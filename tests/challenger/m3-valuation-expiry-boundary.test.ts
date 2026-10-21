/**
 * Empirical Adversarial Challenger Test Harness for Milestone 3
 * File: tests/challenger/m3-valuation-expiry-boundary.test.ts
 *
 * Challenger Agent: challenger_m3_2
 * Role: teamwork_preview_challenger
 * Parent Conversation ID: 1347b039-1626-4c72-8c14-b276ea869349
 *
 * Scope:
 * 1. WAC & FIFO valuation mathematical correctness across multiple incoming shipments at varying price points.
 * 2. Batch expiration: verify expired batches are flagged `EXPIRED` and quarantined from standard allocation.
 * 3. Negative inventory attacks: attempt to transfer or deduct more stock than available on hand (must be cleanly blocked).
 * 4. Reorder point alerts: test exact boundary conditions (`stock == min_alert`, `stock == min_alert - 1`).
 * 5. Cycle count adjustment integrity: verify both positive write-ins and negative write-offs correctly update stock and audit logs.
 */

import { describe, it, expect, beforeEach, runSuites } from '../harness/test-runner.ts';
import { TestDatabaseService } from '../harness/test-db.ts';
import { DatabaseService } from '../../src/services/db.ts';
import { InventoryService } from '../../src/services/inventoryService.ts';
import { TransferService } from '../../src/services/transferService.ts';
import { ERPTestClient } from '../harness/erp-test-client.ts';

let db: TestDatabaseService;
let invService: InventoryService;
let trService: TransferService;
let client: ERPTestClient;

let whCentral: any;
let whPort: any;
let binCentral1: any;
let binCentral2: any;
let binPort1: any;

let itemAlpha: any;
let itemBeta: any;
let itemGamma: any;

