// ============================================================================
// PROBAHO ERP: PROCUREMENT, PURCHASE ORDERS & GOODS RECEIPTS (GRN) SERVICE
// Proposed File: src/services/procurementService.ts
// Milestone: M2 - Suppliers & Procurement Core Domain
// ============================================================================

import { dbService, type IDatabaseService } from './db';
import type {
  Item,
  CreateItemInput,
  PurchaseOrder,
  PurchaseOrderItem,
  GoodsReceipt,
  GoodsReceiptItem,
  POStatus,
  ValuationMethod
} from '../types/erp';

export interface ItemFilterOptions {
  activeOnly?: boolean;
  category?: string;
  search?: string;
  sortBy?: 'name' | 'sku' | 'category' | 'cost_price' | 'selling_price' | 'created_at';
  sortOrder?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

export interface CreatePOItemInput {
  itemId: string;
  sku?: string;
  quantityOrdered: number;
  unitCost: number;
  taxRate?: number;
  notes?: string;
}

export interface CreatePOInput {
  id?: string;
  poNumber?: string;
  supplierId: string;
  targetWarehouseId: string;
  orderDate?: string;
  expectedDeliveryDate?: string;
  paymentTerms?: string;
  shippingCost?: number;
  notes?: string;
  items: CreatePOItemInput[];
  createdBy?: string;
}

export interface PurchaseOrderWithItems extends PurchaseOrder {
  items: PurchaseOrderItem[];
  supplierName?: string;
  supplierCode?: string;
  warehouseName?: string;
  warehouseCode?: string;
}

export interface POFilterOptions {
  supplierId?: string;
  warehouseId?: string;
  status?: POStatus;
  search?: string;
  sortBy?: 'order_date' | 'po_number' | 'total_amount' | 'created_at';
  sortOrder?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

export interface ReceiveGoodsItemInput {
  poItemId: string;
  itemId?: string;
  productId?: string;
  quantityReceived?: number;
  quantityAccepted?: number;
  receivedQuantity?: number;
  quantityRejected?: number;
  rejectedQuantity?: number;
  rejectionReason?: string;
  binId?: string;
  locationId?: string;
  batchNumber?: string;
  expiryDate?: string;
  unitCost?: number;
}

export interface ReceiveGoodsInput {
  id?: string;
  receiptNumber?: string;
  poId?: string;
  purchaseOrderId?: string;
  warehouseId: string;
  receivedBy: string;
  receiptDate?: string;
  inspectionPassed?: boolean;
  inspectionNotes?: string;
  items: ReceiveGoodsItemInput[];
}

export interface GoodsReceiptWithItems extends GoodsReceipt {
  items: (GoodsReceiptItem & {
    itemName?: string;
    itemSku?: string;
    batchNumber?: string;
    binCode?: string;
  })[];
  poNumber?: string;
  warehouseName?: string;
}

export class ProcurementService {
  private static instance: ProcurementService | null = null;

  public static getInstance(): ProcurementService {
    if (!ProcurementService.instance) {
      ProcurementService.instance = new ProcurementService();
    }
    return ProcurementService.instance;
  }

  // ==========================================================================
  // SECTION 1: PRODUCT & SKU CATALOG MANAGEMENT
  // ==========================================================================

