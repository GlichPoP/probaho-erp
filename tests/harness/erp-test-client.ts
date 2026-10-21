import type { IDatabaseService } from '../../src/services/db.ts';
import { TransferService } from '../../src/services/transferService.ts';
import { FulfillmentService } from '../../src/services/fulfillmentService.ts';
import { posService, type POSSaleInput, type POSSaleResult } from '../../src/services/posService.ts';

export interface CreateSupplierInput {
  id?: string;
  supplierCode: string;
  name: string;
  contactPerson: string;
  phone: string;
  email?: string;
  address: string;
  city?: string;
  country?: string;
  taxId?: string;
  paymentTermsDays?: number;
  leadTimeDays?: number;
  rating?: number;
}

export interface CreateItemInput {
  id?: string;
  sku: string;
  barcode?: string;
  name: string;
  category: string;
  unitOfMeasure?: string;
  costPrice: number;
  sellingPrice: number;
  minStockAlert?: number;
  safetyStock?: number;
  maxStock?: number;
  valuationMethod?: 'MOVING_AVERAGE' | 'FIFO';
}

export interface CreateWarehouseInput {
  id?: string;
  warehouseCode: string;
  name: string;
  address: string;
  city: string;
  contactPerson?: string;
  contactPhone?: string;
  isDefault?: boolean;
}

export interface CreateLocationInput {
  id?: string;
  warehouseId: string;
  zone: string;
  aisle: string;
  rack: string;
  shelf: string;
  binCode: string;
  maxWeightKg?: number;
}

export interface CreatePOItemInput {
  itemId: string;
  sku: string;
  quantityOrdered: number;
  unitCost: number;
}

export interface CreatePOInput {
  id?: string;
  poNumber: string;
  supplierId: string;
  targetWarehouseId: string;
  orderDate?: string;
  expectedDeliveryDate?: string;
  items: CreatePOItemInput[];
  paymentTerms?: string;
  notes?: string;
}

export interface ReceiveGoodsItemInput {
  poItemId: string;
  itemId: string;
  batchNumber?: string;
  expiryDate?: string;
  binId: string;
  quantityReceived: number;
  quantityAccepted: number;
  quantityRejected?: number;
  rejectionReason?: string;
  unitCost?: number;
}

export interface ReceiveGoodsInput {
  id?: string;
  receiptNumber: string;
  poId: string;
  warehouseId: string;
  receivedBy: string;
  items: ReceiveGoodsItemInput[];
  inspectionNotes?: string;
}

export interface CreateTransferItemInput {
  itemId: string;
  batchId?: string;
  sourceBinId: string;
  destBinId: string;
  quantityRequested: number;
}

export interface CreateTransferInput {
  id?: string;
  transferNumber: string;
  sourceWarehouseId: string;
  destWarehouseId: string;
  requestedBy: string;
  items: CreateTransferItemInput[];
  notes?: string;
}

export interface CreateShipmentItemInput {
  itemId: string;
  batchId?: string;
  binId: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateShipmentInput {
  id?: string;
  shipmentNumber: string;
  orderReference: string;
  sourceWarehouseId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  destinationCity: string;
  courierName: string;
  trackingNumber?: string;
  items: CreateShipmentItemInput[];
  codAmount?: number;
  shippingFee?: number;
}

export class ERPTestClient {
  private db: IDatabaseService;

  constructor(db: IDatabaseService) {
    this.db = db;
  }

  // --- Suppliers ---
  public async createSupplier(input: CreateSupplierInput): Promise<any> {
    const id = input.id || `sup-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    await this.db.execute(
      `INSERT INTO suppliers (
        id, supplier_code, name, contact_person, phone, email, address, city, country, tax_id,
        payment_terms_days, lead_time_days, rating
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.supplierCode,
        input.name,
        input.contactPerson,
        input.phone,
        input.email || null,
        input.address,
        input.city || 'Dhaka',
        input.country || 'Bangladesh',
        input.taxId || null,
        input.paymentTermsDays ?? 30,
        input.leadTimeDays ?? 7,
        input.rating ?? 5.0
      ]
    );
    return this.getSupplier(id);
  }

  public async getSupplier(id: string): Promise<any> {
    const rows = await this.db.query('SELECT * FROM suppliers WHERE id = ?', [id]);
    return rows[0] || null;
  }

