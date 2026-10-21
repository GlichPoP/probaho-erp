/**
 * Empirical Adversarial Challenger Test Harness for Milestone 4
 * File: tests/challenger/m4-empirical-challenger.ts
 *
 * Scope:
 * 1. Probe concurrent parallel shipment creation competing for limited stock:
 *    If on-hand stock is 50, and 10 parallel requests ask for 10 units each,
 *    exactly 5 must succeed and 5 must be rejected without over-reserving stock.
 * 2. Probe simultaneous un-awaited dispatchShipment calls on the same shipment:
 *    Exactly 1 must succeed, and duplicate calls must be rejected with status error
 *    without double-deducting stock.
 * 3. Probe dispatching a shipment after physical stock was manually reduced below required quantity:
 *    Must cleanly reject dispatch without stock going negative.
 * 4. Verify conservation of mass:
 *    Initial Stock == On-Hand + Dispatched - Restocked.
 */

import { DatabaseService } from '../../src/services/db.ts';
import { FulfillmentService } from '../../src/services/fulfillmentService.ts';
import { ERPTestClient } from '../harness/erp-test-client.ts';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m'
};

interface ProbeResult {
  id: string;
  name: string;
  passed: boolean;
  durationMs: number;
  details: string;
}

const probeResults: ProbeResult[] = [];

async function runProbe(
  id: string,
  name: string,
  fn: () => Promise<string>
): Promise<boolean> {
  const start = Date.now();
  console.log(`\n${colors.yellow}⏳ Running [${id}] ${name}...${colors.reset}`);
  try {
    const details = await fn();
    const durationMs = Date.now() - start;
    console.log(`${colors.green}✔ PASS [${id}] ${name} (${durationMs}ms)${colors.reset}`);
    console.log(`   ${colors.gray}↳ ${details}${colors.reset}`);
    probeResults.push({ id, name, passed: true, durationMs, details });
    return true;
  } catch (err: any) {
    const durationMs = Date.now() - start;
    console.error(`${colors.red}✘ FAIL [${id}] ${name} (${durationMs}ms)${colors.reset}`);
    console.error(`   ${colors.red}↳ Error: ${err.message || String(err)}${colors.reset}`);
    if (err.stack) console.error(err.stack);
    probeResults.push({ id, name, passed: false, durationMs, details: err.message || String(err) });
    return false;
  }
}

async function setupFreshDb() {
  const db = new DatabaseService(':memory:');
  await db.initialize();
  const client = new ERPTestClient(db);
  const service = FulfillmentService.getInstance();

  const wh = await client.createWarehouse({
    warehouseCode: 'WH-CHAL-M4',
    name: 'Challenger Logistics Hub',
    address: '100 Industrial Road',
    city: 'Dhaka',
    isDefault: true
  });

  const bin = await client.createLocation({
    warehouseId: wh.id,
    zone: 'Zone Alpha',
    aisle: 'A1',
    rack: 'R1',
    shelf: 'S1',
    binCode: 'BIN-CHAL-01'
  });

  const item = await client.createItem({
    sku: 'SKU-CHAL-M4-01',
    name: 'Adversarial Test Component',
    category: 'Industrial',
    unitOfMeasure: 'pcs',
    costPrice: 50.0,
    sellingPrice: 80.0
  });

  const courier = await client.createCourier('FastCourier Express', '+8801711000000', 'Express');

  return { db, client, service, wh, bin, item, courier };
}

