/**
 * Empirical Adversarial Bug Reproduction Harness: Outbound Dispatch Race Condition
 * File: tests/challenger/reproduce-dispatch-race-condition.ts
 *
 * Authored by: challenger_m4_1
 * Purpose: Empirically reproduce and confirm the critical race condition in
 * FulfillmentService.dispatchShipment where concurrent/un-awaited calls on the
 * same shipment succeed concurrently, causing duplicate stock deductions and duplicate
 * FULFILLMENT_PICK double-entry audit ledger entries.
 */

import { DatabaseService } from '../../src/services/db.ts';
import { FulfillmentService } from '../../src/services/fulfillmentService.ts';

async function reproduce() {
  console.log('=== EMPIRICAL REPRODUCTION: dispatchShipment Race Condition ===');
  const db = new DatabaseService(':memory:');
  await db.initialize();
  const service = FulfillmentService.getInstance();

  // Setup minimal warehouse, location, item, and courier
  await db.execute(`
    INSERT INTO warehouses (id, warehouse_code, name, address, city, is_default, is_active)
    VALUES ('wh-race', 'WH-RACE', 'Race Hub', 'Tejgaon', 'Dhaka', 1, 1);
  `);
  await db.execute(`
    INSERT INTO warehouse_locations (id, warehouse_id, zone, aisle, rack, shelf, bin_code, is_active)
    VALUES ('bin-race', 'wh-race', 'Z1', 'A1', 'R1', 'S1', 'BIN-RACE-01', 1);
  `);
  await db.execute(`
    INSERT INTO items (id, sku, name, category, cost_price, selling_price, is_active)
    VALUES ('item-race', 'SKU-RACE-01', 'Race Bearing', 'Mechanical', 30.0, 50.0, 1);
  `);
  await db.execute(`
    INSERT INTO couriers (id, name, service_type, contact_phone, is_active)
    VALUES ('cour-race', 'FastPathao', 'Express', '+8801700000000', 1);
  `);

  // Seed stock: 50 on-hand, 0 reserved
  await db.execute(`
    INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
    VALUES ('stk-race', 'item-race', 'wh-race', 'bin-race', 50, 0);
  `);

  // Create shipment for 10 units
  const shipment = await service.createShipment(
    {
      shipmentNumber: 'SHP-RACE-100',
      orderReference: 'ORD-RACE-100',
      sourceWarehouseId: 'wh-race',
      customerName: 'Customer Test',
      customerPhone: '+8801700000000',
      customerAddress: 'Dhaka',
      destinationCity: 'Dhaka',
      courierId: 'cour-race',
      courierName: 'FastPathao',
      items: [{ itemId: 'item-race', binId: 'bin-race', quantity: 10, unitPrice: 50.0 }]
    },
    db
  );

  console.log('1. Shipment created:', { id: shipment.id, status: shipment.status, number: shipment.shipment_number });
  let stockRows = await db.query<any>('SELECT quantity_on_hand, quantity_reserved FROM inventory_stock WHERE id = ?', ['stk-race']);
  console.log('2. Initial stock state:', stockRows[0]); // Expected: on_hand 50, reserved 10

  // Fire 2 concurrent un-awaited calls to dispatchShipment
  console.log('3. Firing 2 simultaneous un-awaited calls to dispatchShipment on the same shipment...');
  const [call1, call2] = await Promise.allSettled([
    service.dispatchShipment(shipment.id, 'TRK-A', 'user1', db),
    service.dispatchShipment(shipment.id, 'TRK-B', 'user2', db)
  ]);

  console.log('4. Call results:', {
    call1_status: call1.status,
    call1_error: call1.status === 'rejected' ? (call1 as any).reason?.message : 'N/A',
    call2_status: call2.status,
    call2_error: call2.status === 'rejected' ? (call2 as any).reason?.message : 'N/A'
  });

  stockRows = await db.query<any>('SELECT quantity_on_hand, quantity_reserved FROM inventory_stock WHERE id = ?', ['stk-race']);
  console.log('5. Stock after dispatch calls:', stockRows[0]);

  const auditRows = await db.query<any>(
    "SELECT id, transaction_type, quantity_change, running_balance_after FROM inventory_transactions WHERE reference_id = ? AND transaction_type = 'FULFILLMENT_PICK'",
    [shipment.shipment_number]
  );
  console.log(`6. FULFILLMENT_PICK audit ledger rows (${auditRows.length}):`, auditRows);

  const bothSucceeded = call1.status === 'fulfilled' && call2.status === 'fulfilled';
  const stockOverDeducted = stockRows[0].quantity_on_hand < 40;

  if (bothSucceeded || stockOverDeducted || auditRows.length > 1) {
    console.error('\n❌ [CRITICAL BUG CONFIRMED]: Outbound dispatch race condition!');
    console.error(`- Both parallel dispatch calls succeeded (expected 1 success, 1 rejection).`);
    console.error(`- Physical stock was double-deducted to ${stockRows[0].quantity_on_hand} (expected 40).`);
    console.error(`- Audit ledger contains ${auditRows.length} FULFILLMENT_PICK entries for the same shipment (expected 1).`);
    console.error('\nRoot Cause Analysis:');
    console.error('In src/services/fulfillmentService.ts:');
    console.error('- Lines 640-648 validate shipment status OUTSIDE db.transaction.');
    console.error('- Inside db.transaction (lines 652-656), the code re-fetches currentShipment:');
    console.error('    const currentShipment = await this.getShipmentById(shipmentId, tx);');
    console.error('    if (!currentShipment) throw new Error(...);');
    console.error('- BUT IT OMITS checking if currentShipment.status is already "dispatched" or "in_transit" inside the transaction boundary!');
    console.error('- Fix: Move the status validation INSIDE db.transaction using currentShipment.status:');
    console.error('    if (currentShipment.status === "dispatched" || currentShipment.status === "in_transit") {');
    console.error('      throw new Error("Shipment is already dispatched.");');
    console.error('    }');
    console.error('    if (currentShipment.status !== "pending" && currentShipment.status !== "packed") {');
    console.error('      throw new Error(`Cannot dispatch shipment in \'${currentShipment.status}\' status.`);');
    console.error('    }');
    console.error('Identical fix needed in processRTO: re-fetch shipment inside db.transaction and ensure status === "return_to_origin".\n');
    process.exit(1);
  } else {
    console.log('\n✅ Race condition resisted cleanly: Exactly 1 dispatch succeeded, duplicate call rejected with error, stock deducted once to 40.');
    process.exit(0);
  }
}

reproduce().catch((err) => {
  console.error('Reproduction crashed:', err);
  process.exit(1);
});
