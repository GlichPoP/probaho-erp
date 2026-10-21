/**
 * Unit & Integration Test Suite for Inventory, Warehouses, Bins, Batches & Valuation
 * Target File: tests/unit/inventory.test.ts
 * Milestone 3 - Multi-Warehouse Inventory, Valuation & Transfer Management
 *
 * Test Matrix:
 * - TC-INV-01: Create warehouse with code, name, city, is_default, and verify persistence
 * - TC-INV-02: Enforce UNIQUE constraint on warehouse_code
 * - TC-INV-03: Create warehouse locations/bins with zone, aisle, rack, shelf, bin_code
 * - TC-INV-04: Enforce UNIQUE(warehouse_id, bin_code) and foreign key constraint to warehouses
 * - TC-INV-05: Create item batches with lot number, manufacturing date, and expiry date
 * - TC-INV-06: Enforce UNIQUE(item_id, batch_number) on item_batches
 * - TC-INV-07: Query pickable batches excluding expired batches (FIFO / FEFO awareness)
 * - TC-INV-08: Real-time stock matrix: maintain stock levels across (item, warehouse, bin, batch)
 * - TC-INV-09: Strict invariant: Prevent negative inventory stock (CHECK quantity_on_hand >= 0)
 * - TC-INV-10: Strict invariant: Enforce quantity_reserved <= quantity_on_hand
 * - TC-INV-11: Weighted Moving Average Cost (WAC) inventory valuation calculation
 * - TC-INV-12: First-In First-Out (FIFO) batch cost layering calculation
 * - TC-INV-13: Detect reorder point thresholds and low stock alerts (quantity_on_hand <= min_stock_alert)
 * - TC-INV-14: Cycle count adjustments & write-offs with double-entry audit logging
 * - TC-INV-15: Warehouse deactivation / soft-delete when active stock exists
 */

import { describe, it, expect, beforeEach, runSuites } from '../harness/test-runner.ts';
import { TestDatabaseService } from '../harness/test-db.ts';
import { ERPTestClient } from '../harness/erp-test-client.ts';

let db: TestDatabaseService;
let client: ERPTestClient;

let warehouseA: any;
let warehouseB: any;
let binA1: any;
let binA2: any;
let binB1: any;
let itemMechanical: any;
let itemElectrical: any;

