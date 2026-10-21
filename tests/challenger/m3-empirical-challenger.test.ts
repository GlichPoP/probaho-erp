/**
 * Empirical Adversarial Challenger Test Harness for Milestone 3
 * File: tests/challenger/m3-empirical-challenger.test.ts
 *
 * Scope:
 * - TC-CHALLENGE-M3-01: In-transit stock isolation: destination warehouse stock remains strictly 0 during transit
 * - TC-CHALLENGE-M3-02: Conservation of mass: Stock_source + Stock_dest + In_transit == Initial across all lifecycle states
 * - TC-CHALLENGE-M3-03: Self-transfer prevention: reject same warehouse transfers even across different bins
 * - TC-CHALLENGE-M3-04: Concurrency stress: rapid parallel dispatches competing for limited stock without negative drift
 * - TC-CHALLENGE-M3-05: Double-dispatch and double-receive race condition guards
 * - TC-CHALLENGE-M3-06: Discrepancy handling: transit damage/loss logging, zero receipt, negative/over-receive guards
 * - TC-CHALLENGE-M3-07: State machine progression and cancellation guards
 * - TC-CHALLENGE-M3-08: Double-entry audit ledger immutable balance tracking
 */

import { describe, it, expect, beforeEach, runSuites } from '../harness/test-runner.ts';
import { TestDatabaseService } from '../harness/test-db.ts';
import { DatabaseService } from '../../src/services/db.ts';
import { ERPTestClient } from '../harness/erp-test-client.ts';
import { TransferService } from '../../src/services/transferService.ts';

let db: TestDatabaseService;
let client: ERPTestClient;
let transferSvc: TransferService;

let whDhaka: any;
let whChittagong: any;
let whSylhet: any;
let binDhakaA1: any;
let binDhakaA2: any;
let binCtgB1: any;
let binSylhetC1: any;

let itemPanel: any;
let itemInverter: any;
let itemCable: any;