  /**
   * Retrieves all items with optional active filtering, category matching, and keyword search.
   */
  public async getAllItems(
    options: ItemFilterOptions = {},
    targetDb?: IDatabaseService
  ): Promise<Item[]> {
    const db = targetDb || dbService;
    let sql = 'SELECT * FROM items';
    const conditions: string[] = [];
    const params: any[] = [];

    if (options.activeOnly) {
      conditions.push('is_active = 1');
    }

    if (options.category && options.category.trim()) {
      conditions.push('category = ?');
      params.push(options.category.trim());
    }

    if (options.search && options.search.trim()) {
      const term = `%${options.search.trim()}%`;
      conditions.push('(sku LIKE ? OR barcode LIKE ? OR name LIKE ? OR description LIKE ?)');
      params.push(term, term, term, term);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    const sortBy = options.sortBy || 'sku';
    const sortOrder = options.sortOrder || 'ASC';
    sql += ` ORDER BY ${sortBy} ${sortOrder}`;

    if (options.limit !== undefined && options.limit > 0) {
      sql += ' LIMIT ?';
      params.push(options.limit);
      if (options.offset !== undefined && options.offset >= 0) {
        sql += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    return db.query<Item>(sql, params);
  }

  /**
   * Retrieves an item by its internal UUID primary key.
   */
  public async getItemById(id: string, targetDb?: IDatabaseService): Promise<Item | null> {
    const db = targetDb || dbService;
    const rows = await db.query<Item>('SELECT * FROM items WHERE id = ?', [id]);
    return rows[0] || null;
  }

  /**
   * Retrieves an item by its unique SKU code.
   */
  public async getItemBySku(sku: string, targetDb?: IDatabaseService): Promise<Item | null> {
    const db = targetDb || dbService;
    const rows = await db.query<Item>('SELECT * FROM items WHERE sku = ?', [sku]);
    return rows[0] || null;
  }

  /**
   * Creates a new SKU / product catalog item with invariant validations.
   */
  public async createItem(input: CreateItemInput, targetDb?: IDatabaseService): Promise<Item> {
    const db = targetDb || dbService;

    // 1. Mandatory field validations
    if (!input.sku || !input.sku.trim()) {
      throw new Error('Item SKU is mandatory.');
    }
    if (!input.name || !input.name.trim()) {
      throw new Error('Item name is mandatory.');
    }
    if (!input.category || !input.category.trim()) {
      throw new Error('Item category is mandatory.');
    }

    // 2. Numeric & business invariant validations
    const costPrice = input.costPrice ?? 0.0;
    if (costPrice < 0.0) {
      throw new Error('Cost price cannot be negative.');
    }

    const sellingPrice = input.sellingPrice ?? 0.0;
    if (sellingPrice < 0.0) {
      throw new Error('Selling price cannot be negative.');
    }

    const minStock = input.minStockAlert ?? 10;
    if (minStock < 0) {
      throw new Error('Min stock alert cannot be negative.');
    }

    const safetyStock = input.safetyStock ?? 5;
    if (safetyStock < 0) {
      throw new Error('Safety stock cannot be negative.');
    }

    const maxStock = input.maxStock ?? 1000;
    if (maxStock < minStock) {
      throw new Error(`Max stock (${maxStock}) cannot be less than min stock alert (${minStock}).`);
    }

    const valuationMethod: ValuationMethod = input.valuationMethod || 'MOVING_AVERAGE';
    if (valuationMethod !== 'MOVING_AVERAGE' && valuationMethod !== 'FIFO') {
      throw new Error(`Invalid valuation method '${valuationMethod}'. Expected 'MOVING_AVERAGE' or 'FIFO'.`);
    }

    const id = input.id || `item-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    await db.execute(
      `INSERT INTO items (
        id, sku, barcode, name, description, category, unit_of_measure, cost_price, selling_price,
        valuation_method, min_stock_alert, safety_stock, max_stock, weight_kg, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        id,
        input.sku.trim(),
        input.barcode?.trim() || null,
        input.name.trim(),
        input.description?.trim() || null,
        input.category.trim(),
        input.unitOfMeasure?.trim() || 'pcs',
        costPrice,
        sellingPrice,
        valuationMethod,
        minStock,
        safetyStock,
        maxStock,
        input.weightKg ?? 0.0
      ]
    );

    const created = await this.getItemById(id, db);
    if (!created) {
      throw new Error(`Failed to retrieve newly created item with ID ${id}`);
    }
    return created;
  }

  /**
   * Updates an existing catalog item with partial attributes.
   */
  public async updateItem(
    id: string,
    input: Partial<CreateItemInput & { isActive: boolean }>,
    targetDb?: IDatabaseService
  ): Promise<Item> {
    const db = targetDb || dbService;
    const existing = await this.getItemById(id, db);
    if (!existing) {
      throw new Error(`Item with ID ${id} not found.`);
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (input.sku !== undefined) {
      if (!input.sku.trim()) throw new Error('SKU cannot be empty.');
      updates.push('sku = ?');
      params.push(input.sku.trim());
    }

    if (input.barcode !== undefined) {
      updates.push('barcode = ?');
      params.push(input.barcode ? input.barcode.trim() : null);
    }

    if (input.name !== undefined) {
      if (!input.name.trim()) throw new Error('Item name cannot be empty.');
      updates.push('name = ?');
      params.push(input.name.trim());
    }

    if (input.description !== undefined) {
      updates.push('description = ?');
      params.push(input.description ? input.description.trim() : null);
    }

    if (input.category !== undefined) {
      if (!input.category.trim()) throw new Error('Category cannot be empty.');
      updates.push('category = ?');
      params.push(input.category.trim());
    }

    if (input.unitOfMeasure !== undefined) {
      updates.push('unit_of_measure = ?');
      params.push(input.unitOfMeasure ? input.unitOfMeasure.trim() : 'pcs');
    }

    if (input.costPrice !== undefined) {
      if (input.costPrice < 0.0) throw new Error('Cost price cannot be negative.');
      updates.push('cost_price = ?');
      params.push(input.costPrice);
    }

    if (input.sellingPrice !== undefined) {
      if (input.sellingPrice < 0.0) throw new Error('Selling price cannot be negative.');
      updates.push('selling_price = ?');
      params.push(input.sellingPrice);
    }

    if (input.valuationMethod !== undefined) {
      if (input.valuationMethod !== 'MOVING_AVERAGE' && input.valuationMethod !== 'FIFO') {
        throw new Error('Valuation method must be MOVING_AVERAGE or FIFO.');
      }
      updates.push('valuation_method = ?');
      params.push(input.valuationMethod);
    }

    if (input.minStockAlert !== undefined) {
      if (input.minStockAlert < 0) throw new Error('Min stock alert cannot be negative.');
      updates.push('min_stock_alert = ?');
      params.push(input.minStockAlert);
    }

    if (input.safetyStock !== undefined) {
      if (input.safetyStock < 0) throw new Error('Safety stock cannot be negative.');
      updates.push('safety_stock = ?');
      params.push(input.safetyStock);
    }

    if (input.maxStock !== undefined) {
      const minS = input.minStockAlert ?? existing.min_stock_alert;
      if (input.maxStock < minS) {
        throw new Error(`Max stock (${input.maxStock}) cannot be less than min stock (${minS}).`);
      }
      updates.push('max_stock = ?');
      params.push(input.maxStock);
    }

    if (input.weightKg !== undefined) {
      if (input.weightKg < 0) throw new Error('Weight cannot be negative.');
      updates.push('weight_kg = ?');
      params.push(input.weightKg);
    }

    if (input.isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(input.isActive ? 1 : 0);
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push("updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))");
    params.push(id);

    const sql = `UPDATE items SET ${updates.join(', ')} WHERE id = ?`;
    await db.execute(sql, params);

    const updated = await this.getItemById(id, db);
    return updated!;
  }

  /**
   * Deletes an item or soft-deletes if referenced in transactions/stock.
   */
  public async deleteItem(
    id: string,
    options: { force?: boolean } = {},
    targetDb?: IDatabaseService
  ): Promise<{ success: boolean; softDeleted: boolean }> {
    const db = targetDb || dbService;
    const existing = await this.getItemById(id, db);
    if (!existing) {
      throw new Error(`Item with ID ${id} not found.`);
    }

    const stockRes = await db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM inventory_stock WHERE item_id = ? AND quantity_on_hand > 0',
      [id]
    );
    const hasActiveStock = Number(stockRes[0]?.count || 0) > 0;

    const poItemRes = await db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM purchase_order_items WHERE item_id = ?',
      [id]
    );
    const hasPOs = Number(poItemRes[0]?.count || 0) > 0;

    if (hasActiveStock || hasPOs) {
      if (!options.force) {
        await this.updateItem(id, { isActive: false }, db);
        return { success: true, softDeleted: true };
      } else {
        throw new Error(
          `Cannot hard delete item ${existing.sku}: active stock or purchase orders reference it. The item has been deactivated.`
        );
      }
    }

    await db.execute('DELETE FROM items WHERE id = ?', [id]);
    return { success: true, softDeleted: false };
  }

  // ==========================================================================
  // SECTION 2: PURCHASE ORDERS & PROCUREMENT WORKFLOWS
  // ==========================================================================

  /**
   * Generates a unique, standardized PO Number (e.g. PO-202610-0012).
   */
  public generatePONumber(): string {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const randPart = Math.floor(1000 + Math.random() * 9000);
    return `PO-${yearMonth}-${randPart}`;
  }

  /**
   * Creates a purchase order with validated line items and calculated financial totals
   * inside an atomic database transaction.
   */
  public async createPurchaseOrder(
    input: CreatePOInput,
    targetDb?: IDatabaseService
  ): Promise<PurchaseOrderWithItems> {
    const db = targetDb || dbService;

    // 1. Invariant: A purchase order must have at least one line item
    if (!input.items || input.items.length === 0) {
      throw new Error('A purchase order must include at least one valid line item.');
    }

    if (!input.supplierId) {
      throw new Error('Supplier ID is required.');
    }

    if (!input.targetWarehouseId) {
      throw new Error('Target warehouse ID is required.');
    }

    // Verify supplier exists
    const supplierRows = await db.query('SELECT id, name FROM suppliers WHERE id = ?', [input.supplierId]);
    if (!supplierRows[0]) {
      throw new Error(`Supplier with ID ${input.supplierId} not found.`);
    }

    // Verify warehouse exists
    const whRows = await db.query('SELECT id, name FROM warehouses WHERE id = ?', [input.targetWarehouseId]);
    if (!whRows[0]) {
      throw new Error(`Target warehouse with ID ${input.targetWarehouseId} not found.`);
    }

    // 2. Validate line items and calculate financial totals
    let subtotal = 0.0;
    let taxAmount = 0.0;
    const resolvedItems: Array<{
      itemId: string;
      sku: string;
      quantityOrdered: number;
      unitCost: number;
      taxRate: number;
      subtotal: number;
      notes?: string;
    }> = [];

    for (const item of input.items) {
      if (item.quantityOrdered <= 0) {
        throw new Error('Quantity ordered must be greater than zero.');
      }
      if (item.unitCost < 0.0) {
        throw new Error('Unit cost cannot be negative.');
      }

      // Resolve SKU if missing
      let sku = item.sku;
      if (!sku) {
        const itemRow = await db.query<{ sku: string }>('SELECT sku FROM items WHERE id = ?', [item.itemId]);
        if (!itemRow[0]) {
          throw new Error(`Item with ID ${item.itemId} not found in catalog.`);
        }
        sku = itemRow[0].sku;
      }

      const itemSubtotal = Math.round(item.quantityOrdered * item.unitCost * 100) / 100;
      const taxRate = item.taxRate ?? 0.0;
      const itemTax = Math.round(itemSubtotal * (taxRate / 100) * 100) / 100;

      subtotal += itemSubtotal;
      taxAmount += itemTax;

      resolvedItems.push({
        itemId: item.itemId,
        sku,
        quantityOrdered: item.quantityOrdered,
        unitCost: item.unitCost,
        taxRate,
        subtotal: itemSubtotal,
        notes: item.notes
      });
    }

    subtotal = Math.round(subtotal * 100) / 100;
    taxAmount = Math.round(taxAmount * 100) / 100;
    const shippingCost = Math.round((input.shippingCost ?? 0.0) * 100) / 100;
    const totalAmount = Math.round((subtotal + taxAmount + shippingCost) * 100) / 100;

    const poId = input.id || `po-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const poNumber = input.poNumber?.trim() || this.generatePONumber();
    const orderDate = input.orderDate || new Date().toISOString();

    // 3. Atomic Transaction Wrapping
    return db.transaction(async (tx) => {
      // Insert PO header
      await tx.execute(
        `INSERT INTO purchase_orders (
          id, po_number, supplier_id, target_warehouse_id, status, order_date,
          expected_delivery_date, subtotal, tax_amount, shipping_cost, total_amount,
          payment_terms, notes, created_by
        ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          poId,
          poNumber,
          input.supplierId,
          input.targetWarehouseId,
          orderDate,
          input.expectedDeliveryDate || null,
          subtotal,
          taxAmount,
          shippingCost,
          totalAmount,
          input.paymentTerms || 'Net 30',
          input.notes || null,
          input.createdBy || 'system'
        ]
      );

      // Insert line items
      for (const line of resolvedItems) {
        const poiId = `poi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        await tx.execute(
          `INSERT INTO purchase_order_items (
            id, po_id, item_id, sku, quantity_ordered, quantity_received, quantity_rejected,
            unit_cost, subtotal, tax_rate, notes
          ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`,
          [
            poiId,
            poId,
            line.itemId,
            line.sku,
            line.quantityOrdered,
            line.unitCost,
            line.subtotal,
            line.taxRate,
            line.notes || null
          ]
        );
      }

      const created = await this.getPurchaseOrderById(poId, tx);
      if (!created) {
        throw new Error(`Failed to load newly created PO ${poId}`);
      }
      return created;
    });
  }

  /**
   * Retrieves a single PO by ID with attached line items and joined metadata.
   */
  public async getPurchaseOrderById(
    id: string,
    targetDb?: IDatabaseService
  ): Promise<PurchaseOrderWithItems | null> {
    const db = targetDb || dbService;
    const pos = await db.query<any>(
      `SELECT 
        po.*,
        s.name as supplierName,
        s.supplier_code as supplierCode,
        w.name as warehouseName,
        w.warehouse_code as warehouseCode
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      LEFT JOIN warehouses w ON po.target_warehouse_id = w.id
      WHERE po.id = ?`,
      [id]
    );

    if (!pos[0]) return null;

    const items = await db.query<PurchaseOrderItem>(
      'SELECT * FROM purchase_order_items WHERE po_id = ? ORDER BY sku ASC',
      [id]
    );

    return {
      ...pos[0],
      items
    };
  }

  /**
   * Retrieves a single PO by PO Number with attached line items.
   */
  public async getPurchaseOrderByNumber(
    poNumber: string,
    targetDb?: IDatabaseService
  ): Promise<PurchaseOrderWithItems | null> {
    const db = targetDb || dbService;
    const pos = await db.query<PurchaseOrder>('SELECT id FROM purchase_orders WHERE po_number = ?', [
      poNumber.trim()
    ]);
    if (!pos[0]) return null;
    return this.getPurchaseOrderById(pos[0].id, db);
  }

  /**
   * Retrieves a list of purchase orders matching query filter options.
   */
  public async getPurchaseOrders(
    options: POFilterOptions = {},
    targetDb?: IDatabaseService
  ): Promise<PurchaseOrderWithItems[]> {
    const db = targetDb || dbService;
    let sql = `
      SELECT 
        po.*,
        s.name as supplierName,
        s.supplier_code as supplierCode,
        w.name as warehouseName,
        w.warehouse_code as warehouseCode
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      LEFT JOIN warehouses w ON po.target_warehouse_id = w.id
    `;
    const conditions: string[] = [];
    const params: any[] = [];

    if (options.supplierId) {
      conditions.push('po.supplier_id = ?');
      params.push(options.supplierId);
    }

    if (options.warehouseId) {
      conditions.push('po.target_warehouse_id = ?');
      params.push(options.warehouseId);
    }

    if (options.status) {
      conditions.push('po.status = ?');
      params.push(options.status);
    }

    if (options.search && options.search.trim()) {
      const term = `%${options.search.trim()}%`;
      conditions.push('(po.po_number LIKE ? OR s.name LIKE ? OR po.notes LIKE ?)');
      params.push(term, term, term);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    const sortBy = options.sortBy || 'order_date';
    const sortOrder = options.sortOrder || 'DESC';
    sql += ` ORDER BY po.${sortBy} ${sortOrder}`;

    if (options.limit !== undefined && options.limit > 0) {
      sql += ' LIMIT ?';
      params.push(options.limit);
      if (options.offset !== undefined && options.offset >= 0) {
        sql += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    const pos = await db.query<any>(sql, params);

    // Populate items for each PO
    const results: PurchaseOrderWithItems[] = [];
    for (const po of pos) {
      const items = await db.query<PurchaseOrderItem>(
        'SELECT * FROM purchase_order_items WHERE po_id = ? ORDER BY sku ASC',
        [po.id]
      );
      results.push({
        ...po,
        items
      });
    }

    return results;
  }

  /**
   * Advances or updates the PO status following the strict state transition machine:
   * draft -> pending_approval -> approved -> ordered -> partially_received -> received -> cancelled.
   */
  public async updatePOStatus(
    id: string,
    newStatus: POStatus,
    updatedBy?: string,
    targetDb?: IDatabaseService
  ): Promise<PurchaseOrderWithItems> {
    const db = targetDb || dbService;
    const po = await this.getPurchaseOrderById(id, db);
    if (!po) {
      throw new Error(`PO with ID ${id} not found.`);
    }

    // State transition map
    const validTransitions: Record<POStatus, POStatus[]> = {
      draft: ['pending_approval', 'cancelled'],
      pending_approval: ['approved', 'draft', 'cancelled'],
      approved: ['ordered', 'cancelled'],
      ordered: ['partially_received', 'received', 'cancelled'],
      partially_received: ['received'],
      received: [],
      cancelled: []
    };

    // Cancellation guard: strictly block cancellation once any item receipt has been recorded
    if (newStatus === 'cancelled') {
      const anyReceived = po.items.some(
        (i) => (i.quantity_received || 0) > 0 || (i.quantity_rejected || 0) > 0
      );
      if (anyReceived) {
        throw new Error('Cannot cancel purchase order: goods receipt has already been registered.');
      }
    }

    const allowed = validTransitions[po.status] || [];
    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Invalid state transition: cannot move PO from '${po.status}' to '${newStatus}'.`
      );
    }

    return db.transaction(async (tx) => {
      const updates: string[] = ['status = ?'];
      const params: any[] = [newStatus];

      if (newStatus === 'approved') {
        updates.push('approved_by = ?');
        params.push(updatedBy || 'manager');
      }

      // If moving to 'ordered', record PO issued on the supplier
      if (newStatus === 'ordered' && po.status !== 'ordered') {
        await tx.execute(
          `UPDATE suppliers 
           SET total_pos_issued = total_pos_issued + 1, 
               updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
           WHERE id = ?`,
          [po.supplier_id]
        );
      }

      updates.push("updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))");
      params.push(id);

      await tx.execute(`UPDATE purchase_orders SET ${updates.join(', ')} WHERE id = ?`, params);

      const refreshed = await this.getPurchaseOrderById(id, tx);
      return refreshed!;
    });
  }

  // ==========================================================================
  // SECTION 3: GOODS RECEIPTS (GRN) & ATOMIC INSPECTIONS
  // ==========================================================================

  /**
   * Generates a unique, standardized GRN Number (e.g. GRN-202610-0015).
   */
  public generateGRNNumber(): string {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const randPart = Math.floor(1000 + Math.random() * 9000);
    return `GRN-${yearMonth}-${randPart}`;
  }

  /**
   * Performs Goods Receipt Note (GRN) inspection & atomic warehouse stock increment.
   * Updates cumulative received quantities on purchase order items and automatically
   * transitions PO status to 'partially_received' or 'received'.
   */
  public async receiveGoodsAgainstPO(
    receiptData: ReceiveGoodsInput,
    targetDb?: IDatabaseService
  ): Promise<{
    grnId: string;
    receiptNumber: string;
    poStatus: POStatus;
    goodsReceipt: GoodsReceiptWithItems;
  }> {
    const db = targetDb || dbService;
    const poId = receiptData.purchaseOrderId || receiptData.poId;
    if (!poId) {
      throw new Error('Purchase Order ID is mandatory for goods receipt.');
    }

    const po = await this.getPurchaseOrderById(poId, db);
    if (!po) {
      throw new Error(`PO ${poId} not found.`);
    }

    // Invariant: Goods can only be received against 'ordered' or 'partially_received' POs
    if (po.status !== 'ordered' && po.status !== 'partially_received') {
      throw new Error(
        `Cannot receive goods: PO status is '${po.status}'. Goods can only be received against 'ordered' or 'partially_received' POs.`
      );
    }

    if (!receiptData.items || receiptData.items.length === 0) {
      throw new Error('Goods receipt must include at least one inspected item.');
    }

    const grnId = receiptData.id || `grn-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const receiptNumber = receiptData.receiptNumber?.trim() || this.generateGRNNumber();
    const receiptDate = receiptData.receiptDate || new Date().toISOString();
    const inspectionPassed = receiptData.inspectionPassed ?? true;

    return db.transaction(async (tx) => {
      // 1. Insert Goods Receipt Note (GRN) Header
      await tx.execute(
        `INSERT INTO goods_receipts (
          id, receipt_number, po_id, warehouse_id, received_by, receipt_date,
          inspection_passed, inspection_notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          grnId,
          receiptNumber,
          poId,
          receiptData.warehouseId,
          receiptData.receivedBy,
          receiptDate,
          inspectionPassed ? 1 : 0,
          receiptData.inspectionNotes || null
        ]
      );

      // 2. Process each receipt line item
      for (const line of receiptData.items) {
        const poItemId = line.poItemId;
        const poItem = po.items.find((p) => p.id === poItemId);
        if (!poItem) {
          throw new Error(`PO Item ${poItemId} does not belong to Purchase Order ${poId}.`);
        }

        const accepted = line.quantityAccepted ?? line.receivedQuantity ?? line.quantityReceived ?? 0;
        const rejected = line.quantityRejected ?? line.rejectedQuantity ?? 0;

        if (accepted < 0 || rejected < 0) {
          throw new Error('Accepted and rejected quantities cannot be negative.');
        }

        if (accepted === 0 && rejected === 0) {
          continue; // Nothing to process for this line
        }

        // Over-delivery guard: cannot receive more than remaining ordered quantity
        const currentTotalProcessed = (poItem.quantity_received || 0) + (poItem.quantity_rejected || 0);
        const remainingAllowed = poItem.quantity_ordered - currentTotalProcessed;

        if (accepted + rejected > remainingAllowed) {
          throw new Error(
            `Received quantity exceeds remaining PO balance for SKU ${poItem.sku}. ` +
            `Remaining: ${remainingAllowed}, Attempted: ${accepted + rejected}.`
          );
        }

        const itemId = line.itemId || line.productId || poItem.item_id;
        const unitCost = line.unitCost ?? poItem.unit_cost;
        const binId = line.binId || line.locationId || null;

        // 3. Batch & Lot Handling (if batch specified)
        let batchId: string | null = null;
        if (line.batchNumber && line.batchNumber.trim()) {
          const batchNum = line.batchNumber.trim();
          const existingBatches = await tx.query<{ id: string }>(
            'SELECT id FROM item_batches WHERE item_id = ? AND batch_number = ?',
            [itemId, batchNum]
          );

          if (existingBatches[0]) {
            batchId = existingBatches[0].id;
            await tx.execute(
              `UPDATE item_batches 
               SET current_quantity = current_quantity + ?, 
                   updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
               WHERE id = ?`,
              [accepted, batchId]
            );
          } else {
            batchId = `batch-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            await tx.execute(
              `INSERT INTO item_batches (
                id, batch_number, item_id, supplier_id, expiry_date, unit_cost,
                initial_quantity, current_quantity, status
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
              [
                batchId,
                batchNum,
                itemId,
                po.supplier_id,
                line.expiryDate || null,
                unitCost,
                accepted,
                accepted
              ]
            );
          }
        }

        // 4. Insert Goods Receipt Item record
        const grnItemId = `grni-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        await tx.execute(
          `INSERT INTO goods_receipt_items (
            id, receipt_id, po_item_id, item_id, batch_id, bin_id,
            quantity_accepted, quantity_rejected, rejection_reason, unit_cost
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            grnItemId,
            grnId,
            poItemId,
            itemId,
            batchId,
            binId,
            accepted,
            rejected,
            line.rejectionReason || null,
            unitCost
          ]
        );

        // 5. Atomic Inventory Stock Increment (only for accepted quantity)
        if (accepted > 0) {
          const stockRows = await tx.query<{ id: string; quantity_on_hand: number }>(
            `SELECT id, quantity_on_hand 
             FROM inventory_stock 
             WHERE item_id = ? AND warehouse_id = ? 
               AND (bin_id = ? OR (bin_id IS NULL AND ? IS NULL))
               AND (batch_id = ? OR (batch_id IS NULL AND ? IS NULL))`,
            [itemId, receiptData.warehouseId, binId, binId, batchId, batchId]
          );

          let newBalance = accepted;
          if (stockRows[0]) {
            newBalance = stockRows[0].quantity_on_hand + accepted;
            await tx.execute(
              `UPDATE inventory_stock 
               SET quantity_on_hand = quantity_on_hand + ?, 
                   updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
               WHERE id = ?`,
              [accepted, stockRows[0].id]
            );
          } else {
            const stockId = `stk-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            await tx.execute(
              `INSERT INTO inventory_stock (
                id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved
              ) VALUES (?, ?, ?, ?, ?, ?, 0)`,
              [stockId, itemId, receiptData.warehouseId, binId, batchId, accepted]
            );
          }

          // 6. Double-Entry Immutable Inventory Audit Ledger Entry
          const auditId = `aud-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          await tx.execute(
            `INSERT INTO inventory_transactions (
              id, transaction_type, reference_type, reference_id, item_id, warehouse_id,
              bin_id, batch_id, quantity_change, unit_cost, running_balance_after, user_id, notes
            ) VALUES (?, 'PO_RECEIPT', 'PO', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Goods Receipt Note')`,
            [
              auditId,
              po.po_number,
              itemId,
              receiptData.warehouseId,
              binId,
              batchId,
              accepted,
              unitCost,
              newBalance,
              receiptData.receivedBy
            ]
          );
        }

        // 7. Update PO Item cumulative received and rejected counts
        await tx.execute(
          `UPDATE purchase_order_items 
           SET quantity_received = quantity_received + ?, 
               quantity_rejected = quantity_rejected + ?, 
               updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
           WHERE id = ?`,
          [accepted, rejected, poItemId]
        );
      }

      // 8. Auto-progress PO Status based on cumulative fulfillment
      const refreshedItems = await tx.query<PurchaseOrderItem>(
        'SELECT quantity_ordered, quantity_received FROM purchase_order_items WHERE po_id = ?',
        [poId]
      );

      const allFullyReceived = refreshedItems.every(
        (item) => item.quantity_received >= item.quantity_ordered
      );
      const newPoStatus: POStatus = allFullyReceived ? 'received' : 'partially_received';

      await tx.execute(
        `UPDATE purchase_orders 
         SET status = ?, 
             actual_delivery_date = CASE WHEN ? = 'received' THEN (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ELSE actual_delivery_date END,
             updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = ?`,
        [newPoStatus, newPoStatus, poId]
      );

      // If fully received, update supplier performance metrics
      if (newPoStatus === 'received') {
        await tx.execute(
          `UPDATE suppliers 
           SET total_pos_fulfilled = total_pos_fulfilled + 1,
               performance_score = ROUND(CAST((total_pos_fulfilled + 1) AS REAL) / MAX(total_pos_issued, 1) * 100.0, 1),
               updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
           WHERE id = ?`,
          [po.supplier_id]
        );
      }

      const receipt = await this.getGoodsReceiptById(grnId, tx);
      if (!receipt) {
        throw new Error(`Failed to load newly created Goods Receipt ${grnId}`);
      }

      return {
        grnId,
        receiptNumber,
        poStatus: newPoStatus,
        goodsReceipt: receipt
      };
    });
  }

