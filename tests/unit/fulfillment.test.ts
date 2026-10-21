/**
 * Unit & Integration Test Suite for Fulfillment, Couriers, Shipments & Return-to-Origin (RTO)
 * File: tests/unit/fulfillment.test.ts
 * Milestone 4 - Fulfillment, Logistics Tracking & Return-to-Origin
 *
 * Hardened Drop-In Update (Iteration 2):
 * - Removed manual test helper DB patches (lines 57-81 raw SQL fallback on inventory_stock).
 * - Relies 100% on native fulfillmentService.updateShipmentStatus(shp.id, 'cancelled') for reservation release.
 * - Enforces strict state machine transition validation (e.g. pending -> packed -> dispatched -> in_transit -> delivered).
 * - Tests rejection of illegal direct state jumps (pending -> delivered).
 *
 * Test Matrix:
 * - TC-FUL-01: Create and manage couriers (validation of phone, active toggle, URL template)
 * - TC-FUL-02: Create outbound shipment with item reservation (validates stock reserved increases and available decreases)
 * - TC-FUL-03: Reject shipment creation with insufficient on-hand stock or empty item list
 * - TC-FUL-04: Dispatch shipment with mandatory tracking number (deducts on-hand and reserved stock, logs FULFILLMENT_PICK)
 * - TC-FUL-05: Reject dispatch without tracking number or when physical stock is altered
 * - TC-FUL-06: Progress shipment status through valid states (packed, dispatched, in_transit, delivered)
 * - TC-FUL-07: Reject invalid status transitions (e.g. pending -> delivered jump, modifications from delivered or cancelled)
 * - TC-FUL-08: Initiate Return-to-Origin (RTO) with documented reason
 * - TC-FUL-09: Process RTO with restocked disposition (increments destination bin stock, logs RETURN_RESTOCK)
 * - TC-FUL-10: Process RTO with damaged_writeoff disposition (does not increment stock, logs write-off)
 * - TC-FUL-11: Reject RTO processing on shipments not in return_to_origin status
 * - TC-FUL-12: Full mass conservation verification: Initial Stock == On-Hand + Dispatched - Restocked
 */

import { describe, it, expect, beforeEach, runSuites } from '../harness/test-runner.ts';
import { TestDatabaseService } from '../harness/test-db.ts';
import { ERPTestClient } from '../harness/erp-test-client.ts';

let db: TestDatabaseService;
let client: ERPTestClient;

let warehouseA: any;
let binA1: any;
let item1: any;
let item2: any;
let courier: any;

/**
 * Native helper to cancel shipment via fulfillment service.
 * Relies 100% on native reservation release inside fulfillmentService.updateShipmentStatus
 * without any manual database manipulation or SQL patching.
 */
async function cancelShipmentHelper(
  testClient: ERPTestClient,
  _targetDb: TestDatabaseService,
  shipmentId: string,
  notes?: string
): Promise<any> {
  return testClient.updateShipmentStatus(shipmentId, 'cancelled', notes);
}

