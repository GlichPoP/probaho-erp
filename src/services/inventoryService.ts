// ============================================================================
// PROBAHO ERP: MULTI-WAREHOUSE INVENTORY & VALUATION SERVICE
// Proposed File: src/services/inventoryService.ts
// Milestone: M3 - Multi-Warehouse Inventory, Bins, Batches & Valuation
// ============================================================================

import { dbService, type IDatabaseService } from './db';
import type {
  Warehouse,
  CreateWarehouseInput,
  WarehouseLocation,
  CreateLocationInput,
  ItemBatch,
  InventoryStock,
  ValuationMethod,
  TransactionType,
  ReferenceType,
  InventoryTransaction,
  BatchStatus
} from '../types/erp';

// ============================================================================
// DOMAIN INTERFACES & INPUT DTOs
// ============================================================================

export interface WarehouseFilterOptions {
  activeOnly?: boolean;
  search?: string;
  city?: string;
  sortBy?: 'name' | 'warehouse_code' | 'city' | 'created_at';
  sortOrder?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

export interface UpdateWarehouseInput {
  warehouseCode?: string;
  name?: string;
  address?: string;
  city?: string;
  district?: string;
  contactPerson?: string;
  contactPhone?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface WarehouseStats {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  totalLocations: number;
  activeLocations: number;
  totalSkus: number;
  totalQuantityOnHand: number;
  totalQuantityReserved: number;
  totalQuantityAvailable: number;
  totalValuation: number;
}

export interface LocationFilterOptions {
  zone?: string;
  aisle?: string;
  activeOnly?: boolean;
  search?: string;
  sortBy?: 'bin_code' | 'zone' | 'aisle' | 'created_at';
  sortOrder?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

export interface UpdateLocationInput {
  zone?: string;
  aisle?: string;
  rack?: string;
  shelf?: string;
  binCode?: string;
  maxWeightKg?: number | null;
  isActive?: boolean;
}

export interface CreateBatchInput {
  id?: string;
  batchNumber: string;
  itemId: string;
  supplierId?: string;
  manufactureDate?: string;
  expiryDate?: string;
  unitCost: number;
  quantity?: number;
  initialQuantity?: number;
  status?: BatchStatus;
}

export interface UpdateBatchInput {
  status?: BatchStatus;
  expiryDate?: string;
  manufactureDate?: string;
  unitCost?: number;
  supplierId?: string;
}

export interface BatchFilterOptions {
  status?: BatchStatus;
  activeOnly?: boolean;
  excludeExpired?: boolean;
  search?: string;
  sortBy?: 'expiry_date' | 'manufacture_date' | 'batch_number' | 'current_quantity' | 'created_at';
  sortOrder?: 'ASC' | 'DESC';
}

export interface ExpiringBatchInfo {
  id: string;
  batchNumber: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  category: string;
  expiryDate: string;
  daysUntilExpiry: number;
  currentQuantity: number;
  unitCost: number;
  totalValue: number;
  status: BatchStatus;
  isExpired: boolean;
}

export interface StockFilterOptions {
  itemId?: string;
  warehouseId?: string;
  binId?: string;
  batchId?: string;
  category?: string;
  search?: string;
  lowStockOnly?: boolean;
  positiveStockOnly?: boolean;
  sortBy?: 'sku' | 'name' | 'warehouse_name' | 'bin_code' | 'quantity_on_hand' | 'valuation';
  sortOrder?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

export interface EnrichedStockRecord {
  id: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  category: string;
  unitOfMeasure: string;
  costPrice: number;
  sellingPrice: number;
  minStockAlert: number;
  safetyStock: number;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  binId: string | null;
  binCode: string | null;
  zone: string | null;
  aisle: string | null;
  rack: string | null;
  shelf: string | null;
  batchId: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  batchStatus: BatchStatus | null;
  batchUnitCost: number | null;
  effectiveUnitCost: number;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  totalValuation: number;
  isLowStock: boolean;
  isSafetyStockBreached: boolean;
  isExpiredBatch: boolean;
}

export interface StockSummary {
  onHand: number;
  reserved: number;
  available: number;
}

export interface BatchAllocationResult {
  batchId: string;
  batchNumber: string;
  warehouseId: string;
  binId?: string | null;
  binCode?: string | null;
  expiryDate?: string | null;
  availableQuantity: number;
  allocatedQuantity: number;
  unitCost: number;
}

export interface ItemValuationDetail {
  itemId: string;
  item_id: string; // compatibility with tests
  sku: string;
  name: string;
  category: string;
  valuation_method: ValuationMethod;
  cost_price: number;
  quantity: number; // total units on hand
  item_total_value: number; // total value in currency
  weighted_average_cost: number;
  fifoLayers?: Array<{
    batchId?: string;
    batchNumber?: string;
    quantity: number;
    unitCost: number;
    totalValue: number;
    receivedDate?: string;
    expiryDate?: string;
  }>;
}

export interface InventoryValuationReport {
  warehouseId?: string;
  warehouseName?: string;
  valuationDate: string;
  totalUnits: number;
  totalValuation: number;
  averageUnitCost: number;
  totalSkus: number;
  itemsValuation: ItemValuationDetail[];
}

export interface LowStockAlert {
  itemId: string;
  sku: string;
  name: string;
  category: string;
  unitOfMeasure: string;
  warehouseId?: string;
  warehouseName?: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  minStockAlert: number;
  safetyStock: number;
  maxStock: number;
  alertLevel: 'OUT_OF_STOCK' | 'CRITICAL' | 'WARNING';
  deficitQuantity: number;
  suggestedReorderQuantity: number;
}

export interface InventoryHealthMetrics {
  totalActiveSkus: number;
  totalUnitsOnHand: number;
  totalUnitsReserved: number;
  totalUnitsAvailable: number;
  totalInventoryValuation: number;
  outOfStockSkus: number;
  criticalStockSkus: number;
  lowStockSkus: number;
  expiredBatchesCount: number;
  expiringSoonBatchesCount: number;
}

export interface StockAdjustmentInput {
  itemId: string;
  warehouseId: string;
  binId?: string | null;
  batchId?: string | null;
  adjustmentType: 'DELTA' | 'NEW_BALANCE';
  quantity: number; // If DELTA: +/- change. If NEW_BALANCE: absolute new target balance.
  reason: 'CYCLE_COUNT_ADJUSTMENT' | 'ADJUSTMENT_WRITE_OFF';
  unitCost?: number;
  notes?: string;
  userId?: string;
}

export interface StockAdjustmentResult {
  stockId: string;
  transactionId: string;
  itemId: string;
  warehouseId: string;
  previousBalance: number;
  quantityChange: number;
  newBalance: number;
  transactionType: TransactionType;
}

export interface TransactionFilterOptions {
  itemId?: string;
  warehouseId?: string;
  referenceId?: string;
  referenceType?: ReferenceType;
  transactionType?: TransactionType;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

export class InventoryService {
  private static instance: InventoryService | null = null;

  public static getInstance(): InventoryService {
    if (!InventoryService.instance) {
      InventoryService.instance = new InventoryService();
    }
    return InventoryService.instance;
  }

