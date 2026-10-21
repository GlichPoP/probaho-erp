/**
 * Empirical Adversarial Challenger Test Suite for Milestone 4
 * File: tests/challenger/m4-empirical-challenger.test.ts
 *
 * Scope:
 * - TC-CHALLENGE-M4-01: Illegal state machine jumps (Direct jump pending -> delivered must be rejected)
 * - TC-CHALLENGE-M4-02: Terminal locking guards (Modifications after reaching delivered or cancelled status)
 * - TC-CHALLENGE-M4-03: Return-to-Origin guards (processRTO on pending, dispatched, delivered must be rejected)
 * - TC-CHALLENGE-M4-04: Duplicate RTO resolution guard (second call to processRTO must be rejected)
 * - TC-CHALLENGE-M4-05: Tracking number invariants on dispatch (missing, empty, and whitespace-only tracking codes)
 * - TC-CHALLENGE-M4-06: RTO pristine restock inventory accuracy & RETURN_RESTOCK double-entry audit logging
 * - TC-CHALLENGE-M4-07: RTO damaged write-off inventory accuracy & ADJUSTMENT_WRITE_OFF double-entry audit logging
 * - TC-CHALLENGE-M4-08: RTO terminal state locking and re-dispatch prevention (return_to_origin & rto_received)
 */

import { describe, it, expect, beforeEach, runSuites } from '../harness/test-runner.ts';
import { DatabaseService } from '../../src/services/db.ts';
import { ERPTestClient } from '../harness/erp-test-client.ts';
import { FulfillmentService } from '../../src/services/fulfillmentService.ts';

let db: DatabaseService;
let client: ERPTestClient;
let fulfillmentSvc: FulfillmentService;

let warehouse: any;
let bin1: any;
let bin2: any;
let itemMech: any;
let itemElec: any;
let courier: any;

