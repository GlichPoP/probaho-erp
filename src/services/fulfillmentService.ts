// ============================================================================
// PROBAHO ERP: OUTBOUND FULFILLMENT, LOGISTICS TRACKING & RTO SERVICE
// File: src/services/fulfillmentService.ts
// Milestone: M4 - Fulfillment, Logistics Tracking & Return-to-Origin
// Proposed Statemachine & State Invariants Hardening by: explorer_m4_it2_2
// ============================================================================

import { dbService, type IDatabaseService } from './db';
import type {
  ICourier,
  Courier,
  ICreateCourierInput,
  CreateCourierInput,
  IUpdateCourierInput,
  UpdateCourierInput,
  CourierFilterOptions,
  IShipment,
  Shipment,
  IShipmentItem,
  ShipmentItem,
  ICreateShipmentInput,
  CreateShipmentInput,
  IRTOProcessingInput,
  ShipmentStatus,
  ShipmentFilterOptions,
  ShipmentWithItems,
  InventoryStock,
  InventoryTransaction
} from '../types/erp';

export class FulfillmentService {
  private static instance: FulfillmentService | null = null;

  public static getInstance(): FulfillmentService {
    if (!FulfillmentService.instance) {
      FulfillmentService.instance = new FulfillmentService();
    }
    return FulfillmentService.instance;
  }

  /**
   * Generates a unique, standardized shipment number (e.g. SHP-202610-1234).
   */
  public generateShipmentNumber(): string {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const randPart = Math.floor(1000 + Math.random() * 9000);
    return `SHP-${yearMonth}-${randPart}`;
  }

  // ==========================================================================
  // SECTION 1: COURIER & CARRIER DIRECTORY MANAGEMENT
  // ==========================================================================