  public async getSupplierByCode(code: string): Promise<any> {
    const rows = await this.db.query('SELECT * FROM suppliers WHERE supplier_code = ?', [code]);
    return rows[0] || null;
  }

  public async listSuppliers(activeOnly: boolean = false): Promise<any[]> {
    if (activeOnly) {
      return this.db.query('SELECT * FROM suppliers WHERE is_active = 1 ORDER BY name ASC');
    }
    return this.db.query('SELECT * FROM suppliers ORDER BY name ASC');
  }

  public async updateSupplierRating(id: string, rating: number, leadTimeDays?: number): Promise<void> {
    if (leadTimeDays !== undefined) {
      await this.db.execute('UPDATE suppliers SET rating = ?, lead_time_days = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [rating, leadTimeDays, id]);
    } else {
      await this.db.execute('UPDATE suppliers SET rating = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [rating, id]);
    }
  }

  public async setSupplierStatus(id: string, isActive: boolean): Promise<void> {
    await this.db.execute('UPDATE suppliers SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [isActive ? 1 : 0, id]);
  }

  // --- Items / SKU Catalog ---
  public async createItem(input: CreateItemInput): Promise<any> {
    const id = input.id || `item-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    await this.db.execute(
      `INSERT INTO items (
        id, sku, barcode, name, category, unit_of_measure, cost_price, selling_price,
        min_stock_alert, safety_stock, max_stock, valuation_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.sku,
        input.barcode || null,
        input.name,
        input.category,
        input.unitOfMeasure || 'pcs',
        input.costPrice,
        input.sellingPrice,
        input.minStockAlert ?? 10,
        input.safetyStock ?? 5,
        input.maxStock ?? 1000,
        input.valuationMethod || 'MOVING_AVERAGE'
      ]
    );
    return this.getItem(id);
  }

  public async getItem(id: string): Promise<any> {
    const rows = await this.db.query('SELECT * FROM items WHERE id = ?', [id]);
    return rows[0] || null;
  }

  public async listItems(): Promise<any[]> {
    return this.db.query('SELECT * FROM items ORDER BY sku ASC');
  }

  // --- Warehouses & Bins ---
  public async createWarehouse(input: CreateWarehouseInput): Promise<any> {
    const id = input.id || `wh-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    await this.db.execute(
      `INSERT INTO warehouses (
        id, warehouse_code, name, address, city, contact_person, contact_phone, is_default
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.warehouseCode,
        input.name,
        input.address,
        input.city,
        input.contactPerson || null,
        input.contactPhone || null,
        input.isDefault ? 1 : 0
      ]
    );
    return this.getWarehouse(id);
  }

  public async getWarehouse(id: string): Promise<any> {
    const rows = await this.db.query('SELECT * FROM warehouses WHERE id = ?', [id]);
    return rows[0] || null;
  }

  public async listWarehouses(): Promise<any[]> {
    return this.db.query('SELECT * FROM warehouses ORDER BY name ASC');
  }

  public async createLocation(input: CreateLocationInput): Promise<any> {
    const id = input.id || `loc-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    await this.db.execute(
      `INSERT INTO warehouse_locations (
        id, warehouse_id, zone, aisle, rack, shelf, bin_code, max_weight_kg
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.warehouseId,
        input.zone,
        input.aisle,
        input.rack,
        input.shelf,
        input.binCode,
        input.maxWeightKg || null
      ]
    );
    const rows = await this.db.query('SELECT * FROM warehouse_locations WHERE id = ?', [id]);
    return rows[0];
  }

  public async getLocation(id: string): Promise<any> {
    const rows = await this.db.query('SELECT * FROM warehouse_locations WHERE id = ?', [id]);
    return rows[0] || null;
  }