describe('M4 Empirical Challenger Test Suite: State Machine Transitions, Terminal Locking & RTO Integrity', () => {
  beforeEach(async () => {
    db = new DatabaseService(':memory:');
    await db.initialize();
    client = new ERPTestClient(db);
    fulfillmentSvc = FulfillmentService.getInstance();

    warehouse = await client.createWarehouse({
      warehouseCode: 'WH-CHAL-M4',
      name: 'Challenger Hub Chittagong',
      address: 'Agrabad C/A',
      city: 'Chittagong',
      isDefault: true
    });

    bin1 = await client.createLocation({
      warehouseId: warehouse.id,
      zone: 'Zone 1',
      aisle: 'A1',
      rack: 'R1',
      shelf: 'S1',
      binCode: 'CTG-Z1-A1-R1-S1'
    });

    bin2 = await client.createLocation({
      warehouseId: warehouse.id,
      zone: 'Zone 2',
      aisle: 'A2',
      rack: 'R1',
      shelf: 'S1',
      binCode: 'CTG-Z2-A2-R1-S1'
    });

    itemMech = await client.createItem({
      sku: 'SKU-CHAL-BRG-100',
      name: 'Precision Bearing Assembly',
      category: 'Mechanical',
      unitOfMeasure: 'pcs',
      costPrice: 50.0,
      sellingPrice: 85.0
    });

    itemElec = await client.createItem({
      sku: 'SKU-CHAL-INV-500',
      name: 'Solar Inverter Module 5KW',
      category: 'Electrical',
      unitOfMeasure: 'units',
      costPrice: 300.0,
      sellingPrice: 480.0
    });

    courier = await client.createCourier('Sundarban Express Cargo', '+8801911223344', 'Standard');

    // Seed Initial Inventory
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
       VALUES 
        ('stk-chal-mech', ?, ?, ?, 100, 0),
        ('stk-chal-elec', ?, ?, ?, 50, 0)`,
      [itemMech.id, warehouse.id, bin1.id, itemElec.id, warehouse.id, bin1.id]
    );
  });

  // -------------------------------------------------------------------------
  // TC-CHALLENGE-M4-01: Illegal state machine jumps (pending -> delivered)
  // -------------------------------------------------------------------------
  it('TC-CHALLENGE-M4-01: Direct jump from pending to delivered must be strictly rejected', async () => {
    const shipment = await client.createShipment({
      shipmentNumber: 'SHP-JUMP-001',
      orderReference: 'ORD-JUMP-001',
      sourceWarehouseId: warehouse.id,
      customerName: 'Direct Jump Corp',
      customerPhone: '+8801711000001',
      customerAddress: 'Jubilee Road',
      destinationCity: 'Chittagong',
      courierName: courier.name,
      items: [{ itemId: itemMech.id, binId: bin1.id, quantity: 10, unitPrice: 85.0 }]
    });

    expect(shipment.status).toBe('pending');

    // Attempt illegal transition pending -> delivered
    let jumpBlocked = false;
    let failureError = '';
    try {
      await client.updateShipmentStatus(shipment.id, 'delivered');
    } catch (err: any) {
      jumpBlocked = true;
      failureError = err.message;
    }

    const currentShp = await client.getShipment(shipment.id);
    const currentStock = await client.getItemTotalStock(itemMech.id, warehouse.id);

    console.log(`    [CHALLENGE FINDING TC-CHALLENGE-M4-01] Direct pending -> delivered jump:`, {
      jumpBlocked,
      finalStatus: currentShp.status,
      stockOnHand: currentStock.onHand,
      stockReserved: currentStock.reserved,
      error: failureError || 'NONE (Allowed!)'
    });

    if (!jumpBlocked) {
      console.log('    ⚠️ [VULNERABILITY CONFIRMED] Direct pending -> delivered state jump allowed! Physical stock deduction bypassed.');
    } else {
      console.log('    ✔ [SAFE] Direct pending -> delivered state jump strictly rejected.');
    }

    // According to DISPATCH mandate: Transitioning directly from pending to delivered must be rejected
    expect(jumpBlocked).toBe(true);
  });

  // -------------------------------------------------------------------------
  // TC-CHALLENGE-M4-02: Terminal locking guards (delivered and cancelled)
  // -------------------------------------------------------------------------
  it('TC-CHALLENGE-M4-02: Modifications after reaching delivered or cancelled status must be strictly blocked', async () => {
    // 1. Delivered Terminal Locking
    const shpDelivered = await client.createShipment({
      shipmentNumber: 'SHP-TERM-DELV',
      orderReference: 'ORD-TERM-DELV',
      sourceWarehouseId: warehouse.id,
      customerName: 'Terminal Delivered Co',
      customerPhone: '+8801711000002',
      customerAddress: 'Strand Road',
      destinationCity: 'Chittagong',
      courierName: courier.name,
      items: [{ itemId: itemMech.id, binId: bin1.id, quantity: 5, unitPrice: 85.0 }]
    });

    await client.dispatchShipment(shpDelivered.id, 'TRACK-DELV-01');
    await client.updateShipmentStatus(shpDelivered.id, 'in_transit');
    await client.updateShipmentStatus(shpDelivered.id, 'delivered');

    await expect(async () => {
      await client.updateShipmentStatus(shpDelivered.id, 'in_transit');
    }).toReject("Cannot transition shipment: already in terminal 'delivered' status.");

    await expect(async () => {
      await client.updateShipmentStatus(shpDelivered.id, 'cancelled');
    }).toReject("Cannot transition shipment: already in terminal 'delivered' status.");

    // 2. Cancelled Locking
    const shpCancelled = await client.createShipment({
      shipmentNumber: 'SHP-TERM-CANC',
      orderReference: 'ORD-TERM-CANC',
      sourceWarehouseId: warehouse.id,
      customerName: 'Cancelled Co',
      customerPhone: '+8801711000003',
      customerAddress: 'Khatungonj',
      destinationCity: 'Chittagong',
      courierName: courier.name,
      items: [{ itemId: itemMech.id, binId: bin1.id, quantity: 5, unitPrice: 85.0 }]
    });

    await client.updateShipmentStatus(shpCancelled.id, 'cancelled', 'Client canceled');

    await expect(async () => {
      await client.updateShipmentStatus(shpCancelled.id, 'pending');
    }).toReject('already cancelled');

    await expect(async () => {
      await client.dispatchShipment(shpCancelled.id, 'TRACK-CANC-01');
    }).toReject('Cannot dispatch cancelled shipment');

    console.log('    ✔ [SAFE] Terminal delivered and cancelled locking strictly enforced.');
  });

  // -------------------------------------------------------------------------
  // TC-CHALLENGE-M4-03: Return-to-Origin guards (processRTO on non-RTO shipments)
  // -------------------------------------------------------------------------
  it('TC-CHALLENGE-M4-03: Calling processRTO on non-return_to_origin shipments must be strictly rejected', async () => {
    const shipment = await client.createShipment({
      shipmentNumber: 'SHP-RTO-GUARD-01',
      orderReference: 'ORD-RTO-GUARD-01',
      sourceWarehouseId: warehouse.id,
      customerName: 'Premature RTO Client',
      customerPhone: '+8801711000004',
      customerAddress: 'Agrabad',
      destinationCity: 'Chittagong',
      courierName: courier.name,
      items: [{ itemId: itemMech.id, binId: bin1.id, quantity: 5, unitPrice: 85.0 }]
    });

    // 1. Calling processRTO on pending shipment
    await expect(async () => {
      await client.processRTO(shipment.id, 'restocked', bin1.id);
    }).toReject("Cannot process RTO: shipment status is 'pending', expected 'return_to_origin'.");

    // 2. Calling processRTO on dispatched shipment
    await client.dispatchShipment(shipment.id, 'TRACK-RTO-G01');
    await expect(async () => {
      await client.processRTO(shipment.id, 'restocked', bin1.id);
    }).toReject("Cannot process RTO: shipment status is 'dispatched', expected 'return_to_origin'.");

    // 3. Calling processRTO on delivered shipment
    await client.updateShipmentStatus(shipment.id, 'in_transit');
    await client.updateShipmentStatus(shipment.id, 'delivered');
    await expect(async () => {
      await client.processRTO(shipment.id, 'restocked', bin1.id);
    }).toReject("Cannot process RTO: shipment status is 'delivered', expected 'return_to_origin'.");

    console.log('    ✔ [SAFE] processRTO strictly rejected on pending, dispatched, and delivered statuses.');
  });

  // -------------------------------------------------------------------------
  // TC-CHALLENGE-M4-04: Duplicate RTO resolution guard
  // -------------------------------------------------------------------------
  it('TC-CHALLENGE-M4-04: Duplicate processRTO calls on the same shipment must be strictly rejected', async () => {
    const shipment = await client.createShipment({
      shipmentNumber: 'SHP-DUP-RTO',
      orderReference: 'ORD-DUP-RTO',
      sourceWarehouseId: warehouse.id,
      customerName: 'Duplicate RTO Co',
      customerPhone: '+8801711000005',
      customerAddress: 'Nasirabad',
      destinationCity: 'Chittagong',
      courierName: courier.name,
      items: [{ itemId: itemMech.id, binId: bin1.id, quantity: 10, unitPrice: 85.0 }]
    });

    await client.dispatchShipment(shipment.id, 'TRACK-DUP-RTO');
    await client.updateShipmentStatus(shipment.id, 'in_transit');
    await client.updateShipmentStatus(shipment.id, 'return_to_origin', 'Customer refused delivery');

    // First processRTO call succeeds
    const firstResult = await client.processRTO(shipment.id, 'restocked', bin1.id);
    expect(firstResult.status).toBe('rto_received');
    expect(firstResult.rto_disposition).toBe('restocked');

    // Second processRTO call on the same shipment must be rejected
    await expect(async () => {
      await client.processRTO(shipment.id, 'restocked', bin1.id);
    }).toReject("Cannot process RTO: shipment status is 'rto_received', expected 'return_to_origin'.");

    console.log('    ✔ [SAFE] Duplicate processRTO on same shipment strictly rejected.');
  });

  // -------------------------------------------------------------------------
  // TC-CHALLENGE-M4-05: Tracking number invariants on dispatch
  // -------------------------------------------------------------------------
  it('TC-CHALLENGE-M4-05: Dispatch without tracking code, with empty string, or whitespace-only code must be rejected', async () => {
    // 1. Missing / undefined tracking code
    const shp1 = await client.createShipment({
      shipmentNumber: 'SHP-NO-TRK-01',
      orderReference: 'ORD-NO-TRK-01',
      sourceWarehouseId: warehouse.id,
      customerName: 'No Track Client',
      customerPhone: '+8801711000006',
      customerAddress: 'Agrabad',
      destinationCity: 'Chittagong',
      courierName: courier.name,
      items: [{ itemId: itemMech.id, binId: bin1.id, quantity: 5, unitPrice: 85.0 }]
    });

    await expect(async () => {
      await client.dispatchShipment(shp1.id);
    }).toReject('Tracking ID is mandatory for dispatched outbound shipments.');

    // 2. Empty string tracking code
    await expect(async () => {
      await client.dispatchShipment(shp1.id, '');
    }).toReject('Tracking ID is mandatory for dispatched outbound shipments.');

    // 3. Whitespace-only tracking code ("   ")
    let wsBlocked = false;
    let wsError = '';
    let wsDispatched: any = null;
    try {
      wsDispatched = await client.dispatchShipment(shp1.id, '   ');
    } catch (err: any) {
      wsBlocked = true;
      wsError = err.message;
    }

    console.log(`    [CHALLENGE FINDING TC-CHALLENGE-M4-05] Whitespace-only tracking code dispatch:`, {
      wsBlocked,
      trackingStored: wsDispatched?.tracking_number,
      error: wsError || 'NONE (Allowed!)'
    });

    if (!wsBlocked) {
      console.log('    ⚠️ [VULNERABILITY CONFIRMED] Dispatch with whitespace-only tracking code allowed!');
    } else {
      console.log('    ✔ [SAFE] Whitespace-only tracking code strictly rejected.');
    }

    // According to DISPATCH mandate: Dispatch with empty string or whitespace-only tracking code must be rejected
    expect(wsBlocked).toBe(true);
  });

  // -------------------------------------------------------------------------
  // TC-CHALLENGE-M4-06: RTO pristine restock inventory accuracy & audit ledger
  // -------------------------------------------------------------------------
  it('TC-CHALLENGE-M4-06: RTO pristine restock exactly restores shipped quantity and records RETURN_RESTOCK', async () => {
    const initialStock = (await client.getItemTotalStock(itemMech.id, warehouse.id)).onHand;

    const shipment = await client.createShipment({
      shipmentNumber: 'SHP-RESTOCK-ACC',
      orderReference: 'ORD-RESTOCK-ACC',
      sourceWarehouseId: warehouse.id,
      customerName: 'Restock Accuracy Co',
      customerPhone: '+8801711000007',
      customerAddress: 'Bayezid Bostami',
      destinationCity: 'Chittagong',
      courierName: courier.name,
      items: [{ itemId: itemMech.id, binId: bin1.id, quantity: 25, unitPrice: 85.0 }]
    });

    // Dispatch: 25 units deducted
    await client.dispatchShipment(shipment.id, 'TRK-RESTOCK-25');
    const stockAfterDispatch = (await client.getItemTotalStock(itemMech.id, warehouse.id)).onHand;
    expect(stockAfterDispatch).toBe(initialStock - 25);

    // Transit -> RTO
    await client.updateShipmentStatus(shipment.id, 'in_transit');
    await client.updateShipmentStatus(shipment.id, 'return_to_origin', 'Consignee shifted office');

    // Restock into bin1
    await client.processRTO(shipment.id, 'restocked', bin1.id);
    const stockAfterRestock = (await client.getItemTotalStock(itemMech.id, warehouse.id)).onHand;
    expect(stockAfterRestock).toBe(initialStock);

    // Audit transaction verification
    const txs = await client.getInventoryTransactions(shipment.shipment_number);
    const restockEntry = txs.find(t => t.transaction_type === 'RETURN_RESTOCK');
    expect(restockEntry).toBeDefined();
    expect(restockEntry.quantity_change).toBe(25);
    expect(restockEntry.running_balance_after).toBe(initialStock);
    expect(restockEntry.reference_type).toBe('SHIPMENT');
    expect(restockEntry.reference_id).toBe(shipment.shipment_number);

    console.log('    ✔ [SAFE] RTO pristine restock restored exact quantity (25 units) and recorded RETURN_RESTOCK.');
  });

  // -------------------------------------------------------------------------
  // TC-CHALLENGE-M4-07: RTO damaged write-off inventory accuracy & audit ledger
  // -------------------------------------------------------------------------
  it('TC-CHALLENGE-M4-07: RTO damaged write-off does NOT restore stock and records ADJUSTMENT_WRITE_OFF', async () => {
    const initialStock = (await client.getItemTotalStock(itemElec.id, warehouse.id)).onHand;

    const shipment = await client.createShipment({
      shipmentNumber: 'SHP-SCRAP-ACC',
      orderReference: 'ORD-SCRAP-ACC',
      sourceWarehouseId: warehouse.id,
      customerName: 'Scrap Accuracy Co',
      customerPhone: '+8801711000008',
      customerAddress: 'Kalurghat',
      destinationCity: 'Chittagong',
      courierName: courier.name,
      items: [{ itemId: itemElec.id, binId: bin1.id, quantity: 15, unitPrice: 480.0 }]
    });

    // Dispatch: 15 units deducted
    await client.dispatchShipment(shipment.id, 'TRK-SCRAP-15');
    const stockAfterDispatch = (await client.getItemTotalStock(itemElec.id, warehouse.id)).onHand;
    expect(stockAfterDispatch).toBe(initialStock - 15);

    // Transit -> RTO
    await client.updateShipmentStatus(shipment.id, 'in_transit');
    await client.updateShipmentStatus(shipment.id, 'return_to_origin', 'Transit water damage');

    // Damaged write-off
    await client.processRTO(shipment.id, 'damaged_writeoff');
    const stockAfterWriteoff = (await client.getItemTotalStock(itemElec.id, warehouse.id)).onHand;
    expect(stockAfterWriteoff).toBe(initialStock - 15); // Unchanged!

    // Audit transaction verification
    const txs = await client.getInventoryTransactions(shipment.shipment_number);
    const writeoffEntry = txs.find(t => t.transaction_type === 'ADJUSTMENT_WRITE_OFF');
    expect(writeoffEntry).toBeDefined();
    expect(writeoffEntry.quantity_change).toBe(0);
    expect(writeoffEntry.reference_type).toBe('SHIPMENT');
    expect(writeoffEntry.reference_id).toBe(shipment.shipment_number);

    console.log('    ✔ [SAFE] RTO damaged write-off kept stock unchanged and recorded ADJUSTMENT_WRITE_OFF.');
  });

  // -------------------------------------------------------------------------
  // TC-CHALLENGE-M4-08: RTO terminal state locking and re-dispatch prevention
  // -------------------------------------------------------------------------
  it('TC-CHALLENGE-M4-08: Shipments in return_to_origin or rto_received must not be re-dispatched or reverted', async () => {
    const shipment = await client.createShipment({
      shipmentNumber: 'SHP-RTO-LOCK',
      orderReference: 'ORD-RTO-LOCK',
      sourceWarehouseId: warehouse.id,
      customerName: 'RTO Lock Client',
      customerPhone: '+8801711000009',
      customerAddress: 'Pahartali',
      destinationCity: 'Chittagong',
      courierName: courier.name,
      items: [{ itemId: itemMech.id, binId: bin1.id, quantity: 5, unitPrice: 85.0 }]
    });

    await client.dispatchShipment(shipment.id, 'TRK-LOCK-01');
    await client.updateShipmentStatus(shipment.id, 'in_transit');
    await client.updateShipmentStatus(shipment.id, 'return_to_origin', 'Undeliverable address');

    // 1. Attempt re-dispatch while in return_to_origin
    let redispatchBlocked = false;
    let redispatchErr = '';
    try {
      await client.dispatchShipment(shipment.id, 'TRK-LOCK-02');
    } catch (err: any) {
      redispatchBlocked = true;
      redispatchErr = err.message;
    }

    console.log(`    [CHALLENGE FINDING TC-CHALLENGE-M4-08] Re-dispatch on return_to_origin:`, {
      redispatchBlocked,
      error: redispatchErr || 'NONE (Allowed!)'
    });

    // 2. Complete RTO and test modification after rto_received
    await client.processRTO(shipment.id, 'restocked', bin1.id);
    let revertBlocked = false;
    let revertErr = '';
    try {
      await client.updateShipmentStatus(shipment.id, 'in_transit');
    } catch (err: any) {
      revertBlocked = true;
      revertErr = err.message;
    }

    console.log(`    [CHALLENGE FINDING TC-CHALLENGE-M4-08] Status mutation after rto_received:`, {
      revertBlocked,
      error: revertErr || 'NONE (Allowed!)'
    });

    if (!redispatchBlocked || !revertBlocked) {
      console.log('    ⚠️ [VULNERABILITY CONFIRMED] RTO terminal locking incomplete: re-dispatch or post-RTO modification permitted.');
    } else {
      console.log('    ✔ [SAFE] RTO terminal locking and re-dispatch prevention strictly enforced.');
    }

    expect(redispatchBlocked).toBe(true);
    expect(revertBlocked).toBe(true);
  });
});

if (process.argv[1]?.includes('m4-empirical-challenger.test.ts')) {
  runSuites().then(res => {
    if (res.failed > 0) process.exit(1);
    process.exit(0);
  });
}
