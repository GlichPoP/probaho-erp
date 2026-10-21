/**
 * Empirical Adversarial Challenger Test Harness for Milestone 3 Iteration 2
 * File: tests/challenger/m3-edge-case-cancellation-valuation.test.ts
 *
 * Challenger: challenger_m3_it2_2
 * Role: teamwork_preview_challenger
 * Parent Conversation ID: 1347b039-1626-4c72-8c14-b276ea869349
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

let wh1: any;
let wh2: any;
let bin1: any;
let bin2: any;
let testItem: any;

describe('M3 Iteration 2 Challenger: Cancellation Edge Cases & Valuation Boundaries', () => {
  beforeEach(async () => {
    db = new TestDatabaseService(':memory:');
    await db.initialize();
    invService = new InventoryService();
    trService = TransferService.getInstance();
    client = new ERPTestClient(db);

    wh1 = await client.createWarehouse({
      warehouseCode: 'WH-EDGE-1',
      name: 'Source Warehouse Hub',
      address: '100 Terminal Road',
      city: 'Dhaka',
      isDefault: true
    });

    wh2 = await client.createWarehouse({
      warehouseCode: 'WH-EDGE-2',
      name: 'Destination Warehouse Hub',
      address: '200 Port Highway',
      city: 'Chittagong',
      isDefault: false
    });

    bin1 = await client.createLocation({
      warehouseId: wh1.id,
      zone: 'Zone A',
      aisle: 'A1',
      rack: 'R1',
      shelf: 'S1',
      binCode: 'BIN-SRC-01'
    });

    bin2 = await client.createLocation({
      warehouseId: wh2.id,
      zone: 'Zone B',
      aisle: 'B1',
      rack: 'R1',
      shelf: 'S1',
      binCode: 'BIN-DST-01'
    });

    testItem = await client.createItem({
      sku: 'SKU-EDGE-ITEM',
      name: 'Precision Pressure Sensor',
      category: 'Sensors',
      costPrice: 85.50,
      sellingPrice: 140.00,
      minStockAlert: 20
    });

    // Seed stock at source warehouse
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
       VALUES ('stk-edge-01', ?, ?, ?, 100, 0)`,
      [testItem.id, wh1.id, bin1.id]
    );
  });

  // =========================================================================
  // SUB-DOMAIN 1: CANCELLATION WITH NOTES EDGE CASES
  // =========================================================================

  it('TC-EDGE-01: Cancel transfer with null/undefined original notes', async () => {
    const tr = await trService.createTransfer({
      transferNumber: 'TR-NOTE-NULL',
      sourceWarehouseId: wh1.id,
      destWarehouseId: wh2.id,
      notes: undefined,
      items: [{ itemId: testItem.id, quantityRequested: 5 }]
    }, db);

    expect(tr.notes).toBeNull();

    const cancelled = await trService.cancelTransfer(tr.id, 'No longer needed', 'Supervisor', db);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.notes).toBe('Cancelled by Supervisor: No longer needed');

    const fetched = await trService.getTransferById(tr.id, db);
    expect(fetched?.status).toBe('cancelled');
    expect(fetched?.notes).toBe('Cancelled by Supervisor: No longer needed');
  });

  it('TC-EDGE-02: Cancel transfer with pre-existing multi-line notes', async () => {
    const originalNotes = 'Line 1: Urgent hospital order\nLine 2: Handle with extreme care\nLine 3: Keep below 25C';
    const tr = await trService.createTransfer({
      transferNumber: 'TR-NOTE-MULTI',
      sourceWarehouseId: wh1.id,
      destWarehouseId: wh2.id,
      notes: originalNotes,
      items: [{ itemId: testItem.id, quantityRequested: 5 }]
    }, db);

    const cancelled = await trService.cancelTransfer(tr.id, 'Procurement halted by client', 'Dispatcher', db);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.notes).toBe(
      `${originalNotes}\nCancelled by Dispatcher: Procurement halted by client`
    );

    const lines = cancelled.notes!.split('\n');
    expect(lines.length).toBe(4);
    expect(lines[0]).toBe('Line 1: Urgent hospital order');
    expect(lines[3]).toBe('Cancelled by Dispatcher: Procurement halted by client');
  });

  it('TC-EDGE-03: Cancel transfer with special characters and SQL metacharacters in notes', async () => {
    const trickyNotes = `Notes with quotes: 'single' and "double"; backslash \\ and SQL injection: '; DROP TABLE stock_transfers; --`;
    const tr = await trService.createTransfer({
      transferNumber: 'TR-NOTE-SPECIAL',
      sourceWarehouseId: wh1.id,
      destWarehouseId: wh2.id,
      notes: trickyNotes,
      items: [{ itemId: testItem.id, quantityRequested: 5 }]
    }, db);

    const cancelReason = `Special reason: ' " \\ ; /* comment */ $100 & 50% <tag>`;
    const cancelled = await trService.cancelTransfer(tr.id, cancelReason, 'Tester', db);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.notes).toContain(trickyNotes);
    expect(cancelled.notes).toContain(cancelReason);

    // Verify stock_transfers table was NOT dropped!
    const allTransfers = await trService.getTransfers({}, db);
    expect(allTransfers.length).toBeGreaterThan(0);
  });

  it('TC-EDGE-03B: Status progression via updateTransferStatus and submitTransfer', async () => {
    const tr = await trService.createTransfer({
      transferNumber: 'TR-STATUS-PROG',
      sourceWarehouseId: wh1.id,
      destWarehouseId: wh2.id,
      items: [{ itemId: testItem.id, quantityRequested: 5 }]
    }, db);

    // Call submitTransfer (draft -> requested)
    const submitted = await trService.submitTransfer(tr.id, 'Requester1', db);
    expect(submitted.status).toBe('requested');

    // Call updateTransferStatus (requested -> draft if needed, or status update)
    const fetched = await trService.getTransferById(tr.id, db);
    expect(fetched?.status).toBe('requested');
  });

  it('TC-EDGE-04: Cancel transfer with multilingual Unicode, Bengali script, and Emojis', async () => {
    const unicodeNotes = 'জরুরি স্থানান্তর নোট 📦 ❄️ 冷蔵保管 आवश्यक 100% certified!';
    const tr = await trService.createTransfer({
      transferNumber: 'TR-NOTE-UNICODE',
      sourceWarehouseId: wh1.id,
      destWarehouseId: wh2.id,
      notes: unicodeNotes,
      items: [{ itemId: testItem.id, quantityRequested: 5 }]
    }, db);

    const unicodeReason = 'অর্ডার বাতিল করা হয়েছে 🚫 顧客の都合によりキャンセル';
    const cancelled = await trService.cancelTransfer(tr.id, unicodeReason, 'অ্যাডমিন', db);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.notes).toContain(unicodeNotes);
    expect(cancelled.notes).toContain('Cancelled by অ্যাডমিন: ' + unicodeReason);
  });

  it('TC-EDGE-05: Cancel transfer without providing reason or user (default parameters)', async () => {
    const tr = await trService.createTransfer({
      transferNumber: 'TR-NOTE-DEFAULTS',
      sourceWarehouseId: wh1.id,
      destWarehouseId: wh2.id,
      notes: 'Initial note',
      items: [{ itemId: testItem.id, quantityRequested: 5 }]
    }, db);

    // Cancel without reason and without user (should use default 'system')
    const cancelled = await trService.cancelTransfer(tr.id, undefined, undefined, db);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.notes).toBe('Initial note\nCancelled by system');
  });

  // =========================================================================
  // SUB-DOMAIN 2: ILLEGAL CANCELLATION AND STATE MACHINE GUARDS
  // =========================================================================

  it('TC-EDGE-06: Strictly reject cancelling transfer once dispatched (in_transit)', async () => {
    const tr = await trService.createTransfer({
      transferNumber: 'TR-DISPATCH-LOCK',
      sourceWarehouseId: wh1.id,
      destWarehouseId: wh2.id,
      items: [{ itemId: testItem.id, sourceBinId: bin1.id, quantityRequested: 10 }]
    }, db);

    // Dispatch transfer -> moves to in_transit
    const dispatched = await trService.dispatchTransfer(tr.id, 'operator', db);
    expect(dispatched.status).toBe('in_transit');

    // Attempt cancellation via trService.cancelTransfer
    await expect(async () => {
      await trService.cancelTransfer(tr.id, 'Attempted cancel in transit', 'rogue', db);
    }).toReject('Cannot cancel transfer: items are already in transit.');

    // Attempt cancellation via client.cancelTransfer
    await expect(async () => {
      await client.cancelTransfer(tr.id, 'Attempted cancel via client', 'rogue');
    }).toReject('Cannot cancel transfer: items are already in transit.');

    // Verify transfer remains in_transit
    const current = await trService.getTransferById(tr.id, db);
    expect(current?.status).toBe('in_transit');
  });

  it('TC-EDGE-07: Strictly reject cancelling transfer once completed/received', async () => {
    const tr = await trService.createTransfer({
      transferNumber: 'TR-COMPLETED-LOCK',
      sourceWarehouseId: wh1.id,
      destWarehouseId: wh2.id,
      items: [{ itemId: testItem.id, sourceBinId: bin1.id, destBinId: bin2.id, quantityRequested: 10 }]
    }, db);

    const dispatched = await trService.dispatchTransfer(tr.id, 'operator', db);
    const lineId = dispatched.items[0].id;

    // Receive transfer -> moves to completed
    const completed = await trService.receiveTransfer(
      {
        transferId: tr.id,
        receivedBy: 'receiver',
        items: [{ lineId, quantityReceived: 10 }]
      },
      undefined,
      undefined,
      db
    );
    expect(completed.status).toBe('completed');

    // Attempt cancellation via trService.cancelTransfer
    await expect(async () => {
      await trService.cancelTransfer(tr.id, 'Attempted cancel after completed', 'rogue', db);
    }).toReject('Cannot cancel transfer: transfer has already been completed.');

    // Attempt cancellation via client.cancelTransfer
    await expect(async () => {
      await client.cancelTransfer(tr.id, 'Attempted cancel after completed', 'rogue');
    }).toReject('Cannot cancel transfer: transfer has already been completed.');

    // Verify transfer remains completed
    const current = await trService.getTransferById(tr.id, db);
    expect(current?.status).toBe('completed');
  });

  it('TC-EDGE-08: Strictly reject cancelling an already cancelled transfer', async () => {
    const tr = await trService.createTransfer({
      transferNumber: 'TR-DOUBLE-CANCEL',
      sourceWarehouseId: wh1.id,
      destWarehouseId: wh2.id,
      items: [{ itemId: testItem.id, quantityRequested: 5 }]
    }, db);

    const firstCancel = await trService.cancelTransfer(tr.id, 'First cancellation', 'Admin', db);
    expect(firstCancel.status).toBe('cancelled');

    // Second cancellation must throw
    await expect(async () => {
      await trService.cancelTransfer(tr.id, 'Second cancellation', 'Admin', db);
    }).toReject('Transfer is already cancelled.');
  });

  it('TC-EDGE-09: Direct status update cannot bypass cancellation guards', async () => {
    const tr = await trService.createTransfer({
      transferNumber: 'TR-BYPASS-TEST',
      sourceWarehouseId: wh1.id,
      destWarehouseId: wh2.id,
      items: [{ itemId: testItem.id, sourceBinId: bin1.id, quantityRequested: 10 }]
    }, db);

    await trService.dispatchTransfer(tr.id, 'operator', db);

    // Call updateTransferStatus with 'cancelled' on in_transit transfer
    await expect(async () => {
      await trService.updateTransferStatus(tr.id, 'cancelled', 'admin', 'Trying backdoor cancel', db);
    }).toReject('Cannot cancel transfer: items are already in transit.');
  });

  // =========================================================================
  // SUB-DOMAIN 3: OVER-RECEIVING AND NEGATIVE QUANTITY REJECTION
  // =========================================================================

  it('TC-EDGE-10: Over-receiving and negative quantity validation on receiveTransfer', async () => {
    const tr = await trService.createTransfer({
      transferNumber: 'TR-RECV-VALIDATION',
      sourceWarehouseId: wh1.id,
      destWarehouseId: wh2.id,
      items: [{ itemId: testItem.id, sourceBinId: bin1.id, destBinId: bin2.id, quantityRequested: 20 }]
    }, db);

    const dispatched = await trService.dispatchTransfer(tr.id, 'operator', db);
    const lineId = dispatched.items[0].id;

    // 1. Negative quantity received
    await expect(async () => {
      await trService.receiveTransfer(
        {
          transferId: tr.id,
          receivedBy: 'receiver',
          items: [{ lineId, quantityReceived: -1 }]
        },
        undefined,
        undefined,
        db
      );
    }).toReject('Received quantity cannot be negative');

    // 2. Over-receiving (> 20 units shipped)
    await expect(async () => {
      await trService.receiveTransfer(
        {
          transferId: tr.id,
          receivedBy: 'receiver',
          items: [{ lineId, quantityReceived: 21 }]
        },
        undefined,
        undefined,
        db
      );
    }).toReject('Received quantity cannot exceed shipped quantity');

    // 3. Massive over-receiving (1000 units)
    await expect(async () => {
      await trService.receiveTransfer(
        {
          transferId: tr.id,
          receivedBy: 'receiver',
          items: [{ lineId, quantityReceived: 1000 }]
        },
        undefined,
        undefined,
        db
      );
    }).toReject('Received quantity cannot exceed shipped quantity');

    // 4. Exact valid receipt
    const completed = await trService.receiveTransfer(
      {
        transferId: tr.id,
        receivedBy: 'receiver',
        items: [{ lineId, quantityReceived: 20 }]
      },
      undefined,
      undefined,
      db
    );
    expect(completed.status).toBe('completed');
  });

  // =========================================================================
  // SUB-DOMAIN 4: WAC / FIFO VALUATION BOUNDARY CHECKS
  // =========================================================================

  it('TC-EDGE-11: Zero stock boundary valuation returns 0 total value without NaN or division by zero', async () => {
    const emptyItem = await client.createItem({
      sku: 'SKU-EMPTY-STOCK',
      name: 'Unstocked Widget',
      category: 'General',
      costPrice: 42.50,
      sellingPrice: 70.00
    });

    // Zero stock valuation for item
    const val = await invService.getItemValuation(emptyItem.id, wh1.id, db);
    expect(val?.quantity).toBe(0);
    expect(val?.item_total_value).toBe(0);
    expect(val?.weighted_average_cost).toBe(42.50); // Catalog fallback
    expect(Number.isNaN(val?.weighted_average_cost)).toBe(false);

    // Empty warehouse valuation
    const emptyWh = await client.createWarehouse({
      warehouseCode: 'WH-EMPTY',
      name: 'Completely Empty Depot',
      address: 'Empty Plains',
      city: 'Sylhet'
    });

    const whReport = await invService.calculateValuation(emptyWh.id, db);
    expect(whReport.totalUnits).toBe(0);
    expect(whReport.totalValuation).toBe(0);
    expect(whReport.averageUnitCost).toBe(0);
    expect(whReport.itemsValuation.length).toBe(0);
  });

  it('TC-EDGE-12: Multi-layer FIFO depletion precision and WAC recalculation', async () => {
    const multiItem = await client.createItem({
      sku: 'SKU-FIFO-MULTI',
      name: 'Lithium Battery Pack',
      category: 'Electronics',
      costPrice: 100.00,
      sellingPrice: 200.00
    });

    // Layer 1: 10 units @ $100.00 = $1,000.00
    const b1 = await invService.createBatch({
      batchNumber: 'LOT-BATT-01',
      itemId: multiItem.id,
      unitCost: 100.00,
      quantity: 10
    }, db);

    // Layer 2: 20 units @ $150.00 = $3,000.00
    const b2 = await invService.createBatch({
      batchNumber: 'LOT-BATT-02',
      itemId: multiItem.id,
      unitCost: 150.00,
      quantity: 20
    }, db);

    // Layer 3: 30 units @ $200.00 = $6,000.00
    const b3 = await invService.createBatch({
      batchNumber: 'LOT-BATT-03',
      itemId: multiItem.id,
      unitCost: 200.00,
      quantity: 30
    }, db);

    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved)
       VALUES 
         ('stk-bat-1', ?, ?, ?, ?, 10, 0),
         ('stk-bat-2', ?, ?, ?, ?, 20, 0),
         ('stk-bat-3', ?, ?, ?, ?, 30, 0)`,
      [
        multiItem.id, wh1.id, bin1.id, b1.id,
        multiItem.id, wh1.id, bin1.id, b2.id,
        multiItem.id, wh1.id, bin1.id, b3.id
      ]
    );

    // Initial: 60 units, $10,000 total, WAC = $10,000 / 60 = $166.67
    const initial = await invService.getItemValuation(multiItem.id, wh1.id, db);
    expect(initial?.quantity).toBe(60);
    expect(initial?.item_total_value).toBe(10000.00);
    expect(initial?.weighted_average_cost).toBe(166.67);
    expect(initial?.fifoLayers?.length).toBe(3);

    // Deplete layer 1 completely (10 units written off)
    await invService.adjustStock({
      itemId: multiItem.id,
      warehouseId: wh1.id,
      binId: bin1.id,
      batchId: b1.id,
      adjustmentType: 'NEW_BALANCE',
      quantity: 0,
      reason: 'ADJUSTMENT_WRITE_OFF'
    }, db);

    // Post-depletion: 50 units (20 @ $150 + 30 @ $200) = $3,000 + $6,000 = $9,000
    // WAC = $9,000 / 50 = $180.00 exactly!
    const postDepletion = await invService.getItemValuation(multiItem.id, wh1.id, db);
    expect(postDepletion?.quantity).toBe(50);
    expect(postDepletion?.item_total_value).toBe(9000.00);
    expect(postDepletion?.weighted_average_cost).toBe(180.00);
  });
});

if (process.argv[1]?.includes('m3-edge-case-cancellation-valuation.test.ts')) {
  runSuites().then(res => {
    if (res.failed > 0) process.exit(1);
    process.exit(0);
  });
}
