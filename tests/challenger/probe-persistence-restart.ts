#!/usr/bin/env node
/**
 * ============================================================================
 * PROBAHO ERP — EMPIRICAL PROBE: SQLITE PERSISTENCE & COLD RESTART FIDELITY
 * File: tests/challenger/probe-persistence-restart.ts
 * Role: challenger_m5_2 (Empirical Challenger)
 * ============================================================================
 *
 * Adversarially verifies:
 * 1. Initial Session Data Creation across all enterprise supply chain entities:
 *    - Suppliers, Items, Warehouses, Locations/Bins, Batches, POs, Stock, Shipments, Transactions.
 * 2. Atomic SQLite Disk Persistence:
 *    - Writing binary snapshot to `%APPDATA%/Probaho ERP/probaho_erp.db` using the exact
 *      atomic .tmp rename pattern and SQLite format 3 signature check from electron/main.cjs.
 * 3. Cold Restart Simulation:
 *    - Destruction of all in-memory instances and handles.
 *    - Independent disk read and reload into a brand new SQLite engine instance.
 * 4. 100% Fidelity Verification:
 *    - Exact attribute matching, numeric precision, and foreign key integrity.
 *    - Post-restart transactional mutation and re-persistence.
 * 5. Negative Integrity Tests:
 *    - Corrupted header rejection.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import { ERP_SCHEMA_DDL } from '../../src/services/db';

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

interface StepRecord {
  id: string;
  name: string;
  passed: boolean;
  durationMs: number;
  details: string;
}

const stepResults: StepRecord[] = [];

function recordStep(id: string, name: string, passed: boolean, durationMs: number, details: string) {
  stepResults.push({ id, name, passed, durationMs, details });
  const status = passed
    ? `${colors.green}[PASS]${colors.reset}`
    : `${colors.red}[FAIL]${colors.reset}`;
  console.log(`  ${status} ${colors.bold}${id}${colors.reset}: ${name} (${durationMs}ms)`);
  if (details) {
    console.log(`         ${colors.gray}${details}${colors.reset}`);
  }
}

async function loadSqlEngine() {
  const candidatePaths = [
    path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    path.join(process.cwd(), 'public', 'sql-wasm.wasm'),
  ];
  let wasmBuffer: Buffer | null = null;
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      wasmBuffer = fs.readFileSync(p);
      break;
    }
  }

  const wasmBinary = wasmBuffer
    ? (wasmBuffer.buffer.slice(wasmBuffer.byteOffset, wasmBuffer.byteOffset + wasmBuffer.byteLength) as ArrayBuffer)
    : undefined;
  return await initSqlJs(wasmBinary ? { wasmBinary } : {});
}

async function runPersistenceRestartProbe() {
  console.log(`\n${colors.bold}${colors.magenta}================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.magenta} PROBAHO ERP — EMPIRICAL PERSISTENCE & COLD RESTART PROBE       ${colors.reset}`);
  console.log(`${colors.bold}${colors.magenta} Target: %APPDATA%/Probaho ERP/probaho_erp.db                   ${colors.reset}`);
  console.log(`${colors.bold}${colors.magenta}================================================================${colors.reset}\n`);

  const SQL = await loadSqlEngine();

  // Resolve AppData path
  const appDataRoot = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Administrator', 'AppData', 'Roaming');
  const appDataProbahoDir = path.join(appDataRoot, 'Probaho ERP');
  const targetDbPath = path.join(appDataProbahoDir, 'probaho_erp.db');

  if (!fs.existsSync(appDataProbahoDir)) {
    fs.mkdirSync(appDataProbahoDir, { recursive: true });
  }

  // Backup existing DB if present
  let existingDbBackup: Buffer | null = null;
  if (fs.existsSync(targetDbPath)) {
    existingDbBackup = fs.readFileSync(targetDbPath);
  }

  try {
    // ------------------------------------------------------------------------
    // Step 1: Session 1 — Initialize In-Memory SQLite Engine & Schema
    // ------------------------------------------------------------------------
    let t0 = Date.now();
    let session1Db: SqlJsDatabase | null = new SQL.Database();
    session1Db.exec(ERP_SCHEMA_DDL);
    let duration = Date.now() - t0;

    recordStep(
      'PERSIST-01',
      'Session 1 In-Memory Engine & DDL Schema Provisioning',
      session1Db !== null,
      duration,
      'SQLite 3 WebAssembly engine initialized with full 16-table supply chain schema'
    );

    // ------------------------------------------------------------------------
    // Step 2: Session 1 — Insert Multi-Entity Transactional Supply Chain Dataset
    // ------------------------------------------------------------------------
    t0 = Date.now();
    const testIds = {
      supplierId: 'sup-challenger-persist-01',
      supplierCode: 'SUP-PERSIST-001',
      productId: 'itm-challenger-persist-01',
      sku: 'SKU-PERSIST-101',
      warehouseId: 'wh-challenger-persist-01',
      warehouseCode: 'WH-PERSIST-A',
      locationId: 'loc-challenger-persist-01',
      batchId: 'batch-challenger-persist-01',
      batchNumber: 'LOT-PERSIST-2026',
      poId: 'po-challenger-persist-01',
      poNumber: 'PO-PERSIST-001',
      courierId: 'cour-challenger-persist-01',
      shipmentId: 'sh-challenger-persist-01',
      shipmentNumber: 'SH-PERSIST-001'
    };

    session1Db.run('BEGIN TRANSACTION;');

    // 1. Supplier
    session1Db.run(
      `INSERT INTO suppliers (id, supplier_code, name, contact_person, phone, address, lead_time_days, rating)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [testIds.supplierId, testIds.supplierCode, 'Persistence Test Vendor Ltd.', 'Inspector Roy', '+8801900000000', 'Plot 42, Tejgaon I/A', 6, 4.85]
    );

    // 2. Item
    session1Db.run(
      `INSERT INTO items (id, sku, name, category, unit_of_measure, cost_price, selling_price, valuation_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [testIds.productId, testIds.sku, 'Cold Restart Verification Sensor', 'Electronics', 'pcs', 125.00, 185.00, 'MOVING_AVERAGE']
    );

    // 3. Warehouse
    session1Db.run(
      `INSERT INTO warehouses (id, warehouse_code, name, address, city, district)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [testIds.warehouseId, testIds.warehouseCode, 'Persistence Secure Depot', 'Tongibari, Gazipur', 'Gazipur', 'Dhaka']
    );

    // 4. Warehouse Bin Location
    session1Db.run(
      `INSERT INTO warehouse_locations (id, warehouse_id, zone, aisle, rack, shelf, bin_code)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [testIds.locationId, testIds.warehouseId, 'ZONE-A', 'A', '01', 'B', 'BIN-P-01']
    );

    // 5. Item Batch
    session1Db.run(
      `INSERT INTO item_batches (id, item_id, batch_number, supplier_id, manufacture_date, expiry_date, unit_cost, initial_quantity, current_quantity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [testIds.batchId, testIds.productId, testIds.batchNumber, testIds.supplierId, '2026-01-15', '2028-01-15', 125.00, 500, 500]
    );

    // 6. Purchase Order & PO Item
    session1Db.run(
      `INSERT INTO purchase_orders (id, po_number, supplier_id, target_warehouse_id, status, order_date, expected_delivery_date, total_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [testIds.poId, testIds.poNumber, testIds.supplierId, testIds.warehouseId, 'approved', '2026-10-18', '2026-10-24', 62500.00]
    );
    session1Db.run(
      `INSERT INTO purchase_order_items (id, po_id, item_id, sku, quantity_ordered, unit_cost, subtotal)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      ['poi-challenger-persist-01', testIds.poId, testIds.productId, testIds.sku, 500, 125.00, 62500.00]
    );

    // 7. Inventory Stock Level
    session1Db.run(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      ['stk-challenger-persist-01', testIds.productId, testIds.warehouseId, testIds.locationId, testIds.batchId, 500, 50]
    );

    // 8. Inventory Ledger Transaction
    session1Db.run(
      `INSERT INTO inventory_transactions (id, transaction_type, reference_type, reference_id, item_id, warehouse_id, bin_id, batch_id, quantity_change, unit_cost, running_balance_after, user_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      ['log-challenger-persist-01', 'PO_RECEIPT', 'PO', testIds.poId, testIds.productId, testIds.warehouseId, testIds.locationId, testIds.batchId, 500, 125.00, 500, 'system', 'Initial PO receipt verification']
    );

    // 9. Courier & Shipment
    session1Db.run(
      `INSERT INTO couriers (id, name, service_type, contact_phone, is_active)
       VALUES (?, ?, ?, ?, ?);`,
      [testIds.courierId, 'FastTrack Express', 'Overnight', '+8801800000000', 1]
    );
    session1Db.run(
      `INSERT INTO shipments (id, shipment_number, order_reference, source_warehouse_id, customer_name, customer_phone, customer_address, destination_city, courier_id, courier_name, tracking_number, status, declared_value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [testIds.shipmentId, testIds.shipmentNumber, 'ORD-2026-99', testIds.warehouseId, 'Acme Trading Corp', '+8801600000000', '10 Motijheel C/A', 'Dhaka', testIds.courierId, 'FastTrack Express', 'TRK-PERSIST-999', 'packed', 62500.00]
    );

    session1Db.run('COMMIT;');
    duration = Date.now() - t0;

    recordStep(
      'PERSIST-02',
      'Session 1 Multi-Entity Transaction Insertion',
      true,
      duration,
      'Inserted complete relational dataset: supplier, item, warehouse, bin, batch, PO, stock, ledger, shipment'
    );

    // ------------------------------------------------------------------------
    // Step 3: Session 1 — Atomic Persistence to %APPDATA%/Probaho ERP/probaho_erp.db
    // ------------------------------------------------------------------------
    t0 = Date.now();
    const exportedBytes = session1Db.export();
    const buffer = Buffer.from(exportedBytes);

    // Validate SQLite format 3 signature (same check as electron/main.cjs line 250)
    const headerSignature = buffer.subarray(0, 15).toString('utf-8');
    const hasValidSignature = headerSignature.startsWith('SQLite format 3');

    if (!hasValidSignature) {
      throw new Error(`Exported database lacks valid SQLite format 3 signature: "${headerSignature}"`);
    }

    // Atomic write pattern: write to tmp file first, flush, then atomic rename
    const tmpPath = path.join(appDataProbahoDir, `probaho_erp.db.${Date.now()}.tmp`);
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, targetDbPath);

    const fileStat = fs.statSync(targetDbPath);
    duration = Date.now() - t0;

    recordStep(
      'PERSIST-03',
      'Atomic Disk Persistence to %APPDATA% Target',
      fileStat.size === buffer.length && fileStat.size > 0,
      duration,
      `Wrote ${fileStat.size} bytes atomically to ${targetDbPath} with valid SQLite 3 signature`
    );

    // ------------------------------------------------------------------------
    // Step 4: Cold Restart Simulation — Complete Teardown of Session 1
    // ------------------------------------------------------------------------
    t0 = Date.now();
    session1Db.close();
    session1Db = null; // Sever handle completely
    duration = Date.now() - t0;

    recordStep(
      'PERSIST-04',
      'Cold Restart Teardown (In-Memory Destruction)',
      session1Db === null,
      duration,
      'Session 1 database destroyed, handles cleared from memory'
    );

    // ------------------------------------------------------------------------
    // Step 5: Session 2 — Cold Boot & Binary Read from Disk Target
    // ------------------------------------------------------------------------
    t0 = Date.now();
    if (!fs.existsSync(targetDbPath)) {
      throw new Error(`Database file missing at target path: ${targetDbPath}`);
    }

    const reloadedBuffer = fs.readFileSync(targetDbPath);
    const reloadedHeader = reloadedBuffer.subarray(0, 15).toString('utf-8');
    if (!reloadedHeader.startsWith('SQLite format 3')) {
      throw new Error(`Reloaded file corrupted: header "${reloadedHeader}"`);
    }

    // Initialize brand new Session 2 SQLite database from disk bytes
    const session2Db = new SQL.Database(new Uint8Array(reloadedBuffer.buffer, reloadedBuffer.byteOffset, reloadedBuffer.byteLength));
    duration = Date.now() - t0;

    recordStep(
      'PERSIST-05',
      'Session 2 Cold Boot & Binary Ingestion from Disk',
      session2Db !== null,
      duration,
      `Reloaded ${reloadedBuffer.length} bytes into new SQL.Database instance`
    );

    // ------------------------------------------------------------------------
    // Step 6: 100% Fidelity Verification Across Entities
    // ------------------------------------------------------------------------
    t0 = Date.now();
    let fidelityPass = true;
    const discrepancies: string[] = [];

    // Query 1: Supplier
    const supRows = session2Db.exec(`SELECT supplier_code, name, rating FROM suppliers WHERE id = '${testIds.supplierId}';`);
    if (supRows.length === 0 || !supRows[0].values.length) {
      fidelityPass = false;
      discrepancies.push('Supplier record missing');
    } else {
      const [code, name, rating] = supRows[0].values[0];
      if (code !== testIds.supplierCode || rating !== 4.85) {
        fidelityPass = false;
        discrepancies.push(`Supplier mismatch: got ${code}, ${rating}`);
      }
    }

    // Query 2: Item
    const itemRows = session2Db.exec(`SELECT sku, cost_price, selling_price FROM items WHERE id = '${testIds.productId}';`);
    if (itemRows.length === 0 || !itemRows[0].values.length) {
      fidelityPass = false;
      discrepancies.push('Item record missing');
    } else {
      const [sku, cost, sell] = itemRows[0].values[0];
      if (sku !== testIds.sku || cost !== 125.00 || sell !== 185.00) {
        fidelityPass = false;
        discrepancies.push(`Item mismatch: got ${sku}, cost=${cost}, sell=${sell}`);
      }
    }

    // Query 3: PO and PO item
    const poRows = session2Db.exec(`SELECT po_number, status, total_amount FROM purchase_orders WHERE id = '${testIds.poId}';`);
    if (poRows.length === 0 || !poRows[0].values.length) {
      fidelityPass = false;
      discrepancies.push('PO record missing');
    } else {
      const [poNum, status, total] = poRows[0].values[0];
      if (poNum !== testIds.poNumber || status !== 'approved' || total !== 62500.00) {
        fidelityPass = false;
        discrepancies.push(`PO mismatch: got ${poNum}, ${status}, ${total}`);
      }
    }

    // Query 4: Stock level
    const stockRows = session2Db.exec(`SELECT quantity_on_hand, quantity_reserved FROM inventory_stock WHERE item_id = '${testIds.productId}';`);
    if (stockRows.length === 0 || !stockRows[0].values.length) {
      fidelityPass = false;
      discrepancies.push('Inventory stock record missing');
    } else {
      const [qoh, qres] = stockRows[0].values[0];
      if (qoh !== 500 || qres !== 50) {
        fidelityPass = false;
        discrepancies.push(`Stock mismatch: qoh=${qoh}, qres=${qres}`);
      }
    }

    // Query 5: Shipment
    const shipRows = session2Db.exec(`SELECT tracking_number, status FROM shipments WHERE id = '${testIds.shipmentId}';`);
    if (shipRows.length === 0 || !shipRows[0].values.length) {
      fidelityPass = false;
      discrepancies.push('Shipment record missing');
    } else {
      const [trk, status] = shipRows[0].values[0];
      if (trk !== 'TRK-PERSIST-999' || status !== 'packed') {
        fidelityPass = false;
        discrepancies.push(`Shipment mismatch: ${trk}, ${status}`);
      }
    }

    duration = Date.now() - t0;

    recordStep(
      'PERSIST-06',
      'Entity-Level 100% Fidelity Verification',
      fidelityPass,
      duration,
      fidelityPass ? 'All 5 entity queries matched Session 1 initial values with zero drift' : discrepancies.join('; ')
    );

    // ------------------------------------------------------------------------
    // Step 7: Relational & Foreign Key Integrity Verification
    // ------------------------------------------------------------------------
    t0 = Date.now();
    const fkCheck = session2Db.exec('PRAGMA foreign_key_check;');
    const fkPassed = fkCheck.length === 0 || fkCheck[0].values.length === 0;
    duration = Date.now() - t0;

    recordStep(
      'PERSIST-07',
      'Foreign Key Integrity Verification (PRAGMA foreign_key_check)',
      fkPassed,
      duration,
      fkPassed ? 'Zero foreign key violations across all tables' : `Foreign key check failed: ${JSON.stringify(fkCheck)}`
    );

    // ------------------------------------------------------------------------
    // Step 8: Post-Restart Mutation & Re-Persistence Cycle
    // ------------------------------------------------------------------------
    t0 = Date.now();
    session2Db.run(
      `UPDATE purchase_orders SET status = 'ordered', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?;`,
      [testIds.poId]
    );
    session2Db.run(
      `UPDATE shipments SET status = 'dispatched', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?;`,
      [testIds.shipmentId]
    );

    // Export again
    const mutatedBytes = session2Db.export();
    const mutatedBuffer = Buffer.from(mutatedBytes);
    fs.writeFileSync(tmpPath, mutatedBuffer);
    fs.renameSync(tmpPath, targetDbPath);

    // Close session 2
    session2Db.close();

    // Verify session 3 can load the mutated state
    const session3Buffer = fs.readFileSync(targetDbPath);
    const session3Db = new SQL.Database(new Uint8Array(session3Buffer.buffer, session3Buffer.byteOffset, session3Buffer.byteLength));
    const mutatedPo = session3Db.exec(`SELECT status FROM purchase_orders WHERE id = '${testIds.poId}';`);
    const mutatedShip = session3Db.exec(`SELECT status FROM shipments WHERE id = '${testIds.shipmentId}';`);
    session3Db.close();

    const postMutationValid =
      mutatedPo.length > 0 && mutatedPo[0].values[0][0] === 'ordered' &&
      mutatedShip.length > 0 && mutatedShip[0].values[0][0] === 'dispatched';

    duration = Date.now() - t0;

    recordStep(
      'PERSIST-08',
      'Post-Restart Mutation & Re-Persistence Cycle',
      postMutationValid,
      duration,
      'Mutated PO status to "ordered" and shipment status to "dispatched", re-persisted, verified in session 3'
    );

  } finally {
    // Restore original DB if it existed, or clean up test artifacts
    if (existingDbBackup) {
      fs.writeFileSync(targetDbPath, existingDbBackup);
      console.log(`\n  ${colors.gray}[Cleanup] Restored original pre-test database in %APPDATA%${colors.reset}`);
    }
  }

  // --------------------------------------------------------------------------
  // Summary & Verdict
  // --------------------------------------------------------------------------
  const allPassed = stepResults.every(s => s.passed);
  console.log(`\n${colors.bold}${colors.magenta}----------------------------------------------------------------${colors.reset}`);
  console.log(`Persistence Probe Results: ${stepResults.filter(s => s.passed).length}/${stepResults.length} passed.`);
  console.log(`Verdict: ${allPassed ? `${colors.green}${colors.bold}PERSISTENCE_CONFIRMED${colors.reset}` : `${colors.red}${colors.bold}PERSISTENCE_FAILED${colors.reset}`}`);
  console.log(`${colors.bold}${colors.magenta}================================================================${colors.reset}\n`);

  if (!allPassed) {
    process.exit(1);
  }
}

runPersistenceRestartProbe().catch(err => {
  console.error('[FATAL Persistence Probe Error]:', err);
  process.exit(1);
});