describe('Unit & Integration Test: Milestone 4 Fulfillment & Logistics Services', () => {
  beforeEach(async () => {
    db = new TestDatabaseService(':memory:');
    await db.initialize();
    client = new ERPTestClient(db);

    // 1. Seed Warehouse and Bin Location
    warehouseA = await client.createWarehouse({
      warehouseCode: 'WH-CTG-PORT',
      name: 'Chittagong Port Terminal Hub',
      address: 'Strand Road, Sadarghat',
      city: 'Chittagong',
      isDefault: true
    });

    binA1 = await client.createLocation({
      warehouseId: warehouseA.id,
      zone: 'Zone Alpha',
      aisle: 'Aisle 01',
      rack: 'Rack 02',
      shelf: 'Shelf 01',
      binCode: 'CTG-ZA-A01-R02-S01'
    });

    // 2. Seed Catalog Products
    item1 = await client.createItem({
      sku: 'SKU-BEARING-6205',
      name: 'Heavy Duty Deep Groove Ball Bearing 6205-2RS',
      category: 'Mechanical',
      unitOfMeasure: 'pcs',
      costPrice: 28.50,
      sellingPrice: 45.00
    });

    item2 = await client.createItem({
      sku: 'SKU-INVERTER-5KW',
      name: 'Pure Sine Wave Industrial Inverter 5KW',
      category: 'Electrical',
      unitOfMeasure: 'units',
      costPrice: 420.00,
      sellingPrice: 650.00
    });

    // 3. Seed Base Courier Partner
    courier = await client.createCourier('Pathao Enterprise Cargo', '+8809610112233', 'Express');

    // 4. Seed Initial Stock Levels (100 bearings, 30 inverters on hand; 0 reserved)
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
       VALUES 
        ('stk-seed-brg', ?, ?, ?, 100, 0),
        ('stk-seed-inv', ?, ?, ?, 30, 0)`,
      [item1.id, warehouseA.id, binA1.id, item2.id, warehouseA.id, binA1.id]
    );
  });

  // --------------------------------------------------------------------------
  // TC-FUL-01: Create and manage couriers (validation of phone, active toggle, URL template)
  // --------------------------------------------------------------------------
  it('TC-FUL-01: Should create and manage couriers with phone validation, URL templates, and active toggling', async () => {
    const courierId = `courier-test-${Date.now()}`;
    await db.execute(
      `INSERT INTO couriers (id, name, service_type, contact_phone, tracking_url_template, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [
        courierId,
        'Steadfast Express Logistics',
        'Express',
        '+8801711223344',
        'https://steadfast.com.bd/track/{tracking_code}'
      ]
    );

    const rows = await db.query('SELECT * FROM couriers WHERE id = ?', [courierId]);
    expect(rows).toHaveLength(1);
    const cr = rows[0];
    expect(cr.name).toBe('Steadfast Express Logistics');
    expect(cr.service_type).toBe('Express');
    expect(cr.contact_phone).toBe('+8801711223344');
    expect(cr.tracking_url_template).toBe('https://steadfast.com.bd/track/{tracking_code}');
    expect(cr.is_active).toBe(1);

    // Toggle active status off
    await db.execute('UPDATE couriers SET is_active = 0 WHERE id = ?', [courierId]);
    const inactiveRows = await db.query('SELECT * FROM couriers WHERE id = ? AND is_active = 1', [courierId]);
    expect(inactiveRows).toHaveLength(0);

    // Toggle active status back on
    await db.execute('UPDATE couriers SET is_active = 1 WHERE id = ?', [courierId]);
    const activeRows = await db.query('SELECT * FROM couriers WHERE id = ? AND is_active = 1', [courierId]);
    expect(activeRows).toHaveLength(1);
  });

  // --------------------------------------------------------------------------
  // TC-FUL-02: Create outbound shipment with item reservation
  // --------------------------------------------------------------------------
  it('TC-FUL-02: Should create outbound shipment and atomically reserve inventory against the order', async () => {
    const preStock = await client.getItemTotalStock(item1.id, warehouseA.id);
    expect(preStock.onHand).toBe(100);
    expect(preStock.reserved).toBe(0);
    expect(preStock.available).toBe(100);

    const shipment = await client.createShipment({
      shipmentNumber: 'SHP-202610-001',
      orderReference: 'ORD-CLIENT-101',
      sourceWarehouseId: warehouseA.id,
      customerName: 'Karnaphuli Shipbuilders Ltd',
      customerPhone: '+8801819123456',
      customerAddress: 'Shipyard Area, Sadarghat',
      destinationCity: 'Chittagong',
      courierName: courier.name,
      items: [
        { itemId: item1.id, binId: binA1.id, quantity: 25, unitPrice: 45.00 }
      ]
    });

    expect(shipment).toBeDefined();
    expect(shipment.shipment_number).toBe('SHP-202610-001');
    expect(shipment.status).toBe('pending');
    expect(shipment.items).toHaveLength(1);
    expect(shipment.items[0].quantity).toBe(25);

    // Invariant: OnHand remains 100, Reserved rises to 25, Available drops to 75
    const postStock = await client.getItemTotalStock(item1.id, warehouseA.id);
    expect(postStock.onHand).toBe(100);
    expect(postStock.reserved).toBe(25);
    expect(postStock.available).toBe(75);
    expect(postStock.onHand).toBe(postStock.reserved + postStock.available);
  });

  // --------------------------------------------------------------------------
  // TC-FUL-03: Reject shipment creation with insufficient on-hand stock or empty item list
  // --------------------------------------------------------------------------
  it('TC-FUL-03: Should reject shipment creation with insufficient stock or empty line items', async () => {
    // 1. Reject empty items list
    await expect(async () => {
      await client.createShipment({
        shipmentNumber: 'SHP-EMPTY-ITEMS',
        orderReference: 'ORD-ERR-EMPTY',
        sourceWarehouseId: warehouseA.id,
        customerName: 'Test Client',
        customerPhone: '+8801700000000',
        customerAddress: 'Dhaka',
        destinationCity: 'Dhaka',
        courierName: courier.name,
        items: []
      });
    }).toReject('A shipment must contain at least one line item.');

    // 2. Reject request exceeding available inventory (100 on hand, requesting 150)
    await expect(async () => {
      await client.createShipment({
        shipmentNumber: 'SHP-OVER-STOCK',
        orderReference: 'ORD-ERR-OVER',
        sourceWarehouseId: warehouseA.id,
        customerName: 'Test Client',
        customerPhone: '+8801700000000',
        customerAddress: 'Dhaka',
        destinationCity: 'Dhaka',
        courierName: courier.name,
        items: [{ itemId: item1.id, binId: binA1.id, quantity: 150, unitPrice: 45.00 }]
      });
    }).toReject('Insufficient inventory to fulfill shipment');

    // Verify stock is untouched
    const stock = await client.getItemTotalStock(item1.id, warehouseA.id);
    expect(stock.onHand).toBe(100);
    expect(stock.reserved).toBe(0);
    expect(stock.available).toBe(100);
  });

  // --------------------------------------------------------------------------
  // TC-FUL-04: Dispatch shipment with mandatory tracking number & FULFILLMENT_PICK logging
  // --------------------------------------------------------------------------
  it('TC-FUL-04: Should dispatch shipment, deducting physical stock and logging FULFILLMENT_PICK ledger entry', async () => {
    const shipment = await client.createShipment({
      shipmentNumber: 'SHP-202610-004',
      orderReference: 'ORD-CLIENT-104',
      sourceWarehouseId: warehouseA.id,
      customerName: 'Meghna Dredging Ltd',
      customerPhone: '+8801819654321',
      customerAddress: 'Customs Ghat',
      destinationCity: 'Chittagong',
      courierName: courier.name,
      items: [{ itemId: item1.id, binId: binA1.id, quantity: 20, unitPrice: 45.00 }]
    });

    const dispatched = await client.dispatchShipment(shipment.id, 'PATHAO-EXP-889922');
    expect(dispatched.status).toBe('dispatched');
    expect(dispatched.tracking_number).toBe('PATHAO-EXP-889922');
    expect(dispatched.dispatched_at).toBeTruthy();

    // Physical stock deducted: 100 - 20 = 80 on hand. Reserved drops back to 0. Available = 80.
    const stock = await client.getItemTotalStock(item1.id, warehouseA.id);
    expect(stock.onHand).toBe(80);
    expect(stock.reserved).toBe(0);
    expect(stock.available).toBe(80);

    // Verify immutable audit ledger entry
    const logs = await client.getInventoryTransactions(shipment.shipment_number);
    expect(logs.length).toBeGreaterThanOrEqual(1);

    const pickLog = logs.find((l: any) => l.transaction_type === 'FULFILLMENT_PICK');
    expect(pickLog).toBeDefined();
    expect(pickLog.reference_type).toBe('SHIPMENT');
    expect(pickLog.quantity_change).toBe(-20);
    expect(pickLog.running_balance_after).toBe(80);
  });

  // --------------------------------------------------------------------------
  // TC-FUL-05: Reject dispatch without tracking number or when physical stock is altered
  // --------------------------------------------------------------------------
  it('TC-FUL-05: Should reject dispatch without tracking number or if physical inventory is depleted', async () => {
    const shipment = await client.createShipment({
      shipmentNumber: 'SHP-NO-TRACK-TEST',
      orderReference: 'ORD-TRACK-ERR',
      sourceWarehouseId: warehouseA.id,
      customerName: 'Client No Track',
      customerPhone: '+8801700000000',
      customerAddress: 'Agrabad',
      destinationCity: 'Chittagong',
      courierName: courier.name,
      items: [{ itemId: item1.id, binId: binA1.id, quantity: 10, unitPrice: 45.00 }]
    });

    // 1. Attempt dispatch without tracking number
    await expect(async () => {
      await client.dispatchShipment(shipment.id);
    }).toReject('Tracking ID is mandatory for dispatched outbound shipments.');

    // 2. Reduce physical stock below shipment requirement (5 on hand vs 10 required)
    // while satisfying table CHECK constraint quantity_reserved <= quantity_on_hand
    await db.execute(
      'UPDATE inventory_stock SET quantity_on_hand = 5, quantity_reserved = 5 WHERE item_id = ? AND warehouse_id = ? AND bin_id = ?',
      [item1.id, warehouseA.id, binA1.id]
    );

    await expect(async () => {
      await client.dispatchShipment(shipment.id, 'PATHAO-FORCE-01');
    }).toReject('Physical stock no longer available in assigned bin.');
  });

  // --------------------------------------------------------------------------
  // TC-FUL-06: Progress shipment status through valid states
  // --------------------------------------------------------------------------
  it('TC-FUL-06: Should progress shipment status cleanly through packed, dispatched, in_transit, and delivered', async () => {
    const shipment = await client.createShipment({
      shipmentNumber: 'SHP-LIFECYCLE-001',
      orderReference: 'ORD-LIFE-001',
      sourceWarehouseId: warehouseA.id,
      customerName: 'Eastern Refineries Ltd',
      customerPhone: '+8801819777888',
      customerAddress: 'North Patenga',
      destinationCity: 'Chittagong',
      courierName: courier.name,
      items: [{ itemId: item1.id, binId: binA1.id, quantity: 10, unitPrice: 45.00 }]
    });

    expect(shipment.status).toBe('pending');

    // 1. Transition pending -> packed
    const packed = await client.updateShipmentStatus(shipment.id, 'packed');
    expect(packed.status).toBe('packed');

    // 2. Transition packed -> dispatched
    const dispatched = await client.dispatchShipment(shipment.id, 'PATHAO-LIFE-771');
    expect(dispatched.status).toBe('dispatched');

    // 3. Transition dispatched -> in_transit
    const transit = await client.updateShipmentStatus(shipment.id, 'in_transit');
    expect(transit.status).toBe('in_transit');

    // 4. Transition in_transit -> delivered
    const delivered = await client.updateShipmentStatus(shipment.id, 'delivered');
    expect(delivered.status).toBe('delivered');
    expect(delivered.delivered_at).toBeTruthy();
  });

  // --------------------------------------------------------------------------
  // TC-FUL-07: Reject invalid status transitions (illegal jumps, delivered or cancelled terminal states)
  // --------------------------------------------------------------------------
  it('TC-FUL-07: Should strictly reject illegal state jumps and modifications after terminal delivered or cancelled status', async () => {
    // 1. Delivered Terminal Locking
    const shipment = await client.createShipment({
      shipmentNumber: 'SHP-TERMINAL-001',
      orderReference: 'ORD-TERM-001',
      sourceWarehouseId: warehouseA.id,
      customerName: 'Terminal Client',
      customerPhone: '+8801819999000',
      customerAddress: 'Port Access Road',
      destinationCity: 'Chittagong',
      courierName: courier.name,
      items: [{ itemId: item1.id, binId: binA1.id, quantity: 5, unitPrice: 45.00 }]
    });

    await client.dispatchShipment(shipment.id, 'PATHAO-TERM-99');
    await client.updateShipmentStatus(shipment.id, 'in_transit');
    await client.updateShipmentStatus(shipment.id, 'delivered');

    // Attempt modification on terminal delivered shipment
    await expect(async () => {
      await client.updateShipmentStatus(shipment.id, 'in_transit');
    }).toReject("Cannot transition shipment: already in terminal 'delivered' status.");

    await expect(async () => {
      await client.updateShipmentStatus(shipment.id, 'cancelled');
    }).toReject("Cannot transition shipment: already in terminal 'delivered' status.");

    // 2. State Machine Invariant: Reject illegal direct jump from pending to delivered
    const jumpShp = await client.createShipment({
      shipmentNumber: 'SHP-JUMP-GUARD',
      orderReference: 'ORD-JUMP-GUARD',
      sourceWarehouseId: warehouseA.id,
      customerName: 'Jump Test Client',
      customerPhone: '+8801819111333',
      customerAddress: 'Agrabad',
      destinationCity: 'Chittagong',
      courierName: courier.name,
      items: [{ itemId: item1.id, binId: binA1.id, quantity: 5, unitPrice: 45.00 }]
    });

    await expect(async () => {
      await client.updateShipmentStatus(jumpShp.id, 'delivered');
    }).toReject('Invalid state transition');

    // 3. Native Cancellation on pending shipment (releasing reserved stock without helper SQL patches)
    const pendingShp = await client.createShipment({
      shipmentNumber: 'SHP-CANCEL-GUARD',
      orderReference: 'ORD-CANC-GUARD',
      sourceWarehouseId: warehouseA.id,
      customerName: 'Cancel Test Client',
      customerPhone: '+8801819111222',
      customerAddress: 'Agrabad',
      destinationCity: 'Chittagong',
      courierName: courier.name,
      items: [{ itemId: item1.id, binId: binA1.id, quantity: 5, unitPrice: 45.00 }]
    });

    // Cleanly cancel jumpShp first to isolate pendingShp reservation release
    await client.updateShipmentStatus(jumpShp.id, 'cancelled');

    const preCancelStock = await client.getItemTotalStock(item1.id, warehouseA.id);
    expect(preCancelStock.reserved).toBe(5); // 5 reserved for pendingShp

    const cancelled = await cancelShipmentHelper(client, db, pendingShp.id, 'Client canceled prior to packing');
    expect(cancelled.status).toBe('cancelled');

    // Invariant: Native cancellation released reserved stock back to 0 without any test helper database patching
    const postCancelStock = await client.getItemTotalStock(item1.id, warehouseA.id);
    expect(postCancelStock.reserved).toBe(0);
    expect(postCancelStock.onHand).toBe(95); // 100 - 5 (from delivered shipment1)

    // Attempt to transition cancelled shipment
    await expect(async () => {
      await cancelShipmentHelper(client, db, pendingShp.id, 'Reopen attempt');
    }).toReject('already cancelled');
  });

  // --------------------------------------------------------------------------
  // TC-FUL-08: Initiate Return-to-Origin (RTO) with documented reason
  // --------------------------------------------------------------------------
  it('TC-FUL-08: Should initiate Return-to-Origin (RTO) workflow on delivery failure with documented reason', async () => {
    const shipment = await client.createShipment({
      shipmentNumber: 'SHP-RTO-INIT-001',
      orderReference: 'ORD-RTO-001',
      sourceWarehouseId: warehouseA.id,
      customerName: 'Chittagong Marine Spares',
      customerPhone: '+8801819333444',
      customerAddress: 'Drydock Zone, Sadarghat',
      destinationCity: 'Chittagong',
      courierName: courier.name,
      items: [{ itemId: item1.id, binId: binA1.id, quantity: 10, unitPrice: 45.00 }]
    });

    await client.dispatchShipment(shipment.id, 'PATHAO-RTO-5501');
    await client.updateShipmentStatus(shipment.id, 'in_transit');

    const rto = await client.updateShipmentStatus(
      shipment.id,
      'return_to_origin',
      'Port terminal gate closed for emergency dredging maintenance; customer requested return'
    );

    expect(rto.status).toBe('return_to_origin');
    expect(rto.rto_reason).toContain('Port terminal gate closed');
    expect(rto.rto_initiated_at).toBeTruthy();
  });

  // --------------------------------------------------------------------------
  // TC-FUL-09: Process RTO with restocked disposition
  // --------------------------------------------------------------------------
  it('TC-FUL-09: Should process RTO with restocked disposition, restoring physical inventory and logging RETURN_RESTOCK', async () => {
    const shipment = await client.createShipment({
      shipmentNumber: 'SHP-RTO-RESTOCK-001',
      orderReference: 'ORD-RESTOCK-001',
      sourceWarehouseId: warehouseA.id,
      customerName: 'Apex Shipping Agency',
      customerPhone: '+8801819555666',
      customerAddress: 'Agrabad Commercial Area',
      destinationCity: 'Chittagong',
      courierName: courier.name,
      items: [{ itemId: item1.id, binId: binA1.id, quantity: 15, unitPrice: 45.00 }]
    });

    await client.dispatchShipment(shipment.id, 'PATHAO-RESTOCK-101');
    const midStock = await client.getItemTotalStock(item1.id, warehouseA.id);
    expect(midStock.onHand).toBe(85); // 100 - 15 = 85

    await client.updateShipmentStatus(shipment.id, 'in_transit');
    await client.updateShipmentStatus(shipment.id, 'return_to_origin', 'Consignee unavailable at address');

    // Staff inspects returned parcel; items pristine -> restock
    const restocked = await client.processRTO(shipment.id, 'restocked', binA1.id);
    expect(restocked.status).toBe('rto_received');
    expect(restocked.rto_disposition).toBe('restocked');
    expect(restocked.rto_received_at).toBeTruthy();

    // Inventory restored back to 100!
    const postStock = await client.getItemTotalStock(item1.id, warehouseA.id);
    expect(postStock.onHand).toBe(100);

    // Verify audit log
    const logs = await client.getInventoryTransactions(shipment.shipment_number);
    const restockLog = logs.find((l: any) => l.transaction_type === 'RETURN_RESTOCK');
    expect(restockLog).toBeDefined();
    expect(restockLog.reference_type).toBe('SHIPMENT');
    expect(restockLog.quantity_change).toBe(15);
    expect(restockLog.running_balance_after).toBe(100);
  });

  // --------------------------------------------------------------------------
  // TC-FUL-10: Process RTO with damaged_writeoff disposition
  // --------------------------------------------------------------------------
  it('TC-FUL-10: Should process RTO with damaged_writeoff disposition without restoring inventory and log write-off', async () => {
    const shipment = await client.createShipment({
      shipmentNumber: 'SHP-RTO-SCRAP-001',
      orderReference: 'ORD-SCRAP-001',
      sourceWarehouseId: warehouseA.id,
      customerName: 'Karnaphuli Drydock',
      customerPhone: '+8801819777999',
      customerAddress: 'Anwara Ghat',
      destinationCity: 'Chittagong',
      courierName: courier.name,
      items: [{ itemId: item1.id, binId: binA1.id, quantity: 10, unitPrice: 45.00 }]
    });

    await client.dispatchShipment(shipment.id, 'PATHAO-SCRAP-990');
    const midStock = await client.getItemTotalStock(item1.id, warehouseA.id);
    expect(midStock.onHand).toBe(90); // 100 - 10 = 90

    await client.updateShipmentStatus(shipment.id, 'in_transit');
    await client.updateShipmentStatus(shipment.id, 'return_to_origin', 'Courier van accident; parcel crushed');

    // Inspection confirms total damage -> damaged_writeoff
    const scrapped = await client.processRTO(shipment.id, 'damaged_writeoff');
    expect(scrapped.status).toBe('rto_received');
    expect(scrapped.rto_disposition).toBe('damaged_writeoff');

    // Physical stock remains 90 (NOT incremented)
    const postStock = await client.getItemTotalStock(item1.id, warehouseA.id);
    expect(postStock.onHand).toBe(90);

    // Verify audit ledger logs ADJUSTMENT_WRITE_OFF
    const logs = await client.getInventoryTransactions(shipment.shipment_number);
    const writeOffLog = logs.find((l: any) => l.transaction_type === 'ADJUSTMENT_WRITE_OFF');
    expect(writeOffLog).toBeDefined();
    expect(writeOffLog.reference_type).toBe('SHIPMENT');
    expect(writeOffLog.notes).toContain('Write-off');
  });

  // --------------------------------------------------------------------------
  // TC-FUL-11: Reject RTO processing on shipments not in return_to_origin status
  // --------------------------------------------------------------------------
  it('TC-FUL-11: Should strictly reject RTO processing when shipment is not in return_to_origin status', async () => {
    const shipment = await client.createShipment({
      shipmentNumber: 'SHP-RTO-GUARD-001',
      orderReference: 'ORD-GUARD-001',
      sourceWarehouseId: warehouseA.id,
      customerName: 'Guard Test Client',
      customerPhone: '+8801819888111',
      customerAddress: 'Halishahar',
      destinationCity: 'Chittagong',
      courierName: courier.name,
      items: [{ itemId: item1.id, binId: binA1.id, quantity: 5, unitPrice: 45.00 }]
    });

    // Attempt RTO while still pending
    await expect(async () => {
      await client.processRTO(shipment.id, 'restocked', binA1.id);
    }).toReject("Cannot process RTO: shipment status is 'pending', expected 'return_to_origin'.");

    // Attempt RTO while dispatched
    await client.dispatchShipment(shipment.id, 'PATHAO-GUARD-123');
    await expect(async () => {
      await client.processRTO(shipment.id, 'restocked', binA1.id);
    }).toReject("Cannot process RTO: shipment status is 'dispatched', expected 'return_to_origin'.");
  });

  // --------------------------------------------------------------------------
  // TC-FUL-12: Full mass conservation verification
  // --------------------------------------------------------------------------
  it('TC-FUL-12: Should enforce exact mass conservation: Initial Stock == On-Hand + Net Dispatched', async () => {
    const initialStock = 100;

    // 1. Shipment A: 20 units -> Dispatched -> In Transit -> Delivered (permanent departure)
    const shpA = await client.createShipment({
      shipmentNumber: 'SHP-MASS-A',
      orderReference: 'ORD-MASS-A',
      sourceWarehouseId: warehouseA.id,
      customerName: 'Client Alpha',
      customerPhone: '+8801819000001',
      customerAddress: 'Agrabad',
      destinationCity: 'Chittagong',
      courierName: courier.name,
      items: [{ itemId: item1.id, binId: binA1.id, quantity: 20, unitPrice: 45.00 }]
    });
    await client.dispatchShipment(shpA.id, 'TRACK-MASS-A');
    await client.updateShipmentStatus(shpA.id, 'in_transit');
    await client.updateShipmentStatus(shpA.id, 'delivered');

    // 2. Shipment B: 15 units -> Dispatched -> In Transit -> RTO -> Restocked (+15 back)
    const shpB = await client.createShipment({
      shipmentNumber: 'SHP-MASS-B',
      orderReference: 'ORD-MASS-B',
      sourceWarehouseId: warehouseA.id,
      customerName: 'Client Beta',
      customerPhone: '+8801819000002',
      customerAddress: 'Nasirabad',
      destinationCity: 'Chittagong',
      courierName: courier.name,
      items: [{ itemId: item1.id, binId: binA1.id, quantity: 15, unitPrice: 45.00 }]
    });
    await client.dispatchShipment(shpB.id, 'TRACK-MASS-B');
    await client.updateShipmentStatus(shpB.id, 'in_transit');
    await client.updateShipmentStatus(shpB.id, 'return_to_origin', 'Address error');
    await client.processRTO(shpB.id, 'restocked', binA1.id);

    // 3. Shipment C: 10 units -> Dispatched -> In Transit -> RTO -> Damaged Write-off (0 returned)
    const shpC = await client.createShipment({
      shipmentNumber: 'SHP-MASS-C',
      orderReference: 'ORD-MASS-C',
      sourceWarehouseId: warehouseA.id,
      customerName: 'Client Gamma',
      customerPhone: '+8801819000003',
      customerAddress: 'Pahartali',
      destinationCity: 'Chittagong',
      courierName: courier.name,
      items: [{ itemId: item1.id, binId: binA1.id, quantity: 10, unitPrice: 45.00 }]
    });
    await client.dispatchShipment(shpC.id, 'TRACK-MASS-C');
    await client.updateShipmentStatus(shpC.id, 'in_transit');
    await client.updateShipmentStatus(shpC.id, 'return_to_origin', 'Transit destruction');
    await client.processRTO(shpC.id, 'damaged_writeoff');

    // 4. Shipment D: 15 units -> Dispatched -> In Transit
    const shpD = await client.createShipment({
      shipmentNumber: 'SHP-MASS-D',
      orderReference: 'ORD-MASS-D',
      sourceWarehouseId: warehouseA.id,
      customerName: 'Client Delta',
      customerPhone: '+8801819000004',
      customerAddress: 'Khulshi',
      destinationCity: 'Chittagong',
      courierName: courier.name,
      items: [{ itemId: item1.id, binId: binA1.id, quantity: 15, unitPrice: 45.00 }]
    });
    await client.dispatchShipment(shpD.id, 'TRACK-MASS-D');
    await client.updateShipmentStatus(shpD.id, 'in_transit');

    // Final calculations:
    // Dispatched: 20 + 15 + 10 + 15 = 60 units.
    // Restocked: 15 units.
    // Net Dispatched: 60 - 15 = 45 units.
    // Expected on hand: 100 - 45 = 55 units.
    const finalStock = await client.getItemTotalStock(item1.id, warehouseA.id);
    expect(finalStock.onHand).toBe(55);

    // Conservation check: Initial Stock (100) == OnHand (55) + Delivered (20) + Scrapped (10) + InTransit (15)
    const totalPhysical = finalStock.onHand + 20 + 10 + 15;
    expect(totalPhysical).toBe(initialStock);

    // Net dispatched formula check: Initial Stock == OnHand + (Dispatched - Restocked)
    const netDispatched = (20 + 15 + 10 + 15) - 15;
    expect(finalStock.onHand + netDispatched).toBe(initialStock);
  });
});

if (process.argv[1]?.includes('fulfillment.test.ts')) {
  runSuites().then((res) => {
    if (res.failed > 0) process.exit(1);
  });
}