  /**
   * Retrieves goods receipt history, optionally filtered by PO.
   */
  public async getGoodsReceipts(
    poId?: string,
    targetDb?: IDatabaseService
  ): Promise<GoodsReceiptWithItems[]> {
    const db = targetDb || dbService;
    let sql = `
      SELECT 
        gr.*,
        po.po_number as poNumber,
        w.name as warehouseName
      FROM goods_receipts gr
      LEFT JOIN purchase_orders po ON gr.po_id = po.id
      LEFT JOIN warehouses w ON gr.warehouse_id = w.id
    `;
    const params: any[] = [];

    if (poId) {
      sql += ' WHERE gr.po_id = ?';
      params.push(poId);
    }

    sql += ' ORDER BY gr.created_at DESC';

    const receipts = await db.query<any>(sql, params);
    const results: GoodsReceiptWithItems[] = [];

    for (const gr of receipts) {
      const items = await db.query<any>(
        `SELECT 
          gri.*,
          i.name as itemName,
          i.sku as itemSku,
          b.batch_number as batchNumber,
          wl.bin_code as binCode
        FROM goods_receipt_items gri
        LEFT JOIN items i ON gri.item_id = i.id
        LEFT JOIN item_batches b ON gri.batch_id = b.id
        LEFT JOIN warehouse_locations wl ON gri.bin_id = wl.id
        WHERE gri.receipt_id = ?`,
        [gr.id]
      );
      results.push({
        ...gr,
        items
      });
    }

    return results;
  }