  // --- ID Generation Utilities ---
  public generateWarehouseId(): string {
    return `wh-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  public generateLocationId(): string {
    return `loc-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  public generateBatchId(): string {
    return `batch-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  public generateStockId(): string {
    return `stk-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  public generateTransactionId(): string {
    return `tx-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  public generateAuditId(): string {
    return `aud-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  // ==========================================================================
  // SECTION 1: MULTI-WAREHOUSE INFRASTRUCTURE
  // ==========================================================================

  /**
   * Retrieves all warehouses with optional active filtering, keyword search, and sorting.
   */
  public async getAllWarehouses(
    options: WarehouseFilterOptions = {},
    targetDb?: IDatabaseService
  ): Promise<Warehouse[]> {
    const db = targetDb || dbService;
    let sql = 'SELECT * FROM warehouses';
    const conditions: string[] = [];
    const params: any[] = [];

    if (options.activeOnly) {
      conditions.push('is_active = 1');
    }

    if (options.city && options.city.trim()) {
      conditions.push('city = ?');
      params.push(options.city.trim());
    }

    if (options.search && options.search.trim()) {
      const term = `%${options.search.trim()}%`;
      conditions.push('(name LIKE ? OR warehouse_code LIKE ? OR city LIKE ? OR contact_person LIKE ?)');
      params.push(term, term, term, term);
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

    return db.query<Warehouse>(sql, params);
  }

  /**
   * Alias for getAllWarehouses (compatible with test harnesses).
   */
  public async listWarehouses(targetDb?: IDatabaseService): Promise<Warehouse[]> {
    return this.getAllWarehouses({}, targetDb);
  }

  /**
   * Retrieves a warehouse by internal primary key ID.
   */
  public async getWarehouseById(id: string, targetDb?: IDatabaseService): Promise<Warehouse | null> {
    const db = targetDb || dbService;
    const rows = await db.query<Warehouse>('SELECT * FROM warehouses WHERE id = ?', [id]);
    return rows[0] || null;
  }

  /**
   * Alias for getWarehouseById.
   */
  public async getWarehouse(id: string, targetDb?: IDatabaseService): Promise<Warehouse | null> {
    return this.getWarehouseById(id, targetDb);
  }

  /**
   * Retrieves a warehouse by its unique human-readable code (e.g. 'WH-DHAKA-CENTRAL').
   */
  public async getWarehouseByCode(code: string, targetDb?: IDatabaseService): Promise<Warehouse | null> {
    const db = targetDb || dbService;
    const rows = await db.query<Warehouse>('SELECT * FROM warehouses WHERE warehouse_code = ?', [code.trim()]);
    return rows[0] || null;
  }

  /**
   * Creates a new warehouse facility.
   * If marked as default, automatically unsets any prior default warehouse within an atomic transaction.
   */
  public async createWarehouse(
    input: CreateWarehouseInput,
    targetDb?: IDatabaseService
  ): Promise<Warehouse> {
    const db = targetDb || dbService;

    // 1. Mandatory field validation
    if (!input.warehouseCode || !input.warehouseCode.trim()) {
      throw new Error('Warehouse code is mandatory.');
    }
    if (!input.name || !input.name.trim()) {
      throw new Error('Warehouse name is mandatory.');
    }
    if (!input.address || !input.address.trim()) {
      throw new Error('Warehouse address is mandatory.');
    }
    if (!input.city || !input.city.trim()) {
      throw new Error('Warehouse city is mandatory.');
    }

    const code = input.warehouseCode.trim();
    const existing = await this.getWarehouseByCode(code, db);
    if (existing) {
      throw new Error(`Warehouse with code '${code}' already exists.`);
    }

    const id = input.id || this.generateWarehouseId();
    const isDefault = input.isDefault ? 1 : 0;

    return db.transaction(async (tx: IDatabaseService) => {
      // If setting default, unset existing default
      if (isDefault === 1) {
        await tx.execute('UPDATE warehouses SET is_default = 0 WHERE is_default = 1');
      }

      await tx.execute(
        `INSERT INTO warehouses (
          id, warehouse_code, name, address, city, district, contact_person, contact_phone, is_default, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          id,
          code,
          input.name.trim(),
          input.address.trim(),
          input.city.trim(),
          input.district?.trim() || null,
          input.contactPerson?.trim() || null,
          input.contactPhone?.trim() || null,
          isDefault
        ]
      );

      const created = await this.getWarehouseById(id, tx);
      if (!created) {
        throw new Error(`Failed to load newly created warehouse ${id}`);
      }
      return created;
    });
  }

  /**
   * Updates an existing warehouse with partial fields.
   */
  public async updateWarehouse(
    id: string,
    input: UpdateWarehouseInput,
    targetDb?: IDatabaseService
  ): Promise<Warehouse> {
    const db = targetDb || dbService;
    const existing = await this.getWarehouseById(id, db);
    if (!existing) {
      throw new Error(`Warehouse with ID ${id} not found.`);
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (input.warehouseCode !== undefined) {
      if (!input.warehouseCode.trim()) throw new Error('Warehouse code cannot be empty.');
      const code = input.warehouseCode.trim();
      const duplicate = await db.query<Warehouse>(
        'SELECT id FROM warehouses WHERE warehouse_code = ? AND id != ?',
        [code, id]
      );
      if (duplicate.length > 0) {
        throw new Error(`Warehouse with code '${code}' is already in use by another warehouse.`);
      }
      updates.push('warehouse_code = ?');
      params.push(code);
    }

    if (input.name !== undefined) {
      if (!input.name.trim()) throw new Error('Warehouse name cannot be empty.');
      updates.push('name = ?');
      params.push(input.name.trim());
    }

    if (input.address !== undefined) {
      if (!input.address.trim()) throw new Error('Warehouse address cannot be empty.');
      updates.push('address = ?');
      params.push(input.address.trim());
    }

    if (input.city !== undefined) {
      if (!input.city.trim()) throw new Error('Warehouse city cannot be empty.');
      updates.push('city = ?');
      params.push(input.city.trim());
    }

    if (input.district !== undefined) {
      updates.push('district = ?');
      params.push(input.district ? input.district.trim() : null);
    }

    if (input.contactPerson !== undefined) {
      updates.push('contact_person = ?');
      params.push(input.contactPerson ? input.contactPerson.trim() : null);
    }

    if (input.contactPhone !== undefined) {
      updates.push('contact_phone = ?');
      params.push(input.contactPhone ? input.contactPhone.trim() : null);
    }

    if (input.isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(input.isActive ? 1 : 0);
    }

    return db.transaction(async (tx: IDatabaseService) => {
      if (input.isDefault !== undefined) {
        const isDef = input.isDefault ? 1 : 0;
        if (isDef === 1) {
          await tx.execute('UPDATE warehouses SET is_default = 0 WHERE is_default = 1');
        }
        updates.push('is_default = ?');
        params.push(isDef);
      }

      if (updates.length > 0) {
        updates.push("updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))");
        params.push(id);
        await tx.execute(`UPDATE warehouses SET ${updates.join(', ')} WHERE id = ?`, params);
      }

      const refreshed = await this.getWarehouseById(id, tx);
      if (!refreshed) {
        throw new Error(`Failed to reload warehouse ${id}`);
      }
      return refreshed;
    });
  }

  /**
   * Soft-deletes a warehouse facility.
   * Safety invariant: Blocks deactivation if physical stock is on hand or if marked as default.
   */
  public async deleteWarehouse(
    id: string,
    targetDb?: IDatabaseService
  ): Promise<{ success: boolean; softDeleted: boolean }> {
    const db = targetDb || dbService;
    const warehouse = await this.getWarehouseById(id, db);
    if (!warehouse) {
      throw new Error(`Warehouse with ID ${id} not found.`);
    }

    if (warehouse.is_default === 1) {
      throw new Error('Cannot delete or deactivate the default warehouse. Designate a new default warehouse first.');
    }

    // Check for existing physical inventory on hand
    const stockCheck = await db.query<{ total: number }>(
      'SELECT COALESCE(SUM(quantity_on_hand), 0) as total FROM inventory_stock WHERE warehouse_id = ?',
      [id]
    );
    const stockCount = Number(stockCheck[0]?.total || 0);
    if (stockCount > 0) {
      throw new Error(
        `Cannot delete or deactivate warehouse '${warehouse.name}': facility currently holds ${stockCount} units of inventory on hand. Stock must be transferred or written off first.`
      );
    }

    await db.execute(
      `UPDATE warehouses 
       SET is_active = 0, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       WHERE id = ?`,
      [id]
    );

    return { success: true, softDeleted: true };
  }

  /**
   * Aggregates live statistical metrics for a specific warehouse.
   */
  public async getWarehouseStats(
    warehouseId: string,
    targetDb?: IDatabaseService
  ): Promise<WarehouseStats> {
    const db = targetDb || dbService;
    const warehouse = await this.getWarehouseById(warehouseId, db);
    if (!warehouse) {
      throw new Error(`Warehouse with ID ${warehouseId} not found.`);
    }

    // Locations count
    const locRows = await db.query<{ total: number; active: number }>(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active
       FROM warehouse_locations WHERE warehouse_id = ?`,
      [warehouseId]
    );

    // Stock & valuation aggregates
    const stockRows = await db.query<{
      distinct_skus: number;
      total_on_hand: number;
      total_reserved: number;
      total_value: number;
    }>(
      `SELECT 
        COUNT(DISTINCT s.item_id) as distinct_skus,
        COALESCE(SUM(s.quantity_on_hand), 0) as total_on_hand,
        COALESCE(SUM(s.quantity_reserved), 0) as total_reserved,
        COALESCE(SUM(s.quantity_on_hand * COALESCE(b.unit_cost, i.cost_price)), 0.0) as total_value
       FROM inventory_stock s
       JOIN items i ON s.item_id = i.id
       LEFT JOIN item_batches b ON s.batch_id = b.id
       WHERE s.warehouse_id = ?`,
      [warehouseId]
    );

    const s = stockRows[0] || { distinct_skus: 0, total_on_hand: 0, total_reserved: 0, total_value: 0 };
    const onHand = Number(s.total_on_hand);
    const reserved = Number(s.total_reserved);

    return {
      warehouseId: warehouse.id,
      warehouseCode: warehouse.warehouse_code,
      warehouseName: warehouse.name,
      totalLocations: Number(locRows[0]?.total || 0),
      activeLocations: Number(locRows[0]?.active || 0),
      totalSkus: Number(s.distinct_skus),
      totalQuantityOnHand: onHand,
      totalQuantityReserved: reserved,
      totalQuantityAvailable: onHand - reserved,
      totalValuation: Math.round(Number(s.total_value) * 100) / 100
    };
  }

  // ==========================================================================
  // SECTION 2: WAREHOUSE BIN / LOCATION HIERARCHY
  // ==========================================================================

  /**
   * Registers a granular bin location within a warehouse.
   * Enforces warehouse existence and unique composite (warehouse_id, bin_code).
   */
  public async createLocation(
    input: CreateLocationInput,
    targetDb?: IDatabaseService
  ): Promise<WarehouseLocation> {
    const db = targetDb || dbService;

    if (!input.warehouseId || !input.warehouseId.trim()) {
      throw new Error('Warehouse ID is mandatory for bin location.');
    }
    if (!input.zone || !input.zone.trim()) {
      throw new Error('Zone is mandatory.');
    }
    if (!input.aisle || !input.aisle.trim()) {
      throw new Error('Aisle is mandatory.');
    }
    if (!input.rack || !input.rack.trim()) {
      throw new Error('Rack is mandatory.');
    }
    if (!input.shelf || !input.shelf.trim()) {
      throw new Error('Shelf is mandatory.');
    }
    if (!input.binCode || !input.binCode.trim()) {
      throw new Error('Bin code is mandatory.');
    }

    const warehouse = await this.getWarehouseById(input.warehouseId, db);
    if (!warehouse) {
      throw new Error(`Warehouse with ID ${input.warehouseId} does not exist.`);
    }

    const binCode = input.binCode.trim();
    const existing = await this.getLocationByCode(input.warehouseId, binCode, db);
    if (existing) {
      throw new Error(`Bin location '${binCode}' already exists in warehouse '${warehouse.name}'.`);
    }

    if (input.maxWeightKg !== undefined && input.maxWeightKg !== null && input.maxWeightKg <= 0) {
      throw new Error('Max weight capacity must be greater than zero.');
    }

    const id = input.id || this.generateLocationId();

    await db.execute(
      `INSERT INTO warehouse_locations (
        id, warehouse_id, zone, aisle, rack, shelf, bin_code, max_weight_kg, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        id,
        input.warehouseId,
        input.zone.trim(),
        input.aisle.trim(),
        input.rack.trim(),
        input.shelf.trim(),
        binCode,
        input.maxWeightKg ?? null
      ]
    );

    const created = await this.getLocationById(id, db);
    if (!created) {
      throw new Error(`Failed to load newly created bin location ${id}`);
    }
    return created;
  }

  /**
   * Retrieves a bin location by its internal primary key ID.
   */
  public async getLocationById(id: string, targetDb?: IDatabaseService): Promise<WarehouseLocation | null> {
    const db = targetDb || dbService;
    const rows = await db.query<WarehouseLocation>('SELECT * FROM warehouse_locations WHERE id = ?', [id]);
    return rows[0] || null;
  }

  /**
   * Alias for getLocationById.
   */
  public async getLocation(id: string, targetDb?: IDatabaseService): Promise<WarehouseLocation | null> {
    return this.getLocationById(id, targetDb);
  }

  /**
   * Retrieves a bin location by composite key (warehouse_id, bin_code).
   */
  public async getLocationByCode(
    warehouseId: string,
    binCode: string,
    targetDb?: IDatabaseService
  ): Promise<WarehouseLocation | null> {
    const db = targetDb || dbService;
    const rows = await db.query<WarehouseLocation>(
      'SELECT * FROM warehouse_locations WHERE warehouse_id = ? AND bin_code = ?',
      [warehouseId, binCode.trim()]
    );
    return rows[0] || null;
  }

  /**
   * Lists all bin locations for a warehouse facility with optional filtering.
   */
  public async getLocationsByWarehouse(
    warehouseId: string,
    options: LocationFilterOptions = {},
    targetDb?: IDatabaseService
  ): Promise<WarehouseLocation[]> {
    const db = targetDb || dbService;
    let sql = 'SELECT * FROM warehouse_locations WHERE warehouse_id = ?';
    const params: any[] = [warehouseId];

    if (options.activeOnly) {
      sql += ' AND is_active = 1';
    }

    if (options.zone && options.zone.trim()) {
      sql += ' AND zone = ?';
      params.push(options.zone.trim());
    }

    if (options.aisle && options.aisle.trim()) {
      sql += ' AND aisle = ?';
      params.push(options.aisle.trim());
    }

    if (options.search && options.search.trim()) {
      const term = `%${options.search.trim()}%`;
      sql += ' AND (bin_code LIKE ? OR zone LIKE ? OR aisle LIKE ?)';
      params.push(term, term, term);
    }

    const sortBy = options.sortBy || 'bin_code';
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

    return db.query<WarehouseLocation>(sql, params);
  }

  /**
   * Updates an existing bin location.
   */
  public async updateLocation(
    id: string,
    input: UpdateLocationInput,
    targetDb?: IDatabaseService
  ): Promise<WarehouseLocation> {
    const db = targetDb || dbService;
    const existing = await this.getLocationById(id, db);
    if (!existing) {
      throw new Error(`Location with ID ${id} not found.`);
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (input.zone !== undefined) {
      if (!input.zone.trim()) throw new Error('Zone cannot be empty.');
      updates.push('zone = ?');
      params.push(input.zone.trim());
    }

    if (input.aisle !== undefined) {
      if (!input.aisle.trim()) throw new Error('Aisle cannot be empty.');
      updates.push('aisle = ?');
      params.push(input.aisle.trim());
    }

    if (input.rack !== undefined) {
      if (!input.rack.trim()) throw new Error('Rack cannot be empty.');
      updates.push('rack = ?');
      params.push(input.rack.trim());
    }

    if (input.shelf !== undefined) {
      if (!input.shelf.trim()) throw new Error('Shelf cannot be empty.');
      updates.push('shelf = ?');
      params.push(input.shelf.trim());
    }

    if (input.binCode !== undefined) {
      if (!input.binCode.trim()) throw new Error('Bin code cannot be empty.');
      const code = input.binCode.trim();
      const duplicate = await db.query<WarehouseLocation>(
        'SELECT id FROM warehouse_locations WHERE warehouse_id = ? AND bin_code = ? AND id != ?',
        [existing.warehouse_id, code, id]
      );
      if (duplicate.length > 0) {
        throw new Error(`Bin code '${code}' already exists in this warehouse.`);
      }
      updates.push('bin_code = ?');
      params.push(code);
    }

    if (input.maxWeightKg !== undefined) {
      if (input.maxWeightKg !== null && input.maxWeightKg <= 0) {
        throw new Error('Max weight capacity must be greater than zero.');
      }
      updates.push('max_weight_kg = ?');
      params.push(input.maxWeightKg);
    }

    if (input.isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(input.isActive ? 1 : 0);
    }

    if (updates.length > 0) {
      updates.push("updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))");
      params.push(id);
      await db.execute(`UPDATE warehouse_locations SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    const refreshed = await this.getLocationById(id, db);
    if (!refreshed) {
      throw new Error(`Failed to reload location ${id}`);
    }
    return refreshed;
  }

  /**
   * Soft-deletes a bin location.
   * Safety invariant: Blocks deactivation if items currently reside in this bin.
   */
  public async deleteLocation(
    id: string,
    targetDb?: IDatabaseService
  ): Promise<{ success: boolean; softDeleted: boolean }> {
    const db = targetDb || dbService;
    const loc = await this.getLocationById(id, db);
    if (!loc) {
      throw new Error(`Location with ID ${id} not found.`);
    }

    const stockCheck = await db.query<{ total: number }>(
      'SELECT COALESCE(SUM(quantity_on_hand), 0) as total FROM inventory_stock WHERE bin_id = ?',
      [id]
    );
    const stockCount = Number(stockCheck[0]?.total || 0);
    if (stockCount > 0) {
      throw new Error(
        `Cannot delete or deactivate bin '${loc.bin_code}': location currently holds ${stockCount} units of stock. Relocate items before deactivating.`
      );
    }

    await db.execute(
      `UPDATE warehouse_locations 
       SET is_active = 0, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       WHERE id = ?`,
      [id]
    );

    return { success: true, softDeleted: true };
  }

  // ==========================================================================
  // SECTION 3: ITEM BATCHES & EXPIRY / LOT TRACKING
  // ==========================================================================

  /**
   * Registers a batch / lot for a specific item.
   * Evaluates expiration date against current date to set initial status (ACTIVE vs EXPIRED).
   */
  public async createBatch(
    input: CreateBatchInput,
    targetDb?: IDatabaseService
  ): Promise<ItemBatch> {
    const db = targetDb || dbService;

    if (!input.batchNumber || !input.batchNumber.trim()) {
      throw new Error('Batch lot number is mandatory.');
    }
    if (!input.itemId || !input.itemId.trim()) {
      throw new Error('Item ID is mandatory for batch registration.');
    }

    const itemRows = await db.query<{ id: string }>('SELECT id FROM items WHERE id = ?', [input.itemId]);
    if (!itemRows[0]) {
      throw new Error(`Item with ID ${input.itemId} does not exist in product catalog.`);
    }

    const batchNum = input.batchNumber.trim();
    const existing = await db.query<ItemBatch>(
      'SELECT id FROM item_batches WHERE item_id = ? AND batch_number = ?',
      [input.itemId, batchNum]
    );
    if (existing[0]) {
      throw new Error(`Batch number '${batchNum}' already exists for this item.`);
    }

    const unitCost = input.unitCost ?? 0.0;
    if (unitCost < 0) {
      throw new Error('Unit cost cannot be negative.');
    }

    const qty = input.quantity ?? input.initialQuantity ?? 0;
    if (qty < 0) {
      throw new Error('Batch quantity cannot be negative.');
    }

    // Determine initial status based on expiry
    let status: BatchStatus = input.status || 'ACTIVE';
    if (input.expiryDate && !input.status) {
      const expDate = new Date(input.expiryDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (expDate < today) {
        status = 'EXPIRED';
      }
    }

    const id = input.id || this.generateBatchId();

    await db.execute(
      `INSERT INTO item_batches (
        id, batch_number, item_id, supplier_id, manufacture_date, expiry_date, unit_cost,
        initial_quantity, current_quantity, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        batchNum,
        input.itemId,
        input.supplierId || null,
        input.manufactureDate || null,
        input.expiryDate || null,
        unitCost,
        qty,
        qty,
        status
      ]
    );

    const created = await this.getBatchById(id, db);
    if (!created) {
      throw new Error(`Failed to load newly created batch ${id}`);
    }
    return created;
  }

  /**
   * Retrieves an item batch by internal primary key ID.
   */
  public async getBatchById(id: string, targetDb?: IDatabaseService): Promise<ItemBatch | null> {
    const db = targetDb || dbService;
    const rows = await db.query<ItemBatch>('SELECT * FROM item_batches WHERE id = ?', [id]);
    return rows[0] || null;
  }

  /**
   * Alias for getBatchById.
   */
  public async getBatch(id: string, targetDb?: IDatabaseService): Promise<ItemBatch | null> {
    return this.getBatchById(id, targetDb);
  }

  /**
   * Lists batches for an item with optional status filtering and sorting.
   */
  public async getBatchesByItem(
    itemId: string,
    options: BatchFilterOptions = {},
    targetDb?: IDatabaseService
  ): Promise<ItemBatch[]> {
    const db = targetDb || dbService;
    let sql = 'SELECT * FROM item_batches WHERE item_id = ?';
    const params: any[] = [itemId];

    if (options.status) {
      sql += ' AND status = ?';
      params.push(options.status);
    } else if (options.activeOnly) {
      sql += " AND status = 'ACTIVE'";
    }

    if (options.excludeExpired) {
      sql += " AND (expiry_date IS NULL OR date(expiry_date) >= date('now'))";
    }

    if (options.search && options.search.trim()) {
      sql += ' AND batch_number LIKE ?';
      params.push(`%${options.search.trim()}%`);
    }

    const sortBy = options.sortBy || 'created_at';
    const sortOrder = options.sortOrder || 'DESC';
    sql += ` ORDER BY ${sortBy} ${sortOrder}`;

    return db.query<ItemBatch>(sql, params);
  }

  /**
   * Updates an item batch record (status, dates, unit cost).
   */
  public async updateBatch(
    id: string,
    input: UpdateBatchInput,
    targetDb?: IDatabaseService
  ): Promise<ItemBatch> {
    const db = targetDb || dbService;
    const existing = await this.getBatchById(id, db);
    if (!existing) {
      throw new Error(`Batch with ID ${id} not found.`);
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (input.status !== undefined) {
      updates.push('status = ?');
      params.push(input.status);
    }

    if (input.expiryDate !== undefined) {
      updates.push('expiry_date = ?');
      params.push(input.expiryDate || null);
    }

    if (input.manufactureDate !== undefined) {
      updates.push('manufacture_date = ?');
      params.push(input.manufactureDate || null);
    }

    if (input.unitCost !== undefined) {
      if (input.unitCost < 0) throw new Error('Unit cost cannot be negative.');
      updates.push('unit_cost = ?');
      params.push(input.unitCost);
    }

    if (input.supplierId !== undefined) {
      updates.push('supplier_id = ?');
      params.push(input.supplierId || null);
    }

    if (updates.length > 0) {
      updates.push("updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))");
      params.push(id);
      await db.execute(`UPDATE item_batches SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    const refreshed = await this.getBatchById(id, db);
    if (!refreshed) {
      throw new Error(`Failed to reload batch ${id}`);
    }
    return refreshed;
  }

  /**
   * Discovers batches nearing expiration within a specified threshold of days, or already expired.
   */
  public async getExpiringBatches(
    daysThreshold: number = 30,
    targetDb?: IDatabaseService
  ): Promise<ExpiringBatchInfo[]> {
    const db = targetDb || dbService;

    const rows = await db.query<any>(
      `SELECT 
        b.id,
        b.batch_number,
        b.item_id,
        i.sku as item_sku,
        i.name as item_name,
        i.category,
        b.expiry_date,
        b.current_quantity,
        b.unit_cost,
        b.status,
        CAST(julianday(b.expiry_date) - julianday('now') AS INTEGER) as days_until_expiry
       FROM item_batches b
       JOIN items i ON b.item_id = i.id
       WHERE b.expiry_date IS NOT NULL 
         AND b.current_quantity > 0
         AND (
           b.status = 'ACTIVE' 
           OR b.status = 'EXPIRED'
         )
         AND date(b.expiry_date) <= date('now', '+' || ? || ' days')
       ORDER BY b.expiry_date ASC`,
      [daysThreshold]
    );

    return rows.map((r: any) => {
      const days = Number(r.days_until_expiry);
      const isExpired = days < 0 || r.status === 'EXPIRED';
      const qty = Number(r.current_quantity);
      const cost = Number(r.unit_cost);
      return {
        id: r.id,
        batchNumber: r.batch_number,
        itemId: r.item_id,
        itemSku: r.item_sku,
        itemName: r.item_name,
        category: r.category,
        expiryDate: r.expiry_date,
        daysUntilExpiry: days,
        currentQuantity: qty,
        unitCost: cost,
        totalValue: Math.round(qty * cost * 100) / 100,
        status: r.status as BatchStatus,
        isExpired
      };
    });
  }

  /**
   * Quarantines a compromised or recalled batch from active inventory selection.
   */
  public async quarantineBatch(
    batchId: string,
    reason?: string,
    userId: string = 'system',
    targetDb?: IDatabaseService
  ): Promise<ItemBatch> {
    const db = targetDb || dbService;
    const batch = await this.getBatchById(batchId, db);
    if (!batch) {
      throw new Error(`Batch with ID ${batchId} not found.`);
    }

    return db.transaction(async (tx: IDatabaseService) => {
      await tx.execute(
        `UPDATE item_batches 
         SET status = 'QUARANTINED', updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = ?`,
        [batchId]
      );

      // Write audit log
      const auditId = this.generateAuditId();
      await tx.execute(
        `INSERT INTO audit_logs (
          id, user_id, action, entity_type, entity_id, details
        ) VALUES (?, ?, 'BATCH_QUARANTINE', 'item_batches', ?, ?)`,
        [
          auditId,
          userId,
          batchId,
          reason || `Batch manually quarantined (previous status: ${batch.status})`
        ]
      );

      const refreshed = await this.getBatchById(batchId, tx);
      if (!refreshed) {
        throw new Error(`Failed to reload batch ${batchId}`);
      }
      return refreshed;
    });
  }

  // ==========================================================================
  // SECTION 4: REAL-TIME STOCK QUERYING & MULTI-WAREHOUSE MATRIX
  // ==========================================================================

  /**
   * Retrieves the specific stock record for an Item x Warehouse x Bin x Batch coordinate.
   */
  public async getStockLevel(
    itemId: string,
    warehouseId: string,
    binId?: string | null,
    batchId?: string | null,
    targetDb?: IDatabaseService
  ): Promise<InventoryStock | null> {
    const db = targetDb || dbService;
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

    const rows = await db.query<InventoryStock>(sql, params);
    return rows[0] || null;
  }

  /**
   * Aggregates total stock quantities (onHand, reserved, available) for an item across the system
   * or scoped to a specific warehouse.
   */
  public async getItemTotalStock(
    itemId: string,
    warehouseId?: string,
    targetDb?: IDatabaseService
  ): Promise<StockSummary> {
    const db = targetDb || dbService;
    let sql = `
      SELECT 
        COALESCE(SUM(quantity_on_hand), 0) as total_on_hand,
        COALESCE(SUM(quantity_reserved), 0) as total_reserved
      FROM inventory_stock
      WHERE item_id = ?
    `;
    const params: any[] = [itemId];

    if (warehouseId) {
      sql += ' AND warehouse_id = ?';
      params.push(warehouseId);
    }

    const rows = await db.query<{ total_on_hand: number; total_reserved: number }>(sql, params);
    const onHand = Number(rows[0]?.total_on_hand || 0);
    const reserved = Number(rows[0]?.total_reserved || 0);

    return {
      onHand,
      reserved,
      available: onHand - reserved
    };
  }

  /**
   * Comprehensive multi-warehouse stock query with joined item, warehouse, bin, and batch metadata.
   */
  public async getAllStock(
    options: StockFilterOptions = {},
    targetDb?: IDatabaseService
  ): Promise<EnrichedStockRecord[]> {
    const db = targetDb || dbService;

    let sql = `
      SELECT 
        s.id as stock_id,
        s.item_id,
        i.sku as item_sku,
        i.name as item_name,
        i.category,
        i.unit_of_measure,
        i.cost_price,
        i.selling_price,
        i.min_stock_alert,
        i.safety_stock,
        s.warehouse_id,
        w.warehouse_code,
        w.name as warehouse_name,
        s.bin_id,
        loc.bin_code,
        loc.zone,
        loc.aisle,
        loc.rack,
        loc.shelf,
        s.batch_id,
        b.batch_number,
        b.expiry_date,
        b.status as batch_status,
        b.unit_cost as batch_unit_cost,
        COALESCE(b.unit_cost, i.cost_price) as effective_unit_cost,
        s.quantity_on_hand,
        s.quantity_reserved
      FROM inventory_stock s
      JOIN items i ON s.item_id = i.id
      JOIN warehouses w ON s.warehouse_id = w.id
      LEFT JOIN warehouse_locations loc ON s.bin_id = loc.id
      LEFT JOIN item_batches b ON s.batch_id = b.id
    `;

    const conditions: string[] = [];
    const params: any[] = [];

    if (options.warehouseId) {
      conditions.push('s.warehouse_id = ?');
      params.push(options.warehouseId);
    }

    if (options.itemId) {
      conditions.push('s.item_id = ?');
      params.push(options.itemId);
    }

    if (options.binId) {
      conditions.push('s.bin_id = ?');
      params.push(options.binId);
    }

    if (options.batchId) {
      conditions.push('s.batch_id = ?');
      params.push(options.batchId);
    }

    if (options.category && options.category.trim()) {
      conditions.push('i.category = ?');
      params.push(options.category.trim());
    }

    if (options.positiveStockOnly) {
      conditions.push('s.quantity_on_hand > 0');
    }

    if (options.search && options.search.trim()) {
      const term = `%${options.search.trim()}%`;
      conditions.push('(i.sku LIKE ? OR i.name LIKE ? OR w.name LIKE ? OR loc.bin_code LIKE ? OR b.batch_number LIKE ?)');
      params.push(term, term, term, term, term);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    const sortBy = options.sortBy || 'sku';
    let orderClause = 'ORDER BY i.sku ASC';
    if (sortBy === 'name') orderClause = `ORDER BY i.name ${options.sortOrder || 'ASC'}`;
    else if (sortBy === 'warehouse_name') orderClause = `ORDER BY w.name ${options.sortOrder || 'ASC'}`;
    else if (sortBy === 'bin_code') orderClause = `ORDER BY loc.bin_code ${options.sortOrder || 'ASC'}`;
    else if (sortBy === 'quantity_on_hand') orderClause = `ORDER BY s.quantity_on_hand ${options.sortOrder || 'DESC'}`;
    else if (sortBy === 'valuation') orderClause = `ORDER BY (s.quantity_on_hand * COALESCE(b.unit_cost, i.cost_price)) ${options.sortOrder || 'DESC'}`;

    sql += ' ' + orderClause;

    if (options.limit !== undefined && options.limit > 0) {
      sql += ' LIMIT ?';
      params.push(options.limit);
      if (options.offset !== undefined && options.offset >= 0) {
        sql += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    const rows = await db.query<any>(sql, params);
    const todayStr = new Date().toISOString().split('T')[0];

    return rows.map((r: any) => {
      const onHand = Number(r.quantity_on_hand);
      const reserved = Number(r.quantity_reserved);
      const available = onHand - reserved;
      const unitCost = Number(r.effective_unit_cost);
      const minAlert = Number(r.min_stock_alert);
      const safety = Number(r.safety_stock);
      const isExpired = !!(r.expiry_date && r.expiry_date < todayStr);

      return {
        id: r.stock_id,
        itemId: r.item_id,
        itemSku: r.item_sku,
        itemName: r.item_name,
        category: r.category,
        unitOfMeasure: r.unit_of_measure,
        costPrice: Number(r.cost_price),
        sellingPrice: Number(r.selling_price),
        minStockAlert: minAlert,
        safetyStock: safety,
        warehouseId: r.warehouse_id,
        warehouseCode: r.warehouse_code,
        warehouseName: r.warehouse_name,
        binId: r.bin_id || null,
        binCode: r.bin_code || null,
        zone: r.zone || null,
        aisle: r.aisle || null,
        rack: r.rack || null,
        shelf: r.shelf || null,
        batchId: r.batch_id || null,
        batchNumber: r.batch_number || null,
        expiryDate: r.expiry_date || null,
        batchStatus: (r.batch_status as BatchStatus) || null,
        batchUnitCost: r.batch_unit_cost !== null ? Number(r.batch_unit_cost) : null,
        effectiveUnitCost: unitCost,
        quantityOnHand: onHand,
        quantityReserved: reserved,
        quantityAvailable: available,
        totalValuation: Math.round(onHand * unitCost * 100) / 100,
        isLowStock: onHand <= minAlert,
        isSafetyStockBreached: onHand <= safety,
        isExpiredBatch: isExpired
      };
    });
  }

  /**
   * Retrieves enriched stock records for a specific warehouse.
   */
  public async getWarehouseStock(
    warehouseId: string,
    options: StockFilterOptions = {},
    targetDb?: IDatabaseService
  ): Promise<EnrichedStockRecord[]> {
    return this.getAllStock({ ...options, warehouseId }, targetDb);
  }

  /**
   * Intelligently selects and allocates available batches for order picking / dispatch.
   * Supports FEFO (First-Expired, First-Out) or FIFO (First-In, First-Out).
   * Strictly filters out expired or quarantined batches.
   */
  public async getAvailableBatchesForPicking(
    itemId: string,
    warehouseId: string,
    quantityNeeded: number,
    strategy: 'FIFO' | 'FEFO' = 'FEFO',
    targetDb?: IDatabaseService
  ): Promise<BatchAllocationResult[]> {
    const db = targetDb || dbService;

    if (quantityNeeded <= 0) {
      throw new Error('Quantity needed must be greater than zero.');
    }

    let orderClause = "ORDER BY b.expiry_date ASC, s.created_at ASC"; // FEFO default
    if (strategy === 'FIFO') {
      orderClause = "ORDER BY COALESCE(b.manufacture_date, b.created_at) ASC, s.created_at ASC";
    }

    const sql = `
      SELECT 
        s.batch_id,
        b.batch_number,
        s.warehouse_id,
        s.bin_id,
        loc.bin_code,
        b.expiry_date,
        COALESCE(b.unit_cost, i.cost_price) as unit_cost,
        (s.quantity_on_hand - s.quantity_reserved) as available_qty
      FROM inventory_stock s
      JOIN items i ON s.item_id = i.id
      LEFT JOIN item_batches b ON s.batch_id = b.id
      LEFT JOIN warehouse_locations loc ON s.bin_id = loc.id
      WHERE s.item_id = ? 
        AND s.warehouse_id = ?
        AND (s.quantity_on_hand - s.quantity_reserved) > 0
        AND (b.status IS NULL OR b.status = 'ACTIVE')
        AND (b.expiry_date IS NULL OR date(b.expiry_date) > date('now'))
      ${orderClause}
    `;

    const rows = await db.query<any>(sql, [itemId, warehouseId]);

    const allocations: BatchAllocationResult[] = [];
    let remaining = quantityNeeded;

    for (const r of rows) {
      if (remaining <= 0) break;
      const available = Number(r.available_qty);
      if (available <= 0) continue;

      const toAllocate = Math.min(available, remaining);
      allocations.push({
        batchId: r.batch_id || 'unassigned',
        batchNumber: r.batch_number || 'DEFAULT-LOT',
        warehouseId: r.warehouse_id,
        binId: r.bin_id || null,
        binCode: r.bin_code || null,
        expiryDate: r.expiry_date || null,
        availableQuantity: available,
        allocatedQuantity: toAllocate,
        unitCost: Number(r.unit_cost)
      });

      remaining -= toAllocate;
    }

    return allocations;
  }

  // ==========================================================================
  // SECTION 5: INVENTORY VALUATION ENGINE (WAC & FIFO)
  // ==========================================================================

  /**
   * Computes comprehensive inventory valuation across the entire enterprise or for a single warehouse.
   * Returns:
   * - totalUnits: total stock units on hand
   * - totalValuation: total dollar/currency value (rounded to 2 decimals)
   * - itemsValuation: per-item detailed valuation array (weighted average cost, quantity, layers)
   */
  public async calculateValuation(
    warehouseId?: string,
    targetDb?: IDatabaseService
  ): Promise<InventoryValuationReport> {
    const db = targetDb || dbService;

    let sql = `
      SELECT 
        s.item_id,
        i.sku,
        i.name,
        i.category,
        i.valuation_method,
        i.cost_price,
        SUM(s.quantity_on_hand) as quantity,
        SUM(s.quantity_reserved) as reserved_quantity,
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

    sql += ' GROUP BY s.item_id ORDER BY i.sku ASC';

    const rows = await db.query<any>(sql, params);

    let totalUnits = 0;
    let totalValuation = 0;
    const itemsValuation: ItemValuationDetail[] = [];

    for (const r of rows) {
      const qty = Number(r.quantity || 0);
      const reserved = Number(r.reserved_quantity || 0);
      const totalVal = Math.round(Number(r.item_total_value || 0) * 100) / 100;
      const costPrice = Number(r.cost_price);
      const wac = qty > 0 ? Math.round((totalVal / qty) * 100) / 100 : costPrice;

      totalUnits += qty;
      totalValuation += totalVal;

      itemsValuation.push({
        itemId: r.item_id,
        item_id: r.item_id,
        sku: r.sku,
        name: r.name,
        category: r.category,
        valuation_method: r.valuation_method as ValuationMethod,
        cost_price: costPrice,
        quantity: qty,
        item_total_value: totalVal,
        weighted_average_cost: wac
      });
    }

    totalValuation = Math.round(totalValuation * 100) / 100;
    const avgUnitCost = totalUnits > 0 ? Math.round((totalValuation / totalUnits) * 100) / 100 : 0;

    let warehouseName: string | undefined;
    if (warehouseId) {
      const wh = await this.getWarehouseById(warehouseId, db);
      warehouseName = wh?.name;
    }

    return {
      warehouseId,
      warehouseName,
      valuationDate: new Date().toISOString(),
      totalUnits,
      totalValuation,
      averageUnitCost: avgUnitCost,
      totalSkus: rows.length,
      itemsValuation
    };
  }

  /**
   * Retrieves valuation and detailed FIFO layer breakdown for a single item.
   */
  public async getItemValuation(
    itemId: string,
    warehouseId?: string,
    targetDb?: IDatabaseService
  ): Promise<ItemValuationDetail | null> {
    const db = targetDb || dbService;

    const itemRows = await db.query<any>('SELECT * FROM items WHERE id = ?', [itemId]);
    if (!itemRows[0]) return null;
    const item = itemRows[0];

    let sql = `
      SELECT 
        s.batch_id,
        b.batch_number,
        b.expiry_date,
        s.created_at as stock_created_at,
        s.quantity_on_hand,
        COALESCE(b.unit_cost, i.cost_price) as unit_cost
      FROM inventory_stock s
      JOIN items i ON s.item_id = i.id
      LEFT JOIN item_batches b ON s.batch_id = b.id
      WHERE s.item_id = ?
    `;
    const params: any[] = [itemId];
    if (warehouseId) {
      sql += ' AND s.warehouse_id = ?';
      params.push(warehouseId);
    }
    sql += ' ORDER BY s.created_at ASC';

    const stockRows = await db.query<any>(sql, params);

    let totalQty = 0;
    let totalVal = 0;
    const fifoLayers: any[] = [];

    for (const s of stockRows) {
      const q = Number(s.quantity_on_hand);
      const c = Number(s.unit_cost);
      const layerVal = Math.round(q * c * 100) / 100;
      totalQty += q;
      totalVal += layerVal;

      fifoLayers.push({
        batchId: s.batch_id || undefined,
        batchNumber: s.batch_number || undefined,
        quantity: q,
        unitCost: c,
        totalValue: layerVal,
        receivedDate: s.stock_created_at,
        expiryDate: s.expiry_date || undefined
      });
    }

    totalVal = Math.round(totalVal * 100) / 100;
    const wac = totalQty > 0 ? Math.round((totalVal / totalQty) * 100) / 100 : Number(item.cost_price);

    return {
      itemId: item.id,
      item_id: item.id,
      sku: item.sku,
      name: item.name,
      category: item.category,
      valuation_method: item.valuation_method as ValuationMethod,
      cost_price: Number(item.cost_price),
      quantity: totalQty,
      item_total_value: totalVal,
      weighted_average_cost: wac,
      fifoLayers
    };
  }

  // ==========================================================================
  // SECTION 6: STOCK ALERTS & INVENTORY HEALTH KPIS
  // ==========================================================================

  /**
   * Evaluates all catalog items against reorder points and safety stock levels.
   * Flags items that are OUT_OF_STOCK, CRITICAL (<= safety_stock), or WARNING (<= min_stock_alert).
   */
  public async getLowStockAlerts(
    warehouseId?: string,
    targetDb?: IDatabaseService
  ): Promise<LowStockAlert[]> {
    const db = targetDb || dbService;

    let sql = `
      SELECT 
        i.id as item_id,
        i.sku,
        i.name,
        i.category,
        i.unit_of_measure,
        i.min_stock_alert,
        i.safety_stock,
        i.max_stock,
        COALESCE(SUM(s.quantity_on_hand), 0) as current_stock,
        COALESCE(SUM(s.quantity_reserved), 0) as current_reserved
      FROM items i
      LEFT JOIN inventory_stock s ON i.id = s.item_id
    `;

    const params: any[] = [];
    if (warehouseId) {
      sql += ' AND s.warehouse_id = ?';
      params.push(warehouseId);
    }

    sql += `
      WHERE i.is_active = 1
      GROUP BY i.id
      HAVING current_stock <= i.min_stock_alert
      ORDER BY (current_stock - i.min_stock_alert) ASC, i.sku ASC
    `;

    const rows = await db.query<any>(sql, params);

    return rows.map((r: any) => {
      const onHand = Number(r.current_stock);
      const reserved = Number(r.current_reserved);
      const available = onHand - reserved;
      const minAlert = Number(r.min_stock_alert);
      const safety = Number(r.safety_stock);
      const maxStock = Number(r.max_stock);

      let alertLevel: 'OUT_OF_STOCK' | 'CRITICAL' | 'WARNING' = 'WARNING';
      if (onHand === 0) {
        alertLevel = 'OUT_OF_STOCK';
      } else if (onHand <= safety) {
        alertLevel = 'CRITICAL';
      }

      const deficit = Math.max(0, minAlert - onHand);
      const suggestedReorder = Math.max(maxStock - onHand, minAlert * 2 - onHand);

      return {
        itemId: r.item_id,
        sku: r.sku,
        name: r.name,
        category: r.category,
        unitOfMeasure: r.unit_of_measure,
        warehouseId,
        quantityOnHand: onHand,
        quantityReserved: reserved,
        quantityAvailable: available,
        minStockAlert: minAlert,
        safetyStock: safety,
        maxStock,
        alertLevel,
        deficitQuantity: deficit,
        suggestedReorderQuantity: Math.max(suggestedReorder, 10)
      };
    });
  }

  /**
   * Computes top-level inventory health summary metrics for executive dashboard KPI cards.
   */
  public async getInventoryHealthMetrics(
    warehouseId?: string,
    targetDb?: IDatabaseService
  ): Promise<InventoryHealthMetrics> {
    const db = targetDb || dbService;

    // 1. Valuation and unit counts
    const valuationReport = await this.calculateValuation(warehouseId, db);

    // 2. Active catalog SKUs
    const skuRows = await db.query<{ count: number }>('SELECT COUNT(*) as count FROM items WHERE is_active = 1');
    const totalActiveSkus = Number(skuRows[0]?.count || 0);

    // 3. Alerts
    const alerts = await this.getLowStockAlerts(warehouseId, db);
    let outOfStock = 0;
    let critical = 0;
    let warning = 0;

    for (const a of alerts) {
      if (a.alertLevel === 'OUT_OF_STOCK') outOfStock++;
      else if (a.alertLevel === 'CRITICAL') critical++;
      else if (a.alertLevel === 'WARNING') warning++;
    }

    // 4. Batches
    const expiring = await this.getExpiringBatches(30, db);
    let expiredBatches = 0;
    let expiringSoon = 0;
    for (const b of expiring) {
      if (b.isExpired) expiredBatches++;
      else expiringSoon++;
    }

    // Total reserved
    let reservedSql = 'SELECT COALESCE(SUM(quantity_reserved), 0) as total_res FROM inventory_stock';
    const reservedParams: any[] = [];
    if (warehouseId) {
      reservedSql += ' WHERE warehouse_id = ?';
      reservedParams.push(warehouseId);
    }
    const resRows = await db.query<{ total_res: number }>(reservedSql, reservedParams);
    const totalReserved = Number(resRows[0]?.total_res || 0);

    return {
      totalActiveSkus,
      totalUnitsOnHand: valuationReport.totalUnits,
      totalUnitsReserved: totalReserved,
      totalUnitsAvailable: valuationReport.totalUnits - totalReserved,
      totalInventoryValuation: valuationReport.totalValuation,
      outOfStockSkus: outOfStock,
      criticalStockSkus: critical,
      lowStockSkus: warning + critical + outOfStock,
      expiredBatchesCount: expiredBatches,
      expiringSoonBatchesCount: expiringSoon
    };
  }

  // ==========================================================================
  // SECTION 7: STOCK ADJUSTMENTS & IMMUTABLE DOUBLE-ENTRY LEDGER
  // ==========================================================================

  /**
   * Adjusts inventory stock for cycle counting or write-offs.
   * Atomically writes to inventory_stock and creates an immutable double-entry ledger entry
   * in inventory_transactions and an audit_logs record.
   * Strictly enforces non-negative stock balance.
   */
  public async adjustStock(
    input: StockAdjustmentInput,
    targetDb?: IDatabaseService
  ): Promise<StockAdjustmentResult> {
    const db = targetDb || dbService;

    if (!input.itemId || !input.itemId.trim()) {
      throw new Error('Item ID is mandatory for stock adjustment.');
    }
    if (!input.warehouseId || !input.warehouseId.trim()) {
      throw new Error('Warehouse ID is mandatory for stock adjustment.');
    }

    const itemRows = await db.query<any>('SELECT * FROM items WHERE id = ?', [input.itemId]);
    if (!itemRows[0]) {
      throw new Error(`Item ${input.itemId} not found.`);
    }
    const item = itemRows[0];

    const whRows = await db.query<any>('SELECT * FROM warehouses WHERE id = ?', [input.warehouseId]);
    if (!whRows[0]) {
      throw new Error(`Warehouse ${input.warehouseId} not found.`);
    }

    const binId = input.binId || null;
    const batchId = input.batchId || null;

    if (binId) {
      const binRows = await db.query<any>(
        'SELECT id FROM warehouse_locations WHERE id = ? AND warehouse_id = ?',
        [binId, input.warehouseId]
      );
      if (!binRows[0]) {
        throw new Error(`Bin location ${binId} does not exist in warehouse ${input.warehouseId}.`);
      }
    }

    if (batchId) {
      const bRows = await db.query<any>('SELECT id, unit_cost FROM item_batches WHERE id = ?', [batchId]);
      if (!bRows[0]) {
        throw new Error(`Batch ${batchId} not found.`);
      }
    }

    return db.transaction(async (tx: IDatabaseService) => {
      // Find exact stock row
      const existingRows = await tx.query<InventoryStock>(
        `SELECT id, quantity_on_hand, quantity_reserved 
         FROM inventory_stock 
         WHERE item_id = ? AND warehouse_id = ? 
           AND (bin_id = ? OR (bin_id IS NULL AND ? IS NULL))
           AND (batch_id = ? OR (batch_id IS NULL AND ? IS NULL))`,
        [input.itemId, input.warehouseId, binId, binId, batchId, batchId]
      );

      const existing = existingRows[0] || null;
      const prevBalance = existing ? existing.quantity_on_hand : 0;
      let newBalance = 0;
      let quantityChange = 0;

      if (input.adjustmentType === 'DELTA') {
        quantityChange = input.quantity;
        newBalance = prevBalance + quantityChange;
      } else {
        // NEW_BALANCE
        newBalance = input.quantity;
        quantityChange = newBalance - prevBalance;
      }

      if (newBalance < 0) {
        throw new Error(
          `Insufficient stock: resulting balance (${newBalance}) cannot be negative. Current on-hand: ${prevBalance}.`
        );
      }

      let stockId = existing ? existing.id : this.generateStockId();

      if (existing) {
        await tx.execute(
          `UPDATE inventory_stock 
           SET quantity_on_hand = ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
           WHERE id = ?`,
          [newBalance, stockId]
        );
      } else {
        await tx.execute(
          `INSERT INTO inventory_stock (
            id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved
          ) VALUES (?, ?, ?, ?, ?, ?, 0)`,
          [stockId, input.itemId, input.warehouseId, binId, batchId, newBalance]
        );
      }

      // If batch exists, update batch current_quantity
      if (batchId && quantityChange !== 0) {
        await tx.execute(
          `UPDATE item_batches 
           SET current_quantity = MAX(0, current_quantity + ?),
               updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
           WHERE id = ?`,
          [quantityChange, batchId]
        );
      }

      const unitCost = input.unitCost ?? item.cost_price;
      const txId = this.generateTransactionId();
      const refId = `ADJ-${Date.now().toString(36).toUpperCase()}`;

      // Insert Double-Entry Audit Ledger
      await tx.execute(
        `INSERT INTO inventory_transactions (
          id, transaction_timestamp, transaction_type, reference_type, reference_id,
          item_id, warehouse_id, bin_id, batch_id, quantity_change, unit_cost,
          running_balance_after, user_id, notes
        ) VALUES (?, (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), ?, 'ADJUSTMENT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          txId,
          input.reason,
          refId,
          input.itemId,
          input.warehouseId,
          binId,
          batchId,
          quantityChange,
          unitCost,
          newBalance,
          input.userId || 'system',
          input.notes || null
        ]
      );

      // Record system audit log
      const auditId = this.generateAuditId();
      await tx.execute(
        `INSERT INTO audit_logs (
          id, user_id, action, entity_type, entity_id, details
        ) VALUES (?, ?, 'STOCK_ADJUSTMENT', 'inventory_stock', ?, ?)`,
        [
          auditId,
          input.userId || 'system',
          stockId,
          input.notes || `Stock adjusted via ${input.reason} (previous on-hand: ${prevBalance}, new on-hand: ${newBalance}, delta: ${quantityChange})`
        ]
      );

      return {
        stockId,
        transactionId: txId,
        itemId: input.itemId,
        warehouseId: input.warehouseId,
        previousBalance: prevBalance,
        quantityChange,
        newBalance,
        transactionType: input.reason
      };
    });
  }

  /**
   * Queries the immutable double-entry inventory audit ledger with flexible multi-criteria filtering.
   */
  public async getInventoryTransactions(
    options: TransactionFilterOptions = {},
    targetDb?: IDatabaseService
  ): Promise<InventoryTransaction[]> {
    const db = targetDb || dbService;

    let sql = 'SELECT * FROM inventory_transactions';
    const conditions: string[] = [];
    const params: any[] = [];

    if (options.itemId) {
      conditions.push('item_id = ?');
      params.push(options.itemId);
    }

    if (options.warehouseId) {
      conditions.push('warehouse_id = ?');
      params.push(options.warehouseId);
    }

    if (options.referenceId) {
      conditions.push('reference_id = ?');
      params.push(options.referenceId);
    }

    if (options.referenceType) {
      conditions.push('reference_type = ?');
      params.push(options.referenceType);
    }

    if (options.transactionType) {
      conditions.push('transaction_type = ?');
      params.push(options.transactionType);
    }

    if (options.startDate) {
      conditions.push('transaction_timestamp >= ?');
      params.push(options.startDate);
    }

    if (options.endDate) {
      conditions.push('transaction_timestamp <= ?');
      params.push(options.endDate);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY transaction_timestamp DESC';

    if (options.limit !== undefined && options.limit > 0) {
      sql += ' LIMIT ?';
      params.push(options.limit);
      if (options.offset !== undefined && options.offset >= 0) {
        sql += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    return db.query<InventoryTransaction>(sql, params);
  }
}

// Default singleton export
export const inventoryService = InventoryService.getInstance();
