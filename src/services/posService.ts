// ============================================================================
// PROBAHO ERP: SHOWROOM & POINT OF SALE (POS) SERVICE
// File: src/services/posService.ts
// Counter Sales, FEFO Stock Depletion, Batch Alignment & Audit Ledger
// ============================================================================

import { dbService, type IDatabaseService } from './db';

export interface POSCartItemInput {
  itemId: string;
  quantity: number;
}

export interface POSSaleInput {
  warehouseId: string;
  customerName?: string;
  customerPhone?: string;
  paymentMethod: 'Cash' | 'Card' | 'MFS';
  paymentDetails?: string;
  discountPercent?: number;
  taxRate?: number;
  cashTendered?: number;
  userId?: string;
  items: POSCartItemInput[];
}

export interface POSSaleItemDetail {
  itemId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  subtotal: number;
}

export interface POSSaleResult {
  receiptNumber: string;
  timestamp: string;
  warehouseId: string;
  warehouseName: string;
  customerName: string;
  customerPhone: string;
  paymentMethod: 'Cash' | 'Card' | 'MFS';
  paymentDetails: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  amountTendered: number;
  changeDue: number;
  items: POSSaleItemDetail[];
}

export interface ShowroomCatalogItem {
  id: string;
  sku: string;
  barcode?: string;
  name: string;
  description?: string;
  category: string;
  unit_of_measure: string;
  cost_price: number;
  selling_price: number;
  stock_available: number;
}

export class POSService {
  private static instance: POSService;

  private constructor() {}

  public static getInstance(): POSService {
    if (!POSService.instance) {
      POSService.instance = new POSService();
    }
    return POSService.instance;
  }

  /**
   * Retrieves active items catalog with unexpired stock in the specified warehouse.
   */
  public async getShowroomCatalog(
    warehouseId: string,
    targetDb?: IDatabaseService
  ): Promise<ShowroomCatalogItem[]> {
    const db = targetDb || dbService;
    await db.initialize();

    const rows = await db.query<any>(
      `SELECT i.id, i.sku, i.barcode, i.name, i.description, i.category,
              i.unit_of_measure, i.cost_price, i.selling_price,
              COALESCE(SUM(
                CASE 
                  WHEN b.expiry_date IS NOT NULL AND date(b.expiry_date) < date('now') THEN 0
                  ELSE s.quantity_on_hand 
                END
              ), 0) as stock_available
       FROM items i
       LEFT JOIN inventory_stock s ON i.id = s.item_id AND s.warehouse_id = ?
       LEFT JOIN item_batches b ON s.batch_id = b.id
       WHERE i.is_active = 1
       GROUP BY i.id
       ORDER BY i.name ASC;`,
      [warehouseId]
    );

    return (rows || []).map((r) => ({
      id: r.id,
      sku: r.sku,
      barcode: r.barcode || undefined,
      name: r.name,
      description: r.description || undefined,
      category: r.category,
      unit_of_measure: r.unit_of_measure || 'pcs',
      cost_price: Number(r.cost_price || 0),
      selling_price: Number(r.selling_price || 0),
      stock_available: Number(r.stock_available || 0)
    }));
  }