  // --- Batches ---
  public async createBatch(input: {
    batchNumber: string;
    itemId: string;
    supplierId?: string;
    manufactureDate?: string;
    expiryDate?: string;
    unitCost: number;
    quantity: number;
  }): Promise<any> {
    const id = `batch-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    await this.db.execute(
      `INSERT INTO item_batches (
        id, batch_number, item_id, supplier_id, manufacture_date, expiry_date, unit_cost,
        initial_quantity, current_quantity, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.batchNumber,
        input.itemId,
        input.supplierId || null,
        input.manufactureDate || null,
        input.expiryDate || null,
        input.unitCost,
        input.quantity,
        input.quantity,
        'ACTIVE'
      ]
    );
    const rows = await this.db.query('SELECT * FROM item_batches WHERE id = ?', [id]);
    return rows[0];
  }

  public async getBatch(id: string): Promise<any> {
    const rows = await this.db.query('SELECT * FROM item_batches WHERE id = ?', [id]);
    return rows[0] || null;
  }

  // --- Inventory Levels & Valuation ---
  public async getStockLevel(itemId: string, warehouseId: string, binId?: string, batchId?: string): Promise<any> {
    let sql = 'SELECT * FROM inventory_stock WHERE item_id = ? AND warehouse_id = ?';
    const params: any[] = [itemId, warehouseId];
    if (binId) {
      sql += ' AND bin_id = ?';
      params.push(binId);
    }
    if (batchId) {
      sql += ' AND batch_id = ?';
      params.push(batchId);
    }
    const rows = await this.db.query(sql, params);
    return rows[0] || null;
  }

  public async getItemTotalStock(itemId: string, warehouseId?: string): Promise<{ onHand: number; reserved: number; available: number }> {
    let sql = 'SELECT SUM(quantity_on_hand) as total_on_hand, SUM(quantity_reserved) as total_reserved FROM inventory_stock WHERE item_id = ?';
    const params: any[] = [itemId];
    if (warehouseId) {
      sql += ' AND warehouse_id = ?';
      params.push(warehouseId);
    }
    const rows = await this.db.query(sql, params);
    const onHand = Number(rows[0]?.total_on_hand || 0);
    const reserved = Number(rows[0]?.total_reserved || 0);
    return {
      onHand,
      reserved,
      available: onHand - reserved
    };
  }

  public async calculateValuation(warehouseId?: string): Promise<{ totalUnits: number; totalValuation: number; itemsValuation: any[] }> {
    let sql = `
      SELECT 
        s.item_id,
        i.sku,
        i.name,
        i.cost_price,
        SUM(s.quantity_on_hand) as quantity,
        SUM(s.quantity_on_hand * COALESCE(b.unit_cost, i.cost_price)) as item_total_value
      FROM inventory_stock s
      JOIN items i ON s.item_id = i.id
      LEFT JOIN item_batches b ON s.batch_id = b.id
    `;
    const params: any[] = [];
    if (warehouseId) {
      sql += ' WHERE s.warehouse_id = ?';
      params.push(warehouseId);
    }
    sql += ' GROUP BY s.item_id';

    const rows = await this.db.query(sql, params);
    let totalUnits = 0;
    let totalValuation = 0;
    for (const r of rows) {
      totalUnits += Number(r.quantity || 0);
      totalValuation += Number(r.item_total_value || 0);
    }
    return {
      totalUnits,
      totalValuation: Math.round(totalValuation * 100) / 100,
      itemsValuation: rows
    };
  }

  // --- Purchase Orders (Procurement) ---
  public async createPurchaseOrder(input: CreatePOInput): Promise<any> {
    if (!input.items || input.items.length === 0) {
      throw new Error('A purchase order must include at least one valid line item.');
    }

    let subtotal = 0;
    for (const item of input.items) {
      if (item.quantityOrdered <= 0) {
        throw new Error('Quantity ordered must be greater than zero.');
      }
      subtotal += item.quantityOrdered * item.unitCost;
    }

    const poId = input.id || `po-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const totalAmount = subtotal; // Assume 0 tax/shipping for baseline unless specified

    return this.db.transaction(async () => {
      await this.db.execute(
        `INSERT INTO purchase_orders (
          id, po_number, supplier_id, target_warehouse_id, status, order_date,
          expected_delivery_date, subtotal, total_amount, payment_terms, notes
        ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
        [
          poId,
          input.poNumber,
          input.supplierId,
          input.targetWarehouseId,
          input.orderDate || new Date().toISOString(),
          input.expectedDeliveryDate || null,
          subtotal,
          totalAmount,
          input.paymentTerms || 'Net 30',
          input.notes || null
        ]
      );

      for (const item of input.items) {
        const itemId = `poi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        await this.db.execute(
          `INSERT INTO purchase_order_items (
            id, po_id, item_id, sku, quantity_ordered, unit_cost, subtotal
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            itemId,
            poId,
            item.itemId,
            item.sku,
            item.quantityOrdered,
            item.unitCost,
            item.quantityOrdered * item.unitCost
          ]
        );
      }

      return this.getPurchaseOrder(poId);
    });
  }

  public async getPurchaseOrder(id: string): Promise<any> {
    const pos = await this.db.query('SELECT * FROM purchase_orders WHERE id = ?', [id]);
    if (!pos[0]) return null;
    const items = await this.db.query('SELECT * FROM purchase_order_items WHERE po_id = ?', [id]);
    return {
      ...pos[0],
      items
    };
  }

  public async updatePurchaseOrderStatus(poId: string, targetStatus: string): Promise<any> {
    const po = await this.getPurchaseOrder(poId);
    if (!po) throw new Error(`PO ${poId} not found`);

    // Valid state transitions
    const validTransitions: Record<string, string[]> = {
      draft: ['pending_approval', 'cancelled'],
      pending_approval: ['approved', 'draft', 'cancelled'],
      approved: ['ordered', 'cancelled'],
      ordered: ['partially_received', 'received', 'cancelled'],
      partially_received: ['received'],
      received: [],
      cancelled: []
    };

    // Cancellation guard: cannot cancel if already received items
    if (targetStatus === 'cancelled') {
      const anyReceived = po.items.some((i: any) => (i.quantity_received || 0) > 0 || (i.quantity_rejected || 0) > 0);
      if (anyReceived) {
        throw new Error('Cannot cancel purchase order: goods receipt has already been registered.');
      }
    }

    const allowed = validTransitions[po.status] || [];
    if (!allowed.includes(targetStatus)) {
      throw new Error(`Invalid state transition: cannot move PO from '${po.status}' to '${targetStatus}'.`);
    }

    await this.db.execute('UPDATE purchase_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [targetStatus, poId]);
    return this.getPurchaseOrder(poId);
  }

  // --- Goods Receipt Note (GRN) Inspection & Atomic Receiving ---
  public async receiveGoods(input: ReceiveGoodsInput): Promise<any> {
    const po = await this.getPurchaseOrder(input.poId);
    if (!po) throw new Error(`PO ${input.poId} not found`);
    if (po.status !== 'ordered' && po.status !== 'partially_received') {
      throw new Error(`Cannot receive goods: PO status is '${po.status}'. Goods can only be received against 'ordered' or 'partially_received' POs.`);
    }

    const grnId = input.id || `grn-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    return this.db.transaction(async () => {
      // 1. Insert GRN Header
      await this.db.execute(
        `INSERT INTO goods_receipts (
          id, receipt_number, po_id, warehouse_id, received_by, inspection_notes
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          grnId,
          input.receiptNumber,
          input.poId,
          input.warehouseId,
          input.receivedBy,
          input.inspectionNotes || null
        ]
      );

      for (const line of input.items) {
        const accepted = line.quantityAccepted;
        const rejected = line.quantityRejected || 0;
        const unitCost = line.unitCost ?? 0;

        // Find PO item
        const poItem = po.items.find((pi: any) => pi.id === line.poItemId);
        if (!poItem) throw new Error(`PO Item ${line.poItemId} not found in PO ${input.poId}`);

        if (poItem.quantity_received + accepted + rejected > poItem.quantity_ordered) {
          throw new Error(`Received quantity exceeds remaining PO balance for SKU ${poItem.sku}.`);
        }

        // 2. Batch handling
        let batchId: string | null = null;
        if (line.batchNumber) {
          const existingBatch = await this.db.query(
            'SELECT id FROM item_batches WHERE item_id = ? AND batch_number = ?',
            [line.itemId, line.batchNumber]
          );
          if (existingBatch[0]) {
            batchId = existingBatch[0].id;
            await this.db.execute(
              'UPDATE item_batches SET current_quantity = current_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
              [accepted, batchId]
            );
          } else {
            batchId = `batch-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            await this.db.execute(
              `INSERT INTO item_batches (
                id, batch_number, item_id, supplier_id, expiry_date, unit_cost, initial_quantity, current_quantity
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                batchId,
                line.batchNumber,
                line.itemId,
                po.supplier_id,
                line.expiryDate || null,
                unitCost || poItem.unit_cost,
                accepted,
                accepted
              ]
            );
          }
        }

        // 3. Insert GRN Item
        const grnItemId = `grni-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        await this.db.execute(
          `INSERT INTO goods_receipt_items (
            id, receipt_id, po_item_id, item_id, batch_id, bin_id,
            quantity_accepted, quantity_rejected, rejection_reason, unit_cost
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            grnItemId,
            grnId,
            line.poItemId,
            line.itemId,
            batchId,
            line.binId,
            accepted,
            rejected,
            line.rejectionReason || null,
            unitCost || poItem.unit_cost
          ]
        );

        // 4. Atomic Inventory Stock Increment (only for accepted quantity)
        if (accepted > 0) {
          const existingStock = await this.db.query(
            'SELECT id, quantity_on_hand FROM inventory_stock WHERE item_id = ? AND warehouse_id = ? AND bin_id = ? AND (batch_id = ? OR (batch_id IS NULL AND ? IS NULL))',
            [line.itemId, input.warehouseId, line.binId, batchId, batchId]
          );

          let newBalance = accepted;
          if (existingStock[0]) {
            newBalance = existingStock[0].quantity_on_hand + accepted;
            await this.db.execute(
              'UPDATE inventory_stock SET quantity_on_hand = quantity_on_hand + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
              [accepted, existingStock[0].id]
            );
          } else {
            const stockId = `stk-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            await this.db.execute(
              `INSERT INTO inventory_stock (
                id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved
              ) VALUES (?, ?, ?, ?, ?, ?, 0)`,
              [stockId, line.itemId, input.warehouseId, line.binId, batchId, accepted]
            );
          }

          // 5. Append to Double-Entry Audit Ledger
          const auditId = `aud-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          await this.db.execute(
            `INSERT INTO inventory_transactions (
              id, transaction_type, reference_type, reference_id, item_id, warehouse_id, bin_id,
              batch_id, quantity_change, unit_cost, running_balance_after, user_id, notes
            ) VALUES (?, 'PO_RECEIPT', 'PO', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Goods Receipt Note')`,
            [
              auditId,
              input.poId,
              line.itemId,
              input.warehouseId,
              line.binId,
              batchId,
              accepted,
              unitCost || poItem.unit_cost,
              newBalance,
              input.receivedBy
            ]
          );
        }

        // 6. Update PO Item cumulative counts
        await this.db.execute(
          `UPDATE purchase_order_items
           SET quantity_received = quantity_received + ?,
               quantity_rejected = quantity_rejected + ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [accepted, rejected, line.poItemId]
        );
      }

      // 7. Auto-progress PO status
      const updatedPo = await this.getPurchaseOrder(input.poId);
      const allFullyReceived = updatedPo.items.every(
        (pi: any) => pi.quantity_received >= pi.quantity_ordered
      );
      const newPoStatus = allFullyReceived ? 'received' : 'partially_received';
      await this.db.execute(
        'UPDATE purchase_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newPoStatus, input.poId]
      );

      return {
        grnId,
        receiptNumber: input.receiptNumber,
        poStatus: newPoStatus
      };
    });
  }

  // --- Inter-Warehouse Stock Transfers ---
  public async createTransfer(input: CreateTransferInput): Promise<any> {
    if (input.sourceWarehouseId === input.destWarehouseId) {
      throw new Error('Source and destination warehouses cannot be identical.');
    }
    if (!input.items || input.items.length === 0) {
      throw new Error('Transfer must contain at least one line item.');
    }

    const transferId = input.id || `tr-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    return this.db.transaction(async () => {
      await this.db.execute(
        `INSERT INTO stock_transfers (
          id, transfer_number, source_warehouse_id, dest_warehouse_id, status, requested_by, notes
        ) VALUES (?, ?, ?, ?, 'draft', ?, ?)`,
        [
          transferId,
          input.transferNumber,
          input.sourceWarehouseId,
          input.destWarehouseId,
          input.requestedBy,
          input.notes || null
        ]
      );

      for (const item of input.items) {
        if (!item.quantityRequested || item.quantityRequested <= 0) {
          throw new Error('Quantity requested must be greater than zero.');
        }
        const lineId = `tri-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        await this.db.execute(
          `INSERT INTO stock_transfer_items (
            id, transfer_id, item_id, batch_id, source_bin_id, dest_bin_id, quantity_requested
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            lineId,
            transferId,
            item.itemId,
            item.batchId || null,
            item.sourceBinId,
            item.destBinId,
            item.quantityRequested
          ]
        );
      }

      return this.getTransfer(transferId);
    });
  }

  public async getTransfer(id: string): Promise<any> {
    const transfers = await this.db.query('SELECT * FROM stock_transfers WHERE id = ?', [id]);
    if (!transfers[0]) return null;
    const items = await this.db.query('SELECT * FROM stock_transfer_items WHERE transfer_id = ?', [id]);
    return {
      ...transfers[0],
      items
    };
  }

  public async dispatchTransfer(transferId: string, dispatchedBy: string = 'system'): Promise<any> {
    const transfer = await this.getTransfer(transferId);
    if (!transfer) throw new Error(`Transfer ${transferId} not found`);
    if (transfer.status !== 'draft' && transfer.status !== 'requested') {
      throw new Error(`Cannot dispatch transfer: status is '${transfer.status}', expected 'draft' or 'requested'.`);
    }

    return this.db.transaction(async () => {
      for (const line of transfer.items) {
        // Check source stock
        let stockQuery = 'SELECT id, quantity_on_hand, quantity_reserved, batch_id FROM inventory_stock WHERE item_id = ? AND warehouse_id = ? AND bin_id = ?';
        const stockParams: any[] = [line.item_id, transfer.source_warehouse_id, line.source_bin_id];
        if (line.batch_id) {
          stockQuery += ' AND batch_id = ?';
          stockParams.push(line.batch_id);
        } else {
          stockQuery += ' ORDER BY quantity_on_hand DESC';
        }
        const stock = await this.db.query(stockQuery, stockParams);
        const currentStock = stock[0];
        const available = (currentStock?.quantity_on_hand || 0) - (currentStock?.quantity_reserved || 0);

        if (!currentStock || available < line.quantity_requested) {
          throw new Error(`Insufficient stock available in source warehouse bin for SKU ${line.item_id}. Requested ${line.quantity_requested}, Available ${available}.`);
        }

        // Atomically decrement source stock
        const balanceAfter = currentStock.quantity_on_hand - line.quantity_requested;
        await this.db.execute(
          'UPDATE inventory_stock SET quantity_on_hand = quantity_on_hand - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [line.quantity_requested, currentStock.id]
        );

        // Record line shipped and propagate batch_id
        const resolvedBatchId = line.batch_id || currentStock.batch_id || null;
        await this.db.execute(
          'UPDATE stock_transfer_items SET quantity_shipped = ?, batch_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [line.quantity_requested, resolvedBatchId, line.id]
        );

        // Audit log
        const auditId = `aud-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        await this.db.execute(
          `INSERT INTO inventory_transactions (
            id, transaction_type, reference_type, reference_id, item_id, warehouse_id, bin_id,
            batch_id, quantity_change, running_balance_after, user_id, notes
          ) VALUES (?, 'TRANSFER_OUT', 'TRANSFER', ?, ?, ?, ?, ?, ?, ?, ?, 'Stock Transfer Departure')`,
          [
            auditId,
            transfer.transfer_number,
            line.item_id,
            transfer.source_warehouse_id,
            line.source_bin_id,
            line.batch_id,
            -line.quantity_requested,
            balanceAfter,
            dispatchedBy
          ]
        );
      }

      await this.db.execute(
        "UPDATE stock_transfers SET status = 'in_transit', shipped_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [transferId]
      );

      return this.getTransfer(transferId);
    });
  }

  public async receiveTransfer(transferId: string, receipts: Array<{ lineId: string; quantityReceived: number; discrepancyReason?: string }>, receivedBy: string = 'system'): Promise<any> {
    const transfer = await this.getTransfer(transferId);
    if (!transfer) throw new Error(`Transfer ${transferId} not found`);
    if (transfer.status !== 'in_transit') {
      throw new Error(`Cannot receive transfer: status is '${transfer.status}', expected 'in_transit'.`);
    }

    return this.db.transaction(async () => {
      for (const rec of receipts) {
        const line = transfer.items.find((i: any) => i.id === rec.lineId);
        if (!line) throw new Error(`Transfer line ${rec.lineId} not found`);

        if (rec.quantityReceived > line.quantity_shipped) {
          throw new Error('Received quantity cannot exceed shipped quantity.');
        }

        // Increment destination warehouse inventory
        const destStock = await this.db.query(
          'SELECT id, quantity_on_hand FROM inventory_stock WHERE item_id = ? AND warehouse_id = ? AND bin_id = ? AND (batch_id = ? OR (batch_id IS NULL AND ? IS NULL))',
          [line.item_id, transfer.dest_warehouse_id, line.dest_bin_id, line.batch_id, line.batch_id]
        );

        let balanceAfter = rec.quantityReceived;
        if (destStock[0]) {
          balanceAfter = destStock[0].quantity_on_hand + rec.quantityReceived;
          await this.db.execute(
            'UPDATE inventory_stock SET quantity_on_hand = quantity_on_hand + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [rec.quantityReceived, destStock[0].id]
          );
        } else {
          const newStockId = `stk-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          await this.db.execute(
            `INSERT INTO inventory_stock (
              id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved
            ) VALUES (?, ?, ?, ?, ?, ?, 0)`,
            [newStockId, line.item_id, transfer.dest_warehouse_id, line.dest_bin_id, line.batch_id, rec.quantityReceived]
          );
        }

        // Update transfer item counts
        await this.db.execute(
          'UPDATE stock_transfer_items SET quantity_received = ?, discrepancy_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [rec.quantityReceived, rec.discrepancyReason || null, rec.lineId]
        );

        // Audit log
        const auditId = `aud-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        await this.db.execute(
          `INSERT INTO inventory_transactions (
            id, transaction_type, reference_type, reference_id, item_id, warehouse_id, bin_id,
            batch_id, quantity_change, running_balance_after, user_id, notes
          ) VALUES (?, 'TRANSFER_IN', 'TRANSFER', ?, ?, ?, ?, ?, ?, ?, ?, 'Stock Transfer Arrival')`,
          [
            auditId,
            transfer.transfer_number,
            line.item_id,
            transfer.dest_warehouse_id,
            line.dest_bin_id,
            line.batch_id,
            rec.quantityReceived,
            balanceAfter,
            receivedBy
          ]
        );
      }

      await this.db.execute(
        "UPDATE stock_transfers SET status = 'completed', received_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [transferId]
      );

      return this.getTransfer(transferId);
    });
  }

  public async cancelTransfer(transferId: string, reason?: string, cancelledBy?: string): Promise<any> {
    return TransferService.getInstance().cancelTransfer(transferId, reason, cancelledBy, this.db);
  }

  // --- Outbound Fulfillment, Shipments & Couriers ---
  public async createCourier(name: string, phone: string, serviceType: string = 'Standard'): Promise<any> {
    return FulfillmentService.getInstance().createCourier({ name, contactPhone: phone, serviceType }, this.db);
  }

  public async getCouriers(options?: any): Promise<any> {
    return FulfillmentService.getInstance().getCouriers(options, this.db);
  }

  public async createShipment(input: CreateShipmentInput): Promise<any> {
    return FulfillmentService.getInstance().createShipment(input, this.db);
  }

  public async getShipment(id: string): Promise<any> {
    return FulfillmentService.getInstance().getShipmentById(id, this.db);
  }

  public async dispatchShipment(shipmentId: string, trackingNumber?: string): Promise<any> {
    return FulfillmentService.getInstance().dispatchShipment(shipmentId, trackingNumber, 'system', this.db);
  }

  public async updateShipmentStatus(shipmentId: string, status: string, notes?: string): Promise<any> {
    return FulfillmentService.getInstance().updateShipmentStatus(shipmentId, status as any, notes, 'system', this.db);
  }

  public async processRTO(shipmentId: string, disposition: 'restocked' | 'damaged_writeoff', targetBinId?: string): Promise<any> {
    return FulfillmentService.getInstance().processRTO(shipmentId, disposition, targetBinId, 'system', this.db);
  }

  // --- POS Showroom Sales ---
  public async processPOSSale(input: POSSaleInput): Promise<POSSaleResult> {
    return posService.processPOSSale(input, this.db);
  }

  public async getShowroomCatalog(warehouseId: string): Promise<any[]> {
    return posService.getShowroomCatalog(warehouseId, this.db);
  }

  // --- Audit Ledger Queries ---
  public async getInventoryTransactions(referenceId?: string): Promise<any[]> {
    if (referenceId) {
      return this.db.query('SELECT * FROM inventory_transactions WHERE reference_id = ? ORDER BY transaction_timestamp ASC', [referenceId]);
    }
    return this.db.query('SELECT * FROM inventory_transactions ORDER BY transaction_timestamp ASC');
  }
}
