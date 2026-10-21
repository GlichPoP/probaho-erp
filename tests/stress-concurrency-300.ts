#!/usr/bin/env node
/**
 * ============================================================================
 * PROBAHO ERP — EMPIRICAL CONCURRENCY STRESS HARNESS (300 INTERLEAVED TX)
 * File: tests/stress-concurrency-300.ts
 * Target: src/services/db.ts (DatabaseService WebAssembly Engine)
 * ============================================================================
 *
 * Verifies:
 *  - 300 rapid interleaved transactions (200 committing, 100 aborting)
 *  - 0 savepoint collisions ("no such savepoint")
 *  - 0 database lock / busy errors
 *  - Atomic rollback guarantee (aborted tx leave 0 leaked rows)
 *  - Atomic commit guarantee (committed tx persist 100% of rows)
 *  - Database integrity check (PRAGMA integrity_check & foreign_key_check)
 */

import { DatabaseService } from '../src/services/db';
import * as fs from 'node:fs';
import * as path from 'node:path';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m'
};

async function runConcurrencyStressHarness() {
  console.log(`\n${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}    PROBAHO ERP — 300 RAPID INTERLEAVED TRANSACTIONS STRESS TEST       ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}\n`);

  const fixturesDir = path.join(process.cwd(), 'tests', 'fixtures');
  if (!fs.existsSync(fixturesDir)) fs.mkdirSync(fixturesDir, { recursive: true });

  const testDbPath = path.join(fixturesDir, `concurrency_300_${Date.now()}.db`);
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

  // Instantiate production DatabaseService pointing to testDbPath
  const db = new DatabaseService(testDbPath);
  await db.initialize();

  console.log(`${colors.gray}Database initialized at: ${testDbPath}${colors.reset}\n`);

  const TOTAL_TRANSACTIONS = 300;
  const ABORT_COUNT = 100;
  const COMMIT_COUNT = TOTAL_TRANSACTIONS - ABORT_COUNT; // 200

  // Pre-seed a base warehouse for reference
  await db.execute(
    `INSERT INTO warehouses (id, warehouse_code, name, address, city)
     VALUES ('wh-base-300', 'WH-BASE-300', 'Central Distribution Hub 300', 'Industrial Area', 'Dhaka');`
  );

  let savepointCollisionErrors = 0;
  let databaseLockErrors = 0;
  let unexpectedErrors: string[] = [];

  const startTime = Date.now();
  console.log(`${colors.yellow}⏳ Launching ${TOTAL_TRANSACTIONS} interleaved concurrent transactions (${COMMIT_COUNT} commits, ${ABORT_COUNT} aborts)...${colors.reset}`);

  // Create array of 300 transaction tasks shuffled
  const tasks = [];
  const shouldAbortFlags: boolean[] = [];

  for (let i = 0; i < TOTAL_TRANSACTIONS; i++) {
    shouldAbortFlags.push(i % 3 === 0); // ~100 aborts, ~200 commits
  }

  // Shuffle tasks to maximize interleaving
  for (let i = shouldAbortFlags.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shouldAbortFlags[i], shouldAbortFlags[j]] = [shouldAbortFlags[j], shouldAbortFlags[i]];
  }

  const actualAbortCount = shouldAbortFlags.filter(Boolean).length;
  const actualCommitCount = TOTAL_TRANSACTIONS - actualAbortCount;

  for (let i = 0; i < TOTAL_TRANSACTIONS; i++) {
    const txId = i;
    const shouldAbort = shouldAbortFlags[i];

    tasks.push(
      (async () => {
        // Random micro-delay before launching or within transaction to interleave async turns
        const preDelay = Math.floor(Math.random() * 10);
        if (preDelay > 0) {
          await new Promise((r) => setTimeout(r, preDelay));
        }

        try {
          return await db.transaction(async (tx) => {
            const supplierId = `sup-300-${txId}`;
            const supplierCode = `SUP-300-${txId.toString().padStart(4, '0')}`;

            // Step 1: Insert supplier
            await tx.execute(
              `INSERT INTO suppliers (id, supplier_code, name, phone, address, rating)
               VALUES (?, ?, ?, '+8801700000000', 'Test Zone', 4.5);`,
              [supplierId, supplierCode, `Supplier ${txId}`]
            );

            // Step 2: Random micro-pause during transaction execution
            const inTxDelay = Math.floor(Math.random() * 5);
            if (inTxDelay > 0) {
              await new Promise((r) => setTimeout(r, inTxDelay));
            }

            // Step 3: Insert courier or log record
            await tx.execute(
              `INSERT INTO couriers (id, name, service_type, contact_phone)
               VALUES (?, ?, 'Standard', '+8801900000000');`,
              [`cour-300-${txId}`, `Courier ${txId}`]
            );

            // Step 4: If designated to abort, throw error
            if (shouldAbort) {
              throw new Error(`ABORT_INTENTIONAL_${txId}`);
            }

            return { success: true, txId };
          });
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          if (errMsg.includes('no such savepoint')) {
            savepointCollisionErrors++;
          } else if (errMsg.includes('locked') || errMsg.includes('busy')) {
            databaseLockErrors++;
          } else if (!errMsg.includes('ABORT_INTENTIONAL_')) {
            unexpectedErrors.push(`Tx ${txId}: ${errMsg}`);
          }
          return { success: false, txId, error: errMsg };
        }
      })()
    );
  }

  // Execute all 300 transactions concurrently
  const outcomes = await Promise.all(tasks);
  const durationMs = Date.now() - startTime;

  console.log(`${colors.green}✔ Completed 300 transactions in ${durationMs}ms (${(durationMs / TOTAL_TRANSACTIONS).toFixed(2)}ms/tx)${colors.reset}\n`);

  // Verify counts
  const succeededTxs = outcomes.filter((o) => o.success);
  const failedTxs = outcomes.filter((o) => !o.success);

  console.log(`  Succeeded Transactions: ${colors.green}${succeededTxs.length}${colors.reset} (Expected: ${actualCommitCount})`);
  console.log(`  Aborted Transactions:   ${colors.yellow}${failedTxs.length}${colors.reset} (Expected: ${actualAbortCount})`);
  console.log(`  Savepoint Collisions:   ${savepointCollisionErrors === 0 ? colors.green : colors.red}${savepointCollisionErrors}${colors.reset}`);
  console.log(`  Database Lock Errors:   ${databaseLockErrors === 0 ? colors.green : colors.red}${databaseLockErrors}${colors.reset}`);
  if (unexpectedErrors.length > 0) {
    console.log(`  Unexpected Errors:      ${colors.red}${unexpectedErrors.length}${colors.reset}`);
    unexpectedErrors.slice(0, 5).forEach((e) => console.log(`   - ${e}`));
  }

  // Verify database state
  console.log(`\n${colors.cyan}--- Verifying Database Integrity & Isolation ---${colors.reset}`);

  // 1. Count suppliers: must equal exact actualCommitCount
  const supRows = await db.query<{ count: number }>('SELECT count(*) as count FROM suppliers WHERE id LIKE "sup-300-%";');
  const actualSupCount = Number(supRows[0].count);
  console.log(`  Committed Suppliers in DB: ${actualSupCount} (Expected: ${actualCommitCount})`);

  // 2. Count couriers: must equal exact actualCommitCount
  const courRows = await db.query<{ count: number }>('SELECT count(*) as count FROM couriers WHERE id LIKE "cour-300-%";');
  const actualCourCount = Number(courRows[0].count);
  console.log(`  Committed Couriers in DB:  ${actualCourCount} (Expected: ${actualCommitCount})`);

  // 3. Verify zero aborted records leaked
  let leakedSuppliers = 0;
  for (let i = 0; i < TOTAL_TRANSACTIONS; i++) {
    if (shouldAbortFlags[i]) {
      const checkRows = await db.query('SELECT id FROM suppliers WHERE id = ?;', [`sup-300-${i}`]);
      if (checkRows.length > 0) leakedSuppliers++;
    }
  }
  console.log(`  Aborted Rows Leaked:       ${leakedSuppliers === 0 ? colors.green : colors.red}${leakedSuppliers}${colors.reset}`);

  // 4. PRAGMA integrity_check
  const integrity = await db.query<{ integrity_check: string }>('PRAGMA integrity_check;');
  const isIntegrityOk = integrity.length > 0 && integrity[0].integrity_check === 'ok';
  console.log(`  PRAGMA integrity_check:    ${isIntegrityOk ? colors.green + 'ok' : colors.red + 'FAIL'}${colors.reset}`);

  // 5. PRAGMA foreign_key_check
  const fkViolations = await db.query('PRAGMA foreign_key_check;');
  console.log(`  PRAGMA foreign_key_check:  ${fkViolations.length === 0 ? colors.green + '0 violations' : colors.red + fkViolations.length + ' violations'}${colors.reset}`);

  // Cleanup
  await db.close();
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  if (fs.existsSync(fixturesDir)) {
    try { fs.rmSync(fixturesDir, { recursive: true, force: true }); } catch {}
  }

  // Final evaluation
  const passed =
    savepointCollisionErrors === 0 &&
    databaseLockErrors === 0 &&
    unexpectedErrors.length === 0 &&
    succeededTxs.length === actualCommitCount &&
    failedTxs.length === actualAbortCount &&
    actualSupCount === actualCommitCount &&
    actualCourCount === actualCommitCount &&
    leakedSuppliers === 0 &&
    isIntegrityOk &&
    fkViolations.length === 0;

  console.log(`\n${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  if (passed) {
    console.log(`${colors.bold}${colors.green}✔ CONCURRENCY CHALLENGE VERDICT: CONFIRMED (300/300 TX VERIFIED)${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`${colors.bold}${colors.red}❌ CONCURRENCY CHALLENGE VERDICT: CHALLENGE_FAILED${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}\n`);
    process.exit(1);
  }
}

runConcurrencyStressHarness().catch((err) => {
  console.error('Fatal concurrency test error:', err);
  process.exit(1);
});
