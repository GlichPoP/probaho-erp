// ============================================================================
// PROBAHO ERP: INTER-WAREHOUSE STOCK TRANSFER SERVICE
// File: src/services/transferService.ts
// Milestone: M3 - Multi-Warehouse Inventory, Valuation & Transfers
// Remediated by: explorer_m3_it2_1 (Iteration 2 Domain Services Remediation)
// Advisory Fix: explorer_m4_1 (line 489 params.push(notes, notes) for 2 placeholders)
// ============================================================================

import { dbService, type IDatabaseService } from './db';
import type {
  StockTransfer,
  StockTransferItem,
  TransferStatus,
  InventoryStock,
  InventoryTransaction
} from '../types/erp';

export interface CreateTransferItemInput {
  itemId: string;
  sourceBinId?: string;
  destBinId?: string;
  batchId?: string;
  quantityRequested: number;
}

export interface CreateTransferInput {
  id?: string;
  transferNumber?: string;
  sourceWarehouseId: string;
  destWarehouseId: string;
  requestedBy: string;
  carrierName?: string;
  trackingNumber?: string;
  notes?: string;
  items: CreateTransferItemInput[];
}

export interface DispatchTransferInput {
  transferId: string;
  carrierName?: string;
  trackingNumber?: string;
  dispatchedBy?: string;
  shippedDate?: string;
  items?: Array<{
    lineId: string;
    quantityShipped?: number;
    batchId?: string;
  }>;
}

export interface ReceiveTransferItemInput {
  lineId: string;
  quantityReceived: number;
  destBinId?: string;
  discrepancyReason?: string;
}

export interface ReceiveTransferInput {
  transferId: string;
  receivedBy: string;
  receivedDate?: string;
  receivingNotes?: string;
  items: ReceiveTransferItemInput[];
}

export interface TransferFilterOptions {
  sourceWarehouseId?: string;
  destWarehouseId?: string;
  status?: TransferStatus;
  search?: string;
  sortBy?: 'created_at' | 'transfer_number' | 'shipped_date' | 'received_date';
  sortOrder?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

export interface StockTransferWithItems extends StockTransfer {
  items: (StockTransferItem & {
    itemName?: string;
    itemSku?: string;
    itemCategory?: string;
    itemUnit?: string;
    batchNumber?: string;
    sourceBinCode?: string;
    destBinCode?: string;
  })[];
  sourceWarehouseName?: string;
  sourceWarehouseCode?: string;
  destWarehouseName?: string;
  destWarehouseCode?: string;
}

export class TransferService {
  private static instance: TransferService | null = null;

  public static getInstance(): TransferService {
    if (!TransferService.instance) {
      TransferService.instance = new TransferService();
    }
    return TransferService.instance;
  }

  /**
   * Generates a unique, standardized stock transfer number (e.g. TR-202610-1234).
   */
  public generateTransferNumber(): string {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const randPart = Math.floor(1000 + Math.random() * 9000);
    return `TR-${yearMonth}-${randPart}`;
  }

  // ==========================================================================
  // SECTION 1: TRANSFER CREATION & LINE ITEM VALIDATION
  // ==========================================================================

