import { describe, it, expect, beforeEach, runSuites } from '../harness/test-runner.ts';
import { TestDatabaseService } from '../harness/test-db.ts';
import { ERPTestClient } from '../harness/erp-test-client.ts';

let db: TestDatabaseService;
let client: ERPTestClient;
let warehouse: any;
let bin: any;
let item: any;
let courier: any;

describe('Tier 1: Feature Coverage — Fulfillment, Couriers, Shipments & Return-to-Origin (RTO)', () => {
  beforeEach(async () => {
    db = new TestDatabaseService(':memory:');
    await db.initialize();
    client = new ERPTestClient(db);

    warehouse = await client.createWarehouse({
      warehouseCode: 'WH-FULFILLMENT',
      name: 'Fulfillment Center 1',
      address: 'Uttara Sector 1',
      city: 'Dhaka'
    });

    bin = await client.createLocation({
      warehouseId: warehouse.id,
      zone: 'Pack Zone',
      aisle: 'Aisle 1',
      rack: 'R1',
      shelf: 'S1',
      binCode: 'FC-BIN-01'
    });

    item = await client.createItem({
      sku: 'SKU-SMART-PLUG-16A',
      name: 'WiFi Smart Plug 16A',
      category: 'Smart Home',
      costPrice: 10.00,
      sellingPrice: 18.50
    });

    courier = await client.createCourier('Pathao Express', '+880961000000', 'Express');

    // Seed stock: 100 units on hand
    await db.execute(
      "INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved) VALUES ('stk-shp-seed', ?, ?, ?, 100, 0)",
      [item.id, warehouse.id, bin.id]
    );
  });

  it('TC1.25: Should create outbound shipment and atomically reserve inventory against the order', async () => {
    const shipment = await client.createShipment({
      shipmentNumber: 'SHP-202610-001',
      orderReference: 'ORD-CUST-8891',
      sourceWarehouseId: warehouse.id,
      customerName: 'Anisul Haque',
      customerPhone: '+8801715000001',
      customerAddress: 'House 12, Road 4, Banani',
      destinationCity: 'Dhaka',
      courierName: courier.name,
      items: [
        {
          itemId: item.id,
          binId: bin.id,
          quantity: 10,
          unitPrice: 18.50
        }
      ]
    });

    expect(shipment).toBeDefined();
    expect(shipment.shipment_number).toBe('SHP-202610-001');
    expect(shipment.status).toBe('pending');
    expect(shipment.items).toHaveLength(1);

    // Verify inventory reservation: OnHand = 100, Reserved = 10, Available = 90
    const stock = await client.getItemTotalStock(item.id, warehouse.id);
    expect(stock.onHand).toBe(100);
    expect(stock.reserved).toBe(10);
    expect(stock.available).toBe(90);
  });

  it('TC1.26: Should dispatch shipment, deducting physical stock and reserving counts atomically', async () => {
    const shipment = await client.createShipment({
      shipmentNumber: 'SHP-202610-002',
      orderReference: 'ORD-CUST-8892',
      sourceWarehouseId: warehouse.id,
      customerName: 'Taslima Begum',
      customerPhone: '+8801815000002',
      customerAddress: 'Nasirabad',
      destinationCity: 'Chittagong',
      courierName: courier.name,
      items: [{ itemId: item.id, binId: bin.id, quantity: 15, unitPrice: 18.50 }]
    });

    const dispatched = await client.dispatchShipment(shipment.id, 'PATHAO-TRACK-9901');
    expect(dispatched.status).toBe('dispatched');
    expect(dispatched.tracking_number).toBe('PATHAO-TRACK-9901');

    // Physical stock deducted: 100 - 15 = 85. Reserved released back to 0. Available = 85.
    const stock = await client.getItemTotalStock(item.id, warehouse.id);
    expect(stock.onHand).toBe(85);
    expect(stock.reserved).toBe(0);
    expect(stock.available).toBe(85);

    // Audit trail verification
    const auditLogs = await client.getInventoryTransactions(shipment.shipment_number);
    expect(auditLogs.length).toBe(1);
    expect(auditLogs[0].transaction_type).toBe('FULFILLMENT_PICK');
    expect(auditLogs[0].quantity_change).toBe(-15);
    expect(auditLogs[0].running_balance_after).toBe(85);
  });

  it('TC1.27: Should progress shipment through carrier stages (dispatched -> in_transit -> delivered)', async () => {
    const shipment = await client.createShipment({
      shipmentNumber: 'SHP-202610-003',
      orderReference: 'ORD-CUST-8893',
      sourceWarehouseId: warehouse.id,
      customerName: 'Farhana Sultana',
      customerPhone: '+8801915000003',
      customerAddress: 'Zindabazar',
      destinationCity: 'Sylhet',
      courierName: courier.name,
      trackingNumber: 'TRACK-SYL-001',
      items: [{ itemId: item.id, binId: bin.id, quantity: 5, unitPrice: 18.50 }]
    });

    await client.dispatchShipment(shipment.id);

    const s1 = await client.updateShipmentStatus(shipment.id, 'in_transit');
    expect(s1.status).toBe('in_transit');

    const s2 = await client.updateShipmentStatus(shipment.id, 'delivered');
    expect(s2.status).toBe('delivered');
    expect(s2.delivered_at).toBeTruthy();
  });

  it('TC1.28: Should enforce carrier tracking number requirement upon dispatch', async () => {
    const shipment = await client.createShipment({
      shipmentNumber: 'SHP-NO-TRACK',
      orderReference: 'ORD-ERR-1',
      sourceWarehouseId: warehouse.id,
      customerName: 'No Track Customer',
      customerPhone: '+8801700000099',
      customerAddress: 'Gulshan 2',
      destinationCity: 'Dhaka',
      courierName: courier.name,
      // No tracking number provided
      items: [{ itemId: item.id, binId: bin.id, quantity: 5, unitPrice: 18.50 }]
    });

    await expect(async () => {
      await client.dispatchShipment(shipment.id); // No tracking number!
    }).toReject('Tracking ID is mandatory for dispatched outbound shipments.');
  });

  it('TC1.29: Should initiate Return-to-Origin (RTO) workflow on delivery failure', async () => {
    const shipment = await client.createShipment({
      shipmentNumber: 'SHP-202610-RTO-1',
      orderReference: 'ORD-RTO-01',
      sourceWarehouseId: warehouse.id,
      customerName: 'Customer Absent',
      customerPhone: '+8801711000099',
      customerAddress: 'KDA Avenue',
      destinationCity: 'Khulna',
      courierName: courier.name,
      trackingNumber: 'TRACK-KHL-123',
      items: [{ itemId: item.id, binId: bin.id, quantity: 8, unitPrice: 18.50 }]
    });

    await client.dispatchShipment(shipment.id);
    await client.updateShipmentStatus(shipment.id, 'in_transit');

    // Customer unreachable
    const rtoShipment = await client.updateShipmentStatus(shipment.id, 'return_to_origin', 'Customer phone switched off after 3 attempts');
    expect(rtoShipment.status).toBe('return_to_origin');
    expect(rtoShipment.rto_reason).toBe('Customer phone switched off after 3 attempts');
    expect(rtoShipment.rto_initiated_at).toBeTruthy();
  });

  it('TC1.30: Should restock undamaged RTO parcels back into warehouse inventory and log return audit entry', async () => {
    const shipment = await client.createShipment({
      shipmentNumber: 'SHP-202610-RTO-RESTOCK',
      orderReference: 'ORD-RTO-RESTOCK',
      sourceWarehouseId: warehouse.id,
      customerName: 'Return Customer',
      customerPhone: '+8801711000088',
      customerAddress: 'Arambagh',
      destinationCity: 'Dhaka',
      courierName: courier.name,
      trackingNumber: 'TRACK-RESTOCK-88',
      items: [{ itemId: item.id, binId: bin.id, quantity: 20, unitPrice: 18.50 }]
    });

    await client.dispatchShipment(shipment.id);
    // Stock on hand drops from 100 to 80
    const stockAfterDispatch = await client.getItemTotalStock(item.id, warehouse.id);
    expect(stockAfterDispatch.onHand).toBe(80);

    // Mark RTO
    await client.updateShipmentStatus(shipment.id, 'return_to_origin', 'Customer refused delivery');

    // Process RTO as 'restocked'
    const processed = await client.processRTO(shipment.id, 'restocked', bin.id);
    expect(processed.status).toBe('rto_received');
    expect(processed.rto_disposition).toBe('restocked');

    // Stock on hand restored from 80 back to 100!
    const stockAfterRestock = await client.getItemTotalStock(item.id, warehouse.id);
    expect(stockAfterRestock.onHand).toBe(100);

    // Audit entry logged
    const logs = await client.getInventoryTransactions(shipment.shipment_number);
    const restockLog = logs.find((l: any) => l.transaction_type === 'RETURN_RESTOCK');
    expect(restockLog).toBeDefined();
    expect(restockLog.quantity_change).toBe(20);
    expect(restockLog.running_balance_after).toBe(100);
  });
});

if (process.argv[1]?.includes('shipments.test.ts')) {
  runSuites().then(res => {
    if (res.failed > 0) process.exit(1);
  });
}
