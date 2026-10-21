/**
 * Empirical Adversarial Challenger Test Harness for Milestone 2
 * File: tests/challenger/m2-empirical-challenger.test.ts
 *
 * Scope:
 * - TC-CHALLENGE-01: Multi-stage partial goods receipt and inventory transaction reconciliation
 * - TC-CHALLENGE-02: Quality inspection: quarantine validation (rejected items do NOT increment stock)
 * - TC-CHALLENGE-03: Stress-test damaged goods replacement & PO completion status
 * - TC-CHALLENGE-04: Concurrent status transition race conditions
 * - TC-CHALLENGE-05: Concurrent goods receipts race condition & over-delivery guard integrity
 * - TC-CHALLENGE-06: Direct transition from ordered to received without GRN audit
 * - TC-CHALLENGE-07: GRN multi-bin location accuracy & zero/negative quantity bounds
 */

import { describe, it, expect, beforeEach, runSuites } from '../harness/test-runner.ts';
import { TestDatabaseService } from '../harness/test-db.ts';
import { DatabaseService } from '../../src/services/db.ts';
import { ProcurementService } from '../../src/services/procurementService.ts';

let db: TestDatabaseService;
let service: ProcurementService;

let supplier: any;
let warehouse: any;
let bin1: any;
let bin2: any;
let itemAlpha: any;
let itemBeta: any;