  /**
   * Creates a new courier/carrier directory record.
   * Supports both object-based input and (name, phone, serviceType) arguments.
   */
  public async createCourier(
    inputOrName: string | CreateCourierInput,
    phoneOrDb?: string | IDatabaseService,
    serviceTypeOrDb?: string | IDatabaseService,
    targetDb?: IDatabaseService
  ): Promise<ICourier> {
    let name: string;
    let contactPhone: string;
    let serviceType = 'Standard';
    let trackingUrlTemplate: string | null = null;
    let customId: string | undefined;
    let db: IDatabaseService;

    if (typeof inputOrName === 'string') {
      name = inputOrName;
      contactPhone = typeof phoneOrDb === 'string' ? phoneOrDb : '';
      if (typeof serviceTypeOrDb === 'string') {
        serviceType = serviceTypeOrDb;
      }
      db = (targetDb ||
        (typeof serviceTypeOrDb === 'object'
          ? (serviceTypeOrDb as IDatabaseService)
          : typeof phoneOrDb === 'object'
          ? (phoneOrDb as IDatabaseService)
          : undefined) ||
        dbService) as IDatabaseService;
    } else {
      name = inputOrName.name;
      contactPhone = inputOrName.contactPhone || (inputOrName as any).phone || '';
      serviceType = inputOrName.serviceType || 'Standard';
      trackingUrlTemplate = inputOrName.trackingUrlTemplate || null;
      customId = inputOrName.id;
      db = (phoneOrDb && typeof phoneOrDb === 'object'
        ? (phoneOrDb as IDatabaseService)
        : targetDb || dbService) as IDatabaseService;
    }

    if (!name || !name.trim()) {
      throw new Error('Courier name is required.');
    }
    if (!contactPhone || !contactPhone.trim()) {
      throw new Error('Courier contact phone is required.');
    }

    const id = customId || `courier-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    await db.execute(
      `INSERT INTO couriers (
        id, name, service_type, contact_phone, tracking_url_template, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, 1, (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))`,
      [id, name.trim(), serviceType.trim(), contactPhone.trim(), trackingUrlTemplate]
    );

    const created = await this.getCourierById(id, db);
    if (!created) {
      throw new Error(`Failed to load newly created courier ${id}`);
    }
    return created;
  }

  /**
   * Retrieves a courier by its unique primary key ID.
   */
  public async getCourierById(id: string, targetDb?: IDatabaseService): Promise<ICourier | null> {
    const db = targetDb || dbService;
    const rows = await db.query<ICourier>('SELECT * FROM couriers WHERE id = ?', [id]);
    return rows[0] || null;
  }

  /**
   * Retrieves all couriers matching optional filter options.
   */
  public async getCouriers(
    options: CourierFilterOptions = {},
    targetDb?: IDatabaseService
  ): Promise<ICourier[]> {
    const db = targetDb || dbService;
    let sql = 'SELECT * FROM couriers';
    const conditions: string[] = [];
    const params: any[] = [];

    if (options.activeOnly !== false) {
      conditions.push('is_active = 1');
    }

    if (options.serviceType && options.serviceType.trim()) {
      conditions.push('service_type = ?');
      params.push(options.serviceType.trim());
    }

    if (options.search && options.search.trim()) {
      const term = `%${options.search.trim()}%`;
      conditions.push('(name LIKE ? OR contact_phone LIKE ?)');
      params.push(term, term);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    const sortBy = options.sortBy || 'name';
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

    return db.query<ICourier>(sql, params);
  }

  /**
   * Updates an existing courier profile.
   */
  public async updateCourier(
    id: string,
    input: UpdateCourierInput,
    targetDb?: IDatabaseService
  ): Promise<ICourier> {
    const db = targetDb || dbService;
    const courier = await this.getCourierById(id, db);
    if (!courier) {
      throw new Error(`Courier with ID ${id} not found.`);
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (input.name !== undefined) {
      updates.push('name = ?');
      params.push(input.name.trim());
    }
    if (input.contactPhone !== undefined || (input as any).phone !== undefined) {
      const phone = input.contactPhone !== undefined ? input.contactPhone : (input as any).phone;
      updates.push('contact_phone = ?');
      params.push(phone.trim());
    }
    if (input.serviceType !== undefined) {
      updates.push('service_type = ?');
      params.push(input.serviceType.trim());
    }
    if (input.trackingUrlTemplate !== undefined) {
      updates.push('tracking_url_template = ?');
      params.push(input.trackingUrlTemplate);
    }
    if (input.isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(input.isActive ? 1 : 0);
    }

    if (updates.length === 0) {
      return courier;
    }

    params.push(id);
    await db.execute(`UPDATE couriers SET ${updates.join(', ')} WHERE id = ?`, params);
    return (await this.getCourierById(id, db))!;
  }

  /**
   * Deactivates or removes a courier directory entry.
   */
  public async deleteCourier(id: string, targetDb?: IDatabaseService): Promise<{ success: boolean }> {
    const db = targetDb || dbService;
    const courier = await this.getCourierById(id, db);
    if (!courier) {
      throw new Error(`Courier with ID ${id} not found.`);
    }

    // Check if shipments reference this courier
    const linkedShipments = await db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM shipments WHERE courier_id = ?',
      [id]
    );

    if (linkedShipments[0] && linkedShipments[0].count > 0) {
      // Soft-delete to preserve foreign key historical integrity
      await db.execute('UPDATE couriers SET is_active = 0 WHERE id = ?', [id]);
    } else {
      await db.execute('DELETE FROM couriers WHERE id = ?', [id]);
    }

    return { success: true };
  }

  // ==========================================================================
  // SECTION 2: SHIPMENT CREATION & IN-TRANSACTION STOCK RESERVATION
  // ==========================================================================

  /**
   * Creates an outbound shipment and atomically reserves inventory in the source warehouse/bin.
   * Enforces business invariants:
   * 1. Must contain at least one line item with quantity > 0.
   * 2. Source warehouse must exist.
   * 3. Available stock (`quantity_on_hand - quantity_reserved >= quantity`) must be strictly verified.
   * 4. Stock reservation increments `quantity_reserved` atomically within transaction.
   * 5. Initial status is always 'pending'.
   */
  public async createShipment(
    input: CreateShipmentInput,
    targetDb?: IDatabaseService
  ): Promise<ShipmentWithItems> {
    const db = targetDb || dbService;

    // Invariant 1: Non-empty line items
    if (!input.items || input.items.length === 0) {
      throw new Error('A shipment must contain at least one line item.');
    }

    const sourceWarehouseId = input.sourceWarehouseId || input.warehouseId;
    if (!sourceWarehouseId) {
      throw new Error('Source warehouse ID is required.');
    }

    // Verify source warehouse exists
    const whRow = await db.query('SELECT id, name FROM warehouses WHERE id = ?', [
      sourceWarehouseId
    ]);
    if (!whRow[0]) {
      throw new Error(`Source warehouse with ID ${sourceWarehouseId} not found.`);
    }

    // Validate line items
    for (const line of input.items) {
      const itemId = line.itemId || line.productId;
      if (!itemId) {
        throw new Error('Item ID is required for each line item.');
      }
      if (line.quantity <= 0) {
        throw new Error('Quantity must be greater than zero.');
      }

      const itemRow = await db.query('SELECT id, sku FROM items WHERE id = ?', [itemId]);
      if (!itemRow[0]) {
        throw new Error(`Item with ID ${itemId} not found in catalog.`);
      }

      const binId = line.binId || line.locationId;
      if (binId) {
        const binRow = await db.query<{ warehouse_id: string }>(
          'SELECT warehouse_id FROM warehouse_locations WHERE id = ?',
          [binId]
        );
        if (binRow[0] && binRow[0].warehouse_id !== sourceWarehouseId) {
          throw new Error(
            `Bin ${binId} does not belong to source warehouse ${sourceWarehouseId}.`
          );
        }
      }
    }

    const shipmentId =
      input.id || `shp-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const shipmentNumber = input.shipmentNumber?.trim() || this.generateShipmentNumber();

    return db.transaction(async (tx: IDatabaseService) => {
      // Step A: In-Transaction Stock Validation & Atomic Reservation
      const resolvedBatchMap = new Map<any, string | null>();

      for (const line of input.items) {
        const itemId = line.itemId || line.productId!;
        const binId = line.binId || line.locationId;

        let stockQuery =
          'SELECT id, quantity_on_hand, quantity_reserved, batch_id FROM inventory_stock WHERE item_id = ? AND warehouse_id = ?';
        const stockParams: any[] = [itemId, sourceWarehouseId];

        if (binId) {
          stockQuery += ' AND bin_id = ?';
          stockParams.push(binId);
        }

        if (line.batchId) {
          stockQuery += ' AND batch_id = ?';
          stockParams.push(line.batchId);
        } else {
          stockQuery += ' ORDER BY (quantity_on_hand - quantity_reserved) DESC, quantity_on_hand DESC';
        }

        const stockRows = await tx.query<InventoryStock>(stockQuery, stockParams);
        const current = stockRows[0];
        const available =
          (current?.quantity_on_hand || 0) - (current?.quantity_reserved || 0);

        if (!current || available < line.quantity) {
          throw new Error(
            `Insufficient inventory to fulfill shipment for SKU ${itemId}. Requested ${line.quantity}, Available ${available}.`
          );
        }

        resolvedBatchMap.set(line, line.batchId || current.batch_id || null);

        // Atomically reserve inventory
        await tx.execute(
          `UPDATE inventory_stock 
           SET quantity_reserved = quantity_reserved + ?, 
               updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) 
           WHERE id = ?`,
          [line.quantity, current.id]
        );
      }

      // Step B: Insert Shipment Header
      await tx.execute(
        `INSERT INTO shipments (
          id, shipment_number, order_reference, source_warehouse_id, customer_name, customer_phone,
          customer_address, destination_city, destination_district, courier_id, courier_name,
          tracking_number, status, declared_value, cod_amount, shipping_fee, notes, created_by,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))`,
        [
          shipmentId,
          shipmentNumber,
          input.orderReference,
          sourceWarehouseId,
          input.customerName,
          input.customerPhone,
          input.customerAddress,
          input.destinationCity,
          input.destinationDistrict || null,
          input.courierId || null,
          input.courierName,
          input.trackingNumber || null,
          input.declaredValue ?? 0,
          input.codAmount ?? 0,
          input.shippingFee ?? 0,
          input.notes || null,
          input.createdBy || 'system'
        ]
      );

      // Step C: Insert Line Items
      for (const line of input.items) {
        const lineId = `shpi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const itemId = line.itemId || line.productId!;
        const binId = line.binId || line.locationId || null;
        const batchToSave = resolvedBatchMap.get(line) || null;
        const unitPrice = line.unitPrice ?? 0;
        const totalPrice = line.quantity * unitPrice;

        await tx.execute(
          `INSERT INTO shipment_items (
            id, shipment_id, item_id, batch_id, bin_id, quantity, unit_price, total_price, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))`,
          [
            lineId,
            shipmentId,
            itemId,
            batchToSave,
            binId,
            line.quantity,
            unitPrice,
            totalPrice
          ]
        );
      }

      const created = await this.getShipmentById(shipmentId, tx);
      if (!created) {
        throw new Error(`Failed to load newly created shipment ${shipmentId}`);
      }
      return created;
    });
  }

  // ==========================================================================
  // SECTION 3: RETRIEVAL & QUERYING
  // ==========================================================================

  /**
   * Retrieves a shipment by its primary UUID key or unique shipment number.
   * Attaches line items with product catalog names, SKUs, and bin/batch metadata.
   */
  public async getShipmentById(
    idOrNumber: string,
    targetDb?: IDatabaseService
  ): Promise<ShipmentWithItems | null> {
    const db = targetDb || dbService;

    const shipmentRows = await db.query<any>(
      `SELECT 
        s.*,
        w.name as source_warehouse_name,
        w.warehouse_code as source_warehouse_code,
        c.service_type as courier_service_type
      FROM shipments s
      LEFT JOIN warehouses w ON s.source_warehouse_id = w.id
      LEFT JOIN couriers c ON s.courier_id = c.id
      WHERE s.id = ? OR s.shipment_number = ?`,
      [idOrNumber, idOrNumber]
    );

    if (!shipmentRows[0]) return null;
    const header = shipmentRows[0];

    const items = await db.query<any>(
      `SELECT 
        si.*,
        i.name as item_name,
        i.sku as item_sku,
        i.category as item_category,
        i.unit_of_measure as item_unit,
        b.batch_number as batch_number,
        loc.bin_code as bin_code,
        loc.zone as zone
      FROM shipment_items si
      LEFT JOIN items i ON si.item_id = i.id
      LEFT JOIN item_batches b ON si.batch_id = b.id
      LEFT JOIN warehouse_locations loc ON si.bin_id = loc.id
      WHERE si.shipment_id = ?
      ORDER BY si.created_at ASC`,
      [header.id]
    );

    return {
      ...header,
      items
    };
  }

  /**
   * Alias for getShipmentById to support test client compatibility.
   */
  public async getShipment(id: string, targetDb?: IDatabaseService): Promise<ShipmentWithItems | null> {
    return this.getShipmentById(id, targetDb);
  }

  /**
   * Retrieves a list of shipments matching filter options.
   */
  public async listShipments(
    filters: ShipmentFilterOptions = {},
    targetDb?: IDatabaseService
  ): Promise<ShipmentWithItems[]> {
    const db = targetDb || dbService;
    let sql = `
      SELECT 
        s.*,
        w.name as source_warehouse_name,
        w.warehouse_code as source_warehouse_code,
        c.service_type as courier_service_type
      FROM shipments s
      LEFT JOIN warehouses w ON s.source_warehouse_id = w.id
      LEFT JOIN couriers c ON s.courier_id = c.id
    `;
    const conditions: string[] = [];
    const params: any[] = [];

    const warehouseId = filters.sourceWarehouseId || filters.warehouseId;
    if (warehouseId) {
      conditions.push('s.source_warehouse_id = ?');
      params.push(warehouseId);
    }

    if (filters.status) {
      conditions.push('s.status = ?');
      params.push(filters.status);
    }

    if (filters.courierId) {
      conditions.push('s.courier_id = ?');
      params.push(filters.courierId);
    }

    if (filters.destinationCity && filters.destinationCity.trim()) {
      conditions.push('s.destination_city LIKE ?');
      params.push(`%${filters.destinationCity.trim()}%`);
    }

    if (filters.startDate) {
      conditions.push('s.created_at >= ?');
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push('s.created_at <= ?');
      params.push(filters.endDate);
    }

    if (filters.search && filters.search.trim()) {
      const term = `%${filters.search.trim()}%`;
      conditions.push(
        '(s.shipment_number LIKE ? OR s.order_reference LIKE ? OR s.customer_name LIKE ? OR s.customer_phone LIKE ? OR s.tracking_number LIKE ?)'
      );
      params.push(term, term, term, term, term);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    const sortBy = filters.sortBy || 'created_at';
    const sortOrder = filters.sortOrder || 'DESC';
    sql += ` ORDER BY s.${sortBy} ${sortOrder}`;

    if (filters.limit !== undefined && filters.limit > 0) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
      if (filters.offset !== undefined && filters.offset >= 0) {
        sql += ' OFFSET ?';
        params.push(filters.offset);
      }
    }

    const headers = await db.query<any>(sql, params);
    const results: ShipmentWithItems[] = [];

    for (const header of headers) {
      const items = await db.query<any>(
        `SELECT 
          si.*,
          i.name as item_name,
          i.sku as item_sku,
          i.category as item_category,
          i.unit_of_measure as item_unit,
          b.batch_number as batch_number,
          loc.bin_code as bin_code,
          loc.zone as zone
        FROM shipment_items si
        LEFT JOIN items i ON si.item_id = i.id
        LEFT JOIN item_batches b ON si.batch_id = b.id
        LEFT JOIN warehouse_locations loc ON si.bin_id = loc.id
        WHERE si.shipment_id = ?
        ORDER BY si.created_at ASC`,
        [header.id]
      );
      results.push({
        ...header,
        items
      });
    }

    return results;
  }

  /**
   * Retrieves all shipments for a specific warehouse facility.
   */
  public async getShipmentsByWarehouse(
    warehouseId: string,
    status?: ShipmentStatus,
    targetDb?: IDatabaseService
  ): Promise<ShipmentWithItems[]> {
    return this.listShipments({ sourceWarehouseId: warehouseId, status }, targetDb);
  }

  // ==========================================================================
  // SECTION 4: SHIPMENT DISPATCH & ATOMIC STOCK DEDUCTION
  // ==========================================================================

  /**
   * Dispatches an outbound shipment:
   * 1. Validates tracking number requirement (mandatory upon dispatch; whitespace trimmed & rejected).
   * 2. Checks shipment status outside transaction and re-validates inside transaction boundary.
   * 3. Prevents re-dispatch on return_to_origin, rto_received, rto_delivered, dispatched, in_transit, delivered, or cancelled.
   * 4. Atomically deducts physical on-hand stock and releases reserved count.
   * 5. Logs immutable double-entry FULFILLMENT_PICK entry in inventory_transactions.
   * 6. Advances shipment status to 'dispatched' with dispatched_at timestamp and trimmed tracking number.
   */
  public async dispatchShipment(
    shipmentId: string,
    trackingNumber?: string,
    dispatchedBy: string = 'system',
    targetDb?: IDatabaseService
  ): Promise<ShipmentWithItems> {
    const db = targetDb || dbService;

    const shipment = await this.getShipmentById(shipmentId, db);
    if (!shipment) {
      throw new Error(`Shipment ${shipmentId} not found`);
    }

    // Whitespace trimming and rejection on empty/whitespace tracking numbers
    const rawTrack = trackingNumber !== undefined ? trackingNumber : shipment.tracking_number;
    const track = (rawTrack || '').trim();
    if (!track) {
      throw new Error('Tracking ID is mandatory for dispatched outbound shipments.');
    }

    // Pre-transaction status validations
    if (shipment.status === 'cancelled') {
      throw new Error('Cannot dispatch cancelled shipment.');
    }
    if (shipment.status === 'delivered') {
      throw new Error("Cannot dispatch shipment: already in terminal 'delivered' status.");
    }
    if (shipment.status === 'dispatched' || shipment.status === 'in_transit') {
      throw new Error('Shipment is already dispatched.');
    }
    if (shipment.status !== 'pending' && shipment.status !== 'packed') {
      throw new Error(
        `Cannot dispatch shipment: current status is '${shipment.status}', expected 'pending' or 'packed'.`
      );
    }

    return db.transaction(async (tx: IDatabaseService) => {
      // Re-verify shipment inside transaction to prevent concurrency race conditions
      const currentShipment = await this.getShipmentById(shipmentId, tx);
      if (!currentShipment) {
        throw new Error(`Shipment ${shipmentId} not found`);
      }

      // In-transaction status validation (blocks simultaneous un-awaited calls)
      if (currentShipment.status === 'cancelled') {
        throw new Error('Cannot dispatch cancelled shipment.');
      }
      if (currentShipment.status === 'delivered') {
        throw new Error("Cannot dispatch shipment: already in terminal 'delivered' status.");
      }
      if (currentShipment.status === 'dispatched' || currentShipment.status === 'in_transit') {
        throw new Error('Shipment is already dispatched.');
      }
      if (currentShipment.status !== 'pending' && currentShipment.status !== 'packed') {
        throw new Error(
          `Cannot dispatch shipment: current status is '${currentShipment.status}', expected 'pending' or 'packed'.`
        );
      }

      // Physical stock deduction & double-entry audit logging
      for (const line of currentShipment.items) {
        let stockQuery =
          'SELECT id, quantity_on_hand, quantity_reserved FROM inventory_stock WHERE item_id = ? AND warehouse_id = ?';
        const stockParams: any[] = [line.item_id, currentShipment.source_warehouse_id];

        if (line.bin_id) {
          stockQuery += ' AND bin_id = ?';
          stockParams.push(line.bin_id);
        }

        if (line.batch_id) {
          stockQuery += ' AND batch_id = ?';
          stockParams.push(line.batch_id);
        } else {
          stockQuery += ' ORDER BY quantity_on_hand DESC';
        }

        const stock = await tx.query<any>(stockQuery, stockParams);
        const currentStock = stock[0];

        if (!currentStock || currentStock.quantity_on_hand < line.quantity) {
          throw new Error('Physical stock no longer available in assigned bin.');
        }

        const balanceAfter = currentStock.quantity_on_hand - line.quantity;
        const reservedAfter = Math.max(0, (currentStock.quantity_reserved || 0) - line.quantity);

        // Deduct quantity_on_hand and release quantity_reserved atomically
        await tx.execute(
          `UPDATE inventory_stock 
           SET quantity_on_hand = quantity_on_hand - ?, 
               quantity_reserved = ?, 
               updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) 
           WHERE id = ?`,
          [line.quantity, reservedAfter, currentStock.id]
        );

        // Query unit cost for ledger
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

        // Immutable Double-Entry Audit Log: FULFILLMENT_PICK
        const auditId = `aud-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        await tx.execute(
          `INSERT INTO inventory_transactions (
            id, transaction_timestamp, transaction_type, reference_type, reference_id,
            item_id, warehouse_id, bin_id, batch_id, quantity_change, unit_cost,
            running_balance_after, user_id, notes
          ) VALUES (?, (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), 'FULFILLMENT_PICK', 'SHIPMENT', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Outbound Shipment Dispatch')`,
          [
            auditId,
            currentShipment.shipment_number,
            line.item_id,
            currentShipment.source_warehouse_id,
            line.bin_id || null,
            line.batch_id || null,
            -line.quantity,
            unitCost,
            balanceAfter,
            dispatchedBy
          ]
        );
      }

      // Update shipment record with trimmed tracking code
      await tx.execute(
        `UPDATE shipments 
         SET status = 'dispatched', 
             tracking_number = ?, 
             dispatched_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), 
             updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) 
         WHERE id = ?`,
        [track, shipmentId]
      );

      const dispatched = await this.getShipmentById(shipmentId, tx);
      return dispatched!;
    });
  }

  // ==========================================================================
  // SECTION 5: STATUS PROGRESSION & TERMINAL GATES
  // ==========================================================================

  /**
   * Advances the shipment status enforcing a strict transition matrix:
   * pending -> packed -> dispatched -> in_transit -> delivered / return_to_origin.
   * Terminal Gates:
   * - 'delivered', 'cancelled', 'rto_received', 'rto_delivered' are strictly terminal.
   * Disallows illegal state jumps (such as pending -> delivered).
   * Fully enclosed in an ACID transaction boundary.
   */
  public async updateShipmentStatus(
    shipmentId: string,
    status: ShipmentStatus | string,
    notes?: string,
    user: string = 'system',
    targetDb?: IDatabaseService
  ): Promise<ShipmentWithItems> {
    const db = targetDb || dbService;

    // Strict state transition dictionary
    const validTransitions: Record<string, string[]> = {
      pending: ['packed', 'cancelled'],
      packed: ['dispatched', 'cancelled'],
      dispatched: ['in_transit', 'return_to_origin'],
      in_transit: ['delivered', 'return_to_origin'],
      delivered: [], // Terminal
      return_to_origin: ['rto_received'],
      rto_received: [], // Terminal
      rto_delivered: [], // Terminal
      cancelled: [] // Terminal
    };

    // Pre-transaction validation
    const shipment = await this.getShipmentById(shipmentId, db);
    if (!shipment) {
      throw new Error(`Shipment ${shipmentId} not found`);
    }

    if (shipment.status === 'cancelled') {
      throw new Error('Cannot transition shipment: already cancelled.');
    }
    if (['delivered', 'rto_received', 'rto_delivered'].includes(shipment.status)) {
      throw new Error(`Cannot transition shipment: already in terminal '${shipment.status}' status.`);
    }

    const allowed = validTransitions[shipment.status] || [];
    if (!allowed.includes(status)) {
      throw new Error(
        `Invalid state transition: cannot move shipment from '${shipment.status}' to '${status}'.`
      );
    }

    return db.transaction(async (tx: IDatabaseService) => {
      // Re-verify shipment inside transaction to enforce consistency
      const currentShipment = await this.getShipmentById(shipmentId, tx);
      if (!currentShipment) {
        throw new Error(`Shipment ${shipmentId} not found`);
      }

      if (currentShipment.status === 'cancelled') {
        throw new Error('Cannot transition shipment: already cancelled.');
      }
      if (['delivered', 'rto_received', 'rto_delivered'].includes(currentShipment.status)) {
        throw new Error(`Cannot transition shipment: already in terminal '${currentShipment.status}' status.`);
      }

      const txAllowed = validTransitions[currentShipment.status] || [];
      if (!txAllowed.includes(status)) {
        throw new Error(
          `Invalid state transition: cannot move shipment from '${currentShipment.status}' to '${status}'.`
        );
      }

      // Cancellation: if shipment is cancelled before dispatch, release reserved stock
      if (status === 'cancelled') {
        if (currentShipment.status === 'pending' || currentShipment.status === 'packed') {
          for (const line of currentShipment.items) {
            let stockQuery =
              'SELECT id, quantity_reserved FROM inventory_stock WHERE item_id = ? AND warehouse_id = ?';
            const stockParams: any[] = [line.item_id, currentShipment.source_warehouse_id];
            if (line.bin_id) {
              stockQuery += ' AND bin_id = ?';
              stockParams.push(line.bin_id);
            }
            if (line.batch_id) {
              stockQuery += ' AND batch_id = ?';
              stockParams.push(line.batch_id);
            }
            const stockRows = await tx.query<any>(stockQuery, stockParams);
            if (stockRows[0]) {
              const newReserved = Math.max(0, stockRows[0].quantity_reserved - line.quantity);
              await tx.execute(
                `UPDATE inventory_stock SET quantity_reserved = ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE id = ?`,
                [newReserved, stockRows[0].id]
              );
            }
          }
        }

        const cancellationNote = notes
          ? `Cancelled by ${user}: ${notes}`
          : `Cancelled by ${user}`;

        await tx.execute(
          `UPDATE shipments 
           SET status = 'cancelled', 
               notes = CASE WHEN notes IS NULL THEN ? ELSE notes || char(10) || ? END,
               updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) 
           WHERE id = ?`,
          [cancellationNote, cancellationNote, shipmentId]
        );

        return (await this.getShipmentById(shipmentId, tx))!;
      }

      // If target status is 'dispatched', delegate to dispatchShipment to ensure inventory deduction & tracking
      if (status === 'dispatched') {
        const rawTrack = currentShipment.tracking_number;
        const track = (rawTrack || '').trim();
        if (!track) {
          throw new Error('Tracking ID is mandatory for dispatched outbound shipments.');
        }
        return this.dispatchShipment(shipmentId, track, user, tx);
      }

      // Return-To-Origin initiation
      if (status === 'return_to_origin') {
        const reason = notes || 'Customer Refused / Delivery Failed';
        if (notes) {
          await tx.execute(
            `UPDATE shipments 
             SET status = 'return_to_origin', 
                 rto_initiated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), 
                 rto_reason = ?, 
                 notes = CASE WHEN notes IS NULL THEN ? ELSE notes || char(10) || ? END,
                 updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) 
             WHERE id = ?`,
            [reason, notes, notes, shipmentId]
          );
        } else {
          await tx.execute(
            `UPDATE shipments 
             SET status = 'return_to_origin', 
                 rto_initiated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), 
                 rto_reason = ?, 
                 updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) 
             WHERE id = ?`,
            [reason, shipmentId]
          );
        }
      } else if (status === 'delivered') {
        if (notes) {
          await tx.execute(
            `UPDATE shipments 
             SET status = 'delivered', 
                 delivered_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), 
                 notes = CASE WHEN notes IS NULL THEN ? ELSE notes || char(10) || ? END,
                 updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) 
             WHERE id = ?`,
            [notes, notes, shipmentId]
          );
        } else {
          await tx.execute(
            `UPDATE shipments 
             SET status = 'delivered', 
                 delivered_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), 
                 updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) 
             WHERE id = ?`,
            [shipmentId]
          );
        }
      } else {
        if (notes) {
          await tx.execute(
            `UPDATE shipments 
             SET status = ?, 
                 notes = CASE WHEN notes IS NULL THEN ? ELSE notes || char(10) || ? END, 
                 updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) 
             WHERE id = ?`,
            [status, notes, notes, shipmentId]
          );
        } else {
          await tx.execute(
            `UPDATE shipments 
             SET status = ?, 
                 updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) 
             WHERE id = ?`,
            [status, shipmentId]
          );
        }
      }

      return (await this.getShipmentById(shipmentId, tx))!;
    });
  }

  // ==========================================================================
  // SECTION 6: RETURN-TO-ORIGIN (RTO) RESTOCK & WRITE-OFF WORKFLOWS
  // ==========================================================================

  /**
   * Processes Return-to-Origin (RTO) parcel resolution:
   * - Requires shipment to be in 'return_to_origin' status.
   * - Re-queries and re-validates shipment status inside transaction boundary.
   * - For 'restocked' disposition: atomically increments target bin inventory_stock
   *   and logs double-entry RETURN_RESTOCK entry in inventory_transactions.
   * - For 'damaged_writeoff' disposition: leaves physical stock unchanged and logs
   *   ADJUSTMENT_WRITE_OFF entry in inventory_transactions.
   * - Sets shipment status to 'rto_received' with rto_disposition recorded.
   */
  public async processRTO(
    inputOrId: string | IRTOProcessingInput,
    dispositionOrBin?: 'restocked' | 'damaged_writeoff' | IDatabaseService,
    targetBinIdOrUser?: string | IDatabaseService,
    userParam?: string,
    targetDb?: IDatabaseService
  ): Promise<ShipmentWithItems> {
    let shipmentId: string;
    let disposition: 'restocked' | 'damaged_writeoff';
    let targetBinId: string | undefined;
    let user = 'system';
    let db: IDatabaseService;

    if (typeof inputOrId === 'object') {
      shipmentId = inputOrId.shipmentId;
      disposition = inputOrId.disposition;
      targetBinId = inputOrId.targetBinId;
      user = inputOrId.user || 'system';
      db = (dispositionOrBin && typeof dispositionOrBin === 'object'
        ? (dispositionOrBin as IDatabaseService)
        : targetDb || dbService) as IDatabaseService;
    } else {
      shipmentId = inputOrId;
      disposition = dispositionOrBin as 'restocked' | 'damaged_writeoff';
      targetBinId = typeof targetBinIdOrUser === 'string' ? targetBinIdOrUser : undefined;
      user = userParam || 'system';
      db = (targetDb ||
        (typeof targetBinIdOrUser === 'object'
          ? (targetBinIdOrUser as IDatabaseService)
          : dbService)) as IDatabaseService;
    }

    const shipment = await this.getShipmentById(shipmentId, db);
    if (!shipment) {
      throw new Error(`Shipment ${shipmentId} not found`);
    }

    if (shipment.status !== 'return_to_origin') {
      throw new Error(
        `Cannot process RTO: shipment status is '${shipment.status}', expected 'return_to_origin'.`
      );
    }

    return db.transaction(async (tx: IDatabaseService) => {
      // Re-query inside transaction to guarantee concurrency isolation
      const currentShipment = await this.getShipmentById(shipmentId, tx);
      if (!currentShipment) {
        throw new Error(`Shipment ${shipmentId} not found`);
      }

      if (currentShipment.status !== 'return_to_origin') {
        throw new Error(
          `Cannot process RTO: shipment status is '${currentShipment.status}', expected 'return_to_origin'.`
        );
      }

      if (disposition === 'restocked') {
        for (const line of currentShipment.items) {
          const bin = targetBinId || line.bin_id;

          if (bin) {
            const binRow = await tx.query<{ id: string; warehouse_id: string }>(
              'SELECT id, warehouse_id FROM warehouse_locations WHERE id = ?',
              [bin]
            );
            if (!binRow[0]) {
              throw new Error(`Destination bin ${bin} not found.`);
            }
            if (binRow[0].warehouse_id !== currentShipment.source_warehouse_id) {
              throw new Error(
                `Destination bin ${bin} does not belong to warehouse ${currentShipment.source_warehouse_id}.`
              );
            }
          }

          const stock = await tx.query<any>(
            `SELECT id, quantity_on_hand 
             FROM inventory_stock 
             WHERE item_id = ? AND warehouse_id = ? 
               AND (bin_id = ? OR (bin_id IS NULL AND ? IS NULL)) 
               AND (batch_id = ? OR (batch_id IS NULL AND ? IS NULL))`,
            [line.item_id, currentShipment.source_warehouse_id, bin, bin, line.batch_id, line.batch_id]
          );

          let balanceAfter = line.quantity;
          if (stock[0]) {
            balanceAfter = stock[0].quantity_on_hand + line.quantity;
            await tx.execute(
              `UPDATE inventory_stock 
               SET quantity_on_hand = quantity_on_hand + ?, 
                   updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) 
               WHERE id = ?`,
              [line.quantity, stock[0].id]
            );
          } else {
            const newStockId = `stk-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            await tx.execute(
              `INSERT INTO inventory_stock (
                id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, 0, (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))`,
              [newStockId, line.item_id, currentShipment.source_warehouse_id, bin, line.batch_id, line.quantity]
            );
          }

          // Query unit cost for ledger
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

          // Immutable Double-Entry Audit Log: RETURN_RESTOCK
          const auditId = `aud-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          await tx.execute(
            `INSERT INTO inventory_transactions (
              id, transaction_timestamp, transaction_type, reference_type, reference_id,
              item_id, warehouse_id, bin_id, batch_id, quantity_change, unit_cost,
              running_balance_after, user_id, notes
            ) VALUES (?, (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), 'RETURN_RESTOCK', 'SHIPMENT', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RTO Restocked Into Bin')`,
            [
              auditId,
              currentShipment.shipment_number,
              line.item_id,
              currentShipment.source_warehouse_id,
              bin,
              line.batch_id,
              line.quantity,
              unitCost,
              balanceAfter,
              user
            ]
          );
        }
      } else {
        // Damaged scrap write-off: log immutable ADJUSTMENT_WRITE_OFF audit entry
        for (const line of currentShipment.items) {
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

          // Query actual remaining balance in the bin/batch for the warehouse
          let currentBalance = 0;
          if (line.bin_id) {
            let sql = `SELECT quantity_on_hand FROM inventory_stock WHERE item_id = ? AND warehouse_id = ? AND bin_id = ?`;
            const params: any[] = [line.item_id, currentShipment.source_warehouse_id, line.bin_id];
            if (line.batch_id) {
              sql += ` AND batch_id = ?`;
              params.push(line.batch_id);
            }
            const stockRow = await tx.query<{ quantity_on_hand: number }>(sql, params);
            currentBalance = stockRow[0] ? stockRow[0].quantity_on_hand : 0;
          } else {
            let sql = `SELECT COALESCE(SUM(quantity_on_hand), 0) as quantity_on_hand FROM inventory_stock WHERE item_id = ? AND warehouse_id = ?`;
            const params: any[] = [line.item_id, currentShipment.source_warehouse_id];
            if (line.batch_id) {
              sql += ` AND batch_id = ?`;
              params.push(line.batch_id);
            }
            const stockRow = await tx.query<{ quantity_on_hand: number }>(sql, params);
            currentBalance = stockRow[0] ? stockRow[0].quantity_on_hand : 0;
          }

          const auditId = `aud-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          await tx.execute(
            `INSERT INTO inventory_transactions (
              id, transaction_timestamp, transaction_type, reference_type, reference_id,
              item_id, warehouse_id, bin_id, batch_id, quantity_change, unit_cost,
              running_balance_after, user_id, notes
            ) VALUES (?, (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), 'ADJUSTMENT_WRITE_OFF', 'SHIPMENT', ?, ?, ?, ?, ?, 0, ?, ?, ?, 'RTO Damaged Scrap Write-off')`,
            [
              auditId,
              currentShipment.shipment_number,
              line.item_id,
              currentShipment.source_warehouse_id,
              line.bin_id || null,
              line.batch_id || null,
              unitCost,
              currentBalance,
              user
            ]
          );
        }
      }

      // Update shipment status to rto_received
      await tx.execute(
        `UPDATE shipments 
         SET status = 'rto_received', 
             rto_received_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), 
             rto_disposition = ?, 
             updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) 
         WHERE id = ?`,
        [disposition, shipmentId]
      );

      const resolved = await this.getShipmentById(shipmentId, tx);
      return resolved!;
    });
  }

  // ==========================================================================
  // SECTION 7: LOGISTICS & FULFILLMENT KPI STATISTICS
  // ==========================================================================

  /**
   * Retrieves summary fulfillment KPI metrics across all shipments or for a specific warehouse.
   */
  public async getFulfillmentStats(
    warehouseId?: string,
    targetDb?: IDatabaseService
  ): Promise<{
    totalShipments: number;
    pendingCount: number;
    dispatchedCount: number;
    inTransitCount: number;
    deliveredCount: number;
    rtoCount: number;
    cancelledCount: number;
    totalDeclaredValue: number;
    totalCodCollected: number;
  }> {
    const db = targetDb || dbService;
    let sql = `
      SELECT 
        COUNT(*) as total_shipments,
        SUM(CASE WHEN status IN ('pending', 'packed') THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'dispatched' THEN 1 ELSE 0 END) as dispatched_count,
        SUM(CASE WHEN status = 'in_transit' THEN 1 ELSE 0 END) as in_transit_count,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered_count,
        SUM(CASE WHEN status IN ('return_to_origin', 'rto_received', 'rto_delivered') THEN 1 ELSE 0 END) as rto_count,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count,
        COALESCE(SUM(declared_value), 0) as total_declared_value,
        COALESCE(SUM(CASE WHEN status = 'delivered' THEN cod_amount ELSE 0 END), 0) as total_cod_collected
      FROM shipments
    `;
    const params: any[] = [];
    if (warehouseId) {
      sql += ' WHERE source_warehouse_id = ?';
      params.push(warehouseId);
    }

    const rows = await db.query<any>(sql, params);
    const r = rows[0] || {};

    return {
      totalShipments: Number(r.total_shipments || 0),
      pendingCount: Number(r.pending_count || 0),
      dispatchedCount: Number(r.dispatched_count || 0),
      inTransitCount: Number(r.in_transit_count || 0),
      deliveredCount: Number(r.delivered_count || 0),
      rtoCount: Number(r.rto_count || 0),
      cancelledCount: Number(r.cancelled_count || 0),
      totalDeclaredValue: Number(r.total_declared_value || 0),
      totalCodCollected: Number(r.total_cod_collected || 0)
    };
  }
}

export const fulfillmentService = FulfillmentService.getInstance();