  /**
   * Creates an inter-warehouse stock transfer record with validated multi-line items.
   * Enforces business invariants:
   * 1. Source and Destination warehouse cannot be identical.
   * 2. Must contain at least one line item with quantityRequested > 0.
   * 3. Both warehouses and all items must exist.
   * Initial status is always 'draft'.
   */
  public async createTransfer(
    input: CreateTransferInput,
    targetDb?: IDatabaseService
  ): Promise<StockTransferWithItems> {
    const db = targetDb || dbService;

    // Invariant 1: Source and destination must be distinct
    if (input.sourceWarehouseId === input.destWarehouseId) {
      throw new Error('Source and destination warehouses cannot be identical.');
    }

    // Invariant 2: Must contain at least one line item
    if (!input.items || input.items.length === 0) {
      throw new Error('Transfer must contain at least one line item.');
    }

    if (!input.sourceWarehouseId) {
      throw new Error('Source warehouse ID is required.');
    }

    if (!input.destWarehouseId) {
      throw new Error('Destination warehouse ID is required.');
    }

    // Verify source warehouse exists
    const srcWh = await db.query('SELECT id, name FROM warehouses WHERE id = ?', [
      input.sourceWarehouseId
    ]);
    if (!srcWh[0]) {
      throw new Error(`Source warehouse with ID ${input.sourceWarehouseId} not found.`);
    }

    // Verify destination warehouse exists
    const destWh = await db.query('SELECT id, name FROM warehouses WHERE id = ?', [
      input.destWarehouseId
    ]);
    if (!destWh[0]) {
      throw new Error(`Destination warehouse with ID ${input.destWarehouseId} not found.`);
    }

    // Validate each line item
    for (const item of input.items) {
      if (!item.itemId) {
        throw new Error('Item ID is required for each line item.');
      }
      if (item.quantityRequested <= 0) {
        throw new Error('Quantity requested must be greater than zero.');
      }

      // Check item exists in catalog
      const itemRow = await db.query('SELECT id, sku FROM items WHERE id = ?', [item.itemId]);
      if (!itemRow[0]) {
        throw new Error(`Item with ID ${item.itemId} not found in catalog.`);
      }

      // If source bin provided, verify it belongs to source warehouse
      if (item.sourceBinId) {
        const binRow = await db.query(
          'SELECT id, warehouse_id FROM warehouse_locations WHERE id = ?',
          [item.sourceBinId]
        );
        if (!binRow[0]) {
          throw new Error(`Source bin location ${item.sourceBinId} not found.`);
        }
        if (binRow[0].warehouse_id !== input.sourceWarehouseId) {
          throw new Error(
            `Source bin ${item.sourceBinId} does not belong to source warehouse ${input.sourceWarehouseId}.`
          );
        }
      }

      // If destination bin provided, verify it belongs to destination warehouse
      if (item.destBinId) {
        const destBinRow = await db.query(
          'SELECT id, warehouse_id FROM warehouse_locations WHERE id = ?',
          [item.destBinId]
        );
        if (!destBinRow[0]) {
          throw new Error(`Destination bin location ${item.destBinId} not found.`);
        }
        if (destBinRow[0].warehouse_id !== input.destWarehouseId) {
          throw new Error(
            `Destination bin ${item.destBinId} does not belong to destination warehouse ${input.destWarehouseId}.`
          );
        }
      }
    }

    const transferId =
      input.id || `tr-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const transferNumber = input.transferNumber?.trim() || this.generateTransferNumber();

    return db.transaction(async (tx) => {
      await tx.execute(
        `INSERT INTO stock_transfers (
          id, transfer_number, source_warehouse_id, dest_warehouse_id, status,
          requested_by, carrier_name, tracking_number, notes
        ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
        [
          transferId,
          transferNumber,
          input.sourceWarehouseId,
          input.destWarehouseId,
          input.requestedBy || 'system',
          input.carrierName || null,
          input.trackingNumber || null,
          input.notes || null
        ]
      );

      for (const item of input.items) {
        const lineId = `tri-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        await tx.execute(
          `INSERT INTO stock_transfer_items (
            id, transfer_id, item_id, batch_id, source_bin_id, dest_bin_id,
            quantity_requested, quantity_shipped, quantity_received
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`,
          [
            lineId,
            transferId,
            item.itemId,
            item.batchId || null,
            item.sourceBinId || null,
            item.destBinId || null,
            item.quantityRequested
          ]
        );
      }

      const created = await this.getTransferById(transferId, tx);
      if (!created) {
        throw new Error(`Failed to load newly created transfer ${transferId}`);
      }
      return created;
    });
  }

  // ==========================================================================
  // SECTION 2: RETRIEVAL & QUERYING
  // ==========================================================================

  /**
   * Retrieves a stock transfer by its primary UUID key with attached line items and warehouse details.
   */
  public async getTransferById(
    id: string,
    targetDb?: IDatabaseService
  ): Promise<StockTransferWithItems | null> {
    const db = targetDb || dbService;
    const transfers = await db.query<any>(
      `SELECT 
        t.*,
        sw.name as sourceWarehouseName,
        sw.warehouse_code as sourceWarehouseCode,
        dw.name as destWarehouseName,
        dw.warehouse_code as destWarehouseCode
      FROM stock_transfers t
      LEFT JOIN warehouses sw ON t.source_warehouse_id = sw.id
      LEFT JOIN warehouses dw ON t.dest_warehouse_id = dw.id
      WHERE t.id = ?`,
      [id]
    );

    if (!transfers[0]) return null;

    const items = await db.query<any>(
      `SELECT 
        ti.*,
        i.name as itemName,
        i.sku as itemSku,
        i.category as itemCategory,
        i.unit_of_measure as itemUnit,
        b.batch_number as batchNumber,
        sb.bin_code as sourceBinCode,
        db_bin.bin_code as destBinCode
      FROM stock_transfer_items ti
      LEFT JOIN items i ON ti.item_id = i.id
      LEFT JOIN item_batches b ON ti.batch_id = b.id
      LEFT JOIN warehouse_locations sb ON ti.source_bin_id = sb.id
      LEFT JOIN warehouse_locations db_bin ON ti.dest_bin_id = db_bin.id
      WHERE ti.transfer_id = ?
      ORDER BY ti.created_at ASC`,
      [id]
    );

    return {
      ...transfers[0],
      items
    };
  }

  /**
   * Retrieves a stock transfer by its unique formatted transfer number.
   */
  public async getTransferByNumber(
    transferNumber: string,
    targetDb?: IDatabaseService
  ): Promise<StockTransferWithItems | null> {
    const db = targetDb || dbService;
    const rows = await db.query<{ id: string }>(
      'SELECT id FROM stock_transfers WHERE transfer_number = ?',
      [transferNumber.trim()]
    );
    if (!rows[0]) return null;
    return this.getTransferById(rows[0].id, db);
  }

  /**
   * Retrieves a list of transfers matching filter options.
   */
  public async getTransfers(
    options: TransferFilterOptions = {},
    targetDb?: IDatabaseService
  ): Promise<StockTransferWithItems[]> {
    const db = targetDb || dbService;
    let sql = `
      SELECT 
        t.*,
        sw.name as sourceWarehouseName,
        sw.warehouse_code as sourceWarehouseCode,
        dw.name as destWarehouseName,
        dw.warehouse_code as destWarehouseCode
      FROM stock_transfers t
      LEFT JOIN warehouses sw ON t.source_warehouse_id = sw.id
      LEFT JOIN warehouses dw ON t.dest_warehouse_id = dw.id
    `;
    const conditions: string[] = [];
    const params: any[] = [];

    if (options.sourceWarehouseId) {
      conditions.push('t.source_warehouse_id = ?');
      params.push(options.sourceWarehouseId);
    }

    if (options.destWarehouseId) {
      conditions.push('t.dest_warehouse_id = ?');
      params.push(options.destWarehouseId);
    }

    if (options.status) {
      conditions.push('t.status = ?');
      params.push(options.status);
    }

    if (options.search && options.search.trim()) {
      const term = `%${options.search.trim()}%`;
      conditions.push(
        '(t.transfer_number LIKE ? OR t.notes LIKE ? OR sw.name LIKE ? OR dw.name LIKE ? OR t.carrier_name LIKE ?)'
      );
      params.push(term, term, term, term, term);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    const sortBy = options.sortBy || 'created_at';
    const sortOrder = options.sortOrder || 'DESC';
    sql += ` ORDER BY t.${sortBy} ${sortOrder}`;

    if (options.limit !== undefined && options.limit > 0) {
      sql += ' LIMIT ?';
      params.push(options.limit);
      if (options.offset !== undefined && options.offset >= 0) {
        sql += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    const transferHeaders = await db.query<any>(sql, params);
    const results: StockTransferWithItems[] = [];

    for (const header of transferHeaders) {
      const items = await db.query<any>(
        `SELECT 
          ti.*,
          i.name as itemName,
          i.sku as itemSku,
          i.category as itemCategory,
          i.unit_of_measure as itemUnit,
          b.batch_number as batchNumber,
          sb.bin_code as sourceBinCode,
          db_bin.bin_code as destBinCode
        FROM stock_transfer_items ti
        LEFT JOIN items i ON ti.item_id = i.id
        LEFT JOIN item_batches b ON ti.batch_id = b.id
        LEFT JOIN warehouse_locations sb ON ti.source_bin_id = sb.id
        LEFT JOIN warehouse_locations db_bin ON ti.dest_bin_id = db_bin.id
        WHERE ti.transfer_id = ?
        ORDER BY ti.created_at ASC`,
        [header.id]
      );
      results.push({
        ...header,
        items
      });
    }

    return results;
  }

  // ==========================================================================
  // SECTION 3: STATE TRANSITION MACHINE & APPROVAL GATES
  // ==========================================================================

  /**
   * Advances or updates the transfer status according to strict transition gates:
   * draft -> requested -> in_transit -> completed / cancelled.
   * Atomically executes inside db.transaction to prevent state transition races.
   */
  public async updateTransferStatus(
    id: string,
    newStatus: TransferStatus,
    user?: string,
    notes?: string,
    targetDb?: IDatabaseService
  ): Promise<StockTransferWithItems> {
    const db = targetDb || dbService;

    return db.transaction(async (tx) => {
      const transfer = await this.getTransferById(id, tx);
      if (!transfer) {
        throw new Error(`Transfer with ID ${id} not found.`);
      }

      // Allowed transition map
      const validTransitions: Record<string, string[]> = {
        draft: ['requested', 'in_transit', 'cancelled'],
        requested: ['draft', 'in_transit', 'cancelled'],
        in_transit: ['completed', 'received'],
        completed: [],
        received: [],
        cancelled: []
      };

      // Cancellation guard: strictly block cancellation once in_transit or completed
      if (newStatus === 'cancelled') {
        if (transfer.status === 'in_transit') {
          throw new Error('Cannot cancel transfer: items are already in transit.');
        }
        if (transfer.status === 'completed' || transfer.status === 'received') {
          throw new Error('Cannot cancel transfer: transfer has already been completed.');
        }
        if (transfer.status === 'cancelled') {
          throw new Error('Transfer is already cancelled.');
        }
      }

      const allowed = validTransitions[transfer.status] || [];
      if (!allowed.includes(newStatus)) {
        throw new Error(
          `Invalid state transition: cannot move transfer from '${transfer.status}' to '${newStatus}'.`
        );
      }

      const updates: string[] = ['status = ?'];
      const params: any[] = [newStatus];

      if (user && (newStatus === 'requested' || transfer.status === 'draft')) {
        updates.push('approved_by = ?');
        params.push(user);
      }

      if (notes) {
        updates.push('notes = CASE WHEN notes IS NULL THEN ? ELSE notes || char(10) || ? END');
        params.push(notes, notes);
      }

      updates.push("updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))");
      params.push(id);

      await tx.execute(`UPDATE stock_transfers SET ${updates.join(', ')} WHERE id = ?`, params);
      return (await this.getTransferById(id, tx))!;
    });
  }

  /**
   * Submits a draft transfer for review/authorization (draft -> requested).
   */
  public async submitTransfer(
    id: string,
    requestedBy?: string,
    targetDb?: IDatabaseService
  ): Promise<StockTransferWithItems> {
    return this.updateTransferStatus(id, 'requested', requestedBy, undefined, targetDb);
  }

  /**
   * Authorizes a transfer request, setting approved_by and maintaining requested state.
   */
  public async approveTransfer(
    id: string,
    approvedBy: string,
    targetDb?: IDatabaseService
  ): Promise<StockTransferWithItems> {
    const db = targetDb || dbService;

    return db.transaction(async (tx) => {
      const transfer = await this.getTransferById(id, tx);
      if (!transfer) {
        throw new Error(`Transfer with ID ${id} not found.`);
      }
      if (transfer.status !== 'draft' && transfer.status !== 'requested') {
        throw new Error(`Cannot approve transfer in '${transfer.status}' status.`);
      }

      await tx.execute(
        `UPDATE stock_transfers 
         SET approved_by = ?, 
             status = 'requested', 
             updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) 
         WHERE id = ?`,
        [approvedBy, id]
      );

      return (await this.getTransferById(id, tx))!;
    });
  }

  // ==========================================================================
  // SECTION 4: IN-TRANSIT STOCK ISOLATION & DISPATCH
  // ==========================================================================

  /**
   * Dispatches a transfer:
   * 1. Validates transfer status INSIDE db.transaction (atomic guard against parallel races).
   * 2. Validates available stock in source warehouse & bin.
   * 3. Atomically decrements source inventory_stock (preventing phantom inventory).
   * 4. Stock is ISOLATED: not yet added to destination warehouse!
   * 5. Updates transfer item quantity_shipped and resolves batch.
   * 6. Logs double-entry immutable audit entry (TRANSFER_OUT) in inventory_transactions.
   * 7. Updates transfer status to 'in_transit' with shipped_date.
   * Supports both (transferId, dispatchedBy) and full DispatchTransferInput.
   */
  public async dispatchTransfer(
    inputOrId: string | DispatchTransferInput,
    dispatchedByOrCarrier?: string,
    targetDb?: IDatabaseService
  ): Promise<StockTransferWithItems> {
    const db = targetDb || dbService;
    const transferId = typeof inputOrId === 'string' ? inputOrId : inputOrId.transferId;
    const dispatchedBy =
      typeof inputOrId === 'object'
        ? inputOrId.dispatchedBy || 'system'
        : dispatchedByOrCarrier || 'system';
    const carrierName = typeof inputOrId === 'object' ? inputOrId.carrierName : undefined;
    const trackingNumber = typeof inputOrId === 'object' ? inputOrId.trackingNumber : undefined;

    return db.transaction(async (tx) => {
      // Re-fetch and validate transfer status INSIDE transaction boundary
      const transfer = await this.getTransferById(transferId, tx);
      if (!transfer) {
        throw new Error(`Transfer with ID ${transferId} not found.`);
      }

      if (transfer.status !== 'draft' && transfer.status !== 'requested') {
        throw new Error(
          `Cannot dispatch transfer: status is '${transfer.status}', expected 'draft' or 'requested'.`
        );
      }

      if (!transfer.items || transfer.items.length === 0) {
        throw new Error('Cannot dispatch transfer with no line items.');
      }

      for (const line of transfer.items) {
        // Query stock in source warehouse and bin
        let stockQuery = `
          SELECT id, quantity_on_hand, quantity_reserved, batch_id 
          FROM inventory_stock 
          WHERE item_id = ? AND warehouse_id = ?
        `;
        const stockParams: any[] = [line.item_id, transfer.source_warehouse_id];

        if (line.source_bin_id) {
          stockQuery += ' AND bin_id = ?';
          stockParams.push(line.source_bin_id);
        }

        if (line.batch_id) {
          stockQuery += ' AND batch_id = ?';
          stockParams.push(line.batch_id);
        } else {
          // If no batch specified, prefer highest available stock
          stockQuery += ' ORDER BY (quantity_on_hand - quantity_reserved) DESC';
        }

        const stockRows = await tx.query<InventoryStock>(stockQuery, stockParams);
        const currentStock = stockRows[0];
        const available =
          (currentStock?.quantity_on_hand || 0) - (currentStock?.quantity_reserved || 0);

        if (!currentStock || available < line.quantity_requested) {
          throw new Error(
            `Insufficient stock available in source warehouse bin for SKU ${line.item_id}. Requested ${line.quantity_requested}, Available ${available}.`
          );
        }

        // Atomically decrement source stock immediately
        const newBalance = currentStock.quantity_on_hand - line.quantity_requested;
        await tx.execute(
          `UPDATE inventory_stock 
           SET quantity_on_hand = quantity_on_hand - ?, 
               updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) 
           WHERE id = ?`,
          [line.quantity_requested, currentStock.id]
        );

        // Resolve batch_id if auto-selected from stock
        const resolvedBatchId = line.batch_id || currentStock.batch_id || null;

        // Update transfer line item shipped quantity and batch
        await tx.execute(
          `UPDATE stock_transfer_items 
           SET quantity_shipped = ?, 
               batch_id = ?, 
               updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) 
           WHERE id = ?`,
          [line.quantity_requested, resolvedBatchId, line.id]
        );

        // Query unit cost for transaction ledger
        let unitCost = 0.0;
        if (resolvedBatchId) {
          const batchRow = await tx.query<{ unit_cost: number }>(
            'SELECT unit_cost FROM item_batches WHERE id = ?',
            [resolvedBatchId]
          );
          if (batchRow[0]) unitCost = batchRow[0].unit_cost;
        } else {
          const itemRow = await tx.query<{ cost_price: number }>(
            'SELECT cost_price FROM items WHERE id = ?',
            [line.item_id]
          );
          if (itemRow[0]) unitCost = itemRow[0].cost_price;
        }

        // Double-entry immutable audit ledger: TRANSFER_OUT
        const auditId = `aud-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        await tx.execute(
          `INSERT INTO inventory_transactions (
            id, transaction_type, reference_type, reference_id, item_id, warehouse_id,
            bin_id, batch_id, quantity_change, unit_cost, running_balance_after, user_id, notes
          ) VALUES (?, 'TRANSFER_OUT', 'TRANSFER', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Stock Transfer Departure')`,
          [
            auditId,
            transfer.transfer_number,
            line.item_id,
            transfer.source_warehouse_id,
            line.source_bin_id || null,
            resolvedBatchId,
            -line.quantity_requested,
            unitCost,
            newBalance,
            dispatchedBy
          ]
        );
      }

