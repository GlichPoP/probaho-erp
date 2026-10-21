/**
 * Empirical Adversarial Bug Reproduction Harness: RTO Restock Race Condition
 * File: tests/challenger/reproduce-rto-race-condition.ts
 *
 * Authored by: challenger_m4_1
 * Purpose: Empirically reproduce and confirm the critical race condition in
 * FulfillmentService.processRTO where concurrent/un-awaited calls on the
 * same shipment succeed concurrently, causing duplicate stock increments (phantom stock)
 * and duplicate RETURN_RESTOCK double-entry audit ledger entries.
 */

import { DatabaseService } from '../../src/services/db.ts';
import { FulfillmentService } from '../../src/services/fulfillmentService.ts';

async function reproduce() {
  console.log('=== EMPIRICAL REPRODUCTION: processRTO Race Condition ===');
  const db = new DatabaseService(':memory:');
  await db.initialize();
  const service = FulfillmentService.getInstance();

  // Setup minimal warehouse, location, item, and courier
  await db.execute(`
    INSERT INTO warehouses (id, warehouse_code, name, address, city, is_default, is_active)
    VALUES ('wh-rto', 'WH-RTO', 'RTO Hub', 'Tejgaon', 'Dhaka', 1, 1);
  `);
  await db.execute(`
    INSERT INTO warehouse_locations (id, warehouse_id, zone, aisle, rack, shelf, bin_code, is_active)
    VALUES ('bin-rto', 'wh-rto', 'Z1', 'A1', 'R1', 'S1', 'BIN-RTO-01', 1);
  `);
  await db.execute(`
    INSERT INTO items (id, sku, name, category, cost_price, selling_price, is_active)
    VALUES ('item-rto', 'SKU-RTO-01', 'RTO Bearing', 'Mechanical', 30.0, 50.0, 1);
  `);
  await db.execute(`
    INSERT INTO couriers (id, name, service_type, contact_phone, is_active)
    VALUES ('cour-rto', 'FastPathao', 'Express', '+8801700000000', 1);
  `);

  // Seed stock: 20 on-hand, 0 reserved
  await db.execute(`
    INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
    VALUES ('stk-rto', 'item-rto', 'wh-rto', 'bin-rto', 20, 0);
  `);

  // Create shipment for 10 units
  const shipment = await service.createShipment(
    {
      shipmentNumber: 'SHP-RTO-100',
      orderReference: 'ORD-RTO-100',
      sourceWarehouseId: 'wh-rto',
      customerName: 'Customer Test',
      customerPhone: '+8801700000000',
      customerAddress: 'Dhaka',
      destinationCity: 'Dhaka',
      courierId: 'cour-rto',
      courierName: 'FastPathao',
      items: [{ itemId: 'item-rto', binId: 'bin-rto', quantity: 10, unitPrice: 50.0 }]
    },
    db
  );

  // Dispatch and advance to return_to_origin
  await service.dispatchShipment(shipment.id, 'TRK-RTO-100', 'user', db);
  await service.updateShipmentStatus(shipment.id, 'in_transit', 'In transit', 'user', db);
  await service.updateShipmentStatus(shipment.id, 'return_to_origin', 'Customer refused delivery', 'user', db);

  let stockRows = await db.query<any>('SELECT quantity_on_hand, quantity_reserved FROM inventory_stock WHERE id = ?', ['stk-rto']);
  console.log('1. Stock before RTO restock:', stockRows[0]); // Expected: on_hand 10, reserved 0

  // Fire 2 concurrent un-awaited calls to processRTO with 'restocked'
  console.log('2. Firing 2 simultaneous un-awaited calls to processRTO on the same shipment...');
  const [call1, call2] = await Promise.allSettled([
    service.processRTO(shipment.id, 'restocked', 'bin-rto', 'user1', db),
    service.processRTO(shipment.id, 'restocked', 'bin-rto', 'user2', db)
  ]);

  console.log('3. Call results:', {
    call1_status: call1.status,
    call1_error: call1.status === 'rejected' ? (call1 as any).reason?.message : 'N/A',
    call2_status: call2.status,
    call2_error: call2.status === 'rejected' ? (call2 as any).reason?.message : 'N/A'
  });

  stockRows = await db.query<any>('SELECT quantity_on_hand, quantity_reserved FROM inventory_stock WHERE id = ?', ['stk-rto']);
  console.log('4. Stock after RTO calls:', stockRows[0]);

  const auditRows = await db.query<any>(
    "SELECT id, transaction_type, quantity_change, running_balance_after FROM inventory_transactions WHERE reference_id = ? AND transaction_type = 'RETURN_RESTOCK'",
    [shipment.shipment_number]
  );
  console.log(`5. RETURN_RESTOCK audit ledger rows (${auditRows.length}):`, auditRows);

  const bothSucceeded = call1.status === 'fulfilled' && call2.status === 'fulfilled';
  const stockOverRestocked = stockRows[0].quantity_on_hand > 20;

  if (bothSucceeded || stockOverRestocked || auditRows.length > 1) {
    console.error('\n❌ [CRITICAL BUG CONFIRMED]: RTO restock race condition!');
    console.error(`- Both parallel processRTO calls succeeded (expected 1 success, 1 rejection).`);
    console.error(`- Physical stock was double-restocked to ${stockRows[0].quantity_on_hand} (expected 20). Phantom inventory created: +${stockRows[0].quantity_on_hand - 20} units.`);
    console.error(`- Audit ledger contains ${auditRows.length} RETURN_RESTOCK entries for the same shipment (expected 1).`);
    console.error('\nRoot Cause Analysis:');
    console.error('In src/services/fulfillmentService.ts:');
    console.error('- Lines 920-924 validate shipment status is "return_to_origin" OUTSIDE db.transaction.');
    console.error('- Inside db.transaction (line 926), shipment is NOT re-fetched, nor is its status re-validated inside the transaction boundary.');
    console.error('- Fix: Re-fetch currentShipment inside db.transaction:');
    console.error('    const currentShipment = await this.getShipmentById(shipmentId, tx);');
    console.error('    if (!currentShipment || currentShipment.status !== "return_to_origin") {');
    console.error('      throw new Error(`Cannot process RTO: shipment status is \'${currentShipment?.status}\', expected \'return_to_origin\'.`);');
    console.error('    }');
    process.exit(1);
  } else {
    console.log('\n✅ Race condition resisted cleanly: Exactly 1 RTO restock succeeded, duplicate call rejected with error, stock restored once to 20.');
    process.exit(0);
  }
}

reproduce().catch((err) => {
  console.error('Reproduction crashed:', err);
  process.exit(1);
});