async function main() {
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}    PROBAHO ERP — EMPIRICAL ADVERSARIAL CHALLENGER (MILESTONE 4)       ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}`);

  // --------------------------------------------------------------------------
  // MANDATE 1: Concurrent Parallel Shipment Creation Competing for Limited Stock
  // --------------------------------------------------------------------------
  await runProbe(
    'PROBE-M4-01',
    'Concurrent parallel shipment creation competing for limited stock (50 on-hand, 10 parallel x 10 units)',
    async () => {
      const { db, client, service, wh, bin, item, courier } = await setupFreshDb();

      // Seed 50 units on hand, 0 reserved
      await db.execute(
        `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
         VALUES ('stk-probe-1', ?, ?, ?, 50, 0)`,
        [item.id, wh.id, bin.id]
      );

      // Launch 10 simultaneous un-awaited createShipment requests, requesting 10 units each
      const requests = Array.from({ length: 10 }, (_, i) => {
        return service.createShipment(
          {
            shipmentNumber: `SHP-CONC-${i + 1}`,
            orderReference: `ORD-CONC-${i + 1}`,
            sourceWarehouseId: wh.id,
            customerName: `Customer ${i + 1}`,
            customerPhone: '+8801700000000',
            customerAddress: 'Dhaka, Bangladesh',
            destinationCity: 'Dhaka',
            courierId: courier.id,
            courierName: courier.name,
            items: [
              {
                itemId: item.id,
                binId: bin.id,
                quantity: 10,
                unitPrice: 80.0
              }
            ]
          },
          db
        );
      });

      const settled = await Promise.allSettled(requests);
      const fulfilled = settled.filter((s) => s.status === 'fulfilled');
      const rejected = settled.filter((s) => s.status === 'rejected');

      // Check stock table in DB
      const stockRows = await db.query(
        'SELECT quantity_on_hand, quantity_reserved FROM inventory_stock WHERE id = ?',
        ['stk-probe-1']
      );
      const stock = stockRows[0];

      if (fulfilled.length !== 5) {
        throw new Error(`Expected exactly 5 fulfilled shipments, got ${fulfilled.length}`);
      }
      if (rejected.length !== 5) {
        throw new Error(`Expected exactly 5 rejected shipments, got ${rejected.length}`);
      }
      if (stock.quantity_on_hand !== 50) {
        throw new Error(`Expected quantity_on_hand to remain 50, got ${stock.quantity_on_hand}`);
      }
      if (stock.quantity_reserved !== 50) {
        throw new Error(`Expected quantity_reserved to be exactly 50, got ${stock.quantity_reserved}`);
      }

      return `Successfully tested 10 parallel requests: exactly 5 succeeded, 5 rejected. On-hand: ${stock.quantity_on_hand}, Reserved: ${stock.quantity_reserved}, Available: ${stock.quantity_on_hand - stock.quantity_reserved}.`;
    }
  );

  // --------------------------------------------------------------------------
  // MANDATE 2: Simultaneous Un-Awaited dispatchShipment Calls on the Same Shipment
  // --------------------------------------------------------------------------
  await runProbe(
    'PROBE-M4-02',
    'Simultaneous un-awaited dispatchShipment calls on the same shipment (Race Condition Resistance)',
    async () => {
      const { db, client, service, wh, bin, item, courier } = await setupFreshDb();

      // Seed 50 units on hand
      await db.execute(
        `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
         VALUES ('stk-probe-2', ?, ?, ?, 50, 0)`,
        [item.id, wh.id, bin.id]
      );

      // Create a single shipment for 10 units
      const shipment = await service.createShipment(
        {
          shipmentNumber: 'SHP-RACE-001',
          orderReference: 'ORD-RACE-001',
          sourceWarehouseId: wh.id,
          customerName: 'Race Test Customer',
          customerPhone: '+8801700000000',
          customerAddress: 'Dhaka, Bangladesh',
          destinationCity: 'Dhaka',
          courierId: courier.id,
          courierName: courier.name,
          items: [
            {
              itemId: item.id,
              binId: bin.id,
              quantity: 10,
              unitPrice: 80.0
            }
          ]
        },
        db
      );

      // Verify initial state: on-hand 50, reserved 10
      let stock = (await db.query('SELECT * FROM inventory_stock WHERE id = ?', ['stk-probe-2']))[0];
      if (stock.quantity_on_hand !== 50 || stock.quantity_reserved !== 10) {
        throw new Error(`Unexpected initial stock: on_hand=${stock.quantity_on_hand}, reserved=${stock.quantity_reserved}`);
      }

      // Execute 5 simultaneous un-awaited dispatchShipment calls on the SAME shipment
      const dispatchCalls = [
        service.dispatchShipment(shipment.id, 'TRK-RACE-1', 'user1', db),
        service.dispatchShipment(shipment.id, 'TRK-RACE-2', 'user2', db),
        service.dispatchShipment(shipment.id, 'TRK-RACE-3', 'user3', db),
        service.dispatchShipment(shipment.id, 'TRK-RACE-4', 'user4', db),
        service.dispatchShipment(shipment.id, 'TRK-RACE-5', 'user5', db)
      ];

      const settled = await Promise.allSettled(dispatchCalls);
      const fulfilled = settled.filter((s) => s.status === 'fulfilled');
      const rejected = settled.filter((s) => s.status === 'rejected');

      // Check final stock state
      stock = (await db.query('SELECT * FROM inventory_stock WHERE id = ?', ['stk-probe-2']))[0];

      // Check double-entry audit ledger for FULFILLMENT_PICK transactions for this shipment
      const ledgerEntries = await db.query(
        "SELECT * FROM inventory_transactions WHERE reference_type = 'SHIPMENT' AND reference_id = ? AND transaction_type = 'FULFILLMENT_PICK'",
        [shipment.shipment_number]
      );

      const rejectedReasons = rejected.map((r: any) => r.reason?.message || String(r.reason));

      console.log(`     [Debug PROBE-M4-02] Fulfilled count: ${fulfilled.length}, Rejected count: ${rejected.length}`);
      console.log(`     [Debug PROBE-M4-02] Final on_hand: ${stock.quantity_on_hand}, reserved: ${stock.quantity_reserved}`);
      console.log(`     [Debug PROBE-M4-02] FULFILLMENT_PICK ledger count: ${ledgerEntries.length}`);
      console.log(`     [Debug PROBE-M4-02] Rejected error messages:`, rejectedReasons);

      if (fulfilled.length !== 1) {
        throw new Error(
          `CRITICAL CONCURRENCY BUG CONFIRMED: Expected exactly 1 dispatch call to succeed, but ${fulfilled.length} succeeded! Stock was deducted multiple times. On-hand: ${stock.quantity_on_hand} (expected 40). Ledger entries: ${ledgerEntries.length} (expected 1).`
        );
      }

      if (rejected.length !== 4) {
        throw new Error(`Expected 4 rejected calls, got ${rejected.length}`);
      }

      if (stock.quantity_on_hand !== 40) {
        throw new Error(`Double stock deduction detected! Expected on_hand 40, found ${stock.quantity_on_hand}`);
      }

      if (stock.quantity_reserved !== 0) {
        throw new Error(`Expected reserved 0, found ${stock.quantity_reserved}`);
      }

      if (ledgerEntries.length !== 1) {
        throw new Error(`Duplicate ledger entries logged! Found ${ledgerEntries.length}, expected 1`);
      }

      return `Race condition resisted: Exactly 1 dispatch succeeded, 4 rejected. Stock deducted once: 50 -> 40. Reserved: 0. Exactly 1 FULFILLMENT_PICK ledger entry.`;
    }
  );

  // --------------------------------------------------------------------------
  // MANDATE 2B: Simultaneous Un-Awaited processRTO Calls on the Same Shipment
  // --------------------------------------------------------------------------
  await runProbe(
    'PROBE-M4-02B',
    'Simultaneous un-awaited processRTO calls on the same shipment (Double-Restock Race Condition)',
    async () => {
      const { db, client, service, wh, bin, item, courier } = await setupFreshDb();

      // Seed 20 units on hand
      await db.execute(
        `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
         VALUES ('stk-probe-2b', ?, ?, ?, 20, 0)`,
        [item.id, wh.id, bin.id]
      );

      // Create shipment of 10 units
      const shipment = await service.createShipment(
        {
          shipmentNumber: 'SHP-RTO-RACE',
          orderReference: 'ORD-RTO-RACE',
          sourceWarehouseId: wh.id,
          customerName: 'RTO Customer',
          customerPhone: '+8801700000000',
          customerAddress: 'Dhaka',
          destinationCity: 'Dhaka',
          courierId: courier.id,
          courierName: courier.name,
          items: [{ itemId: item.id, binId: bin.id, quantity: 10, unitPrice: 80.0 }]
        },
        db
      );

      // Dispatch and transition to return_to_origin
      await service.dispatchShipment(shipment.id, 'TRK-RTO-RACE', 'system', db);
      await service.updateShipmentStatus(shipment.id, 'in_transit', 'In transit', 'system', db);
      await service.updateShipmentStatus(shipment.id, 'return_to_origin', 'Undeliverable address', 'system', db);

      // At this point: on_hand = 10, reserved = 0
      let stock = (await db.query('SELECT * FROM inventory_stock WHERE id = ?', ['stk-probe-2b']))[0];
      if (stock.quantity_on_hand !== 10) {
        throw new Error(`Unexpected stock before RTO: ${stock.quantity_on_hand}`);
      }

      // Launch 5 simultaneous un-awaited processRTO requests for restock
      const rtoCalls = [
        service.processRTO(shipment.id, 'restocked', bin.id, 'user1', db),
        service.processRTO(shipment.id, 'restocked', bin.id, 'user2', db),
        service.processRTO(shipment.id, 'restocked', bin.id, 'user3', db),
        service.processRTO(shipment.id, 'restocked', bin.id, 'user4', db),
        service.processRTO(shipment.id, 'restocked', bin.id, 'user5', db)
      ];

      const settled = await Promise.allSettled(rtoCalls);
      const fulfilled = settled.filter((s) => s.status === 'fulfilled');
      const rejected = settled.filter((s) => s.status === 'rejected');

      stock = (await db.query('SELECT * FROM inventory_stock WHERE id = ?', ['stk-probe-2b']))[0];
      const restockLedgers = await db.query(
        "SELECT * FROM inventory_transactions WHERE reference_type = 'SHIPMENT' AND reference_id = ? AND transaction_type = 'RETURN_RESTOCK'",
        [shipment.shipment_number]
      );

      console.log(`     [Debug PROBE-M4-02B] Fulfilled count: ${fulfilled.length}, Rejected count: ${rejected.length}`);
      console.log(`     [Debug PROBE-M4-02B] Final on_hand: ${stock.quantity_on_hand} (expected 20)`);
      console.log(`     [Debug PROBE-M4-02B] RETURN_RESTOCK ledger count: ${restockLedgers.length} (expected 1)`);

      if (fulfilled.length !== 1) {
        throw new Error(
          `CRITICAL RTO CONCURRENCY BUG CONFIRMED: Expected exactly 1 RTO restock to succeed, but ${fulfilled.length} succeeded! Stock was restocked multiple times. On-hand: ${stock.quantity_on_hand} (expected 20). Ledger entries: ${restockLedgers.length} (expected 1).`
        );
      }

      if (stock.quantity_on_hand !== 20) {
        throw new Error(`Phantom inventory created! Expected on_hand 20, got ${stock.quantity_on_hand}`);
      }

      return `RTO race condition resisted: Exactly 1 restock succeeded, 4 rejected. Stock restored once: 10 -> 20. Exactly 1 RETURN_RESTOCK ledger entry.`;
    }
  );

  // --------------------------------------------------------------------------
  // MANDATE 3: Dispatching After Physical Stock Was Manually Reduced Below Required Quantity
  // --------------------------------------------------------------------------
  await runProbe(
    'PROBE-M4-03',
    'Dispatching a shipment after physical stock was manually reduced below required quantity (Floor Protection)',
    async () => {
      const { db, client, service, wh, bin, item, courier } = await setupFreshDb();

      // Seed 20 units on hand
      await db.execute(
        `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
         VALUES ('stk-probe-3', ?, ?, ?, 20, 0)`,
        [item.id, wh.id, bin.id]
      );

      // Create shipment for 20 units (reserves all 20 units)
      const shipment = await service.createShipment(
        {
          shipmentNumber: 'SHP-FLOOR-001',
          orderReference: 'ORD-FLOOR-001',
          sourceWarehouseId: wh.id,
          customerName: 'Floor Test Customer',
          customerPhone: '+8801700000000',
          customerAddress: 'Dhaka, Bangladesh',
          destinationCity: 'Dhaka',
          courierId: courier.id,
          courierName: courier.name,
          items: [
            {
              itemId: item.id,
              binId: bin.id,
              quantity: 20,
              unitPrice: 80.0
            }
          ]
        },
        db
      );

      // Now simulate unexpected physical shrinkage or administrative adjustment:
      // Lower on_hand to 5 units and reserved to 5 units (to satisfy table CHECK constraint quantity_reserved <= quantity_on_hand)
      await db.execute(
        'UPDATE inventory_stock SET quantity_on_hand = 5, quantity_reserved = 5 WHERE id = ?',
        ['stk-probe-3']
      );

      // Now attempt to dispatch the shipment of 20 units
      let threwExpectedError = false;
      let errorMsg = '';
      try {
        await service.dispatchShipment(shipment.id, 'TRK-FLOOR-01', 'system', db);
      } catch (err: any) {
        threwExpectedError = true;
        errorMsg = err.message || String(err);
      }

      // Re-query stock
      const stock = (await db.query('SELECT * FROM inventory_stock WHERE id = ?', ['stk-probe-3']))[0];

      if (!threwExpectedError) {
        throw new Error('Expected dispatchShipment to fail when physical stock is reduced below required quantity, but it succeeded!');
      }

      if (stock.quantity_on_hand < 0) {
        throw new Error(`Negative stock anomaly detected! quantity_on_hand = ${stock.quantity_on_hand}`);
      }

      if (stock.quantity_on_hand !== 5) {
        throw new Error(`Stock changed unexpectedly! Expected 5, got ${stock.quantity_on_hand}`);
      }

      // Ensure shipment status remained 'pending'
      const currentShipment = await service.getShipmentById(shipment.id, db);
      if (currentShipment?.status !== 'pending') {
        throw new Error(`Shipment status altered! Expected 'pending', got '${currentShipment?.status}'`);
      }

      return `Cleanly rejected dispatch with error "${errorMsg}". Stock preserved at 5 (never negative). Shipment remains 'pending'.`;
    }
  );

  // --------------------------------------------------------------------------
  // MANDATE 4: Conservation of Mass: Initial Stock == On-Hand + Dispatched - Restocked
  // --------------------------------------------------------------------------
  await runProbe(
    'PROBE-M4-04',
    'Conservation of mass: Initial Stock == On-Hand + Dispatched - Restocked across full lifecycle',
    async () => {
      const { db, client, service, wh, bin, item, courier } = await setupFreshDb();

      const INITIAL_STOCK = 100;
      await db.execute(
        `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
         VALUES ('stk-probe-4', ?, ?, ?, ?, 0)`,
        [item.id, wh.id, bin.id, INITIAL_STOCK]
      );

      // Lifecycle Step 1: Create Shipment A (30 units) and Shipment B (20 units)
      const shpA = await service.createShipment(
        {
          shipmentNumber: 'SHP-MASS-A',
          orderReference: 'ORD-MASS-A',
          sourceWarehouseId: wh.id,
          customerName: 'Customer A',
          customerPhone: '+8801700000000',
          customerAddress: 'Dhaka',
          destinationCity: 'Dhaka',
          courierId: courier.id,
          courierName: courier.name,
          items: [{ itemId: item.id, binId: bin.id, quantity: 30, unitPrice: 80.0 }]
        },
        db
      );

      const shpB = await service.createShipment(
        {
          shipmentNumber: 'SHP-MASS-B',
          orderReference: 'ORD-MASS-B',
          sourceWarehouseId: wh.id,
          customerName: 'Customer B',
          customerPhone: '+8801700000000',
          customerAddress: 'Dhaka',
          destinationCity: 'Dhaka',
          courierId: courier.id,
          courierName: courier.name,
          items: [{ itemId: item.id, binId: bin.id, quantity: 20, unitPrice: 80.0 }]
        },
        db
      );

      // Check at Pending: On-hand 100, Reserved 50, Dispatched 0, Restocked 0
      // Invariant: Initial == On-Hand + Dispatched - Restocked -> 100 == 100 + 0 - 0
      let stock = (await db.query('SELECT * FROM inventory_stock WHERE id = ?', ['stk-probe-4']))[0];
      if (stock.quantity_on_hand !== 100 || stock.quantity_reserved !== 50) {
        throw new Error(`Step 1 Invariant failed: on_hand=${stock.quantity_on_hand}, reserved=${stock.quantity_reserved}`);
      }

      // Lifecycle Step 2: Dispatch both shipments
      await service.dispatchShipment(shpA.id, 'TRK-MASS-A', 'system', db);
      await service.dispatchShipment(shpB.id, 'TRK-MASS-B', 'system', db);

      // Check at Dispatched: On-hand 50, Reserved 0, Dispatched = 30 + 20 = 50, Restocked = 0
      // Invariant: Initial == On-Hand + Dispatched - Restocked -> 100 == 50 + 50 - 0 = 100
      stock = (await db.query('SELECT * FROM inventory_stock WHERE id = ?', ['stk-probe-4']))[0];
      let dispatchedTotal = 50;
      let restockedTotal = 0;
      if (INITIAL_STOCK !== stock.quantity_on_hand + dispatchedTotal - restockedTotal) {
        throw new Error(`Step 2 Mass Invariant failed! 100 != ${stock.quantity_on_hand} + ${dispatchedTotal} - ${restockedTotal}`);
      }

      // Lifecycle Step 3: Advance shpA to delivered
      await service.updateShipmentStatus(shpA.id, 'in_transit', 'In transit with Pathao', 'system', db);
      await service.updateShipmentStatus(shpA.id, 'delivered', 'Successfully handed to customer', 'system', db);

      // Lifecycle Step 4: Advance shpB to return_to_origin and process restock
      await service.updateShipmentStatus(shpB.id, 'in_transit', 'In transit', 'system', db);
      await service.updateShipmentStatus(shpB.id, 'return_to_origin', 'Customer refused delivery', 'system', db);

      // Process RTO restock for shpB (20 units returned to bin)
      await service.processRTO(shpB.id, 'restocked', bin.id, 'system', db);
      restockedTotal += 20;

      // Check after Restock:
      // On-hand should now be 50 + 20 = 70
      // Dispatched is 50
      // Restocked is 20
      // Invariant: Initial (100) == On-Hand (70) + Dispatched (50) - Restocked (20) = 100
      stock = (await db.query('SELECT * FROM inventory_stock WHERE id = ?', ['stk-probe-4']))[0];
      if (stock.quantity_on_hand !== 70) {
        throw new Error(`Expected on_hand 70 after restock, got ${stock.quantity_on_hand}`);
      }

      const balance = stock.quantity_on_hand + dispatchedTotal - restockedTotal;
      if (INITIAL_STOCK !== balance) {
        throw new Error(`Conservation of mass violated! Initial ${INITIAL_STOCK} != ${balance} (onHand=${stock.quantity_on_hand}, dispatched=${dispatchedTotal}, restocked=${restockedTotal})`);
      }

      // Double-entry audit ledger reconciliation
      const transactions = await db.query(
        'SELECT transaction_type, SUM(quantity_change) as total_change FROM inventory_transactions GROUP BY transaction_type'
      );
      const pickTx = transactions.find((t: any) => t.transaction_type === 'FULFILLMENT_PICK');
      const restockTx = transactions.find((t: any) => t.transaction_type === 'RETURN_RESTOCK');

      if (pickTx?.total_change !== -50) {
        throw new Error(`Expected ledger FULFILLMENT_PICK total to be -50, got ${pickTx?.total_change}`);
      }
      if (restockTx?.total_change !== 20) {
        throw new Error(`Expected ledger RETURN_RESTOCK total to be 20, got ${restockTx?.total_change}`);
      }

      return `Mass strictly conserved across entire lifecycle: Initial (${INITIAL_STOCK}) == On-Hand (${stock.quantity_on_hand}) + Dispatched (${dispatchedTotal}) - Restocked (${restockedTotal}) = ${balance}. Double-entry ledger reconciled exactly.`;
    }
  );

  // --------------------------------------------------------------------------
  // Summary & Verdict
  // --------------------------------------------------------------------------
  console.log(`\n${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}              CHALLENGER SCORECARD & EMPIRICAL VERDICT                  ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  const total = probeResults.length;
  const passed = probeResults.filter((p) => p.passed).length;
  const failed = probeResults.filter((p) => !p.passed).length;

  console.log(`  Total Probes: ${total}`);
  console.log(`  Passed:       ${passed}`);
  console.log(`  Failed:       ${failed}`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}\n`);

  if (failed > 0) {
    console.log(`${colors.bold}${colors.red}❌ VERDICT: CHALLENGE_FAILED (Bugs Discovered & Empirically Confirmed)${colors.reset}\n`);
    process.exit(1);
  } else {
    console.log(`${colors.bold}${colors.green}✅ VERDICT: CONFIRMED (All Adversarial Probes Resisted Cleanly)${colors.reset}\n`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