describe('M2 Empirical Challenger Test Suite: PO State Machine & Stock Mutations', () => {
  beforeEach(async () => {
    db = new TestDatabaseService(':memory:');
    await db.initialize();
    service = new ProcurementService();

    // Seed Supplier
    await db.execute(
      `INSERT INTO suppliers (
        id, supplier_code, name, contact_person, phone, address, city, country,
        payment_terms_days, lead_time_days, rating, performance_score, total_pos_issued, total_pos_fulfilled, is_active
      ) VALUES ('sup-chal-01', 'SUP-CHAL-001', 'Adversarial Test Supplier Ltd', 'Farhan Chowdhury', '+8801811000001', 'Tejgaon I/A', 'Dhaka', 'Bangladesh', 30, 5, 4.8, 100.0, 0, 0, 1)`
    );
    const supRows = await db.query('SELECT * FROM suppliers WHERE id = ?', ['sup-chal-01']);
    supplier = supRows[0];

    // Seed Warehouse & Bins
    await db.execute(
      `INSERT INTO warehouses (
        id, warehouse_code, name, address, city, is_default, is_active
      ) VALUES ('wh-chal-01', 'WH-CHAL-MAIN', 'Adversarial Test Warehouse', 'Tongie Industrial Area', 'Gazipur', 1, 1)`
    );
    const whRows = await db.query('SELECT * FROM warehouses WHERE id = ?', ['wh-chal-01']);
    warehouse = whRows[0];

    await db.execute(
      `INSERT INTO warehouse_locations (
        id, warehouse_id, zone, aisle, rack, shelf, bin_code, is_active
      ) VALUES ('bin-chal-01', 'wh-chal-01', 'Zone A', 'A1', 'R1', 'S1', 'BIN-CHAL-A1', 1)`
    );
    const b1Rows = await db.query('SELECT * FROM warehouse_locations WHERE id = ?', ['bin-chal-01']);
    bin1 = b1Rows[0];

    await db.execute(
      `INSERT INTO warehouse_locations (
        id, warehouse_id, zone, aisle, rack, shelf, bin_code, is_active
      ) VALUES ('bin-chal-02', 'wh-chal-01', 'Zone B', 'B1', 'R1', 'S1', 'BIN-CHAL-B1', 1)`
    );
    const b2Rows = await db.query('SELECT * FROM warehouse_locations WHERE id = ?', ['bin-chal-02']);
    bin2 = b2Rows[0];

    // Seed Catalog Items
    itemAlpha = await service.createItem(
      {
        sku: 'SKU-CHAL-ALPHA',
        barcode: 'BAR-CHAL-001',
        name: 'High Precision Sensor Unit',
        category: 'Sensors',
        unitOfMeasure: 'pcs',
        costPrice: 50.00,
        sellingPrice: 90.00,
        minStockAlert: 10,
        safetyStock: 5,
        maxStock: 500
      },
      db
    );

    itemBeta = await service.createItem(
      {
        sku: 'SKU-CHAL-BETA',
        barcode: 'BAR-CHAL-002',
        name: 'Industrial Controller Relay',
        category: 'Controllers',
        unitOfMeasure: 'pcs',
        costPrice: 25.00,
        sellingPrice: 45.00,
        minStockAlert: 20,
        safetyStock: 10,
        maxStock: 1000
      },
      db
    );
  });

  // -------------------------------------------------------------------------
  // TC-CHALLENGE-01: Multi-stage partial goods receipt and transaction reconciliation
  // -------------------------------------------------------------------------
  it('TC-CHALLENGE-01: Multi-stage partial goods receipt updates stock and immutable audit trail', async () => {
    const po = await service.createPurchaseOrder(
      {
        poNumber: 'PO-CHAL-MULTI-P1',
        supplierId: supplier.id,
        targetWarehouseId: warehouse.id,
        items: [
          { itemId: itemAlpha.id, quantityOrdered: 100, unitCost: 50.00 },
          { itemId: itemBeta.id, quantityOrdered: 50, unitCost: 25.00 }
        ]
      },
      db
    );

    await service.updatePOStatus(po.id, 'pending_approval', undefined, db);
    await service.updatePOStatus(po.id, 'approved', undefined, db);
    await service.updatePOStatus(po.id, 'ordered', undefined, db);

    // Stage 1 Receipt: 35 Alpha, 20 Beta
    const grn1 = await service.receiveGoodsAgainstPO(
      {
        receiptNumber: 'GRN-CHAL-P1-01',
        purchaseOrderId: po.id,
        warehouseId: warehouse.id,
        receivedBy: 'Inspector Tester',
        items: [
          { poItemId: po.items[0].id, itemId: itemAlpha.id, binId: bin1.id, quantityAccepted: 35 },
          { poItemId: po.items[1].id, itemId: itemBeta.id, binId: bin2.id, quantityAccepted: 20 }
        ]
      },
      db
    );

    expect(grn1.poStatus).toBe('partially_received');

    const poAfter1 = await service.getPurchaseOrderById(po.id, db);
    expect(poAfter1?.status).toBe('partially_received');
    expect(poAfter1?.items[0].quantity_received).toBe(35);
    expect(poAfter1?.items[1].quantity_received).toBe(20);

    const stockAlpha1 = await db.query<any>(
      'SELECT quantity_on_hand FROM inventory_stock WHERE item_id = ? AND bin_id = ?',
      [itemAlpha.id, bin1.id]
    );
    expect(stockAlpha1[0].quantity_on_hand).toBe(35);

    const stockBeta1 = await db.query<any>(
      'SELECT quantity_on_hand FROM inventory_stock WHERE item_id = ? AND bin_id = ?',
      [itemBeta.id, bin2.id]
    );
    expect(stockBeta1[0].quantity_on_hand).toBe(20);

    // Stage 2 Receipt: 65 Alpha (fulfill Alpha), 15 Beta (Beta remains 35/50)
    const grn2 = await service.receiveGoodsAgainstPO(
      {
        receiptNumber: 'GRN-CHAL-P1-02',
        purchaseOrderId: po.id,
        warehouseId: warehouse.id,
        receivedBy: 'Inspector Tester',
        items: [
          { poItemId: po.items[0].id, itemId: itemAlpha.id, binId: bin1.id, quantityAccepted: 65 },
          { poItemId: po.items[1].id, itemId: itemBeta.id, binId: bin2.id, quantityAccepted: 15 }
        ]
      },
      db
    );

    expect(grn2.poStatus).toBe('partially_received'); // Beta still incomplete (35/50)

    const stockAlpha2 = await db.query<any>(
      'SELECT quantity_on_hand FROM inventory_stock WHERE item_id = ? AND bin_id = ?',
      [itemAlpha.id, bin1.id]
    );
    expect(stockAlpha2[0].quantity_on_hand).toBe(100);

    // Stage 3 Receipt: remaining 15 Beta
    const grn3 = await service.receiveGoodsAgainstPO(
      {
        receiptNumber: 'GRN-CHAL-P1-03',
        purchaseOrderId: po.id,
        warehouseId: warehouse.id,
        receivedBy: 'Inspector Tester',
        items: [
          { poItemId: po.items[1].id, itemId: itemBeta.id, binId: bin2.id, quantityAccepted: 15 }
        ]
      },
      db
    );

    expect(grn3.poStatus).toBe('received'); // Both items now 100% fulfilled

    const poFinal = await service.getPurchaseOrderById(po.id, db);
    expect(poFinal?.status).toBe('received');
    expect(poFinal?.actual_delivery_date).toBeDefined();

    // Audit Ledger Verification: exactly 5 transactions (2 from grn1, 2 from grn2, 1 from grn3)
    const auditEntries = await db.query<any>(
      "SELECT * FROM inventory_transactions WHERE reference_id = ? ORDER BY transaction_timestamp ASC",
      [po.po_number]
    );
    expect(auditEntries.length).toBe(5);

    // Verify running balances for item Beta
    const betaAudits = auditEntries.filter((a: any) => a.item_id === itemBeta.id);
    expect(betaAudits.length).toBe(3);
    expect(betaAudits[0].quantity_change).toBe(20);
    expect(betaAudits[0].running_balance_after).toBe(20);
    expect(betaAudits[1].quantity_change).toBe(15);
    expect(betaAudits[1].running_balance_after).toBe(35);
    expect(betaAudits[2].quantity_change).toBe(15);
    expect(betaAudits[2].running_balance_after).toBe(50);
  });

  // -------------------------------------------------------------------------
  // TC-CHALLENGE-02: Quality inspection: quarantine validation
  // -------------------------------------------------------------------------
  it('TC-CHALLENGE-02: Rejected items do NOT leak into stock or batch counts', async () => {
    const po = await service.createPurchaseOrder(
      {
        poNumber: 'PO-CHAL-QUARANTINE',
        supplierId: supplier.id,
        targetWarehouseId: warehouse.id,
        items: [{ itemId: itemAlpha.id, quantityOrdered: 50, unitCost: 50.00 }]
      },
      db
    );

    await service.updatePOStatus(po.id, 'pending_approval', undefined, db);
    await service.updatePOStatus(po.id, 'approved', undefined, db);
    await service.updatePOStatus(po.id, 'ordered', undefined, db);

    const grn = await service.receiveGoodsAgainstPO(
      {
        receiptNumber: 'GRN-CHAL-QUAR-01',
        purchaseOrderId: po.id,
        warehouseId: warehouse.id,
        receivedBy: 'QA Inspector',
        inspectionNotes: 'High rejection batch due to cracked casing',
        items: [
          {
            poItemId: po.items[0].id,
            itemId: itemAlpha.id,
            binId: bin1.id,
            batchNumber: 'LOT-CHAL-CRACK-01',
            quantityAccepted: 10,
            quantityRejected: 40,
            rejectionReason: 'Structural cracks detected'
          }
        ]
      },
      db
    );

    // Stock on hand MUST be strictly 10, NOT 50
    const stock = await db.query<any>(
      'SELECT quantity_on_hand FROM inventory_stock WHERE item_id = ? AND bin_id = ?',
      [itemAlpha.id, bin1.id]
    );
    expect(stock[0].quantity_on_hand).toBe(10);

    // Batch current_quantity and initial_quantity MUST be strictly 10, NOT 50
    const batch = await db.query<any>(
      'SELECT * FROM item_batches WHERE batch_number = ?',
      ['LOT-CHAL-CRACK-01']
    );
    expect(batch[0].initial_quantity).toBe(10);
    expect(batch[0].current_quantity).toBe(10);

    // Audit log MUST only have 1 entry of quantity_change = 10
    const audit = await db.query<any>(
      "SELECT * FROM inventory_transactions WHERE reference_id = ?",
      [po.po_number]
    );
    expect(audit.length).toBe(1);
    expect(audit[0].quantity_change).toBe(10);
    expect(audit[0].running_balance_after).toBe(10);

    // PO Line Item MUST record both accepted and rejected
    const poLine = await db.query<any>(
      'SELECT quantity_received, quantity_rejected FROM purchase_order_items WHERE id = ?',
      [po.items[0].id]
    );
    expect(poLine[0].quantity_received).toBe(10);
    expect(poLine[0].quantity_rejected).toBe(40);
  });

  // -------------------------------------------------------------------------
  // TC-CHALLENGE-03: Damaged goods replacement vs. PO Status Deadlock
  // -------------------------------------------------------------------------
  it('TC-CHALLENGE-03: Analyze rejection handling: replacement attempt and PO completion behavior', async () => {
    const po = await service.createPurchaseOrder(
      {
        poNumber: 'PO-CHAL-REJECT-FLOW',
        supplierId: supplier.id,
        targetWarehouseId: warehouse.id,
        items: [{ itemId: itemAlpha.id, quantityOrdered: 100, unitCost: 50.00 }]
      },
      db
    );

    await service.updatePOStatus(po.id, 'pending_approval', undefined, db);
    await service.updatePOStatus(po.id, 'approved', undefined, db);
    await service.updatePOStatus(po.id, 'ordered', undefined, db);

    // Receipt 1: 90 accepted, 10 rejected
    const grn1 = await service.receiveGoodsAgainstPO(
      {
        receiptNumber: 'GRN-CHAL-RJ-01',
        purchaseOrderId: po.id,
        warehouseId: warehouse.id,
        receivedBy: 'QA Inspector',
        items: [
          {
            poItemId: po.items[0].id,
            itemId: itemAlpha.id,
            binId: bin1.id,
            quantityAccepted: 90,
            quantityRejected: 10,
            rejectionReason: 'Damaged during transit'
          }
        ]
      },
      db
    );

    // Current behavior check: PO status is 'partially_received'
    expect(grn1.poStatus).toBe('partially_received');

    // Supplier sends replacement 10 units for the rejected items.
    // CHALLENGE: What does the system do when replacement is delivered?
    let replacementBlocked = false;
    let failureReason = '';
    try {
      await service.receiveGoodsAgainstPO(
        {
          receiptNumber: 'GRN-CHAL-RJ-REPLACEMENT',
          purchaseOrderId: po.id,
          warehouseId: warehouse.id,
          receivedBy: 'QA Inspector',
          items: [
            {
              poItemId: po.items[0].id,
              itemId: itemAlpha.id,
              binId: bin1.id,
              quantityAccepted: 10
            }
          ]
        },
        db
      );
    } catch (err: any) {
      replacementBlocked = true;
      failureReason = err.message;
    }

    // Observation: Replacement IS blocked because remainingAllowed = quantity_ordered - (received + rejected)
    // When remainingAllowed == 0, replacement is rejected as over-delivery!
    console.log(`    [CHALLENGE FINDING TC-CHALLENGE-03] Replacement blocked: ${replacementBlocked} (Error: "${failureReason}")`);

    // Furthermore, can the PO be cancelled?
    let cancelBlocked = false;
    try {
      await service.updatePOStatus(po.id, 'cancelled', undefined, db);
    } catch {
      cancelBlocked = true;
    }
    expect(cancelBlocked).toBe(true);

    // Verify PO state: It remains in 'partially_received' and cannot advance or cancel
    const poStuck = await service.getPurchaseOrderById(po.id, db);
    expect(poStuck?.status).toBe('partially_received');
    console.log(`    [CHALLENGE FINDING TC-CHALLENGE-03] PO '${po.po_number}' is permanently in '${poStuck?.status}' status.`);
  });

  // -------------------------------------------------------------------------
  // TC-CHALLENGE-04: Concurrent status transition race conditions
  // -------------------------------------------------------------------------
  it('TC-CHALLENGE-04: Rapid concurrent PO status transitions under race conditions', async () => {
    const po = await service.createPurchaseOrder(
      {
        poNumber: 'PO-CHAL-RACE-STATUS',
        supplierId: supplier.id,
        targetWarehouseId: warehouse.id,
        items: [{ itemId: itemAlpha.id, quantityOrdered: 20, unitCost: 50.00 }]
      },
      db
    );

    // From draft, attempt concurrent transition to 'pending_approval' and 'cancelled'
    const results = await Promise.allSettled([
      service.updatePOStatus(po.id, 'pending_approval', undefined, db),
      service.updatePOStatus(po.id, 'cancelled', undefined, db)
    ]);

    const refreshed = await service.getPurchaseOrderById(po.id, db);
    console.log(`    [CHALLENGE FINDING TC-CHALLENGE-04] Concurrent draft transitions result:`, {
      call1: results[0].status,
      call2: results[1].status,
      finalStatus: refreshed?.status
    });

    // In a correct state machine, both operations should not both succeed into an inconsistent state
    // Let's assert that final status is either 'pending_approval' or 'cancelled'
    expect(['pending_approval', 'cancelled']).toContain(refreshed?.status);
  });

  // -------------------------------------------------------------------------
  // TC-CHALLENGE-05: Concurrent goods receipts race condition & over-delivery
  // -------------------------------------------------------------------------
  it('TC-CHALLENGE-05: Concurrent goods receipts race condition over-delivery test', async () => {
    const po = await service.createPurchaseOrder(
      {
        poNumber: 'PO-CHAL-RACE-GRN',
        supplierId: supplier.id,
        targetWarehouseId: warehouse.id,
        items: [{ itemId: itemAlpha.id, quantityOrdered: 100, unitCost: 50.00 }]
      },
      db
    );

    await service.updatePOStatus(po.id, 'pending_approval', undefined, db);
    await service.updatePOStatus(po.id, 'approved', undefined, db);
    await service.updatePOStatus(po.id, 'ordered', undefined, db);

    // Two concurrent receipts of 60 items each (total attempted: 120, ordered: 100)
    const grnResults = await Promise.allSettled([
      service.receiveGoodsAgainstPO(
        {
          receiptNumber: 'GRN-RACE-01',
          purchaseOrderId: po.id,
          warehouseId: warehouse.id,
          receivedBy: 'Inspector A',
          items: [{ poItemId: po.items[0].id, itemId: itemAlpha.id, binId: bin1.id, quantityAccepted: 60 }]
        },
        db
      ),
      service.receiveGoodsAgainstPO(
        {
          receiptNumber: 'GRN-RACE-02',
          purchaseOrderId: po.id,
          warehouseId: warehouse.id,
          receivedBy: 'Inspector B',
          items: [{ poItemId: po.items[0].id, itemId: itemAlpha.id, binId: bin1.id, quantityAccepted: 60 }]
        },
        db
      )
    ]);

    const refreshedPo = await service.getPurchaseOrderById(po.id, db);
    const stock = await db.query<any>(
      'SELECT quantity_on_hand FROM inventory_stock WHERE item_id = ? AND bin_id = ?',
      [itemAlpha.id, bin1.id]
    );

    console.log(`    [CHALLENGE FINDING TC-CHALLENGE-05] Concurrent GRN results:`, {
      grn1: grnResults[0].status,
      grn2: grnResults[1].status,
      grn2Error: grnResults[1].status === 'rejected' ? (grnResults[1] as any).reason?.message : undefined,
      poReceived: refreshedPo?.items[0].quantity_received,
      stockOnHand: stock[0]?.quantity_on_hand
    });

    // If both succeeded, then total received is 120 (which violates ordered=100 limit!)
    // If one rejected, then total received is 60 (which respects the limit)
    const totalReceived = refreshedPo?.items[0].quantity_received || 0;
    if (totalReceived > 100) {
      console.log(`    ⚠️ [VULNERABILITY CONFIRMED] Concurrent GRN race condition caused over-delivery! Total: ${totalReceived} > Ordered: 100`);
    } else {
      console.log(`    ✔ [SAFE] Over-delivery prevented under concurrency; Total: ${totalReceived}`);
    }
  });

  // -------------------------------------------------------------------------
  // TC-CHALLENGE-06: Direct transition from ordered to received without GRN
  // -------------------------------------------------------------------------
  it('TC-CHALLENGE-06: Manual transition from ordered to received bypasses goods receipt', async () => {
    const po = await service.createPurchaseOrder(
      {
        poNumber: 'PO-CHAL-DIRECT-RECV',
        supplierId: supplier.id,
        targetWarehouseId: warehouse.id,
        items: [{ itemId: itemAlpha.id, quantityOrdered: 50, unitCost: 50.00 }]
      },
      db
    );

    await service.updatePOStatus(po.id, 'pending_approval', undefined, db);
    await service.updatePOStatus(po.id, 'approved', undefined, db);
    await service.updatePOStatus(po.id, 'ordered', undefined, db);

    // The state machine allows ordered -> received directly!
    const receivedPo = await service.updatePOStatus(po.id, 'received', undefined, db);
    expect(receivedPo.status).toBe('received');

    // Observation: Stock on hand is still 0
    const stock = await db.query<any>(
      'SELECT quantity_on_hand FROM inventory_stock WHERE item_id = ?',
      [itemAlpha.id]
    );
    expect(stock.length).toBe(0);

    // Observation: Supplier fulfilled count was NOT incremented because GRN was bypassed
    const sup = await db.query<any>('SELECT total_pos_fulfilled FROM suppliers WHERE id = ?', [supplier.id]);
    expect(sup[0].total_pos_fulfilled).toBe(0);

    console.log(`    [CHALLENGE FINDING TC-CHALLENGE-06] Manual ordered -> received transition bypassed stock & supplier scorecard.`);
  });

  // -------------------------------------------------------------------------
  // TC-CHALLENGE-07: GRN multi-bin location accuracy & zero/negative quantity bounds
  // -------------------------------------------------------------------------
  it('TC-CHALLENGE-07: GRN multi-bin location segregation and bounds enforcement', async () => {
    const po = await service.createPurchaseOrder(
      {
        poNumber: 'PO-CHAL-MULTIBIN',
        supplierId: supplier.id,
        targetWarehouseId: warehouse.id,
        items: [{ itemId: itemAlpha.id, quantityOrdered: 40, unitCost: 50.00 }]
      },
      db
    );

    await service.updatePOStatus(po.id, 'pending_approval', undefined, db);
    await service.updatePOStatus(po.id, 'approved', undefined, db);
    await service.updatePOStatus(po.id, 'ordered', undefined, db);

    // Receive 20 into bin1 and 20 into bin2 in separate receipts
    await service.receiveGoodsAgainstPO(
      {
        receiptNumber: 'GRN-BIN-01',
        purchaseOrderId: po.id,
        warehouseId: warehouse.id,
        receivedBy: 'Inspector',
        items: [{ poItemId: po.items[0].id, itemId: itemAlpha.id, binId: bin1.id, quantityAccepted: 20 }]
      },
      db
    );

    await service.receiveGoodsAgainstPO(
      {
        receiptNumber: 'GRN-BIN-02',
        purchaseOrderId: po.id,
        warehouseId: warehouse.id,
        receivedBy: 'Inspector',
        items: [{ poItemId: po.items[0].id, itemId: itemAlpha.id, binId: bin2.id, quantityAccepted: 20 }]
      },
      db
    );

    const stockBin1 = await db.query<any>(
      'SELECT quantity_on_hand FROM inventory_stock WHERE item_id = ? AND bin_id = ?',
      [itemAlpha.id, bin1.id]
    );
    const stockBin2 = await db.query<any>(
      'SELECT quantity_on_hand FROM inventory_stock WHERE item_id = ? AND bin_id = ?',
      [itemAlpha.id, bin2.id]
    );

    expect(stockBin1[0].quantity_on_hand).toBe(20);
    expect(stockBin2[0].quantity_on_hand).toBe(20);

    // Negative quantity bounds check on active ordered PO
    const poNeg = await service.createPurchaseOrder(
      {
        poNumber: 'PO-CHAL-NEG',
        supplierId: supplier.id,
        targetWarehouseId: warehouse.id,
        items: [{ itemId: itemAlpha.id, quantityOrdered: 20, unitCost: 50.00 }]
      },
      db
    );
    await service.updatePOStatus(poNeg.id, 'pending_approval', undefined, db);
    await service.updatePOStatus(poNeg.id, 'approved', undefined, db);
    await service.updatePOStatus(poNeg.id, 'ordered', undefined, db);

    await expect(async () => {
      await service.receiveGoodsAgainstPO(
        {
          purchaseOrderId: poNeg.id,
          warehouseId: warehouse.id,
          receivedBy: 'Inspector',
          items: [{ poItemId: poNeg.items[0].id, itemId: itemAlpha.id, binId: bin1.id, quantityAccepted: -5 }]
        },
        db
      );
    }).toReject('Accepted and rejected quantities cannot be negative');
  });

  // -------------------------------------------------------------------------
  // TC-CHALLENGE-08: Concurrency stress test under production DatabaseService (txQueue)
  // -------------------------------------------------------------------------
  it('TC-CHALLENGE-08: Concurrency race condition under production DatabaseService (sql.js txQueue)', async () => {
    const prodDb = new DatabaseService(':memory:');
    await prodDb.initialize();

    // Seed supplier, warehouse, bin, item in prodDb
    await prodDb.execute(
      `INSERT INTO suppliers (
        id, supplier_code, name, contact_person, phone, address, city, country,
        payment_terms_days, lead_time_days, rating, performance_score, total_pos_issued, total_pos_fulfilled, is_active
      ) VALUES ('sup-prod-01', 'SUP-PROD-001', 'Prod Test Supplier', 'Karim', '+8801700000000', 'Dhaka', 'Dhaka', 'Bangladesh', 30, 5, 5.0, 100.0, 0, 0, 1)`
    );

    await prodDb.execute(
      `INSERT INTO warehouses (
        id, warehouse_code, name, address, city, is_default, is_active
      ) VALUES ('wh-prod-01', 'WH-PROD', 'Prod Warehouse', 'Dhaka', 'Dhaka', 1, 1)`
    );

    await prodDb.execute(
      `INSERT INTO warehouse_locations (
        id, warehouse_id, zone, aisle, rack, shelf, bin_code, is_active
      ) VALUES ('bin-prod-01', 'wh-prod-01', 'Zone A', 'A1', 'R1', 'S1', 'BIN-PROD-A1', 1)`
    );

    const item = await service.createItem(
      {
        sku: 'SKU-PROD-RACE',
        name: 'Race Condition Test Item',
        category: 'Test',
        costPrice: 10.00,
        sellingPrice: 20.00
      },
      prodDb
    );

    const po = await service.createPurchaseOrder(
      {
        poNumber: 'PO-PROD-RACE',
        supplierId: 'sup-prod-01',
        targetWarehouseId: 'wh-prod-01',
        items: [{ itemId: item.id, quantityOrdered: 100, unitCost: 10.00 }]
      },
      prodDb
    );

    await service.updatePOStatus(po.id, 'pending_approval', undefined, prodDb);
    await service.updatePOStatus(po.id, 'approved', undefined, prodDb);
    await service.updatePOStatus(po.id, 'ordered', undefined, prodDb);

    // Launch TWO concurrent receipts of 60 items each against PO of 100 items
    const results = await Promise.allSettled([
      service.receiveGoodsAgainstPO(
        {
          receiptNumber: 'GRN-CONC-01',
          purchaseOrderId: po.id,
          warehouseId: 'wh-prod-01',
          receivedBy: 'Inspector 1',
          items: [{ poItemId: po.items[0].id, itemId: item.id, binId: 'bin-prod-01', quantityAccepted: 60 }]
        },
        prodDb
      ),
      service.receiveGoodsAgainstPO(
        {
          receiptNumber: 'GRN-CONC-02',
          purchaseOrderId: po.id,
          warehouseId: 'wh-prod-01',
          receivedBy: 'Inspector 2',
          items: [{ poItemId: po.items[0].id, itemId: item.id, binId: 'bin-prod-01', quantityAccepted: 60 }]
        },
        prodDb
      )
    ]);

    const refreshedPo = await service.getPurchaseOrderById(po.id, prodDb);
    const totalRecv = refreshedPo?.items[0].quantity_received;
    const stockRows = await prodDb.query<any>(
      'SELECT quantity_on_hand FROM inventory_stock WHERE item_id = ?',
      [item.id]
    );

    console.log(`    [CHALLENGE FINDING TC-CHALLENGE-08] Concurrency outcomes under DatabaseService:`, {
      call1: results[0].status,
      call2: results[1].status,
      call2Error: results[1].status === 'rejected' ? (results[1] as any).reason?.message : undefined,
      poItemReceived: totalRecv,
      stockOnHand: stockRows[0]?.quantity_on_hand
    });

    if (totalRecv !== undefined && totalRecv > 100) {
      console.log(`    ⚠️ [VULNERABILITY CONFIRMED IN DatabaseService] Over-delivery allowed! Total received: ${totalRecv} > Ordered: 100!`);
    } else {
      console.log(`    ✔ [SAFE] Over-delivery prevented under DatabaseService: Total received: ${totalRecv}`);
    }
  });
});

if (process.argv[1]?.includes('m2-empirical-challenger.test.ts')) {
  runSuites().then(res => {
    if (res.failed > 0) process.exit(1);
    process.exit(0);
  });
}