describe('M3 Adversarial Challenger: Valuation, Expiry Quarantine & Negative Boundary Resistance', () => {
  beforeEach(async () => {
    db = new TestDatabaseService(':memory:');
    await db.initialize();
    invService = new InventoryService();
    trService = new TransferService();
    client = new ERPTestClient(db);

    // 1. Seed Warehouses
    whCentral = await invService.createWarehouse(
      {
        warehouseCode: 'WH-CENTRAL-CHAL',
        name: 'Central Distribution Depot',
        address: '100 Tejgaon Commercial Area',
        city: 'Dhaka',
        isDefault: true
      },
      db
    );

    whPort = await invService.createWarehouse(
      {
        warehouseCode: 'WH-PORT-CHAL',
        name: 'Maritime Port Facility',
        address: '45 Strand Road',
        city: 'Chittagong',
        isDefault: false
      },
      db
    );

    // 2. Seed Bins
    binCentral1 = await invService.createLocation(
      {
        warehouseId: whCentral.id,
        zone: 'Zone A',
        aisle: 'A1',
        rack: 'R1',
        shelf: 'S1',
        binCode: 'CEN-ZA-A1-R1-S1',
        maxWeightKg: 1000
      },
      db
    );

    binCentral2 = await invService.createLocation(
      {
        warehouseId: whCentral.id,
        zone: 'Zone B',
        aisle: 'B1',
        rack: 'R1',
        shelf: 'S1',
        binCode: 'CEN-ZB-B1-R1-S1',
        maxWeightKg: 1000
      },
      db
    );

    binPort1 = await invService.createLocation(
      {
        warehouseId: whPort.id,
        zone: 'Zone P',
        aisle: 'P1',
        rack: 'R1',
        shelf: 'S1',
        binCode: 'PRT-ZP-P1-R1-S1',
        maxWeightKg: 2000
      },
      db
    );

    // 3. Seed Catalog Items
    itemAlpha = await client.createItem({
      sku: 'SKU-VAL-ALPHA',
      barcode: 'BAR-VAL-001',
      name: 'High Performance Inverter Module',
      category: 'Electronics',
      unitOfMeasure: 'units',
      costPrice: 100.00,
      sellingPrice: 180.00,
      minStockAlert: 50,
      safetyStock: 20,
      maxStock: 500
    });

    itemBeta = await client.createItem({
      sku: 'SKU-VAL-BETA',
      barcode: 'BAR-VAL-002',
      name: 'Solar Monocrystalline Cell 400W',
      category: 'Photovoltaic',
      unitOfMeasure: 'pcs',
      costPrice: 50.00,
      sellingPrice: 85.00,
      minStockAlert: 100,
      safetyStock: 40,
      maxStock: 1000
    });

    itemGamma = await client.createItem({
      sku: 'SKU-VAL-GAMMA',
      barcode: 'BAR-VAL-003',
      name: 'Industrial Heavy Duty Contactor',
      category: 'Switchgear',
      unitOfMeasure: 'pcs',
      costPrice: 25.00,
      sellingPrice: 45.00,
      minStockAlert: 30,
      safetyStock: 10,
      maxStock: 300
    });
  });

  // =========================================================================
  // DOMAIN 1: WAC & FIFO VALUATION MATHEMATICAL CORRECTNESS
  // =========================================================================

  it('TC-CHAL-M3-01: WAC valuation mathematical precision across multi-tier shipments at varying price points', async () => {
    // Multi-tier shipments for itemAlpha:
    // Shipment 1: 100 units @ $100.00 = $10,000.00
    // Shipment 2: 250 units @ $145.00 = $36,250.00
    // Shipment 3: 150 units @ $182.50 = $27,375.00
    // Total Units: 100 + 250 + 150 = 500 units
    // Total Valuation: $10,000 + $36,250 + $27,375 = $73,625.00
    // Mathematical Weighted Average Cost = $73,625 / 500 = $147.25 exactly.

    const b1 = await invService.createBatch(
      {
        batchNumber: 'LOT-SHIP-01',
        itemId: itemAlpha.id,
        unitCost: 100.00,
        quantity: 100
      },
      db
    );

    const b2 = await invService.createBatch(
      {
        batchNumber: 'LOT-SHIP-02',
        itemId: itemAlpha.id,
        unitCost: 145.00,
        quantity: 250
      },
      db
    );

    const b3 = await invService.createBatch(
      {
        batchNumber: 'LOT-SHIP-03',
        itemId: itemAlpha.id,
        unitCost: 182.50,
        quantity: 150
      },
      db
    );

    // Seed into inventory_stock
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved)
       VALUES 
         ('stk-alpha-1', ?, ?, ?, ?, 100, 0),
         ('stk-alpha-2', ?, ?, ?, ?, 250, 0),
         ('stk-alpha-3', ?, ?, ?, ?, 150, 0)`,
      [
        itemAlpha.id, whCentral.id, binCentral1.id, b1.id,
        itemAlpha.id, whCentral.id, binCentral1.id, b2.id,
        itemAlpha.id, whCentral.id, binCentral2.id, b3.id
      ]
    );

    // Verify overall valuation report
    const report = await invService.calculateValuation(whCentral.id, db);
    expect(report.totalUnits).toBe(500);
    expect(report.totalValuation).toBe(73625.00);
    expect(report.averageUnitCost).toBe(147.25);

    // Verify detailed item valuation
    const itemVal = await invService.getItemValuation(itemAlpha.id, whCentral.id, db);
    expect(itemVal).toBeDefined();
    expect(itemVal?.quantity).toBe(500);
    expect(itemVal?.item_total_value).toBe(73625.00);
    expect(itemVal?.weighted_average_cost).toBe(147.25);
    expect(itemVal?.fifoLayers?.length).toBe(3);
  });

  it('TC-CHAL-M3-02: FIFO cost layering fidelity and post-depletion WAC re-computation', async () => {
    // Initial:
    // Batch 1 (Oldest): 40 units @ $50.00 = $2,000.00
    // Batch 2 (Newer):  60 units @ $75.00 = $4,500.00
    // Total = 100 units, $6,500.00, initial WAC = $65.00
    const b1 = await invService.createBatch(
      {
        batchNumber: 'LOT-FIFO-ALPHA',
        itemId: itemBeta.id,
        manufactureDate: '2026-01-01',
        expiryDate: '2029-01-01',
        unitCost: 50.00,
        quantity: 40
      },
      db
    );

    const b2 = await invService.createBatch(
      {
        batchNumber: 'LOT-FIFO-BETA',
        itemId: itemBeta.id,
        manufactureDate: '2026-03-01',
        expiryDate: '2029-03-01',
        unitCost: 75.00,
        quantity: 60
      },
      db
    );

    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved)
       VALUES 
         ('stk-beta-1', ?, ?, ?, ?, 40, 0),
         ('stk-beta-2', ?, ?, ?, ?, 60, 0)`,
      [
        itemBeta.id, whCentral.id, binCentral1.id, b1.id,
        itemBeta.id, whCentral.id, binCentral2.id, b2.id
      ]
    );

    const initialVal = await invService.getItemValuation(itemBeta.id, whCentral.id, db);
    expect(initialVal?.quantity).toBe(100);
    expect(initialVal?.item_total_value).toBe(6500.00);
    expect(initialVal?.weighted_average_cost).toBe(65.00);

    // Deplete oldest Batch 1 entirely (40 units written off or shipped)
    await invService.adjustStock(
      {
        itemId: itemBeta.id,
        warehouseId: whCentral.id,
        binId: binCentral1.id,
        batchId: b1.id,
        adjustmentType: 'NEW_BALANCE',
        quantity: 0,
        reason: 'ADJUSTMENT_WRITE_OFF',
        notes: 'FIFO oldest batch fully consumed'
      },
      db
    );

    // Remaining: only Batch 2 (60 units @ $75.00 = $4,500.00)
    // New WAC should be exactly $75.00!
    const postVal = await invService.getItemValuation(itemBeta.id, whCentral.id, db);
    expect(postVal?.quantity).toBe(60);
    expect(postVal?.item_total_value).toBe(4500.00);
    expect(postVal?.weighted_average_cost).toBe(75.00);
  });

  it('TC-CHAL-M3-03: Zero-quantity valuation boundary and multi-facility isolation', async () => {
    // Check item with zero inventory: must not return NaN or throw division by zero
    const emptyVal = await invService.getItemValuation(itemGamma.id, whCentral.id, db);
    expect(emptyVal?.quantity).toBe(0);
    expect(emptyVal?.item_total_value).toBe(0);
    expect(emptyVal?.weighted_average_cost).toBe(itemGamma.cost_price); // Falls back to catalog cost price

    // Multi-facility segregation:
    // Place 10 units of itemGamma in Central @ $25 = $250
    // Place 20 units of itemGamma in Port @ $30 = $600
    const bPort = await invService.createBatch(
      {
        batchNumber: 'LOT-GAMMA-PRT',
        itemId: itemGamma.id,
        unitCost: 30.00,
        quantity: 20
      },
      db
    );

    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved)
       VALUES 
         ('stk-gam-cen', ?, ?, ?, NULL, 10, 0),
         ('stk-gam-prt', ?, ?, ?, ?, 20, 0)`,
      [
        itemGamma.id, whCentral.id, binCentral1.id,
        itemGamma.id, whPort.id, binPort1.id, bPort.id
      ]
    );

    // Query Central: strictly 10 units, $250
    const valCentral = await invService.calculateValuation(whCentral.id, db);
    const gammaCen = valCentral.itemsValuation.find(i => i.itemId === itemGamma.id);
    expect(gammaCen?.quantity).toBe(10);
    expect(gammaCen?.item_total_value).toBe(250.00);

    // Query Port: strictly 20 units, $600
    const valPort = await invService.calculateValuation(whPort.id, db);
    const gammaPrt = valPort.itemsValuation.find(i => i.itemId === itemGamma.id);
    expect(gammaPrt?.quantity).toBe(20);
    expect(gammaPrt?.item_total_value).toBe(600.00);

    // Enterprise-wide (unfiltered): 30 units, $850, WAC = 850 / 30 = 28.33
    const valEnterprise = await invService.calculateValuation(undefined, db);
    const gammaAll = valEnterprise.itemsValuation.find(i => i.itemId === itemGamma.id);
    expect(gammaAll?.quantity).toBe(30);
    expect(gammaAll?.item_total_value).toBe(850.00);
    expect(gammaAll?.weighted_average_cost).toBe(28.33);
  });

  // =========================================================================
  // DOMAIN 2: BATCH EXPIRATION & QUARANTINE ALLOCATION INTEGRITY
  // =========================================================================

  it('TC-CHAL-M3-04: Batch creation with past expiry date automatically sets EXPIRED status', async () => {
    // Create batch with expiry date in 2023 (past)
    const expiredBatch = await invService.createBatch(
      {
        batchNumber: 'LOT-PAST-2023',
        itemId: itemAlpha.id,
        expiryDate: '2023-01-01',
        unitCost: 100.00,
        quantity: 50
      },
      db
    );
    expect(expiredBatch.status).toBe('EXPIRED');

    // Create batch with expiry date in 2030 (future)
    const validBatch = await invService.createBatch(
      {
        batchNumber: 'LOT-FUTURE-2030',
        itemId: itemAlpha.id,
        expiryDate: '2030-01-01',
        unitCost: 100.00,
        quantity: 50
      },
      db
    );
    expect(validBatch.status).toBe('ACTIVE');
  });

  it('TC-CHAL-M3-05: Expired and quarantined batches are strictly barred from picking allocation', async () => {
    // 1. Batch A: Expired (status = 'EXPIRED', past date) - 100 units
    const bExpired = await invService.createBatch(
      {
        batchNumber: 'LOT-EXPIRED-PICK',
        itemId: itemAlpha.id,
        expiryDate: '2024-05-01',
        unitCost: 90.00,
        quantity: 100
      },
      db
    );

    // 2. Batch B: Quarantined (status = 'QUARANTINED') - 50 units
    const bQuarantine = await invService.createBatch(
      {
        batchNumber: 'LOT-QUARANTINED-PICK',
        itemId: itemAlpha.id,
        expiryDate: '2029-01-01',
        status: 'QUARANTINED',
        unitCost: 100.00,
        quantity: 50
      },
      db
    );

    // 3. Batch C: Active valid - 25 units
    const bActive = await invService.createBatch(
      {
        batchNumber: 'LOT-ACTIVE-PICK',
        itemId: itemAlpha.id,
        expiryDate: '2029-06-01',
        status: 'ACTIVE',
        unitCost: 110.00,
        quantity: 25
      },
      db
    );

    // Insert stock rows for all three
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved)
       VALUES 
         ('stk-exp-01', ?, ?, ?, ?, 100, 0),
         ('stk-qua-01', ?, ?, ?, ?, 50, 0),
         ('stk-act-01', ?, ?, ?, ?, 25, 0)`,
      [
        itemAlpha.id, whCentral.id, binCentral1.id, bExpired.id,
        itemAlpha.id, whCentral.id, binCentral1.id, bQuarantine.id,
        itemAlpha.id, whCentral.id, binCentral2.id, bActive.id
      ]
    );

    // Request picking allocation for 20 units:
    // Should allocate strictly from bActive, ignoring bExpired and bQuarantine!
    const alloc1 = await invService.getAvailableBatchesForPicking(
      itemAlpha.id,
      whCentral.id,
      20,
      'FEFO',
      db
    );

    expect(alloc1.length).toBe(1);
    expect(alloc1[0].batchId).toBe(bActive.id);
    expect(alloc1[0].allocatedQuantity).toBe(20);

    // Request picking allocation for 60 units (more than bActive's 25):
    // Even though bExpired has 100 and bQuarantine has 50, it MUST NOT allocate from them!
    // Total allocated must cap at 25 units from bActive.
    const alloc2 = await invService.getAvailableBatchesForPicking(
      itemAlpha.id,
      whCentral.id,
      60,
      'FEFO',
      db
    );

    expect(alloc2.length).toBe(1);
    expect(alloc2[0].batchId).toBe(bActive.id);
    expect(alloc2[0].allocatedQuantity).toBe(25);
    const totalAllocated = alloc2.reduce((sum, a) => sum + a.allocatedQuantity, 0);
    expect(totalAllocated).toBe(25);
  });

  it('TC-CHAL-M3-06: Manual batch quarantine transitions status and creates audit log', async () => {
    const batch = await invService.createBatch(
      {
        batchNumber: 'LOT-DEFECT-RECALL',
        itemId: itemBeta.id,
        expiryDate: '2028-12-31',
        status: 'ACTIVE',
        unitCost: 50.00,
        quantity: 80
      },
      db
    );

    expect(batch.status).toBe('ACTIVE');

    // Quarantine batch
    const quarantined = await invService.quarantineBatch(
      batch.id,
      'Thermal defect detected during sample testing',
      'qa-lead',
      db
    );

    expect(quarantined.status).toBe('QUARANTINED');

    // Verify audit log entry
    const auditRows = await db.query<any>(
      "SELECT * FROM audit_logs WHERE entity_id = ? AND action = 'BATCH_QUARANTINE'",
      [batch.id]
    );
    expect(auditRows.length).toBe(1);
    expect(auditRows[0].user_id).toBe('qa-lead');
    expect(auditRows[0].details).toContain('Thermal defect');
  });

  // =========================================================================
  // DOMAIN 3: NEGATIVE INVENTORY ATTACK RESISTANCE
  // =========================================================================

  it('TC-CHAL-M3-07: SQL CHECK constraint blocks negative quantity_on_hand and excessive reservation', async () => {
    // Attack 1: INSERT negative quantity_on_hand
    await expect(async () => {
      await db.execute(
        `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
         VALUES ('stk-neg-01', ?, ?, ?, -5, 0)`,
        [itemAlpha.id, whCentral.id, binCentral1.id]
      );
    }).toReject('CHECK constraint failed');

    // Attack 2: UPDATE driving quantity_on_hand to negative
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
       VALUES ('stk-pos-01', ?, ?, ?, 10, 0)`,
      [itemAlpha.id, whCentral.id, binCentral1.id]
    );

    await expect(async () => {
      await db.execute(
        "UPDATE inventory_stock SET quantity_on_hand = -1 WHERE id = 'stk-pos-01'"
      );
    }).toReject('CHECK constraint failed');

    // Attack 3: quantity_reserved > quantity_on_hand
    await expect(async () => {
      await db.execute(
        "UPDATE inventory_stock SET quantity_reserved = 15 WHERE id = 'stk-pos-01'"
      );
    }).toReject('CHECK constraint failed');
  });

  it('TC-CHAL-M3-08: Stock transfer dispatch attack: transferring more stock than available on hand is blocked', async () => {
    // Available stock in Central Bin 1: exactly 25 units
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
       VALUES ('stk-atk-tr', ?, ?, ?, 25, 0)`,
      [itemAlpha.id, whCentral.id, binCentral1.id]
    );

    // Create transfer requesting 30 units (> 25 available)
    const transfer = await trService.createTransfer(
      {
        transferNumber: 'TR-ATTACK-001',
        sourceWarehouseId: whCentral.id,
        destWarehouseId: whPort.id,
        items: [
          {
            itemId: itemAlpha.id,
            sourceBinId: binCentral1.id,
            quantityRequested: 30
          }
        ]
      },
      db
    );

    // Attempt dispatch: MUST be blocked cleanly
    let errorCaught = false;
    let errorMessage = '';
    try {
      await trService.dispatchTransfer(transfer.id, 'attacker', db);
    } catch (err: any) {
      errorCaught = true;
      errorMessage = err.message;
    }

    expect(errorCaught).toBe(true);
    expect(errorMessage).toContain('Insufficient stock available');

    // Assert atomicity and isolation:
    // 1. Source stock must remain strictly 25 units
    const stockAfter = await invService.getStockLevel(itemAlpha.id, whCentral.id, binCentral1.id, null, db);
    expect(stockAfter?.quantity_on_hand).toBe(25);

    // 2. Transfer status must NOT be 'in_transit'
    const transferAfter = await trService.getTransferById(transfer.id, db);
    expect(transferAfter?.status).toBe('draft');

    // 3. Destination stock must be 0
    const destStock = await invService.getStockLevel(itemAlpha.id, whPort.id, null, null, db);
    expect(destStock).toBeNull();
  });

  it('TC-CHAL-M3-09: Stock adjustment negative attacks: DELTA and NEW_BALANCE below zero rejected', async () => {
    // Stock on hand: 20 units
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
       VALUES ('stk-adj-neg', ?, ?, ?, 20, 0)`,
      [itemBeta.id, whCentral.id, binCentral1.id]
    );

    // Attack 1: DELTA = -25 (would result in -5)
    await expect(async () => {
      await invService.adjustStock(
        {
          itemId: itemBeta.id,
          warehouseId: whCentral.id,
          binId: binCentral1.id,
          adjustmentType: 'DELTA',
          quantity: -25,
          reason: 'ADJUSTMENT_WRITE_OFF'
        },
        db
      );
    }).toReject('resulting balance (-5) cannot be negative');

    // Attack 2: NEW_BALANCE = -1
    await expect(async () => {
      await invService.adjustStock(
        {
          itemId: itemBeta.id,
          warehouseId: whCentral.id,
          binId: binCentral1.id,
          adjustmentType: 'NEW_BALANCE',
          quantity: -1,
          reason: 'ADJUSTMENT_WRITE_OFF'
        },
        db
      );
    }).toReject('resulting balance (-1) cannot be negative');

    // Stock on hand must still be 20
    const stock = await invService.getStockLevel(itemBeta.id, whCentral.id, binCentral1.id, null, db);
    expect(stock?.quantity_on_hand).toBe(20);
  });

  it('TC-CHAL-M3-10: Concurrency attack: simultaneous dispatches exceeding on-hand stock', async () => {
    // Production DatabaseService with serialized transaction queue
    const prodDb = new DatabaseService(':memory:');
    await prodDb.initialize();

    // Setup facilities
    const wh1 = await invService.createWarehouse(
      { warehouseCode: 'WH-RACE-1', name: 'Race WH 1', address: 'A', city: 'Dhaka' },
      prodDb
    );
    const wh2 = await invService.createWarehouse(
      { warehouseCode: 'WH-RACE-2', name: 'Race WH 2', address: 'B', city: 'Chittagong' },
      prodDb
    );
    const bin1 = await invService.createLocation(
      { warehouseId: wh1.id, zone: 'Z', aisle: 'A', rack: 'R', shelf: 'S', binCode: 'BIN-RACE-1' },
      prodDb
    );

    const raceItem = await client.createItem({
      sku: 'SKU-RACE-ITEM',
      name: 'Race Invariant Item',
      category: 'General',
      costPrice: 50.00,
      sellingPrice: 100.00
    });
    // Insert item in prodDb as well
    await prodDb.execute(
      `INSERT INTO items (id, sku, name, category, cost_price, selling_price, min_stock_alert, safety_stock, max_stock)
       VALUES (?, ?, ?, ?, ?, ?, 10, 5, 100)`,
      [raceItem.id, raceItem.sku, raceItem.name, raceItem.category, raceItem.cost_price, raceItem.selling_price]
    );

    // Initial stock: exactly 30 units
    await prodDb.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
       VALUES ('stk-race-01', ?, ?, ?, 30, 0)`,
      [raceItem.id, wh1.id, bin1.id]
    );

    // Create 2 transfers of 20 units each (total 40 > 30)
    const tr1 = await trService.createTransfer(
      {
        transferNumber: 'TR-RACE-001',
        sourceWarehouseId: wh1.id,
        destWarehouseId: wh2.id,
        items: [{ itemId: raceItem.id, sourceBinId: bin1.id, quantityRequested: 20 }]
      },
      prodDb
    );

    const tr2 = await trService.createTransfer(
      {
        transferNumber: 'TR-RACE-002',
        sourceWarehouseId: wh1.id,
        destWarehouseId: wh2.id,
        items: [{ itemId: raceItem.id, sourceBinId: bin1.id, quantityRequested: 20 }]
      },
      prodDb
    );

    // Launch both dispatches concurrently
    const results = await Promise.allSettled([
      trService.dispatchTransfer(tr1.id, 'dispatch-agent-1', prodDb),
      trService.dispatchTransfer(tr2.id, 'dispatch-agent-2', prodDb)
    ]);

    // Exactly one should succeed, and one should fail
    const succeeded = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    expect(succeeded.length).toBe(1);
    expect(rejected.length).toBe(1);

    // Stock on hand must be exactly 30 - 20 = 10 (NEVER negative!)
    const stockRows = await prodDb.query<any>(
      'SELECT quantity_on_hand FROM inventory_stock WHERE id = ?',
      ['stk-race-01']
    );
    expect(stockRows[0].quantity_on_hand).toBe(10);
  });

  // =========================================================================
  // DOMAIN 4: REORDER POINT ALERT BOUNDARIES
  // =========================================================================

  it('TC-CHAL-M3-11: Reorder alert boundary conditions: min_stock_alert, safety_stock, and out of stock', async () => {
    // Item Beta configuration: minStockAlert = 100, safetyStock = 40, maxStock = 1000

    // Boundary 1: stock == minStockAlert + 1 (101 units) -> NOT low stock
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
       VALUES ('stk-bnd-1', ?, ?, ?, 101, 0)`,
      [itemBeta.id, whCentral.id, binCentral1.id]
    );

    let alerts = await invService.getLowStockAlerts(whCentral.id, db);
    let betaAlert = alerts.find(a => a.itemId === itemBeta.id);
    expect(betaAlert).toBe(undefined); // No alert when stock > minStockAlert

    // Boundary 2: stock == minStockAlert (100 units) -> Exact boundary, alert triggered with 'WARNING'
    await db.execute(
      "UPDATE inventory_stock SET quantity_on_hand = 100 WHERE id = 'stk-bnd-1'"
    );
    alerts = await invService.getLowStockAlerts(whCentral.id, db);
    betaAlert = alerts.find(a => a.itemId === itemBeta.id);
    expect(betaAlert).toBeDefined();
    expect(betaAlert?.alertLevel).toBe('WARNING');
    expect(betaAlert?.deficitQuantity).toBe(0); // 100 - 100 = 0

    // Boundary 3: stock == minStockAlert - 1 (99 units) -> Alert triggered with 'WARNING'
    await db.execute(
      "UPDATE inventory_stock SET quantity_on_hand = 99 WHERE id = 'stk-bnd-1'"
    );
    alerts = await invService.getLowStockAlerts(whCentral.id, db);
    betaAlert = alerts.find(a => a.itemId === itemBeta.id);
    expect(betaAlert).toBeDefined();
    expect(betaAlert?.alertLevel).toBe('WARNING');
    expect(betaAlert?.deficitQuantity).toBe(1); // 100 - 99 = 1

    // Boundary 4: stock == safetyStock + 1 (41 units) -> Still 'WARNING'
    await db.execute(
      "UPDATE inventory_stock SET quantity_on_hand = 41 WHERE id = 'stk-bnd-1'"
    );
    alerts = await invService.getLowStockAlerts(whCentral.id, db);
    betaAlert = alerts.find(a => a.itemId === itemBeta.id);
    expect(betaAlert?.alertLevel).toBe('WARNING');

    // Boundary 5: stock == safetyStock (40 units) -> Transitions to 'CRITICAL'
    await db.execute(
      "UPDATE inventory_stock SET quantity_on_hand = 40 WHERE id = 'stk-bnd-1'"
    );
    alerts = await invService.getLowStockAlerts(whCentral.id, db);
    betaAlert = alerts.find(a => a.itemId === itemBeta.id);
    expect(betaAlert?.alertLevel).toBe('CRITICAL');
    expect(betaAlert?.deficitQuantity).toBe(60); // 100 - 40 = 60

    // Boundary 6: stock == 0 -> Transitions to 'OUT_OF_STOCK'
    await db.execute(
      "UPDATE inventory_stock SET quantity_on_hand = 0 WHERE id = 'stk-bnd-1'"
    );
    alerts = await invService.getLowStockAlerts(whCentral.id, db);
    betaAlert = alerts.find(a => a.itemId === itemBeta.id);
    expect(betaAlert?.alertLevel).toBe('OUT_OF_STOCK');
    expect(betaAlert?.deficitQuantity).toBe(100);
  });

  it('TC-CHAL-M3-12: Warehouse-specific vs enterprise-wide reorder alert scoping', async () => {
    // itemGamma has minStockAlert = 30
    // Central has 15 units (low: <= 30)
    // Port has 50 units (abundant: > 30)
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
       VALUES 
         ('stk-gam-c', ?, ?, ?, 15, 0),
         ('stk-gam-p', ?, ?, ?, 50, 0)`,
      [
        itemGamma.id, whCentral.id, binCentral1.id,
        itemGamma.id, whPort.id, binPort1.id
      ]
    );

    // Query Central: must trigger alert (15 <= 30)
    const alertsCen = await invService.getLowStockAlerts(whCentral.id, db);
    const gammaCen = alertsCen.find(a => a.itemId === itemGamma.id);
    expect(gammaCen).toBeDefined();
    expect(gammaCen?.quantityOnHand).toBe(15);

    // Query Port: must NOT trigger alert (50 > 30)
    const alertsPrt = await invService.getLowStockAlerts(whPort.id, db);
    const gammaPrt = alertsPrt.find(a => a.itemId === itemGamma.id);
    expect(gammaPrt).toBe(undefined);

    // Query Enterprise-wide: aggregate = 15 + 50 = 65 > 30 -> No enterprise alert!
    const alertsAll = await invService.getLowStockAlerts(undefined, db);
    const gammaAll = alertsAll.find(a => a.itemId === itemGamma.id);
    expect(gammaAll).toBe(undefined);
  });

  // =========================================================================
  // DOMAIN 5: CYCLE COUNT ADJUSTMENT INTEGRITY & DOUBLE-ENTRY LEDGER
  // =========================================================================

  it('TC-CHAL-M3-13: Positive cycle count write-in updates stock, batch, and double-entry ledger', async () => {
    const batch = await invService.createBatch(
      {
        batchNumber: 'LOT-CYCLE-POS',
        itemId: itemAlpha.id,
        unitCost: 100.00,
        quantity: 50
      },
      db
    );

    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved)
       VALUES ('stk-cycle-1', ?, ?, ?, ?, 50, 0)`,
      [itemAlpha.id, whCentral.id, binCentral1.id, batch.id]
    );

    // Physical audit reveals 62 units (+12 surplus found)
    const adjResult = await invService.adjustStock(
      {
        itemId: itemAlpha.id,
        warehouseId: whCentral.id,
        binId: binCentral1.id,
        batchId: batch.id,
        adjustmentType: 'DELTA',
        quantity: 12,
        reason: 'CYCLE_COUNT_ADJUSTMENT',
        notes: 'Unopened box found on upper rack during quarterly count',
        userId: 'auditor-01'
      },
      db
    );

    expect(adjResult.previousBalance).toBe(50);
    expect(adjResult.quantityChange).toBe(12);
    expect(adjResult.newBalance).toBe(62);

    // Verify stock table updated
    const stock = await invService.getStockLevel(itemAlpha.id, whCentral.id, binCentral1.id, batch.id, db);
    expect(stock?.quantity_on_hand).toBe(62);

    // Verify batch current_quantity updated to 62
    const batchAfter = await invService.getBatchById(batch.id, db);
    expect(batchAfter?.current_quantity).toBe(62);

    // Verify double-entry ledger in inventory_transactions
    const txRows = await db.query<any>(
      "SELECT * FROM inventory_transactions WHERE reference_type = 'ADJUSTMENT' AND item_id = ?",
      [itemAlpha.id]
    );
    expect(txRows.length).toBe(1);
    expect(txRows[0].transaction_type).toBe('CYCLE_COUNT_ADJUSTMENT');
    expect(txRows[0].quantity_change).toBe(12);
    expect(txRows[0].running_balance_after).toBe(62);
    expect(txRows[0].user_id).toBe('auditor-01');
  });

  it('TC-CHAL-M3-14: Negative cycle count write-off updates stock, batch, and double-entry ledger', async () => {
    const batch = await invService.createBatch(
      {
        batchNumber: 'LOT-CYCLE-NEG',
        itemId: itemBeta.id,
        unitCost: 50.00,
        quantity: 60
      },
      db
    );

    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved)
       VALUES ('stk-cycle-2', ?, ?, ?, ?, 60, 0)`,
      [itemBeta.id, whCentral.id, binCentral1.id, batch.id]
    );

    // Physical audit reveals 54 units (-6 shrinkage/damaged write-off)
    const adjResult = await invService.adjustStock(
      {
        itemId: itemBeta.id,
        warehouseId: whCentral.id,
        binId: binCentral1.id,
        batchId: batch.id,
        adjustmentType: 'DELTA',
        quantity: -6,
        reason: 'ADJUSTMENT_WRITE_OFF',
        notes: '6 cracked solar cells written off to scrap',
        userId: 'auditor-02'
      },
      db
    );

    expect(adjResult.previousBalance).toBe(60);
    expect(adjResult.quantityChange).toBe(-6);
    expect(adjResult.newBalance).toBe(54);

    const stock = await invService.getStockLevel(itemBeta.id, whCentral.id, binCentral1.id, batch.id, db);
    expect(stock?.quantity_on_hand).toBe(54);

    const batchAfter = await invService.getBatchById(batch.id, db);
    expect(batchAfter?.current_quantity).toBe(54);

    const txRows = await db.query<any>(
      "SELECT * FROM inventory_transactions WHERE reference_type = 'ADJUSTMENT' AND item_id = ?",
      [itemBeta.id]
    );
    expect(txRows.length).toBe(1);
    expect(txRows[0].transaction_type).toBe('ADJUSTMENT_WRITE_OFF');
    expect(txRows[0].quantity_change).toBe(-6);
    expect(txRows[0].running_balance_after).toBe(54);
  });

  it('TC-CHAL-M3-15: Absolute NEW_BALANCE adjustments including full write-off to zero', async () => {
    // Initial: 20 units
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved)
       VALUES ('stk-cycle-3', ?, ?, ?, NULL, 20, 0)`,
      [itemGamma.id, whCentral.id, binCentral1.id]
    );

    // Count reveals exactly 0 (complete write-off)
    const zeroAdj = await invService.adjustStock(
      {
        itemId: itemGamma.id,
        warehouseId: whCentral.id,
        binId: binCentral1.id,
        adjustmentType: 'NEW_BALANCE',
        quantity: 0,
        reason: 'ADJUSTMENT_WRITE_OFF',
        notes: 'Total loss write-off'
      },
      db
    );

    expect(zeroAdj.previousBalance).toBe(20);
    expect(zeroAdj.quantityChange).toBe(-20);
    expect(zeroAdj.newBalance).toBe(0);

    const stockAfter = await invService.getStockLevel(itemGamma.id, whCentral.id, binCentral1.id, null, db);
    expect(stockAfter?.quantity_on_hand).toBe(0);

    const txRows = await db.query<any>(
      "SELECT * FROM inventory_transactions WHERE reference_type = 'ADJUSTMENT' AND item_id = ?",
      [itemGamma.id]
    );
    expect(txRows.length).toBe(1);
    expect(txRows[0].running_balance_after).toBe(0);
  });

  // =========================================================================
  // DOMAIN 6: TRANSFER RECEIVING & STRUCTURAL INTEGRITY ATTACKS
  // =========================================================================

  it('TC-CHAL-M3-16: Over-receiving and negative receiving attacks during destination receipt are rejected', async () => {
    // Setup stock in Central: 50 units
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
       VALUES ('stk-recv-atk', ?, ?, ?, 50, 0)`,
      [itemAlpha.id, whCentral.id, binCentral1.id]
    );

    const tr = await trService.createTransfer(
      {
        transferNumber: 'TR-RECV-ATK',
        sourceWarehouseId: whCentral.id,
        destWarehouseId: whPort.id,
        items: [{ itemId: itemAlpha.id, sourceBinId: binCentral1.id, destBinId: binPort1.id, quantityRequested: 30 }]
      },
      db
    );

    // Dispatch 30 units
    const dispatched = await trService.dispatchTransfer(tr.id, 'dispatch-mgr', db);
    expect(dispatched.status).toBe('in_transit');
    const lineItem = dispatched.items[0];

    // Attack 1: Negative quantity received (-5 units)
    await expect(async () => {
      await trService.receiveTransfer(
        {
          transferId: tr.id,
          receivedBy: 'receiver',
          items: [{ lineId: lineItem.id, quantityReceived: -5 }]
        },
        undefined,
        undefined,
        db
      );
    }).toReject('Received quantity cannot be negative');

    // Attack 2: Over-receiving (attempt to receive 35 units when only 30 shipped)
    await expect(async () => {
      await trService.receiveTransfer(
        {
          transferId: tr.id,
          receivedBy: 'receiver',
          items: [{ lineId: lineItem.id, quantityReceived: 35 }]
        },
        undefined,
        undefined,
        db
      );
    }).toReject('Received quantity cannot exceed shipped quantity');

    // Legitimate receipt with discrepancy: 28 units received, 2 lost/damaged
    const completed = await trService.receiveTransfer(
      {
        transferId: tr.id,
        receivedBy: 'receiver',
        items: [{ lineId: lineItem.id, quantityReceived: 28, discrepancyReason: '2 units shattered in container' }]
      },
      undefined,
      undefined,
      db
    );

    expect(completed.status).toBe('completed');
    const portStock = await invService.getStockLevel(itemAlpha.id, whPort.id, binPort1.id, null, db);
    expect(portStock?.quantity_on_hand).toBe(28);
  });

  it('TC-CHAL-M3-17: Self-transfer invariant strictly enforced (source == dest rejected)', async () => {
    await expect(async () => {
      await trService.createTransfer(
        {
          sourceWarehouseId: whCentral.id,
          destWarehouseId: whCentral.id, // IDENTICAL!
          items: [{ itemId: itemAlpha.id, quantityRequested: 10 }]
        },
        db
      );
    }).toReject('Source and destination warehouses cannot be identical');
  });

  it('TC-CHAL-M3-18: Zero and negative transfer item quantities strictly rejected upon creation', async () => {
    // Quantity = 0
    await expect(async () => {
      await trService.createTransfer(
        {
          sourceWarehouseId: whCentral.id,
          destWarehouseId: whPort.id,
          items: [{ itemId: itemAlpha.id, quantityRequested: 0 }]
        },
        db
      );
    }).toReject('Quantity requested must be greater than zero');

    // Quantity = -10
    await expect(async () => {
      await trService.createTransfer(
        {
          sourceWarehouseId: whCentral.id,
          destWarehouseId: whPort.id,
          items: [{ itemId: itemAlpha.id, quantityRequested: -10 }]
        },
        db
      );
    }).toReject('Quantity requested must be greater than zero');
  });
});

if (process.argv[1]?.includes('m3-valuation-expiry-boundary.test.ts')) {
  runSuites().then(res => {
    if (res.failed > 0) process.exit(1);
    process.exit(0);
  });
}