  /**
   * Processes a complete walk-in POS counter sale:
   * 1. Validates cart items, quantities and payment.
   * 2. Depletes physical inventory using FEFO (First Expired, First Out) & FIFO order.
   * 3. Synchronizes item_batches.current_quantity when batched stock is sold.
   * 4. Enforces database CHECK constraints (quantity_on_hand >= 0.0).
   * 5. Logs immutable double-entry FULFILLMENT_PICK entries in inventory_transactions with exact batch cost.
   * 6. Returns structured POSSaleResult.
   */
  public async processPOSSale(
    input: POSSaleInput,
    targetDb?: IDatabaseService
  ): Promise<POSSaleResult> {
    const db = targetDb || dbService;
    await db.initialize();

    if (!input.items || input.items.length === 0) {
      throw new Error('POS checkout failed: Cart is empty.');
    }

    for (const item of input.items) {
      if (!item.quantity || item.quantity <= 0) {
        throw new Error(`POS checkout failed: Invalid quantity (${item.quantity}) for item ${item.itemId}`);
      }
    }

    // Warehouse validation
    const whRows = await db.query<any>(
      'SELECT id, name FROM warehouses WHERE id = ?;',
      [input.warehouseId]
    );
    if (!whRows || whRows.length === 0) {
      throw new Error(`POS checkout failed: Warehouse ${input.warehouseId} not found.`);
    }
    const warehouseName = whRows[0].name;

    const receiptNumber = `POS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
    const lineDetails: POSSaleItemDetail[] = [];

    // Atomic SQLite Transaction Boundary
    await db.transaction(async (tx) => {
      for (const line of input.items) {
        const itemRows = await tx.query<any>(
          'SELECT id, sku, name, selling_price, cost_price FROM items WHERE id = ?;',
          [line.itemId]
        );
        if (!itemRows || itemRows.length === 0) {
          throw new Error(`Item ${line.itemId} not found in catalog.`);
        }
        const item = itemRows[0];

        // Query available unexpired stock bins for this item in this warehouse
        // FEFO order: earliest expiry date first, unbatched FIFO (created_at ASC) next
        const stockRows = await tx.query<any>(
          `SELECT s.id, s.bin_id, s.batch_id, s.quantity_on_hand,
                  b.expiry_date,
                  COALESCE(b.unit_cost, i.cost_price) as effective_unit_cost
           FROM inventory_stock s
           JOIN items i ON s.item_id = i.id
           LEFT JOIN item_batches b ON s.batch_id = b.id
           WHERE s.item_id = ? AND s.warehouse_id = ? AND s.quantity_on_hand > 0
             AND (b.expiry_date IS NULL OR date(b.expiry_date) >= date('now'))
           ORDER BY 
             CASE WHEN b.expiry_date IS NOT NULL THEN 0 ELSE 1 END,
             b.expiry_date ASC,
             s.created_at ASC;`,
          [line.itemId, input.warehouseId]
        );

        const totalAvailable = stockRows.reduce((acc, r) => acc + r.quantity_on_hand, 0);
        if (totalAvailable < line.quantity) {
          throw new Error(
            `Insufficient available stock for SKU ${item.sku}. Requested: ${line.quantity}, Available: ${totalAvailable}.`
          );
        }

        let needed = line.quantity;
        let weightedCostSum = 0;

        for (const stock of stockRows) {
          if (needed <= 0) break;
          const deduct = Math.min(needed, stock.quantity_on_hand);
          const remaining = stock.quantity_on_hand - deduct;

          // 1. Deduct physical stock on hand
          await tx.execute(
            `UPDATE inventory_stock 
             SET quantity_on_hand = ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
             WHERE id = ?;`,
            [remaining, stock.id]
          );

          // 2. Synchronize item_batches current quantity if batched
          if (stock.batch_id) {
            await tx.execute(
              `UPDATE item_batches 
               SET current_quantity = MAX(0, current_quantity - ?),
                   updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
               WHERE id = ?;`,
              [deduct, stock.batch_id]
            );
          }

          // 3. Log immutable Double-Entry Audit Ledger Entry
          const auditId = `aud-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          await tx.execute(
            `INSERT INTO inventory_transactions (
              id, transaction_timestamp, transaction_type, reference_type, reference_id,
              item_id, warehouse_id, bin_id, batch_id, quantity_change, unit_cost,
              running_balance_after, user_id, notes
            ) VALUES (?, (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), 'FULFILLMENT_PICK', 'SHIPMENT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              auditId,
              receiptNumber,
              item.id,
              input.warehouseId,
              stock.bin_id,
              stock.batch_id,
              -deduct,
              stock.effective_unit_cost,
              remaining,
              input.userId || 'POS Cashier',
              `Showroom Walk-in Counter Sale (${input.paymentMethod}) - Chit #${receiptNumber}`
            ]
          );

          weightedCostSum += stock.effective_unit_cost * deduct;
          needed -= deduct;
        }

        const avgUnitCost = line.quantity > 0 ? weightedCostSum / line.quantity : item.cost_price;
        lineDetails.push({
          itemId: item.id,
          sku: item.sku,
          name: item.name,
          quantity: line.quantity,
          unitPrice: Number(item.selling_price || 0),
          unitCost: Math.round(avgUnitCost * 100) / 100,
          subtotal: Number(item.selling_price || 0) * line.quantity
        });
      }
    });

    // Financial totals
    const subtotal = lineDetails.reduce((sum, d) => sum + d.subtotal, 0);
    const discountPercent = input.discountPercent || 0;
    const discountAmount = Math.round(((subtotal * discountPercent) / 100) * 100) / 100;
    const taxableAmount = Math.max(0, subtotal - discountAmount);
    const taxRate = input.taxRate !== undefined ? input.taxRate : 5;
    const taxAmount = Math.round(((taxableAmount * taxRate) / 100) * 100) / 100;
    const grandTotal = Math.round((taxableAmount + taxAmount) * 100) / 100;

    const tendered = input.paymentMethod === 'Cash' ? (input.cashTendered || 0) : grandTotal;
    if (input.paymentMethod === 'Cash' && tendered < grandTotal) {
      throw new Error(`Tendered cash ($${tendered.toFixed(2)}) is less than total amount ($${grandTotal.toFixed(2)}).`);
    }

    const changeDue = input.paymentMethod === 'Cash' ? Math.max(0, Math.round((tendered - grandTotal) * 100) / 100) : 0;

    return {
      receiptNumber,
      timestamp: new Date().toISOString(),
      warehouseId: input.warehouseId,
      warehouseName,
      customerName: (input.customerName || 'Walk-in Customer').trim(),
      customerPhone: (input.customerPhone || '').trim(),
      paymentMethod: input.paymentMethod,
      paymentDetails: input.paymentDetails || '',
      subtotal,
      tax: taxAmount,
      discount: discountAmount,
      total: grandTotal,
      amountTendered: tendered,
      changeDue,
      items: lineDetails
    };
  }
}

export const posService = POSService.getInstance();