  /**
   * Retrieves a single Goods Receipt by ID.
   */
  public async getGoodsReceiptById(
    id: string,
    targetDb?: IDatabaseService
  ): Promise<GoodsReceiptWithItems | null> {
    const db = targetDb || dbService;
    const receipts = await db.query<any>(
      `SELECT 
        gr.*,
        po.po_number as poNumber,
        w.name as warehouseName
      FROM goods_receipts gr
      LEFT JOIN purchase_orders po ON gr.po_id = po.id
      LEFT JOIN warehouses w ON gr.warehouse_id = w.id
      WHERE gr.id = ?`,
      [id]
    );

    if (!receipts[0]) return null;

    const items = await db.query<any>(
      `SELECT 
        gri.*,
        i.name as itemName,
        i.sku as itemSku,
        b.batch_number as batchNumber,
        wl.bin_code as binCode
      FROM goods_receipt_items gri
      LEFT JOIN items i ON gri.item_id = i.id
      LEFT JOIN item_batches b ON gri.batch_id = b.id
      LEFT JOIN warehouse_locations wl ON gri.bin_id = wl.id
      WHERE gri.receipt_id = ?`,
      [id]
    );

    return {
      ...receipts[0],
      items
    };
  }
}

export const procurementService = ProcurementService.getInstance();