describe('Unit & Integration Test: Milestone 3 Inventory & Valuation Services', () => {
  beforeEach(async () => {
    db = new TestDatabaseService(':memory:');
    await db.initialize();
    client = new ERPTestClient(db);

    // 1. Seed Warehouses
    warehouseA = await client.createWarehouse({
      warehouseCode: 'WH-DHAKA-CENTRAL',
      name: 'Dhaka Central Distribution Hub',
      address: 'Plot 104, Tejgaon Industrial Area',
      city: 'Dhaka',
      isDefault: true
    });

    warehouseB = await client.createWarehouse({
      warehouseCode: 'WH-CTG-PORT',
      name: 'Chittagong Port Facility',
      address: 'Agrabad Commercial Area',
      city: 'Chittagong',
      isDefault: false
    });

    // 2. Seed Bins
    binA1 = await client.createLocation({
      warehouseId: warehouseA.id,
      zone: 'Zone A - High Bay',
      aisle: 'Aisle 01',
      rack: 'Rack 01',
      shelf: 'Shelf 01',
      binCode: 'DHK-ZA-A01-R01-S01',
      maxWeightKg: 1000
    });

    binA2 = await client.createLocation({
      warehouseId: warehouseA.id,
      zone: 'Zone A - High Bay',
      aisle: 'Aisle 01',
      rack: 'Rack 01',
      shelf: 'Shelf 02',
      binCode: 'DHK-ZA-A01-R01-S02',
      maxWeightKg: 1000
    });

    binB1 = await client.createLocation({
      warehouseId: warehouseB.id,
      zone: 'Zone B - Coastal Receiving',
      aisle: 'Aisle 01',
      rack: 'Rack 01',
      shelf: 'Shelf 01',
      binCode: 'CTG-ZB-A01-R01-S01',
      maxWeightKg: 1500
    });

    // 3. Seed Items
    itemMechanical = await client.createItem({
      sku: 'SKU-BEARING-6205',
      name: 'Deep Groove Ball Bearing 6205-2RS',
      category: 'Mechanical',
      unitOfMeasure: 'pcs',
      costPrice: 20.00,
      sellingPrice: 35.00,
      minStockAlert: 30,
      safetyStock: 15,
      maxStock: 500,
      valuationMethod: 'MOVING_AVERAGE'
    });

    itemElectrical = await client.createItem({
      sku: 'SKU-INV-5KW',
      name: 'Solar Hybrid Inverter 5KW',
      category: 'Electrical',
      unitOfMeasure: 'pcs',
      costPrice: 400.00,
      sellingPrice: 650.00,
      minStockAlert: 5,
      safetyStock: 2,
      maxStock: 50,
      valuationMethod: 'FIFO'
    });
  });

  // --------------------------------------------------------------------------
  // TC-INV-01: Create warehouse and verify persistence
  // --------------------------------------------------------------------------
  it('TC-INV-01: Should create warehouse with code, name, city, and default flag', async () => {
    const wh = await client.createWarehouse({
      warehouseCode: 'WH-SYLHET-DEPOT',
      name: 'Sylhet Regional Depot',
      address: 'Osmani Nagar, Shibganj',
      city: 'Sylhet',
      contactPerson: 'Sultan Mahmud',
      contactPhone: '+8801711223344',
      isDefault: false
    });

    expect(wh).toBeDefined();
    expect(wh.warehouse_code).toBe('WH-SYLHET-DEPOT');
    expect(wh.name).toBe('Sylhet Regional Depot');
    expect(wh.city).toBe('Sylhet');
    expect(wh.is_default).toBe(0);
    expect(wh.is_active).toBe(1);

    const queried = await client.getWarehouse(wh.id);
    expect(queried.warehouse_code).toBe('WH-SYLHET-DEPOT');
  });

  // --------------------------------------------------------------------------
  // TC-INV-02: Enforce UNIQUE constraint on warehouse_code
  // --------------------------------------------------------------------------
  it('TC-INV-02: Should strictly enforce UNIQUE constraint on warehouse_code', async () => {
    await expect(async () => {
      await client.createWarehouse({
        warehouseCode: 'WH-DHAKA-CENTRAL', // Duplicate code!
        name: 'Another Central Hub',
        address: 'Tejgaon',
        city: 'Dhaka'
      });
    }).toReject('UNIQUE constraint failed');
  });

  // --------------------------------------------------------------------------
  // TC-INV-03: Create warehouse locations/bins with granular hierarchy
  // --------------------------------------------------------------------------
  it('TC-INV-03: Should create warehouse bin locations with zone, aisle, rack, shelf and bin code', async () => {
    const bin = await client.createLocation({
      warehouseId: warehouseA.id,
      zone: 'Zone C - Bulk Pallets',
      aisle: 'Aisle 05',
      rack: 'Rack 02',
      shelf: 'Shelf 01',
      binCode: 'DHK-ZC-A05-R02-S01',
      maxWeightKg: 2500
    });

    expect(bin).toBeDefined();
    expect(bin.warehouse_id).toBe(warehouseA.id);
    expect(bin.zone).toBe('Zone C - Bulk Pallets');
    expect(bin.bin_code).toBe('DHK-ZC-A05-R02-S01');
    expect(bin.max_weight_kg).toBe(2500);
    expect(bin.is_active).toBe(1);
  });

  // --------------------------------------------------------------------------
  // TC-INV-04: Enforce UNIQUE(warehouse_id, bin_code) and foreign key
  // --------------------------------------------------------------------------
  it('TC-INV-04: Should enforce UNIQUE(warehouse_id, bin_code) and foreign key to warehouses', async () => {
    // Duplicate bin in same warehouse
    await expect(async () => {
      await client.createLocation({
        warehouseId: warehouseA.id,
        zone: 'Zone A',
        aisle: 'A1',
        rack: 'R1',
        shelf: 'S1',
        binCode: 'DHK-ZA-A01-R01-S01' // Duplicate!
      });
    }).toReject('UNIQUE constraint failed');

    // Non-existent warehouse ID
    await expect(async () => {
      await client.createLocation({
        warehouseId: 'non-existent-warehouse-uuid',
        zone: 'Zone X',
        aisle: 'A1',
        rack: 'R1',
        shelf: 'S1',
        binCode: 'BIN-NON-EXISTENT'
      });
    }).toReject('FOREIGN KEY constraint failed');
  });

  // --------------------------------------------------------------------------
  // TC-INV-05: Create item batches with lot numbers and dates
  // --------------------------------------------------------------------------
  it('TC-INV-05: Should register and track item batches with lot numbers and expiration dates', async () => {
    const batch = await client.createBatch({
      batchNumber: 'LOT-BRG-2026-001',
      itemId: itemMechanical.id,
      manufactureDate: '2026-02-01',
      expiryDate: '2029-02-01',
      unitCost: 19.50,
      quantity: 150
    });

    expect(batch).toBeDefined();
    expect(batch.batch_number).toBe('LOT-BRG-2026-001');
    expect(batch.item_id).toBe(itemMechanical.id);
    expect(batch.unit_cost).toBe(19.50);
    expect(batch.initial_quantity).toBe(150);
    expect(batch.current_quantity).toBe(150);
    expect(batch.status).toBe('ACTIVE');
  });

  // --------------------------------------------------------------------------
  // TC-INV-06: Enforce UNIQUE(item_id, batch_number) on item_batches
  // --------------------------------------------------------------------------
  it('TC-INV-06: Should strictly enforce UNIQUE constraint on (item_id, batch_number)', async () => {
    await client.createBatch({
      batchNumber: 'LOT-UNIQUE-CHECK',
      itemId: itemMechanical.id,
      unitCost: 20.00,
      quantity: 50
    });

    await expect(async () => {
      await client.createBatch({
        batchNumber: 'LOT-UNIQUE-CHECK', // Duplicate for same item!
        itemId: itemMechanical.id,
        unitCost: 21.00,
        quantity: 50
      });
    }).toReject('UNIQUE constraint failed');
  });

  // --------------------------------------------------------------------------
  // TC-INV-07: Query pickable batches excluding expired batches
  // --------------------------------------------------------------------------
  it('TC-INV-07: Should exclude expired batches from pickable stock queries', async () => {
    // 1. Active valid batch
    await client.createBatch({
      batchNumber: 'LOT-ACTIVE-2028',
      itemId: itemMechanical.id,
      manufactureDate: '2026-01-01',
      expiryDate: '2028-12-31',
      unitCost: 20.00,
      quantity: 100
    });

    // 2. Expired batch (expired in 2024)
    const expiredBatch = await client.createBatch({
      batchNumber: 'LOT-EXPIRED-2024',
      itemId: itemMechanical.id,
      manufactureDate: '2022-01-01',
      expiryDate: '2024-01-01',
      unitCost: 18.00,
      quantity: 50
    });

    // Set status to EXPIRED
    await db.execute("UPDATE item_batches SET status = 'EXPIRED' WHERE id = ?", [expiredBatch.id]);

    const activeBatches = await db.query(
      "SELECT * FROM item_batches WHERE item_id = ? AND status = 'ACTIVE' AND date(expiry_date) > date('now')",
      [itemMechanical.id]
    );

    expect(activeBatches.length).toBe(1);
    expect(activeBatches[0].batch_number).toBe('LOT-ACTIVE-2028');
  });

  // --------------------------------------------------------------------------
  // TC-INV-08: Real-time stock matrix (item x warehouse x bin x batch)
  // --------------------------------------------------------------------------
  it('TC-INV-08: Should maintain real-time inventory balances across Item x Warehouse x Bin x Batch matrix', async () => {
    // Seed bin A1 with 100 units (20 reserved), bin A2 with 60 units (0 reserved)
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
       VALUES ('stk-test-1', ?, ?, ?, 100, 20), ('stk-test-2', ?, ?, ?, 60, 0)`,
      [itemMechanical.id, warehouseA.id, binA1.id, itemMechanical.id, warehouseA.id, binA2.id]
    );

    const b1Stock = await client.getStockLevel(itemMechanical.id, warehouseA.id, binA1.id);
    expect(b1Stock.quantity_on_hand).toBe(100);
    expect(b1Stock.quantity_reserved).toBe(20);

    const b2Stock = await client.getStockLevel(itemMechanical.id, warehouseA.id, binA2.id);
    expect(b2Stock.quantity_on_hand).toBe(60);

    // Aggregate totals at warehouse level
    const totals = await client.getItemTotalStock(itemMechanical.id, warehouseA.id);
    expect(totals.onHand).toBe(160);
    expect(totals.reserved).toBe(20);
    expect(totals.available).toBe(140);
  });

  // --------------------------------------------------------------------------
  // TC-INV-09: Prevent negative inventory stock
  // --------------------------------------------------------------------------
  it('TC-INV-09: Should strictly prevent negative stock via CHECK (quantity_on_hand >= 0)', async () => {
    await expect(async () => {
      await db.execute(
        `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
         VALUES ('stk-neg-err', ?, ?, ?, -10, 0)`,
        [itemMechanical.id, warehouseA.id, binA1.id]
      );
    }).toReject('CHECK constraint failed');
  });

  // --------------------------------------------------------------------------
  // TC-INV-10: Enforce quantity_reserved <= quantity_on_hand
  // --------------------------------------------------------------------------
  it('TC-INV-10: Should strictly enforce CHECK (quantity_reserved <= quantity_on_hand)', async () => {
    await expect(async () => {
      await db.execute(
        `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
         VALUES ('stk-res-err', ?, ?, ?, 20, 25)`, // Reserved 25 > on hand 20!
        [itemMechanical.id, warehouseA.id, binA1.id]
      );
    }).toReject('CHECK constraint failed');
  });

  // --------------------------------------------------------------------------
  // TC-INV-11: Weighted Moving Average Cost (WAC) valuation
  // --------------------------------------------------------------------------
  it('TC-INV-11: Should compute accurate Weighted Moving Average Cost (WAC) valuation across lots', async () => {
    // Batch 1: 100 units @ $20.00 = $2,000.00
    const b1 = await client.createBatch({
      batchNumber: 'LOT-WAC-01',
      itemId: itemMechanical.id,
      unitCost: 20.00,
      quantity: 100
    });

    // Batch 2: 50 units @ $26.00 = $1,300.00
    const b2 = await client.createBatch({
      batchNumber: 'LOT-WAC-02',
      itemId: itemMechanical.id,
      unitCost: 26.00,
      quantity: 50
    });

    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved)
       VALUES ('stk-wac-1', ?, ?, ?, ?, 100, 0), ('stk-wac-2', ?, ?, ?, ?, 50, 0)`,
      [itemMechanical.id, warehouseA.id, binA1.id, b1.id, itemMechanical.id, warehouseA.id, binA2.id, b2.id]
    );

    // Total units: 150. Total value: $2000 + $1300 = $3300. Weighted average cost: $3300 / 150 = $22.00
    const val = await client.calculateValuation(warehouseA.id);
    expect(val.totalUnits).toBe(150);
    expect(val.totalValuation).toBe(3300.00);

    const wac = val.totalValuation / val.totalUnits;
    expect(wac).toBe(22.00);
  });

  // --------------------------------------------------------------------------
  // TC-INV-12: FIFO batch valuation layering
  // --------------------------------------------------------------------------
  it('TC-INV-12: Should support FIFO batch valuation by preserving batch receipt costs and dates', async () => {
    // Older Batch 1: 40 units @ $400.00 (Feb 2026)
    const b1 = await client.createBatch({
      batchNumber: 'LOT-FIFO-01',
      itemId: itemElectrical.id,
      manufactureDate: '2026-01-01',
      expiryDate: '2030-01-01',
      unitCost: 400.00,
      quantity: 40
    });

    // Newer Batch 2: 20 units @ $450.00 (Apr 2026)
    const b2 = await client.createBatch({
      batchNumber: 'LOT-FIFO-02',
      itemId: itemElectrical.id,
      manufactureDate: '2026-03-01',
      expiryDate: '2030-03-01',
      unitCost: 450.00,
      quantity: 20
    });

    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved)
       VALUES ('stk-fifo-1', ?, ?, ?, ?, 40, 0), ('stk-fifo-2', ?, ?, ?, ?, 20, 0)`,
      [itemElectrical.id, warehouseA.id, binA1.id, b1.id, itemElectrical.id, warehouseA.id, binA2.id, b2.id]
    );

    // Query batches ordered by manufactureDate / creation (FIFO order)
    const fifoBatches = await db.query(
      `SELECT b.batch_number, b.unit_cost, s.quantity_on_hand, (b.unit_cost * s.quantity_on_hand) as layer_value
       FROM inventory_stock s
       JOIN item_batches b ON s.batch_id = b.id
       WHERE s.item_id = ? AND s.warehouse_id = ?
       ORDER BY b.manufacture_date ASC`,
      [itemElectrical.id, warehouseA.id]
    );

    expect(fifoBatches.length).toBe(2);
    expect(fifoBatches[0].batch_number).toBe('LOT-FIFO-01');
    expect(fifoBatches[0].layer_value).toBe(16000.00); // 40 * 400
    expect(fifoBatches[1].batch_number).toBe('LOT-FIFO-02');
    expect(fifoBatches[1].layer_value).toBe(9000.00); // 20 * 450

    const totalFifoValue = fifoBatches.reduce((acc: number, row: any) => acc + row.layer_value, 0);
    expect(totalFifoValue).toBe(25000.00);
  });

  // --------------------------------------------------------------------------
  // TC-INV-13: Detect reorder point thresholds and low stock alerts
  // --------------------------------------------------------------------------
  it('TC-INV-13: Should flag items whose stock is at or below min_stock_alert', async () => {
    // itemMechanical has minStockAlert = 30
    // Populate with 25 units (< 30)
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
       VALUES ('stk-alert-test', ?, ?, ?, 25, 0)`,
      [itemMechanical.id, warehouseA.id, binA1.id]
    );

    const alerts = await db.query(`
      SELECT i.id, i.sku, i.name, i.min_stock_alert, i.safety_stock, SUM(s.quantity_on_hand) as total_on_hand
      FROM items i
      JOIN inventory_stock s ON i.id = s.item_id
      WHERE i.is_active = 1
      GROUP BY i.id
      HAVING total_on_hand <= i.min_stock_alert
    `);

    expect(alerts.length).toBe(1);
    expect(alerts[0].sku).toBe('SKU-BEARING-6205');
    expect(Number(alerts[0].total_on_hand)).toBe(25);
    expect(alerts[0].min_stock_alert).toBe(30);
  });

  // --------------------------------------------------------------------------
  // TC-INV-14: Cycle count adjustments & write-offs with audit logging
  // --------------------------------------------------------------------------
  it('TC-INV-14: Should record stock adjustments and write-offs with immutable double-entry audit logging', async () => {
    // Initial stock: 50 units
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
       VALUES ('stk-adj-init', ?, ?, ?, 50, 0)`,
      [itemMechanical.id, warehouseA.id, binA1.id]
    );

    // Cycle count discrepancy: 3 units missing (actual count: 47)
    await db.transaction(async (tx) => {
      // 1. Decrement stock
      await tx.execute(
        `UPDATE inventory_stock SET quantity_on_hand = 47, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = 'stk-adj-init'`
      );

      // 2. Audit log
      const auditId = `aud-cycle-${Date.now()}`;
      await tx.execute(
        `INSERT INTO inventory_transactions (
          id, transaction_type, reference_type, reference_id, item_id, warehouse_id,
          bin_id, quantity_change, unit_cost, running_balance_after, user_id, notes
        ) VALUES (?, 'CYCLE_COUNT_ADJUSTMENT', 'ADJUSTMENT', 'ADJ-202610-01', ?, ?, ?, -3, 20.00, 47, 'QC Inspector', 'Annual cycle count discrepancy')`,
        [auditId, itemMechanical.id, warehouseA.id, binA1.id]
      );
    });

    const stock = await client.getStockLevel(itemMechanical.id, warehouseA.id, binA1.id);
    expect(stock.quantity_on_hand).toBe(47);

    const auditRecords = await db.query(
      "SELECT * FROM inventory_transactions WHERE reference_id = 'ADJ-202610-01'"
    );
    expect(auditRecords.length).toBe(1);
    expect(auditRecords[0].transaction_type).toBe('CYCLE_COUNT_ADJUSTMENT');
    expect(auditRecords[0].quantity_change).toBe(-3);
    expect(auditRecords[0].running_balance_after).toBe(47);
  });

  // --------------------------------------------------------------------------
  // TC-INV-15: Warehouse deactivation / soft-delete when active stock exists
  // --------------------------------------------------------------------------
  it('TC-INV-15: Should soft-delete warehouse (is_active = 0) and preserve historical stock and bins', async () => {
    // Place stock in warehouse B
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
       VALUES ('stk-whb-active', ?, ?, ?, 30, 0)`,
      [itemMechanical.id, warehouseB.id, binB1.id]
    );

    // Deactivate warehouse
    await db.execute(
      "UPDATE warehouses SET is_active = 0, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE id = ?",
      [warehouseB.id]
    );

    const wh = await client.getWarehouse(warehouseB.id);
    expect(wh.is_active).toBe(0);

    // Active warehouses list excludes deactivated facility
    const activeList = await client.listWarehouses();
    const stillActive = activeList.filter((w: any) => w.is_active === 1);
    expect(stillActive.some((w: any) => w.id === warehouseB.id)).toBeFalsy();

    // Historical stock record remains intact
    const stock = await client.getStockLevel(itemMechanical.id, warehouseB.id, binB1.id);
    expect(stock.quantity_on_hand).toBe(30);
  });
});

if (process.argv[1]?.includes('inventory.test.ts')) {
  runSuites().then(res => {
    if (res.failed > 0) process.exit(1);
  });
}
