import { DatabaseService } from '../../src/services/db.ts';
import { ERPTestClient } from '../harness/erp-test-client.ts';
import { FulfillmentService } from '../../src/services/fulfillmentService.ts';

async function runAdversarialTests() {
  console.log('=== EMPIRICAL ADVERSARIAL STRESS TEST: MILESTONE 4 INVARIANTS ===\n');

  const db = new DatabaseService(':memory:');
  await db.initialize();
  const client = new ERPTestClient(db);
  const fs = FulfillmentService.getInstance();

  const wh = await client.createWarehouse({
    warehouseCode: 'WH-ADV-1',
    name: 'Adversarial Test Warehouse',
    address: 'Adversarial Rd',
    city: 'Chittagong',
    isDefault: true
  });

  const bin = await client.createLocation({
    warehouseId: wh.id,
    zone: 'Zone Z',
    aisle: 'A1',
    rack: 'R1',
    shelf: 'S1',
    binCode: 'ADV-B1'
  });

  const item = await client.createItem({
    sku: 'SKU-ADV-01',
    name: 'Adversarial Test Item',
    category: 'Mechanical',
    costPrice: 50,
    sellingPrice: 100
  });

  const courier = await client.createCourier('AdvCourier', '+8801999999999', 'Express');

  // Seed initial stock: 100 on hand, 0 reserved
  await db.execute(
    'INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved) VALUES (?, ?, ?, ?, 100, 0)',
    ['stk-adv-1', item.id, wh.id, bin.id]
  );

  let concurrencyBugsFound = 0;

  // -------------------------------------------------------------------------
  // TEST 1: Concurrent Dispatch on Same Shipment
  // -------------------------------------------------------------------------
  console.log('1. Testing In-Transaction Status Validation on Concurrent Dispatch...');
  const shp = await client.createShipment({
    shipmentNumber: 'SHP-CONC-001',
    orderReference: 'ORD-CONC-1',
    sourceWarehouseId: wh.id,
    customerName: 'Concurrent Buyer',
    customerPhone: '+8801700000001',
    customerAddress: 'Port Area',
    destinationCity: 'Chittagong',
    courierName: courier.name,
    items: [{ itemId: item.id, binId: bin.id, quantity: 20, unitPrice: 100 }]
  });

  const preDispatchStock = await client.getItemTotalStock(item.id, wh.id);
  console.log('   Stock before dispatch:', preDispatchStock);

  // Dispatch 1 and Dispatch 2 started concurrently
  const [disp1, disp2] = await Promise.allSettled([
    fs.dispatchShipment(shp.id, 'TRK-CONC-1', 'user1', db),
    fs.dispatchShipment(shp.id, 'TRK-CONC-2', 'user2', db)
  ]);

  const stockAfterDisp = await client.getItemTotalStock(item.id, wh.id);
  const txLogs = await client.getInventoryTransactions(shp.shipment_number);
  const pickCount = txLogs.filter(t => t.transaction_type === 'FULFILLMENT_PICK').length;

  console.log('   Dispatch 1 status:', disp1.status);
  console.log('   Dispatch 2 status:', disp2.status);
  console.log('   Stock after concurrent dispatch:', stockAfterDisp);
  console.log('   FULFILLMENT_PICK transactions count:', pickCount);

  if (disp1.status === 'fulfilled' && disp2.status === 'fulfilled') {
    concurrencyBugsFound++;
    console.error('   ❌ [DEFECT CONFIRMED]: dispatchShipment lacks in-transaction status validation!');
    console.error(`      Both concurrent dispatch calls succeeded. Stock dropped by 40 units (100 -> ${stockAfterDisp.onHand}) instead of 20 units!`);
    console.error(`      ${pickCount} FULFILLMENT_PICK audit records created for a single 20-unit shipment.`);
  } else {
    console.log('   ✅ Concurrent dispatch properly rejected second caller.');
  }

  // -------------------------------------------------------------------------
  // TEST 2: Concurrent RTO Restock on Same Shipment
  // -------------------------------------------------------------------------
  console.log('\n2. Testing In-Transaction Status Validation on Concurrent RTO Restock...');
  const shpRto = await client.createShipment({
    shipmentNumber: 'SHP-CONC-RTO',
    orderReference: 'ORD-CONC-2',
    sourceWarehouseId: wh.id,
    customerName: 'RTO Buyer',
    customerPhone: '+8801700000002',
    customerAddress: 'Port Area',
    destinationCity: 'Chittagong',
    courierName: courier.name,
    items: [{ itemId: item.id, binId: bin.id, quantity: 15, unitPrice: 100 }]
  });

  await fs.dispatchShipment(shpRto.id, 'TRK-RTO-1', 'system', db);
  await fs.updateShipmentStatus(shpRto.id, 'in_transit', undefined, 'system', db);
  await fs.updateShipmentStatus(shpRto.id, 'return_to_origin', 'Address unknown', 'system', db);

  const stockBeforeRto = await client.getItemTotalStock(item.id, wh.id);
  console.log('   Stock before RTO restock:', stockBeforeRto);

  const [rto1, rto2] = await Promise.allSettled([
    fs.processRTO(shpRto.id, 'restocked', bin.id, 'user1', db),
    fs.processRTO(shpRto.id, 'restocked', bin.id, 'user2', db)
  ]);

  const stockAfterRto = await client.getItemTotalStock(item.id, wh.id);
  const rtoLogs = await client.getInventoryTransactions(shpRto.shipment_number);
  const restockCount = rtoLogs.filter(t => t.transaction_type === 'RETURN_RESTOCK').length;

  console.log('   RTO 1 status:', rto1.status);
  console.log('   RTO 2 status:', rto2.status);
  console.log('   Stock after concurrent RTO:', stockAfterRto);
  console.log('   RETURN_RESTOCK transactions count:', restockCount);

  if (rto1.status === 'fulfilled' && rto2.status === 'fulfilled') {
    concurrencyBugsFound++;
    console.error('   ❌ [DEFECT CONFIRMED]: processRTO lacks in-transaction status validation!');
    console.error(`      Both concurrent RTO calls succeeded. Stock increased by 30 units (${stockBeforeRto.onHand} -> ${stockAfterRto.onHand}) instead of 15 units!`);
    console.error(`      ${restockCount} RETURN_RESTOCK audit records created for a single 15-unit shipment (phantom inventory created out of thin air).`);
  } else {
    console.log('   ✅ Concurrent RTO properly rejected second caller.');
  }

  // -------------------------------------------------------------------------
  // TEST 3: Terminal Status Locking
  // -------------------------------------------------------------------------
  console.log('\n3. Testing Terminal Status Guards...');
  const shpTerm = await client.createShipment({
    shipmentNumber: 'SHP-TERM-001',
    orderReference: 'ORD-TERM-1',
    sourceWarehouseId: wh.id,
    customerName: 'Terminal Buyer',
    customerPhone: '+8801700000003',
    customerAddress: 'Port Area',
    destinationCity: 'Chittagong',
    courierName: courier.name,
    items: [{ itemId: item.id, binId: bin.id, quantity: 5, unitPrice: 100 }]
  });

  await fs.dispatchShipment(shpTerm.id, 'TRK-TERM-1', 'system', db);
  await fs.updateShipmentStatus(shpTerm.id, 'in_transit', undefined, 'system', db);
  await fs.updateShipmentStatus(shpTerm.id, 'delivered', undefined, 'system', db);

  try {
    await fs.updateShipmentStatus(shpTerm.id, 'dispatched', undefined, 'system', db);
    console.error('   ❌ Allowed edit on delivered shipment!');
  } catch (err: any) {
    console.log('   ✅ Blocked edit on delivered shipment:', err.message);
  }

  try {
    await fs.dispatchShipment(shpTerm.id, 'TRK-AGAIN', 'system', db);
    console.error('   ❌ Allowed dispatch on delivered shipment!');
  } catch (err: any) {
    console.log('   ✅ Blocked dispatch on delivered shipment:', err.message);
  }

  try {
    await fs.processRTO(shpTerm.id, 'restocked', bin.id, 'system', db);
    console.error('   ❌ Allowed RTO on delivered shipment!');
  } catch (err: any) {
    console.log('   ✅ Blocked RTO on delivered shipment:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 4: Direct Cancellation (No Test Helper)
  // -------------------------------------------------------------------------
  console.log('\n4. Testing Direct Cancellation Reservation Release (without test helpers)...');
  const shpCancel = await client.createShipment({
    shipmentNumber: 'SHP-DIR-CANCEL',
    orderReference: 'ORD-DIR-CANCEL',
    sourceWarehouseId: wh.id,
    customerName: 'Cancel Buyer',
    customerPhone: '+8801700000005',
    customerAddress: 'Port Area',
    destinationCity: 'Chittagong',
    courierName: courier.name,
    items: [{ itemId: item.id, binId: bin.id, quantity: 10, unitPrice: 100 }]
  });

  const stockBeforeCancel = await client.getItemTotalStock(item.id, wh.id);
  await fs.updateShipmentStatus(shpCancel.id, 'cancelled', 'User direct cancel', 'system', db);
  const stockAfterCancel = await client.getItemTotalStock(item.id, wh.id);

  if (stockAfterCancel.reserved !== stockBeforeCancel.reserved - 10) {
    console.error('   ❌ Cancellation failed to release reserved stock!');
  } else {
    console.log('   ✅ Direct cancellation released reserved stock properly.');
  }

  console.log(`\n=== ADVERSARIAL STRESS TEST SUMMARY: ${concurrencyBugsFound} CONCURRENCY DEFECTS IDENTIFIED ===`);
  if (concurrencyBugsFound > 0) {
    process.exit(1);
  }
}

runAdversarialTests().catch(console.error);
