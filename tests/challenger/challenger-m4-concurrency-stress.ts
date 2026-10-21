/**
 * Extreme Concurrency Stress Probe for Milestone 4 (challenger_m4_it2_1)
 * File: tests/challenger/challenger-m4-concurrency-stress.ts
 */

import { DatabaseService } from '../../src/services/db.ts';
import { FulfillmentService } from '../../src/services/fulfillmentService.ts';

async function runHighConcurrencyStress() {
  console.log('=== CHALLENGER EMPIRICAL HIGH-CONCURRENCY STRESS PROBE ===\n');

  const db = new DatabaseService(':memory:');
  await db.initialize();
  const service = FulfillmentService.getInstance();

  // Setup seed data
  await db.execute(`
    INSERT INTO warehouses (id, warehouse_code, name, address, city, is_default, is_active)
    VALUES ('wh-stress', 'WH-STRESS', 'Stress Hub', 'Tejgaon', 'Dhaka', 1, 1);
  `);
  await db.execute(`
    INSERT INTO warehouse_locations (id, warehouse_id, zone, aisle, rack, shelf, bin_code, is_active)
    VALUES ('bin-stress', 'wh-stress', 'Z1', 'A1', 'R1', 'S1', 'BIN-STRESS-01', 1);
  `);
  await db.execute(`
    INSERT INTO items (id, sku, name, category, cost_price, selling_price, is_active)
    VALUES ('item-stress', 'SKU-STRESS-01', 'Stress Item', 'Testing', 10.0, 20.0, 1);
  `);
  await db.execute(`
    INSERT INTO couriers (id, name, service_type, contact_phone, is_active)
    VALUES ('cour-stress', 'StressExpress', 'Express', '+8801700000000', 1);
  `);

  // Initial stock: 100 on-hand, 0 reserved
  await db.execute(`
    INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
    VALUES ('stk-stress', 'item-stress', 'wh-stress', 'bin-stress', 100, 0);
  `);

  // -------------------------------------------------------------------------
  // TEST 1: 25 Parallel Simultaneous Un-Awaited dispatchShipment calls
  // -------------------------------------------------------------------------
  console.log('TEST 1: 25 Parallel Simultaneous Un-Awaited dispatchShipment calls...');
  const shipment1 = await service.createShipment(
    {
      shipmentNumber: 'SHP-STRESS-01',
      orderReference: 'ORD-STRESS-01',
      sourceWarehouseId: 'wh-stress',
      customerName: 'Stress Customer 1',
      customerPhone: '+8801700000000',
      customerAddress: 'Dhaka',
      destinationCity: 'Dhaka',
      courierId: 'cour-stress',
      courierName: 'StressExpress',
      items: [{ itemId: 'item-stress', binId: 'bin-stress', quantity: 15, unitPrice: 20.0 }]
    },
    db
  );

  // Stock before: 100 on-hand, 15 reserved
  const dispatchPromises = Array.from({ length: 25 }, (_, i) =>
    service.dispatchShipment(shipment1.id, `TRK-STRESS-${i}`, `user-${i}`, db)
  );

  const dispatchResults = await Promise.allSettled(dispatchPromises);
  const dispatchFulfilled = dispatchResults.filter((r) => r.status === 'fulfilled');
  const dispatchRejected = dispatchResults.filter((r) => r.status === 'rejected');

  const stock1 = (await db.query<any>('SELECT quantity_on_hand, quantity_reserved FROM inventory_stock WHERE id = ?', ['stk-stress']))[0];
  const ledgerPick = await db.query<any>(
    "SELECT * FROM inventory_transactions WHERE reference_id = ? AND transaction_type = 'FULFILLMENT_PICK'",
    [shipment1.shipment_number]
  );

  console.log(`- Dispatch Fulfilled: ${dispatchFulfilled.length}, Rejected: ${dispatchRejected.length}`);
  console.log(`- Stock: on_hand=${stock1.quantity_on_hand}, reserved=${stock1.quantity_reserved}`);
  console.log(`- FULFILLMENT_PICK transactions: ${ledgerPick.length}`);

  if (dispatchFulfilled.length !== 1 || dispatchRejected.length !== 24) {
    throw new Error(`TEST 1 FAILED: Expected exactly 1 dispatch fulfilled, 24 rejected. Got ${dispatchFulfilled.length} fulfilled.`);
  }
  if (stock1.quantity_on_hand !== 85 || stock1.quantity_reserved !== 0) {
    throw new Error(`TEST 1 FAILED: Expected on_hand=85, reserved=0. Got on_hand=${stock1.quantity_on_hand}, reserved=${stock1.quantity_reserved}.`);
  }
  if (ledgerPick.length !== 1 || ledgerPick[0].quantity_change !== -15) {
    throw new Error(`TEST 1 FAILED: Expected exactly 1 FULFILLMENT_PICK for -15. Got ${ledgerPick.length} entries.`);
  }
  console.log('✅ TEST 1 PASSED: 25 concurrent dispatches strictly serialized without race condition.\n');

  // -------------------------------------------------------------------------
  // TEST 2: 25 Parallel Simultaneous Un-Awaited processRTO calls
  // -------------------------------------------------------------------------
  console.log('TEST 2: 25 Parallel Simultaneous Un-Awaited processRTO calls...');
  // Move shipment1 to in_transit then return_to_origin
  await service.updateShipmentStatus(shipment1.id, 'in_transit', 'In transit', 'system', db);
  await service.updateShipmentStatus(shipment1.id, 'return_to_origin', 'Customer refused delivery', 'system', db);

  const rtoPromises = Array.from({ length: 25 }, (_, i) =>
    service.processRTO(shipment1.id, 'restocked', 'bin-stress', `user-${i}`, db)
  );

  const rtoResults = await Promise.allSettled(rtoPromises);
  const rtoFulfilled = rtoResults.filter((r) => r.status === 'fulfilled');
  const rtoRejected = rtoResults.filter((r) => r.status === 'rejected');

  const stock2 = (await db.query<any>('SELECT quantity_on_hand, quantity_reserved FROM inventory_stock WHERE id = ?', ['stk-stress']))[0];
  const ledgerRestock = await db.query<any>(
    "SELECT * FROM inventory_transactions WHERE reference_id = ? AND transaction_type = 'RETURN_RESTOCK'",
    [shipment1.shipment_number]
  );

  console.log(`- RTO Fulfilled: ${rtoFulfilled.length}, Rejected: ${rtoRejected.length}`);
  console.log(`- Stock: on_hand=${stock2.quantity_on_hand}, reserved=${stock2.quantity_reserved}`);
  console.log(`- RETURN_RESTOCK transactions: ${ledgerRestock.length}`);

  if (rtoFulfilled.length !== 1 || rtoRejected.length !== 24) {
    throw new Error(`TEST 2 FAILED: Expected exactly 1 RTO fulfilled, 24 rejected. Got ${rtoFulfilled.length} fulfilled.`);
  }
  if (stock2.quantity_on_hand !== 100 || stock2.quantity_reserved !== 0) {
    throw new Error(`TEST 2 FAILED: Expected on_hand=100, reserved=0. Got on_hand=${stock2.quantity_on_hand}, reserved=${stock2.quantity_reserved}.`);
  }
  if (ledgerRestock.length !== 1 || ledgerRestock[0].quantity_change !== 15) {
    throw new Error(`TEST 2 FAILED: Expected exactly 1 RETURN_RESTOCK for 15. Got ${ledgerRestock.length} entries.`);
  }
  console.log('✅ TEST 2 PASSED: 25 concurrent RTO restocks strictly serialized without race condition.\n');

  // -------------------------------------------------------------------------
  // TEST 3: Concurrent Dispatch vs Cancellation Race Condition
  // -------------------------------------------------------------------------
  console.log('TEST 3: Concurrent Dispatch vs Cancellation Race Condition...');
  const shipment2 = await service.createShipment(
    {
      shipmentNumber: 'SHP-STRESS-02',
      orderReference: 'ORD-STRESS-02',
      sourceWarehouseId: 'wh-stress',
      customerName: 'Stress Customer 2',
      customerPhone: '+8801700000000',
      customerAddress: 'Dhaka',
      destinationCity: 'Dhaka',
      courierId: 'cour-stress',
      courierName: 'StressExpress',
      items: [{ itemId: 'item-stress', binId: 'bin-stress', quantity: 20, unitPrice: 20.0 }]
    },
    db
  );

  // Initial stock before race: on_hand=100, reserved=20
  const raceResults = await Promise.allSettled([
    service.dispatchShipment(shipment2.id, 'TRK-RACE-02', 'user-dispatch', db),
    service.updateShipmentStatus(shipment2.id, 'cancelled', 'Cancel order', 'user-cancel', db)
  ]);

  const stock3 = (await db.query<any>('SELECT quantity_on_hand, quantity_reserved FROM inventory_stock WHERE id = ?', ['stk-stress']))[0];
  const finalShipment2 = await service.getShipmentById(shipment2.id, db);

  console.log(`- Call 1 (Dispatch): ${raceResults[0].status}`);
  console.log(`- Call 2 (Cancel):   ${raceResults[1].status}`);
  console.log(`- Final Shipment Status: ${finalShipment2?.status}`);
  console.log(`- Final Stock: on_hand=${stock3.quantity_on_hand}, reserved=${stock3.quantity_reserved}`);

  // Invariant check: Either dispatch won (on_hand=80, reserved=0, status=dispatched)
  // OR cancellation won (on_hand=100, reserved=0, status=cancelled).
  // Under NO circumstance should stock be negative, or reserved > 0, or double-deducted!
  if (finalShipment2?.status === 'dispatched') {
    if (stock3.quantity_on_hand !== 80 || stock3.quantity_reserved !== 0) {
      throw new Error(`TEST 3 FAILED: Dispatched shipment has corrupted stock: on_hand=${stock3.quantity_on_hand}, reserved=${stock3.quantity_reserved}`);
    }
  } else if (finalShipment2?.status === 'cancelled') {
    if (stock3.quantity_on_hand !== 100 || stock3.quantity_reserved !== 0) {
      throw new Error(`TEST 3 FAILED: Cancelled shipment has corrupted stock: on_hand=${stock3.quantity_on_hand}, reserved=${stock3.quantity_reserved}`);
    }
  } else {
    throw new Error(`TEST 3 FAILED: Unexpected final status: ${finalShipment2?.status}`);
  }
  console.log('✅ TEST 3 PASSED: Dispatch vs Cancellation race handled with absolute transaction consistency.\n');

  console.log('🎉 ALL HIGH-CONCURRENCY STRESS PROBES PASSED WITH ZERO DEFECTS!');
}

runHighConcurrencyStress().catch((err) => {
  console.error('STRESS TEST ERROR:', err);
  process.exit(1);
});