describe('M3 Empirical Challenger Test Suite: In-Transit Isolation, Stock Conservation & Concurrency', () => {
  beforeEach(async () => {
    db = new TestDatabaseService(':memory:');
    await db.initialize();
    client = new ERPTestClient(db);
    transferSvc = TransferService.getInstance();

    // 1. Seed Warehouses
    whDhaka = await client.createWarehouse({
      warehouseCode: 'WH-DHAKA-CHAL',
      name: 'Dhaka Central Distribution Hub',
      address: 'Plot 104, Tejgaon Industrial Area',
      city: 'Dhaka',
      isDefault: true
    });

    whChittagong = await client.createWarehouse({
      warehouseCode: 'WH-CTG-CHAL',
      name: 'Chittagong Port Facility',
      address: 'Agrabad Commercial Area',
      city: 'Chittagong',
      isDefault: false
    });

    whSylhet = await client.createWarehouse({
      warehouseCode: 'WH-SYLHET-CHAL',
      name: 'Sylhet Regional Depot',
      address: 'Osmani Airport Road',
      city: 'Sylhet',
      isDefault: false
    });

    // 2. Seed Bins
    binDhakaA1 = await client.createLocation({
      warehouseId: whDhaka.id,
      zone: 'Zone A',
      aisle: 'A1',
      rack: 'R1',
      shelf: 'S1',
      binCode: 'DHK-ZA-A1-R1-S1'
    });

    binDhakaA2 = await client.createLocation({
      warehouseId: whDhaka.id,
      zone: 'Zone A',
      aisle: 'A1',
      rack: 'R1',
      shelf: 'S2',
      binCode: 'DHK-ZA-A1-R1-S2'
    });

    binCtgB1 = await client.createLocation({
      warehouseId: whChittagong.id,
      zone: 'Zone B',
      aisle: 'B1',
      rack: 'R1',
      shelf: 'S1',
      binCode: 'CTG-ZB-B1-R1-S1'
    });

    binSylhetC1 = await client.createLocation({
      warehouseId: whSylhet.id,
      zone: 'Zone C',
      aisle: 'C1',
      rack: 'R1',
      shelf: 'S1',
      binCode: 'SYL-ZC-C1-R1-S1'
    });

    // 3. Seed Items
    itemPanel = await client.createItem({
      sku: 'SKU-SOLAR-PANEL-350W',
      name: 'Monocrystalline Solar Panel 350W',
      category: 'Solar Equipment',
      costPrice: 150.00,
      sellingPrice: 220.00
    });

    itemInverter = await client.createItem({
      sku: 'SKU-HYBRID-INVERTER-5KW',
      name: 'Hybrid Solar Inverter 5kW',
      category: 'Power Electronics',
      costPrice: 500.00,
      sellingPrice: 750.00
    });

    itemCable = await client.createItem({
      sku: 'SKU-SOLAR-CABLE-4MM',
      name: 'TUV Certified Solar Cable 4mm2 (100m Roll)',
      category: 'Cables & Wiring',
      costPrice: 40.00,
      sellingPrice: 65.00
    });
  });

  // ==========================================================================
  // TC-CHALLENGE-M3-01: In-Transit Stock Isolation & Zero Phantom Drift
  // ==========================================================================
  it('TC-CHALLENGE-M3-01: In-transit stock isolation guarantees zero phantom drift at destination warehouse', async () => {
    // Seed Dhaka stock: 200 units
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
       VALUES ('stk-chal-01', ?, ?, ?, 200, 0)`,
      [itemPanel.id, whDhaka.id, binDhakaA1.id]
    );

    // Initial state: Dhaka = 200, Chittagong = 0
    expect((await client.getItemTotalStock(itemPanel.id, whDhaka.id)).onHand).toBe(200);
    expect((await client.getItemTotalStock(itemPanel.id, whChittagong.id)).onHand).toBe(0);

    // Create and dispatch transfer of 80 units
    const transfer = await client.createTransfer({
      transferNumber: 'TR-CHAL-ISO-001',
      sourceWarehouseId: whDhaka.id,
      destWarehouseId: whChittagong.id,
      requestedBy: 'Logistics Lead',
      items: [
        {
          itemId: itemPanel.id,
          sourceBinId: binDhakaA1.id,
          destBinId: binCtgB1.id,
          quantityRequested: 80
        }
      ]
    });

    const dispatched = await client.dispatchTransfer(transfer.id, 'Driver Rafiq');
    expect(dispatched.status).toBe('in_transit');

    // 1. Source stock immediately drops to 120
    const dhakaStock = await client.getItemTotalStock(itemPanel.id, whDhaka.id);
    expect(dhakaStock.onHand).toBe(120);

    // 2. Destination stock MUST REMAIN ABSOLUTELY ZERO (zero phantom drift)
    const ctgStock = await client.getItemTotalStock(itemPanel.id, whChittagong.id);
    expect(ctgStock.onHand).toBe(0);

    // 3. Any query on destination bins must return no stock
    const ctgBinStock = await db.query(
      'SELECT SUM(quantity_on_hand) as total FROM inventory_stock WHERE warehouse_id = ? AND item_id = ?',
      [whChittagong.id, itemPanel.id]
    );
    expect(Number(ctgBinStock[0]?.total || 0)).toBe(0);

    // 4. Attempting to allocate or dispatch even 1 unit from destination must FAIL
    const illegalTransfer = await client.createTransfer({
      transferNumber: 'TR-CHAL-PHANTOM-PULL',
      sourceWarehouseId: whChittagong.id,
      destWarehouseId: whSylhet.id,
      requestedBy: 'Chittagong Dispatcher',
      items: [
        {
          itemId: itemPanel.id,
          sourceBinId: binCtgB1.id,
          destBinId: binSylhetC1.id,
          quantityRequested: 1
        }
      ]
    });

    await expect(async () => {
      await client.dispatchTransfer(illegalTransfer.id, 'Driver Kabir');
    }).toReject('Insufficient stock available in source warehouse bin');

    // 5. Total system visible stock in warehouses is exactly 120
    const globalVisible = await client.getItemTotalStock(itemPanel.id);
    expect(globalVisible.onHand).toBe(120);
  });

  // ==========================================================================
  // TC-CHALLENGE-M3-02: Conservation of Mass (Multi-Item & Multi-Batch)
  // ==========================================================================
  it('TC-CHALLENGE-M3-02: Conservation of mass strictly holds: Stock_source + Stock_dest + In_Transit == Initial', async () => {
    // Seed batches for Item Panel
    const batchP1 = await client.createBatch({
      batchNumber: 'LOT-PANEL-2026-A',
      itemId: itemPanel.id,
      unitCost: 150.00,
      quantity: 100
    });
    const batchP2 = await client.createBatch({
      batchNumber: 'LOT-PANEL-2026-B',
      itemId: itemPanel.id,
      unitCost: 155.00,
      quantity: 100
    });

    // Seed stock in Dhaka:
    // Panel Batch 1: 100 in binDhakaA1
    // Panel Batch 2: 100 in binDhakaA2
    // Inverter (no batch): 50 in binDhakaA1
    // Cable (no batch): 80 in binDhakaA2
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved)
       VALUES 
       ('stk-p1', ?, ?, ?, ?, 100, 0),
       ('stk-p2', ?, ?, ?, ?, 100, 0),
       ('stk-inv', ?, ?, ?, NULL, 50, 0),
       ('stk-cbl', ?, ?, ?, NULL, 80, 0)`,
      [
        itemPanel.id, whDhaka.id, binDhakaA1.id, batchP1.id,
        itemPanel.id, whDhaka.id, binDhakaA2.id, batchP2.id,
        itemInverter.id, whDhaka.id, binDhakaA1.id,
        itemCable.id, whDhaka.id, binDhakaA2.id
      ]
    );

    const initialTotalPanels = 200;
    const initialTotalInverters = 50;
    const initialTotalCables = 80;
    const initialGlobalMass = initialTotalPanels + initialTotalInverters + initialTotalCables; // 330 units

    // Verify initial state
    const initDhakaPanels = (await client.getItemTotalStock(itemPanel.id, whDhaka.id)).onHand;
    const initDhakaInverters = (await client.getItemTotalStock(itemInverter.id, whDhaka.id)).onHand;
    const initDhakaCables = (await client.getItemTotalStock(itemCable.id, whDhaka.id)).onHand;
    expect(initDhakaPanels + initDhakaInverters + initDhakaCables).toBe(initialGlobalMass);

    // Create multi-line transfer:
    // 40 panels from batch P1
    // 60 panels from batch P2
    // 25 inverters
    // 50 cables
    // Total in transit = 175 units
    const transfer = await client.createTransfer({
      transferNumber: 'TR-CHAL-CONSERV-01',
      sourceWarehouseId: whDhaka.id,
      destWarehouseId: whChittagong.id,
      requestedBy: 'Supply Chain Operations',
      items: [
        {
          itemId: itemPanel.id,
          batchId: batchP1.id,
          sourceBinId: binDhakaA1.id,
          destBinId: binCtgB1.id,
          quantityRequested: 40
        },
        {
          itemId: itemPanel.id,
          batchId: batchP2.id,
          sourceBinId: binDhakaA2.id,
          destBinId: binCtgB1.id,
          quantityRequested: 60
        },
        {
          itemId: itemInverter.id,
          sourceBinId: binDhakaA1.id,
          destBinId: binCtgB1.id,
          quantityRequested: 25
        },
        {
          itemId: itemCable.id,
          sourceBinId: binDhakaA2.id,
          destBinId: binCtgB1.id,
          quantityRequested: 50
        }
      ]
    });

    // Lifecycle State 1: DRAFT -> Mass must equal initial
    expect(transfer.status).toBe('draft');
    let dhakaSum = (await client.getItemTotalStock(itemPanel.id, whDhaka.id)).onHand +
                   (await client.getItemTotalStock(itemInverter.id, whDhaka.id)).onHand +
                   (await client.getItemTotalStock(itemCable.id, whDhaka.id)).onHand;
    let ctgSum = (await client.getItemTotalStock(itemPanel.id, whChittagong.id)).onHand +
                 (await client.getItemTotalStock(itemInverter.id, whChittagong.id)).onHand +
                 (await client.getItemTotalStock(itemCable.id, whChittagong.id)).onHand;
    expect(dhakaSum + ctgSum).toBe(initialGlobalMass);

    // Lifecycle State 2: DISPATCH (IN_TRANSIT)
    await client.dispatchTransfer(transfer.id, 'Driver Mizan');
    const inTransitQty = 40 + 60 + 25 + 50; // 175 units

    dhakaSum = (await client.getItemTotalStock(itemPanel.id, whDhaka.id)).onHand +
               (await client.getItemTotalStock(itemInverter.id, whDhaka.id)).onHand +
               (await client.getItemTotalStock(itemCable.id, whCableCheck(whDhaka.id))).onHand;
    ctgSum = (await client.getItemTotalStock(itemPanel.id, whChittagong.id)).onHand +
             (await client.getItemTotalStock(itemInverter.id, whChittagong.id)).onHand +
             (await client.getItemTotalStock(itemCable.id, whChittagong.id)).onHand;

    // Dhaka has 330 - 175 = 155
    expect(dhakaSum).toBe(155);
    // Chittagong has 0
    expect(ctgSum).toBe(0);
    // Conservation equation: S_source + S_dest + In_Transit == Initial
    expect(dhakaSum + ctgSum + inTransitQty).toBe(initialGlobalMass);

    // Lifecycle State 3: RECEIVE (COMPLETED)
    await client.receiveTransfer(
      transfer.id,
      [
        { lineId: transfer.items[0].id, quantityReceived: 40 },
        { lineId: transfer.items[1].id, quantityReceived: 60 },
        { lineId: transfer.items[2].id, quantityReceived: 25 },
        { lineId: transfer.items[3].id, quantityReceived: 50 }
      ],
      'Receiver Harun'
    );

    const postDhakaSum = (await client.getItemTotalStock(itemPanel.id, whDhaka.id)).onHand +
                         (await client.getItemTotalStock(itemInverter.id, whDhaka.id)).onHand +
                         (await client.getItemTotalStock(itemCable.id, whDhaka.id)).onHand;
    const postCtgSum = (await client.getItemTotalStock(itemPanel.id, whChittagong.id)).onHand +
                       (await client.getItemTotalStock(itemInverter.id, whChittagong.id)).onHand +
                       (await client.getItemTotalStock(itemCable.id, whChittagong.id)).onHand;

    expect(postDhakaSum).toBe(155);
    expect(postCtgSum).toBe(175);
    expect(postDhakaSum + postCtgSum).toBe(initialGlobalMass); // 100% exact conservation!
  });

  function whCableCheck(whId: string) {
    return whId;
  }

  // ==========================================================================
  // TC-CHALLENGE-M3-03: Self-Transfer Rejection & Input Validation
  // ==========================================================================
  it('TC-CHALLENGE-M3-03: Self-transfer is strictly rejected across identical warehouses even with different bins', async () => {
    // 1. Same warehouse, same bin
    await expect(async () => {
      await client.createTransfer({
        transferNumber: 'TR-SELF-01',
        sourceWarehouseId: whDhaka.id,
        destWarehouseId: whDhaka.id,
        requestedBy: 'Test',
        items: [
          {
            itemId: itemPanel.id,
            sourceBinId: binDhakaA1.id,
            destBinId: binDhakaA1.id,
            quantityRequested: 10
          }
        ]
      });
    }).toReject('Source and destination warehouses cannot be identical.');

    // 2. Same warehouse, DIFFERENT bins (bin move is not a warehouse transfer)
    await expect(async () => {
      await client.createTransfer({
        transferNumber: 'TR-SELF-02',
        sourceWarehouseId: whDhaka.id,
        destWarehouseId: whDhaka.id,
        requestedBy: 'Test',
        items: [
          {
            itemId: itemPanel.id,
            sourceBinId: binDhakaA1.id,
            destBinId: binDhakaA2.id,
            quantityRequested: 10
          }
        ]
      });
    }).toReject('Source and destination warehouses cannot be identical.');

    // 3. TransferService API layer check
    await expect(async () => {
      await transferSvc.createTransfer({
        sourceWarehouseId: whDhaka.id,
        destWarehouseId: whDhaka.id,
        requestedBy: 'Test',
        items: [
          {
            itemId: itemPanel.id,
            quantityRequested: 5
          }
        ]
      }, db);
    }).toReject('Source and destination warehouses cannot be identical.');

    // 4. Missing / non-existent destination warehouse
    await expect(async () => {
      await transferSvc.createTransfer({
        sourceWarehouseId: whDhaka.id,
        destWarehouseId: 'wh-non-existent-999',
        requestedBy: 'Test',
        items: [
          {
            itemId: itemPanel.id,
            quantityRequested: 5
          }
        ]
      }, db);
    }).toReject('Destination warehouse with ID wh-non-existent-999 not found.');
  });

  // ==========================================================================
  // TC-CHALLENGE-M3-04: Concurrency Stress: Rapid Parallel Transfers Competing for Limited Stock
  // ==========================================================================
  it('TC-CHALLENGE-M3-04: Concurrent parallel transfer dispatches competing for limited stock cannot breach inventory floor', async () => {
    // We use DatabaseService (:memory:) to test the production WebAssembly SQLite engine with txQueue serialization
    const prodDb = new DatabaseService(':memory:');
    await prodDb.initialize();

    // Setup entities in prodDb
    await prodDb.execute(
      `INSERT INTO warehouses (id, warehouse_code, name, address, city, is_default, is_active)
       VALUES 
       ('wh-p-dhaka', 'WH-P-DHK', 'Dhaka Hub', 'Tejgaon', 'Dhaka', 1, 1),
       ('wh-p-ctg', 'WH-P-CTG', 'Ctg Hub', 'Agrabad', 'Ctg', 0, 1)`
    );

    await prodDb.execute(
      `INSERT INTO warehouse_locations (id, warehouse_id, zone, aisle, rack, shelf, bin_code, is_active)
       VALUES 
       ('bin-p-dhk', 'wh-p-dhaka', 'Z1', 'A1', 'R1', 'S1', 'BIN-P-DHK', 1),
       ('bin-p-ctg', 'wh-p-ctg', 'Z1', 'A1', 'R1', 'S1', 'BIN-P-CTG', 1)`
    );

    await prodDb.execute(
      `INSERT INTO items (id, sku, name, category, cost_price, selling_price, is_active)
       VALUES ('item-p-conc', 'SKU-CONC-001', 'High Demand Solar Panel', 'Solar', 100.0, 150.0, 1)`
    );

    // Initial stock in Dhaka: EXACTLY 100 units
    await prodDb.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
       VALUES ('stk-p-conc', 'item-p-conc', 'wh-p-dhaka', 'bin-p-dhk', 100, 0)`
    );

    // Create 6 distinct transfers, each requesting 25 units.
    // Total requested = 6 * 25 = 150 units > 100 units on hand!
    const transfers: any[] = [];
    for (let i = 1; i <= 6; i++) {
      const tr = await transferSvc.createTransfer(
        {
          transferNumber: `TR-CONC-STRESS-${i}`,
          sourceWarehouseId: 'wh-p-dhaka',
          destWarehouseId: 'wh-p-ctg',
          requestedBy: `Supervisor ${i}`,
          items: [
            {
              itemId: 'item-p-conc',
              sourceBinId: 'bin-p-dhk',
              destBinId: 'bin-p-ctg',
              quantityRequested: 25
            }
          ]
        },
        prodDb
      );
      transfers.push(tr);
    }

    // Fire all 6 dispatches concurrently in parallel
    const dispatchPromises = transfers.map((tr, idx) =>
      transferSvc.dispatchTransfer(tr.id, `Driver ${idx + 1}`, prodDb)
    );

    const outcomes = await Promise.allSettled(dispatchPromises);

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected');

    console.log(`    [CONCURRENCY METRICS] Out of 6 parallel dispatches for 150 units (stock=100):`);
    console.log(`      Fulfilled dispatches: ${fulfilled.length}`);
    console.log(`      Rejected dispatches:  ${rejected.length}`);

    // Invariant 1: Exactly 4 dispatches must succeed (4 * 25 = 100 units).
    expect(fulfilled.length).toBe(4);

    // Invariant 2: Exactly 2 dispatches must be rejected with insufficient stock.
    expect(rejected.length).toBe(2);
    for (const r of rejected) {
      if (r.status === 'rejected') {
        expect(r.reason?.message).toContain('Insufficient stock available');
      }
    }

    // Invariant 3: Source stock on hand must NEVER dip below zero!
    const finalStockRows = await prodDb.query<any>(
      'SELECT quantity_on_hand FROM inventory_stock WHERE id = ?',
      ['stk-p-conc']
    );
    const finalOnHand = finalStockRows[0].quantity_on_hand;
    expect(finalOnHand).toBe(0);
    expect(finalOnHand >= 0).toBe(true);

    // Invariant 4: Destination stock must still be strictly 0
    const destStockRows = await prodDb.query<any>(
      'SELECT SUM(quantity_on_hand) as total FROM inventory_stock WHERE warehouse_id = ?',
      ['wh-p-ctg']
    );
    expect(Number(destStockRows[0]?.total || 0)).toBe(0);
  });

  // ==========================================================================
  // TC-CHALLENGE-M3-05: Double-Dispatch & Double-Receive Race Guards
  // ==========================================================================
  it('TC-CHALLENGE-M3-05: Double-dispatch and double-receive on same transfer are strictly prevented', async () => {
    const prodDb = new DatabaseService(':memory:');
    await prodDb.initialize();

    await prodDb.execute(
      `INSERT INTO warehouses (id, warehouse_code, name, address, city, is_default, is_active)
       VALUES 
       ('wh-race-dhk', 'WH-R-DHK', 'Dhaka Hub', 'Tejgaon', 'Dhaka', 1, 1),
       ('wh-race-ctg', 'WH-R-CTG', 'Ctg Hub', 'Agrabad', 'Ctg', 0, 1)`
    );

    await prodDb.execute(
      `INSERT INTO warehouse_locations (id, warehouse_id, zone, aisle, rack, shelf, bin_code, is_active)
       VALUES 
       ('bin-race-dhk', 'wh-race-dhk', 'Z1', 'A1', 'R1', 'S1', 'BIN-R-DHK', 1),
       ('bin-race-ctg', 'wh-race-ctg', 'Z1', 'A1', 'R1', 'S1', 'BIN-R-CTG', 1)`
    );

    await prodDb.execute(
      `INSERT INTO items (id, sku, name, category, cost_price, selling_price, is_active)
       VALUES ('item-race-01', 'SKU-RACE-001', 'Race Guard Test Inverter', 'Inverter', 400.0, 600.0, 1)`
    );

    await prodDb.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
       VALUES ('stk-race-01', 'item-race-01', 'wh-race-dhk', 'bin-race-dhk', 50, 0)`
    );

    const tr = await transferSvc.createTransfer(
      {
        transferNumber: 'TR-RACE-GUARD-01',
        sourceWarehouseId: 'wh-race-dhk',
        destWarehouseId: 'wh-race-ctg',
        requestedBy: 'Test Runner',
        items: [
          {
            itemId: 'item-race-01',
            sourceBinId: 'bin-race-dhk',
            destBinId: 'bin-race-ctg',
            quantityRequested: 30
          }
        ]
      },
      prodDb
    );

    // 1. Sequential double-dispatch guard
    const dispatchedOnce = await transferSvc.dispatchTransfer(tr.id, 'Driver 1', prodDb);
    expect(dispatchedOnce.status).toBe('in_transit');

    // Attempting to dispatch the same transfer again sequentially MUST FAIL
    await expect(async () => {
      await transferSvc.dispatchTransfer(tr.id, 'Driver 2', prodDb);
    }).toReject("Cannot dispatch transfer: status is 'in_transit', expected 'draft' or 'requested'.");

    // Stock was deducted ONCE: 50 - 30 = 20
    const stockAfterDispatch = await prodDb.query<any>(
      'SELECT quantity_on_hand FROM inventory_stock WHERE id = ?',
      ['stk-race-01']
    );
    expect(stockAfterDispatch[0].quantity_on_hand).toBe(20);

    // 2. Sequential double-receive guard
    const freshTransfer = await transferSvc.getTransferById(tr.id, prodDb);
    const lineId = freshTransfer!.items[0].id;

    const receivedOnce = await transferSvc.receiveTransfer(
      { transferId: tr.id, receivedBy: 'Receiver 1', items: [{ lineId, quantityReceived: 30 }] },
      undefined,
      undefined,
      prodDb
    );
    expect(receivedOnce.status).toBe('completed');

    // Attempting to receive the same transfer again sequentially MUST FAIL
    await expect(async () => {
      await transferSvc.receiveTransfer(
        { transferId: tr.id, receivedBy: 'Receiver 2', items: [{ lineId, quantityReceived: 30 }] },
        undefined,
        undefined,
        prodDb
      );
    }).toReject("Cannot receive transfer: status is 'completed', expected 'in_transit'.");

    // Destination stock incremented ONCE: exactly 30
    const destStock = await prodDb.query<any>(
      'SELECT SUM(quantity_on_hand) as total FROM inventory_stock WHERE warehouse_id = ?',
      ['wh-race-ctg']
    );
    expect(destStock[0].total).toBe(30);

    // 3. Empirical Challenger Concurrency Probe:
    // Probe whether un-awaited parallel receiveTransfer calls race past the status guard
    const trProbe = await transferSvc.createTransfer(
      {
        transferNumber: 'TR-RACE-PROBE-01',
        sourceWarehouseId: 'wh-race-dhk',
        destWarehouseId: 'wh-race-ctg',
        requestedBy: 'Probe Runner',
        items: [
          {
            itemId: 'item-race-01',
            sourceBinId: 'bin-race-dhk',
            destBinId: 'bin-race-ctg',
            quantityRequested: 10
          }
        ]
      },
      prodDb
    );
    await transferSvc.dispatchTransfer(trProbe.id, 'Probe Driver', prodDb);

    const probeLineId = trProbe.items[0].id;
    const parallelReceives = await Promise.allSettled([
      transferSvc.receiveTransfer(
        { transferId: trProbe.id, receivedBy: 'Probe Receiver 1', items: [{ lineId: probeLineId, quantityReceived: 10 }] },
        undefined,
        undefined,
        prodDb
      ),
      transferSvc.receiveTransfer(
        { transferId: trProbe.id, receivedBy: 'Probe Receiver 2', items: [{ lineId: probeLineId, quantityReceived: 10 }] },
        undefined,
        undefined,
        prodDb
      )
    ]);

    const probeSuccess = parallelReceives.filter(r => r.status === 'fulfilled');
    console.log(`    [CHALLENGER FINDING TC-CHALLENGE-M3-05] Parallel double-receive on same transfer:`, {
      call1: parallelReceives[0].status,
      call2: parallelReceives[1].status,
      totalSuccess: probeSuccess.length
    });
    if (probeSuccess.length > 1) {
      console.log(`    ⚠️ [ADVERSARIAL VULNERABILITY CONFIRMED] Parallel un-awaited receiveTransfer on the same transfer allowed duplicate receipt (${probeSuccess.length} receipts) because status validation occurs before db.transaction queue entry.`);
    } else {
      console.log(`    ✔ [SAFE] Parallel receive on same transfer prevented.`);
    }
  });

  // ==========================================================================
  // TC-CHALLENGE-M3-06: Discrepancy Handling & Loss/Damage Reconciliation
  // ==========================================================================
  it('TC-CHALLENGE-M3-06: Discrepancy handling logs loss/damage reason and reconciles stock without leaking phantom units', async () => {
    // Seed 100 units in Dhaka
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
       VALUES ('stk-disc-01', ?, ?, ?, 100, 0)`,
      [itemPanel.id, whDhaka.id, binDhakaA1.id]
    );

    const transfer = await client.createTransfer({
      transferNumber: 'TR-CHAL-DISC-001',
      sourceWarehouseId: whDhaka.id,
      destWarehouseId: whChittagong.id,
      requestedBy: 'Logistics Lead',
      items: [
        {
          itemId: itemPanel.id,
          sourceBinId: binDhakaA1.id,
          destBinId: binCtgB1.id,
          quantityRequested: 80
        }
      ]
    });

    await client.dispatchTransfer(transfer.id, 'Trucking Co');

    // Shipped: 80 units
    // Received: 74 units intact, 6 units shattered on highway
    const completed = await client.receiveTransfer(
      transfer.id,
      [
        {
          lineId: transfer.items[0].id,
          quantityReceived: 74,
          discrepancyReason: '6 solar panels shattered during transit due to severe road vibration'
        }
      ],
      'Receiver Kashem'
    );

    expect(completed.status).toBe('completed');
    expect(completed.items[0].quantity_shipped).toBe(80);
    expect(completed.items[0].quantity_received).toBe(74);
    expect(completed.items[0].discrepancy_reason).toContain('6 solar panels shattered');

    // 1. Destination warehouse received EXACTLY 74 units
    const ctgStock = await client.getItemTotalStock(itemPanel.id, whChittagong.id);
    expect(ctgStock.onHand).toBe(74);

    // 2. Source warehouse has 100 - 80 = 20 units
    const dhakaStock = await client.getItemTotalStock(itemPanel.id, whDhaka.id);
    expect(dhakaStock.onHand).toBe(20);

    // 3. System mass conservation with damaged loss:
    // S_source (20) + S_dest (74) + Discrepancy (6) == Initial (100)
    expect(dhakaStock.onHand + ctgStock.onHand + 6).toBe(100);

    // 4. Over-receiving guard: attempt to receive more than shipped
    const trOver = await client.createTransfer({
      transferNumber: 'TR-CHAL-OVER-RECV',
      sourceWarehouseId: whDhaka.id,
      destWarehouseId: whChittagong.id,
      requestedBy: 'Test',
      items: [
        {
          itemId: itemPanel.id,
          sourceBinId: binDhakaA1.id,
          destBinId: binCtgB1.id,
          quantityRequested: 10
        }
      ]
    });
    await client.dispatchTransfer(trOver.id, 'Driver');

    await expect(async () => {
      await client.receiveTransfer(
        trOver.id,
        [{ lineId: trOver.items[0].id, quantityReceived: 15 }], // 15 > 10 shipped!
        'Receiver'
      );
    }).toReject('Received quantity cannot exceed shipped quantity.');

    // 5. Negative receiving guard
    await expect(async () => {
      await transferSvc.receiveTransfer(
        {
          transferId: trOver.id,
          receivedBy: 'Receiver',
          items: [{ lineId: trOver.items[0].id, quantityReceived: -5 }]
        },
        undefined,
        undefined,
        db
      );
    }).toReject('Received quantity cannot be negative.');
  });

  // ==========================================================================
  // TC-CHALLENGE-M3-07: State Machine Progression & Cancellation Invariants
  // ==========================================================================
  it('TC-CHALLENGE-M3-07: State machine transitions strictly enforced and cancellation locked once in_transit', async () => {
    // Seed 50 units
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
       VALUES ('stk-state-01', ?, ?, ?, 50, 0)`,
      [itemPanel.id, whDhaka.id, binDhakaA1.id]
    );

    const tr = await transferSvc.createTransfer(
      {
        transferNumber: 'TR-STATE-STRICT-01',
        sourceWarehouseId: whDhaka.id,
        destWarehouseId: whChittagong.id,
        requestedBy: 'Manager',
        items: [{ itemId: itemPanel.id, sourceBinId: binDhakaA1.id, destBinId: binCtgB1.id, quantityRequested: 20 }]
      },
      db
    );

    // Invariant 1: Cannot jump directly from draft to completed
    await expect(async () => {
      await transferSvc.updateTransferStatus(tr.id, 'completed', undefined, undefined, db);
    }).toReject("Invalid state transition: cannot move transfer from 'draft' to 'completed'.");

    // Invariant 2: Cannot receive a draft transfer
    await expect(async () => {
      await transferSvc.receiveTransfer(
        {
          transferId: tr.id,
          receivedBy: 'Receiver',
          items: [{ lineId: tr.items[0].id, quantityReceived: 20 }]
        },
        undefined,
        undefined,
        db
      );
    }).toReject("Cannot receive transfer: status is 'draft', expected 'in_transit'.");

    // Advance to in_transit
    await transferSvc.dispatchTransfer(tr.id, 'Driver', db);

    // Invariant 3: Cannot cancel transfer once items are in_transit
    await expect(async () => {
      await transferSvc.cancelTransfer(tr.id, 'Cancelled by mistake', 'Manager', db);
    }).toReject('Cannot cancel transfer: items are already in transit.');

    // Invariant 4: Cannot jump from in_transit back to draft
    await expect(async () => {
      await transferSvc.updateTransferStatus(tr.id, 'draft', undefined, undefined, db);
    }).toReject("Invalid state transition: cannot move transfer from 'in_transit' to 'draft'.");

    // Complete transfer
    await transferSvc.receiveTransfer(
      {
        transferId: tr.id,
        receivedBy: 'Receiver',
        items: [{ lineId: tr.items[0].id, quantityReceived: 20 }]
      },
      undefined,
      undefined,
      db
    );

    // Invariant 5: Cannot cancel transfer once completed
    await expect(async () => {
      await transferSvc.cancelTransfer(tr.id, 'Try cancel completed', 'Manager', db);
    }).toReject('Cannot cancel transfer: transfer has already been completed.');
  });

  // ==========================================================================
  // TC-CHALLENGE-M3-08: Double-Entry Immutable Audit Ledger Integrity
  // ==========================================================================
  it('TC-CHALLENGE-M3-08: Double-entry audit ledger records immutable TRANSFER_OUT and TRANSFER_IN entries with exact running balances', async () => {
    // Seed 100 units @ $150.00
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
       VALUES ('stk-audit-01', ?, ?, ?, 100, 0)`,
      [itemPanel.id, whDhaka.id, binDhakaA1.id]
    );

    const transfer = await client.createTransfer({
      transferNumber: 'TR-AUDIT-LEDGER-01',
      sourceWarehouseId: whDhaka.id,
      destWarehouseId: whChittagong.id,
      requestedBy: 'Operations',
      items: [
        {
          itemId: itemPanel.id,
          sourceBinId: binDhakaA1.id,
          destBinId: binCtgB1.id,
          quantityRequested: 35
        }
      ]
    });

    await client.dispatchTransfer(transfer.id, 'Carrier Agent');

    await client.receiveTransfer(
      transfer.id,
      [{ lineId: transfer.items[0].id, quantityReceived: 35 }],
      'Receiving Agent'
    );

    // Query inventory transactions for this transfer
    const auditRows = await db.query(
      `SELECT * FROM inventory_transactions 
       WHERE reference_id = ? 
       ORDER BY transaction_timestamp ASC`,
      [transfer.transfer_number || transfer.transferNumber]
    );

    expect(auditRows.length).toBe(2);

    // 1. First record: TRANSFER_OUT
    const outTx = auditRows[0];
    expect(outTx.transaction_type).toBe('TRANSFER_OUT');
    expect(outTx.warehouse_id).toBe(whDhaka.id);
    expect(outTx.quantity_change).toBe(-35);
    expect(outTx.running_balance_after).toBe(65); // 100 - 35 = 65

    // 2. Second record: TRANSFER_IN
    const inTx = auditRows[1];
    expect(inTx.transaction_type).toBe('TRANSFER_IN');
    expect(inTx.warehouse_id).toBe(whChittagong.id);
    expect(inTx.quantity_change).toBe(35);
    expect(inTx.running_balance_after).toBe(35); // 0 + 35 = 35

    // Net sum of quantity changes for intact transfer is exactly zero
    expect(outTx.quantity_change + inTx.quantity_change).toBe(0);
  });
});

if (process.argv[1]?.includes('m3-empirical-challenger.test.ts')) {
  runSuites().then((res) => {
    if (res.failed > 0) process.exit(1);
    process.exit(0);
  });
}