      // Update transfer header status to 'in_transit'
      const headerUpdates: string[] = [
        "status = 'in_transit'",
        "shipped_date = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        "updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"
      ];
      const headerParams: any[] = [];

      if (carrierName) {
        headerUpdates.push('carrier_name = ?');
        headerParams.push(carrierName);
      }
      if (trackingNumber) {
        headerUpdates.push('tracking_number = ?');
        headerParams.push(trackingNumber);
      }

      headerParams.push(transferId);
      await tx.execute(
        `UPDATE stock_transfers SET ${headerUpdates.join(', ')} WHERE id = ?`,
        headerParams
      );

      const dispatched = await this.getTransferById(transferId, tx);
      return dispatched!;
    });
  }

  // ==========================================================================
  // SECTION 5: DESTINATION RECEIPT & RECONCILIATION
  // ==========================================================================

  /**
   * Receives a stock transfer at destination warehouse:
   * 1. Validates transfer status INSIDE db.transaction (atomic guard against parallel race conditions).
   * 2. Validates receipt quantities against shipped quantities (over-receiving guard).
   * 3. Atomically increments destination inventory_stock.
   * 4. Logs double-entry immutable audit entry (TRANSFER_IN) in inventory_transactions.
   * 5. Handles discrepancies (transit damage or lost items) with reason logging.
   * 6. Updates transfer status to 'completed' with received_date.
   * Supports both:
   *   receiveTransfer(id, receiptsArray, receivedBy)
   *   receiveTransfer({ transferId, receivedBy, items: [...] })
   */
  public async receiveTransfer(
    inputOrId: string | ReceiveTransferInput,
    receiptsOrReceivedBy?: any,
    receivedByParam?: string,
    targetDb?: IDatabaseService
  ): Promise<StockTransferWithItems> {
    const db = targetDb || dbService;

    let transferId: string;
    let receivedBy: string;
    let receivingNotes: string | undefined;
    let receiptLines: ReceiveTransferItemInput[];

    if (typeof inputOrId === 'object') {
      transferId = inputOrId.transferId;
      receivedBy = inputOrId.receivedBy || 'system';
      receivingNotes = inputOrId.receivingNotes;
      receiptLines = inputOrId.items;
    } else {
      transferId = inputOrId;
      receiptLines = Array.isArray(receiptsOrReceivedBy) ? receiptsOrReceivedBy : [];
      receivedBy = receivedByParam || (typeof receiptsOrReceivedBy === 'string' ? receiptsOrReceivedBy : 'system');
    }

    if (!receiptLines || receiptLines.length === 0) {
      throw new Error('Receipt must contain at least one line item verification.');
    }

    return db.transaction(async (tx) => {
      // Re-fetch and validate transfer status INSIDE transaction boundary
      const transfer = await this.getTransferById(transferId, tx);
      if (!transfer) {
        throw new Error(`Transfer with ID ${transferId} not found.`);
      }

      if (transfer.status !== 'in_transit') {
        throw new Error(
          `Cannot receive transfer: status is '${transfer.status}', expected 'in_transit'.`
        );
      }

      for (const rec of receiptLines) {
        const line = transfer.items.find((i) => i.id === rec.lineId);
        if (!line) {
          throw new Error(`Transfer line item ${rec.lineId} not found on transfer ${transferId}.`);
        }

        const qtyReceived = Number(rec.quantityReceived ?? 0);
        if (qtyReceived < 0) {
          throw new Error('Received quantity cannot be negative.');
        }

        // Over-receiving guard: cannot receive more than shipped
        if (qtyReceived > line.quantity_shipped) {
          throw new Error('Received quantity cannot exceed shipped quantity.');
        }

        const destBinId = rec.destBinId || line.dest_bin_id || null;

        // Atomically increment destination warehouse stock
        let balanceAfter = qtyReceived;
        if (qtyReceived > 0) {
          const destStockRows = await tx.query<InventoryStock>(
            `SELECT id, quantity_on_hand 
             FROM inventory_stock 
             WHERE item_id = ? AND warehouse_id = ? 
               AND (bin_id = ? OR (bin_id IS NULL AND ? IS NULL))
               AND (batch_id = ? OR (batch_id IS NULL AND ? IS NULL))`,
            [line.item_id, transfer.dest_warehouse_id, destBinId, destBinId, line.batch_id, line.batch_id]
          );

          if (destStockRows[0]) {
            balanceAfter = destStockRows[0].quantity_on_hand + qtyReceived;
            await tx.execute(
              `UPDATE inventory_stock 
               SET quantity_on_hand = quantity_on_hand + ?, 
                   updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) 
               WHERE id = ?`,
              [qtyReceived, destStockRows[0].id]
            );
          } else {
            const newStockId = `stk-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            await tx.execute(
              `INSERT INTO inventory_stock (
                id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved
              ) VALUES (?, ?, ?, ?, ?, ?, 0)`,
              [newStockId, line.item_id, transfer.dest_warehouse_id, destBinId, line.batch_id, qtyReceived]
            );
          }

          // Query unit cost for audit ledger
          let unitCost = 0.0;
          if (line.batch_id) {
            const batchRow = await tx.query<{ unit_cost: number }>(
              'SELECT unit_cost FROM item_batches WHERE id = ?',
              [line.batch_id]
            );
            if (batchRow[0]) unitCost = batchRow[0].unit_cost;
          } else {
            const itemRow = await tx.query<{ cost_price: number }>(
              'SELECT cost_price FROM items WHERE id = ?',
              [line.item_id]
            );
            if (itemRow[0]) unitCost = itemRow[0].cost_price;
          }

          // Double-entry immutable audit ledger: TRANSFER_IN
          const auditId = `aud-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          await tx.execute(
            `INSERT INTO inventory_transactions (
              id, transaction_type, reference_type, reference_id, item_id, warehouse_id,
              bin_id, batch_id, quantity_change, unit_cost, running_balance_after, user_id, notes
            ) VALUES (?, 'TRANSFER_IN', 'TRANSFER', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Stock Transfer Arrival')`,
            [
              auditId,
              transfer.transfer_number,
              line.item_id,
              transfer.dest_warehouse_id,
              destBinId,
              line.batch_id,
              qtyReceived,
              unitCost,
              balanceAfter,
              receivedBy
            ]
          );
        }

        // Update transfer item record with received quantity and discrepancy reason
        await tx.execute(
          `UPDATE stock_transfer_items 
           SET quantity_received = ?, 
               dest_bin_id = COALESCE(?, dest_bin_id),
               discrepancy_reason = ?, 
               updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) 
           WHERE id = ?`,
          [qtyReceived, destBinId, rec.discrepancyReason || null, line.id]
        );
      }

      // Update transfer header status to 'completed'
      await tx.execute(
        `UPDATE stock_transfers 
         SET status = 'completed', 
             received_date = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), 
             receiving_notes = ?, 
             updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) 
         WHERE id = ?`,
        [receivingNotes || null, transferId]
      );

      const completed = await this.getTransferById(transferId, tx);
      return completed!;
    });
  }

  // ==========================================================================
  // SECTION 6: CANCELLATION
  // ==========================================================================

  /**
   * Cancels a stock transfer.
   * Prohibited once transfer is in_transit or completed.
   * Executes atomically inside db.transaction to prevent cancellation concurrency races.
   */
  public async cancelTransfer(
    id: string,
    reason?: string,
    cancelledBy: string = 'system',
    targetDb?: IDatabaseService
  ): Promise<StockTransferWithItems> {
    const db = targetDb || dbService;

    return db.transaction(async (tx) => {
      // Re-fetch and validate transfer status INSIDE transaction boundary
      const transfer = await this.getTransferById(id, tx);
      if (!transfer) {
        throw new Error(`Transfer with ID ${id} not found.`);
      }

      if (transfer.status === 'in_transit') {
        throw new Error('Cannot cancel transfer: items are already in transit.');
      }

      if (transfer.status === 'completed' || transfer.status === 'received') {
        throw new Error('Cannot cancel transfer: transfer has already been completed.');
      }

      if (transfer.status === 'cancelled') {
        throw new Error('Transfer is already cancelled.');
      }

      const cancellationNote = reason
        ? `Cancelled by ${cancelledBy}: ${reason}`
        : `Cancelled by ${cancelledBy}`;

      await tx.execute(
        `UPDATE stock_transfers 
         SET status = 'cancelled', 
             notes = CASE WHEN notes IS NULL THEN ? ELSE notes || char(10) || ? END,
             updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) 
         WHERE id = ?`,
        [cancellationNote, cancellationNote, id]
      );

      const updated = await this.getTransferById(id, tx);
      return updated!;
    });
  }
}

export const transferService = TransferService.getInstance();
