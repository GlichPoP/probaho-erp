/**
 * Adversarial Concurrency & Stock Isolation Challenger Harness
 * File: tests/challenger/adversarial-concurrency-verifier.ts
 *
 * Authored by: challenger_m3_it2_1
 * Purpose: Empirically stress-test race conditions, transaction serialization,
 * stock isolation, and mass conservation invariants on Milestone 3 Iteration 2.
 */

import { DatabaseService } from '../../src/services/db.ts';
import { TransferService } from '../../src/services/transferService.ts';

interface VerificationResult {
  name: string;
  passed: boolean;
  durationMs: number;
  details: string;
}

const results: VerificationResult[] = [];

async function assertCondition(desc: string, condition: boolean, failMessage: string) {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED] ${desc}: ${failMessage}`);
  }
}

async function runAdversarialTest(name: string, fn: () => Promise<string>): Promise<boolean> {
  const start = Date.now();
  console.log(`\n⏳ Running Adversarial Probe: ${name}...`);
  try {
    const details = await fn();
    const durationMs = Date.now() - start;
    console.log(`✔ [PASS] ${name} (${durationMs}ms)\n    ↳ ${details}`);
    results.push({ name, passed: true, durationMs, details });
    return true;
  } catch (err: any) {
    const durationMs = Date.now() - start;
    console.error(`✘ [FAIL] ${name} (${durationMs}ms)\n    ↳ Error: ${err.message || String(err)}`);
    if (err.stack) console.error(err.stack);
    results.push({ name, passed: false, durationMs, details: err.message || String(err) });
    return false;
  }
}

async function createSeededDb() {
  const db = new DatabaseService(':memory:');
  await db.initialize();

  await db.execute(`
    INSERT INTO warehouses (id, warehouse_code, name, address, city, is_default, is_active)
    VALUES 
    ('wh-src', 'WH-SRC', 'Source Warehouse Hub', 'Tejgaon', 'Dhaka', 1, 1),
    ('wh-dst', 'WH-DST', 'Destination Warehouse Hub', 'Agrabad', 'Chittagong', 0, 1),
    ('wh-aux', 'WH-AUX', 'Auxiliary Warehouse Hub', 'Airport Rd', 'Sylhet', 0, 1);
  `);

  await db.execute(`
    INSERT INTO warehouse_locations (id, warehouse_id, zone, aisle, rack, shelf, bin_code, is_active)
    VALUES 
    ('bin-s1', 'wh-src', 'Z1', 'A1', 'R1', 'S1', 'SRC-BIN-01', 1),
    ('bin-s2', 'wh-src', 'Z1', 'A1', 'R1', 'S2', 'SRC-BIN-02', 1),
    ('bin-d1', 'wh-dst', 'Z2', 'B1', 'R1', 'S1', 'DST-BIN-01', 1),
    ('bin-d2', 'wh-dst', 'Z2', 'B1', 'R1', 'S2', 'DST-BIN-02', 1);
  `);

  await db.execute(`
    INSERT INTO items (id, sku, name, category, cost_price, selling_price, is_active)
    VALUES 
    ('item-a', 'SKU-SOLAR-350W', 'Mono Solar Panel 350W', 'Solar', 150.0, 220.0, 1),
    ('item-b', 'SKU-INV-5KW', 'Hybrid Inverter 5kW', 'Inverter', 500.0, 750.0, 1),
    ('item-c', 'SKU-BAT-100AH', 'Lithium Battery 100Ah', 'Storage', 300.0, 450.0, 1);
  `);

  await db.execute(`
    INSERT INTO item_batches (id, batch_number, item_id, manufacture_date, expiry_date, unit_cost, initial_quantity, current_quantity, status)
    VALUES 
    ('batch-a1', 'LOT-A-001', 'item-a', '2026-01-01', '2028-01-01', 150.0, 500, 500, 'ACTIVE'),
    ('batch-a2', 'LOT-A-002', 'item-a', '2026-02-01', '2028-02-01', 155.0, 500, 500, 'ACTIVE'),
    ('batch-b1', 'LOT-B-001', 'item-b', '2026-01-15', '2029-01-15', 500.0, 200, 200, 'ACTIVE');
  `);

  return db;
}

async function main() {
  console.log('========================================================================');
  console.log('   PROBAHO ERP — EMPIRICAL ADVERSARIAL CONCURRENCY & ISOLATION PROBES   ');
  console.log('========================================================================');

  const transferSvc = TransferService.getInstance();

  // --------------------------------------------------------------------------
  // PROBE 1: 20-Way Parallel Un-Awaited receiveTransfer Race Contention
  // --------------------------------------------------------------------------
  await runAdversarialTest(
    'PROBE-01: 20-way simultaneous un-awaited receiveTransfer calls on same transfer',
    async () => {
      const db = await createSeededDb();

      // Seed 100 panels in Source bin 1
      await db.execute(
        `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved)
         VALUES ('stk-p1', 'item-a', 'wh-src', 'bin-s1', 'batch-a1', 100, 0)`
      );

      // Create and dispatch transfer of 40 units
      const tr = await transferSvc.createTransfer(
        {
          transferNumber: 'TR-ADV-20WAY-RECV',
          sourceWarehouseId: 'wh-src',
          destWarehouseId: 'wh-dst',
          requestedBy: 'Challenger Lead',
          items: [
            {
              itemId: 'item-a',
              sourceBinId: 'bin-s1',
              destBinId: 'bin-d1',
              batchId: 'batch-a1',
              quantityRequested: 40
            }
          ]
        },
        db
      );

      await transferSvc.dispatchTransfer(tr.id, 'Dispatch Agent', db);

      const lineId = tr.items[0].id;

      // Fire 20 parallel un-awaited receives simultaneously
      const callerCount = 20;
      const receivePromises = Array.from({ length: callerCount }, (_, i) =>
        transferSvc.receiveTransfer(
          {
            transferId: tr.id,
            receivedBy: `Parallel Receiver #${i + 1}`,
            items: [{ lineId, quantityReceived: 40 }]
          },
          undefined,
          undefined,
          db
        )
      );

      const outcomes = await Promise.allSettled(receivePromises);
      const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
      const rejected = outcomes.filter((o) => o.status === 'rejected');

      await assertCondition('Fulfilled count', fulfilled.length === 1, `Expected exactly 1 winner, got ${fulfilled.length}`);
      await assertCondition('Rejected count', rejected.length === 19, `Expected exactly 19 rejections, got ${rejected.length}`);

      // All 19 rejected must give clear concurrency rejection message
      for (const r of rejected) {
        if (r.status === 'rejected') {
          await assertCondition(
            'Rejection error message',
            r.reason?.message.includes("Cannot receive transfer: status is 'completed', expected 'in_transit'."),
            `Unexpected error: ${r.reason?.message}`
          );
        }
      }

      // Check destination warehouse stock: MUST BE EXACTLY 40 (NOT 800!)
      const destStock = await db.query<any>(
        'SELECT SUM(quantity_on_hand) as total FROM inventory_stock WHERE warehouse_id = "wh-dst" AND item_id = "item-a"'
      );
      const totalDest = Number(destStock[0]?.total || 0);
      await assertCondition('Destination stock count', totalDest === 40, `Expected exactly 40, found ${totalDest}`);

      // Check inventory_transactions: MUST BE EXACTLY 1 TRANSFER_IN
      const inTxs = await db.query<any>(
        'SELECT * FROM inventory_transactions WHERE transaction_type = "TRANSFER_IN" AND reference_id = "TR-ADV-20WAY-RECV"'
      );
      await assertCondition('Audit ledger count', inTxs.length === 1, `Expected exactly 1 TRANSFER_IN entry, found ${inTxs.length}`);

      await db.close();
      return `20-way contention: 1 winner, 19 rejected. Dest stock exactly 40, exactly 1 audit entry.`;
    }
  );

  // --------------------------------------------------------------------------
  // PROBE 2: Dispatch vs Cancel Race Condition
  // --------------------------------------------------------------------------
  await runAdversarialTest(
    'PROBE-02: Simultaneous race between dispatchTransfer and cancelTransfer on draft transfer',
    async () => {
      const db = await createSeededDb();

      // Seed 50 units in Source
      await db.execute(
        `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved)
         VALUES ('stk-p2', 'item-b', 'wh-src', 'bin-s1', 'batch-b1', 50, 0)`
      );

      const tr = await transferSvc.createTransfer(
        {
          transferNumber: 'TR-ADV-DISP-CANCEL-RACE',
          sourceWarehouseId: 'wh-src',
          destWarehouseId: 'wh-dst',
          requestedBy: 'Challenger',
          items: [
            {
              itemId: 'item-b',
              sourceBinId: 'bin-s1',
              destBinId: 'bin-d1',
              batchId: 'batch-b1',
              quantityRequested: 20
            }
          ]
        },
        db
      );

      // Fire dispatch and cancel concurrently
      const [dispatchRes, cancelRes] = await Promise.allSettled([
        transferSvc.dispatchTransfer(tr.id, 'Driver Speedy', db),
        transferSvc.cancelTransfer(tr.id, 'Abort Mission', 'Supervisor Emergency', db)
      ]);

      const updated = await transferSvc.getTransferById(tr.id, db);
      const finalStatus = updated?.status;

      const srcStock = await db.query<any>(
        'SELECT quantity_on_hand FROM inventory_stock WHERE id = "stk-p2"'
      );
      const currentSrcStock = srcStock[0].quantity_on_hand;

      if (dispatchRes.status === 'fulfilled') {
        // Dispatch won the race
        await assertCondition('Cancel rejection', cancelRes.status === 'rejected', 'Cancel should have been rejected');
        const cancelErr = (cancelRes as PromiseRejectedResult).reason?.message;
        await assertCondition(
          'Cancel rejection reason',
          cancelErr.includes('Cannot cancel transfer: items are already in transit.') ||
            cancelErr.includes('Cannot cancel transfer: transfer has already been completed.'),
          `Unexpected cancel error: ${cancelErr}`
        );
        await assertCondition('Final status', finalStatus === 'in_transit', `Expected in_transit, got ${finalStatus}`);
        await assertCondition('Source stock', currentSrcStock === 30, `Expected 30 (50-20), got ${currentSrcStock}`);
        await db.close();
        return `Dispatch won the race: status='in_transit', source stock decremented once to 30. Cancel safely rejected.`;
      } else {
        // Cancel won the race
        await assertCondition('Dispatch rejection', dispatchRes.status === 'rejected', 'Dispatch should have been rejected');
        const dispErr = (dispatchRes as PromiseRejectedResult).reason?.message;
        await assertCondition(
          'Dispatch rejection reason',
          dispErr.includes("Cannot dispatch transfer: status is 'cancelled'"),
          `Unexpected dispatch error: ${dispErr}`
        );
        await assertCondition('Final status', finalStatus === 'cancelled', `Expected cancelled, got ${finalStatus}`);
        await assertCondition('Source stock untouched', currentSrcStock === 50, `Expected 50, got ${currentSrcStock}`);
        await db.close();
        return `Cancel won the race: status='cancelled', source stock untouched at 50. Dispatch safely rejected.`;
      }
    }
  );

  // --------------------------------------------------------------------------
  // PROBE 3: In-Transit Receive vs Cancel Race
  // --------------------------------------------------------------------------
  await runAdversarialTest(
    'PROBE-03: Simultaneous race between receiveTransfer and cancelTransfer on in_transit transfer',
    async () => {
      const db = await createSeededDb();

      await db.execute(
        `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
         VALUES ('stk-p3', 'item-c', 'wh-src', 'bin-s2', 40, 0)`
      );

      const tr = await transferSvc.createTransfer(
        {
          transferNumber: 'TR-ADV-RECV-CANCEL-RACE',
          sourceWarehouseId: 'wh-src',
          destWarehouseId: 'wh-dst',
          requestedBy: 'Challenger',
          items: [
            {
              itemId: 'item-c',
              sourceBinId: 'bin-s2',
              destBinId: 'bin-d2',
              quantityRequested: 15
            }
          ]
        },
        db
      );

      await transferSvc.dispatchTransfer(tr.id, 'Driver', db);
      const lineId = tr.items[0].id;

      // Fire receive and cancel concurrently on in_transit transfer
      const [recvRes, cancelRes] = await Promise.allSettled([
        transferSvc.receiveTransfer(
          { transferId: tr.id, receivedBy: 'Receiver', items: [{ lineId, quantityReceived: 15 }] },
          undefined,
          undefined,
          db
        ),
        transferSvc.cancelTransfer(tr.id, 'Late Cancel', 'User', db)
      ]);

      // Receive MUST succeed
      await assertCondition('Receive success', recvRes.status === 'fulfilled', 'Receive should have succeeded');

      // Cancel MUST fail (either because in_transit or completed)
      await assertCondition('Cancel rejection', cancelRes.status === 'rejected', 'Cancel must be rejected');
      const cancelErrMsg = (cancelRes as PromiseRejectedResult).reason?.message;
      await assertCondition(
        'Cancel rejection reason',
        cancelErrMsg.includes('Cannot cancel transfer: items are already in transit.') ||
          cancelErrMsg.includes('Cannot cancel transfer: transfer has already been completed.'),
        `Unexpected cancel error: ${cancelErrMsg}`
      );

      const destStock = await db.query<any>('SELECT quantity_on_hand FROM inventory_stock WHERE warehouse_id = "wh-dst" AND item_id = "item-c"');
      await assertCondition('Dest stock received', destStock[0]?.quantity_on_hand === 15, `Expected 15, got ${destStock[0]?.quantity_on_hand}`);

      await db.close();
      return `Receive succeeded, illegal cancellation strictly blocked with '${cancelErrMsg}'.`;
    }
  );

  // --------------------------------------------------------------------------
  // PROBE 4: Complex Multi-Item Multi-Batch Conservation of Mass Under Discrepancy
  // --------------------------------------------------------------------------
  await runAdversarialTest(
    'PROBE-04: Complex multi-item, multi-bin, multi-batch transfer conservation of mass across all stages',
    async () => {
      const db = await createSeededDb();

      // Seed:
      // Item A Batch 1 in bin-s1: 80 units
      // Item A Batch 2 in bin-s2: 120 units
      // Item B Batch 1 in bin-s1: 60 units
      // Item C (no batch) in bin-s2: 90 units
      // Total Initial Global Mass = 80 + 120 + 60 + 90 = 350 units
      await db.execute(`
        INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved)
        VALUES 
        ('stk-m1', 'item-a', 'wh-src', 'bin-s1', 'batch-a1', 80, 0),
        ('stk-m2', 'item-a', 'wh-src', 'bin-s2', 'batch-a2', 120, 0),
        ('stk-m3', 'item-b', 'wh-src', 'bin-s1', 'batch-b1', 60, 0),
        ('stk-m4', 'item-c', 'wh-src', 'bin-s2', NULL, 90, 0);
      `);

      const initialMass = 350;

      // Transfer:
      // 30 of Item A (Batch 1, bin-s1 -> bin-d1)
      // 50 of Item A (Batch 2, bin-s2 -> bin-d2)
      // 20 of Item B (Batch 1, bin-s1 -> bin-d1)
      // 40 of Item C (no batch, bin-s2 -> bin-d2)
      // Total Shipped = 140 units.
      const tr = await transferSvc.createTransfer(
        {
          transferNumber: 'TR-ADV-MASS-001',
          sourceWarehouseId: 'wh-src',
          destWarehouseId: 'wh-dst',
          requestedBy: 'Mass Auditor',
          items: [
            { itemId: 'item-a', batchId: 'batch-a1', sourceBinId: 'bin-s1', destBinId: 'bin-d1', quantityRequested: 30 },
            { itemId: 'item-a', batchId: 'batch-a2', sourceBinId: 'bin-s2', destBinId: 'bin-d2', quantityRequested: 50 },
            { itemId: 'item-b', batchId: 'batch-b1', sourceBinId: 'bin-s1', destBinId: 'bin-d1', quantityRequested: 20 },
            { itemId: 'item-c', sourceBinId: 'bin-s2', destBinId: 'bin-d2', quantityRequested: 40 }
          ]
        },
        db
      );

      // STAGE 1: DRAFT
      let srcSum = await queryTotalWarehouseStock(db, 'wh-src');
      let dstSum = await queryTotalWarehouseStock(db, 'wh-dst');
      await assertCondition('Stage 1 Mass', srcSum + dstSum === initialMass, `Draft mass mismatch: ${srcSum + dstSum}`);

      // STAGE 2: DISPATCH (IN_TRANSIT)
      await transferSvc.dispatchTransfer(tr.id, 'Driver Mizan', db);
      srcSum = await queryTotalWarehouseStock(db, 'wh-src');
      dstSum = await queryTotalWarehouseStock(db, 'wh-dst');
      const inTransitMass = 140;

      await assertCondition('Stage 2 Source Stock', srcSum === 210, `Expected 210 in source, found ${srcSum}`);
      await assertCondition('Stage 2 Dest Stock', dstSum === 0, `Expected strictly 0 in destination, found ${dstSum}`);
      await assertCondition(
        'Stage 2 Conservation Equation',
        srcSum + dstSum + inTransitMass === initialMass,
        `Mass conservation breach during transit: ${srcSum + dstSum + inTransitMass} != ${initialMass}`
      );

      // STAGE 3: RECEIVE WITH TRANSIT DAMAGE / DISCREPANCY
      // Shipped: 30, 50, 20, 40
      // Received: 28 (2 damaged), 50 (0 damaged), 19 (1 lost), 37 (3 damaged)
      // Total Received = 28 + 50 + 19 + 37 = 134 units
      // Total Discrepancy = 2 + 0 + 1 + 3 = 6 units
      await transferSvc.receiveTransfer(
        {
          transferId: tr.id,
          receivedBy: 'Dest Auditor',
          items: [
            { lineId: tr.items[0].id, quantityReceived: 28, discrepancyReason: '2 cracked during transport' },
            { lineId: tr.items[1].id, quantityReceived: 50 },
            { lineId: tr.items[2].id, quantityReceived: 19, discrepancyReason: '1 box fell off truck' },
            { lineId: tr.items[3].id, quantityReceived: 37, discrepancyReason: '3 water damaged' }
          ]
        },
        undefined,
        undefined,
        db
      );

      srcSum = await queryTotalWarehouseStock(db, 'wh-src');
      dstSum = await queryTotalWarehouseStock(db, 'wh-dst');
      const totalLost = 6;

      await assertCondition('Stage 3 Source Stock', srcSum === 210, `Source stock changed: ${srcSum}`);
      await assertCondition('Stage 3 Dest Stock', dstSum === 134, `Expected 134 in dest, found ${dstSum}`);
      await assertCondition(
        'Stage 3 Conservation with Loss',
        srcSum + dstSum + totalLost === initialMass,
        `Mass + Loss conservation breach: ${srcSum} + ${dstSum} + ${totalLost} = ${srcSum + dstSum + totalLost} != ${initialMass}`
      );

      // Verify specific bin balances
      const d1Stock = await queryBinStock(db, 'bin-d1');
      const d2Stock = await queryBinStock(db, 'bin-d2');
      await assertCondition('Bin D1 items', d1Stock === 28 + 19, `Bin D1 mismatch: ${d1Stock}`);
      await assertCondition('Bin D2 items', d2Stock === 50 + 37, `Bin D2 mismatch: ${d2Stock}`);

      await db.close();
      return `Exact mass conservation: Initial 350 == Source(210) + Dest(134) + Discrepancy(6). Zero phantom leakage across bins/batches.`;
    }
  );

  // --------------------------------------------------------------------------
  // PROBE 5: High-Concurrency Exhaustive Depletion Race
  // --------------------------------------------------------------------------
  await runAdversarialTest(
    'PROBE-05: 12 concurrent transfers competing for 50 items to exhaustive depletion',
    async () => {
      const db = await createSeededDb();

      // Seed exactly 50 units in Source bin
      await db.execute(
        `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
         VALUES ('stk-exhaust', 'item-a', 'wh-src', 'bin-s1', 50, 0)`
      );

      // Create 12 transfers of 10 units each (total demand = 120 units, stock = 50)
      const transfers: any[] = [];
      for (let i = 1; i <= 12; i++) {
        const tr = await transferSvc.createTransfer(
          {
            transferNumber: `TR-EXHAUST-${i}`,
            sourceWarehouseId: 'wh-src',
            destWarehouseId: 'wh-dst',
            requestedBy: `Requester ${i}`,
            items: [
              {
                itemId: 'item-a',
                sourceBinId: 'bin-s1',
                destBinId: 'bin-d1',
                quantityRequested: 10
              }
            ]
          },
          db
        );
        transfers.push(tr);
      }

      // Dispatch all 12 simultaneously
      const dispatches = transfers.map((tr, idx) =>
        transferSvc.dispatchTransfer(tr.id, `Driver ${idx + 1}`, db)
      );

      const outcomes = await Promise.allSettled(dispatches);
      const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
      const rejected = outcomes.filter((o) => o.status === 'rejected');

      await assertCondition('Fulfilled count', fulfilled.length === 5, `Expected 5 to succeed, got ${fulfilled.length}`);
      await assertCondition('Rejected count', rejected.length === 7, `Expected 7 to fail, got ${rejected.length}`);

      const remainingStock = await db.query<any>(
        'SELECT quantity_on_hand FROM inventory_stock WHERE id = "stk-exhaust"'
      );
      const finalStock = remainingStock[0].quantity_on_hand;
      await assertCondition('Zero inventory floor', finalStock === 0, `Expected exactly 0, got ${finalStock}`);

      await db.close();
      return `Exactly 5 succeeded (50 units), exactly 7 rejected. Stock floor reached 0 with 0 negative drift.`;
    }
  );

  // --------------------------------------------------------------------------
  // FINAL SCORECARD
  // --------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('              ADVERSARIAL CHALLENGER VERIFICATION SCORECARD             ');
  console.log('========================================================================');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`  Total Adversarial Probes: ${results.length}`);
  console.log(`  Passed:                   ${passedCount}`);
  console.log(`  Failed:                   ${failedCount}`);
  console.log('========================================================================\n');

  if (failedCount > 0) {
    console.error('❌ [CHALLENGE FAILED] One or more adversarial probes detected violations!');
    process.exit(1);
  } else {
    console.log('✨ [CONFIRMED] All adversarial concurrency and stock isolation probes PASSED!');
    process.exit(0);
  }
}

async function queryTotalWarehouseStock(db: DatabaseService, warehouseId: string): Promise<number> {
  const res = await db.query<any>(
    'SELECT SUM(quantity_on_hand) as total FROM inventory_stock WHERE warehouse_id = ?',
    [warehouseId]
  );
  return Number(res[0]?.total || 0);
}

async function queryBinStock(db: DatabaseService, binId: string): Promise<number> {
  const res = await db.query<any>(
    'SELECT SUM(quantity_on_hand) as total FROM inventory_stock WHERE bin_id = ?',
    [binId]
  );
  return Number(res[0]?.total || 0);
}

main().catch((err) => {
  console.error('FATAL UNCAUGHT ERROR IN HARNESS:', err);
  process.exit(1);
});
