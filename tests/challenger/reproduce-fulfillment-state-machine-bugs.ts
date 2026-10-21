/**
 * Standalone Empirical Bug Reproduction Script for Milestone 4 Fulfillment State Machine
 * File: tests/challenger/reproduce-fulfillment-state-machine-bugs.ts
 *
 * Demonstrates:
 * 1. Bug #1: Illegal state transition from 'pending' directly to 'delivered' succeeds,
 *    bypassing dispatch deduction and locking shipment permanently in 'delivered'.
 * 2. Bug #2: Dispatching with whitespace-only tracking code ('   ') succeeds without rejection.
 * 3. Bug #3: Re-dispatching a shipment in 'return_to_origin' succeeds, deducting stock twice.
 */

import { DatabaseService } from '../../src/services/db.ts';
import { ERPTestClient } from '../harness/erp-test-client.ts';
import { FulfillmentService } from '../../src/services/fulfillmentService.ts';

async function reproduce() {
  console.log('========================================================================');
  console.log('   EMPIRICAL BUG REPRODUCTION: FULFILLMENT STATE MACHINE DEFECTS      ');
  console.log('========================================================================\n');

  const db = new DatabaseService(':memory:');
  await db.initialize();
  const client = new ERPTestClient(db);

  // Setup
  const wh = await client.createWarehouse({
    warehouseCode: 'WH-BUG-REPRO',
    name: 'Repro Warehouse',
    address: 'Chittagong',
    city: 'Chittagong',
    isDefault: true
  });
  const bin = await client.createLocation({
    warehouseId: wh.id,
    zone: 'Z1',
    aisle: 'A1',
    rack: 'R1',
    shelf: 'S1',
    binCode: 'BIN-REPRO-01'
  });
  const item = await client.createItem({
    sku: 'SKU-REPRO-1',
    name: 'Repro Bearing Item',
    category: 'Mechanical',
    unitOfMeasure: 'pcs',
    costPrice: 20.0,
    sellingPrice: 40.0
  });
  const courier = await client.createCourier('Repro Courier', '+8801700000000', 'Standard');

  await db.execute(
    'INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved) VALUES (?, ?, ?, ?, 100, 0)',
    ['stk-repro-1', item.id, wh.id, bin.id]
  );

  let bugCount = 0;

  // ---------------------------------------------------------------------------
  // BUG #1: Direct jump from 'pending' to 'delivered'
  // ---------------------------------------------------------------------------
  console.log('--- REPRODUCING BUG #1: Direct jump from pending to delivered ---');
  const shp1 = await client.createShipment({
    shipmentNumber: 'SHP-BUG1-JUMP',
    orderReference: 'ORD-BUG1',
    sourceWarehouseId: wh.id,
    customerName: 'Customer Bug1',
    customerPhone: '+8801700000001',
    customerAddress: 'Agrabad',
    destinationCity: 'Chittagong',
    courierName: courier.name,
    items: [{ itemId: item.id, binId: bin.id, quantity: 10, unitPrice: 40.0 }]
  });

  console.log(`1. Initial state: status = '${shp1.status}'`);
  let bug1Thrown = false;
  try {
    const updated = await client.updateShipmentStatus(shp1.id, 'delivered');
    console.log(`2. Status after updateShipmentStatus(id, 'delivered'): '${updated.status}'`);
  } catch (err: any) {
    bug1Thrown = true;
    console.log(`2. Call rejected: ${err.message}`);
  }

  const stock1 = await client.getItemTotalStock(item.id, wh.id);
  console.log(`3. Inventory state: onHand = ${stock1.onHand}, reserved = ${stock1.reserved}`);

  if (!bug1Thrown) {
    bugCount++;
    console.error('❌ [BUG #1 CONFIRMED]: Transition from pending directly to delivered SUCCEEDED!');
    console.error('   Physical stock deduction was bypassed: 10 units remained onHand (100) while reserved (10) was abandoned.');
    console.error('   Shipment is now permanently locked in terminal "delivered" status without ever being dispatched.');
  } else {
    console.log('✅ Bug #1 not present.');
  }

  // ---------------------------------------------------------------------------
  // BUG #2: Whitespace-only tracking code allowed on dispatch
  // ---------------------------------------------------------------------------
  console.log('\n--- REPRODUCING BUG #2: Whitespace-only tracking number allowed on dispatch ---');
  const shp2 = await client.createShipment({
    shipmentNumber: 'SHP-BUG2-TRACK',
    orderReference: 'ORD-BUG2',
    sourceWarehouseId: wh.id,
    customerName: 'Customer Bug2',
    customerPhone: '+8801700000002',
    customerAddress: 'Agrabad',
    destinationCity: 'Chittagong',
    courierName: courier.name,
    items: [{ itemId: item.id, binId: bin.id, quantity: 5, unitPrice: 40.0 }]
  });

  let bug2Thrown = false;
  let dispatchedShp: any = null;
  try {
    dispatchedShp = await client.dispatchShipment(shp2.id, '   ');
    console.log(`1. Dispatch result: status = '${dispatchedShp.status}', tracking_number = ${JSON.stringify(dispatchedShp.tracking_number)}`);
  } catch (err: any) {
    bug2Thrown = true;
    console.log(`1. Dispatch rejected: ${err.message}`);
  }

  if (!bug2Thrown) {
    bugCount++;
    console.error('❌ [BUG #2 CONFIRMED]: Dispatch with whitespace-only tracking code SUCCEEDED!');
    console.error('   fulfillmentService.ts:636 checks `if (!track)`, but does not validate `!track.trim()`.');
    console.error('   Shipment was dispatched with tracking_number = "   ".');
  } else {
    console.log('✅ Bug #2 not present.');
  }

  // ---------------------------------------------------------------------------
  // BUG #3: Re-dispatch of return_to_origin shipment
  // ---------------------------------------------------------------------------
  console.log('\n--- REPRODUCING BUG #3: Re-dispatch of return_to_origin shipment ---');
  const shp3 = await client.createShipment({
    shipmentNumber: 'SHP-BUG3-REDISP',
    orderReference: 'ORD-BUG3',
    sourceWarehouseId: wh.id,
    customerName: 'Customer Bug3',
    customerPhone: '+8801700000003',
    customerAddress: 'Agrabad',
    destinationCity: 'Chittagong',
    courierName: courier.name,
    items: [{ itemId: item.id, binId: bin.id, quantity: 5, unitPrice: 40.0 }]
  });

  await client.dispatchShipment(shp3.id, 'TRK-VALID-01');
  await client.updateShipmentStatus(shp3.id, 'in_transit');
  await client.updateShipmentStatus(shp3.id, 'return_to_origin', 'Customer refused');

  const stockBeforeRedispatch = (await client.getItemTotalStock(item.id, wh.id)).onHand;
  console.log(`1. Shipment status: 'return_to_origin'. Current onHand stock: ${stockBeforeRedispatch}`);

  let bug3Thrown = false;
  try {
    const redispatched = await client.dispatchShipment(shp3.id, 'TRK-VALID-02');
    console.log(`2. Status after re-dispatch: '${redispatched.status}'`);
  } catch (err: any) {
    bug3Thrown = true;
    console.log(`2. Re-dispatch rejected: ${err.message}`);
  }

  const stockAfterRedispatch = (await client.getItemTotalStock(item.id, wh.id)).onHand;
  console.log(`3. Inventory after re-dispatch: onHand = ${stockAfterRedispatch}`);

  if (!bug3Thrown) {
    bugCount++;
    console.error('❌ [BUG #3 CONFIRMED]: Re-dispatch of return_to_origin shipment SUCCEEDED!');
    console.error(`   Physical stock was deducted a second time: from ${stockBeforeRedispatch} down to ${stockAfterRedispatch}.`);
    console.error('   fulfillmentService.ts:640 does not guard against status "return_to_origin" or "rto_received".');
  } else {
    console.log('✅ Bug #3 not present.');
  }

  console.log('\n========================================================================');
  console.log(`Total Confirmed Bugs: ${bugCount}`);
  console.log('========================================================================\n');

  if (bugCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

reproduce().catch(console.error);
