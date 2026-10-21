/**
 * ============================================================================
 * PROBAHO ERP: EMPIRICAL CHALLENGER TIER 5 FAULT-INJECTION & ADVERSARIAL SUITE
 * File: tests/challenger/m6-tier5-fault-adversarial.ts
 *
 * Scope:
 * Phase 2 Tier 5 Adversarial Coverage Hardening for Milestone 6:
 * 1. White-box security & fault tolerance analysis:
 *    - Sibling directory traversal in `db-restore` when `useDialog: false`
 *    - Permissive `file:` navigation in `will-navigate`
 *    - Null-terminated 16-byte SQLite header check
 * 2. Fault injection against `src/services/backupService.ts` and `src/services/db.ts`:
 *    - Restoring truncated, malformed, or tampered JSON snapshots
 *    - Restoring corrupted, zero-byte, or garbage SQLite binary blobs
 *    - Foreign key cascading and RESTRICT constraint enforcement
 *    - Atomic rollback and pre-restore database state preservation
 * 3. Preload Context Bridge and IPC surface validation
 * ============================================================================
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseService } from '../../src/services/db.ts';
import { BackupService } from '../../src/services/backupService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI Styling
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
  category: 'ELECTRON_SHELL' | 'FAULT_INJECTION_JSON' | 'FAULT_INJECTION_SQLITE' | 'RELATIONAL_INVARIANTS' | 'PRELOAD_BRIDGE';
  passed: boolean;
  isVulnerabilityOrGap: boolean;
  durationMs: number;
  details: string;
  reproductionNotes?: string;
  recommendation?: string;
}

const probeResults: ProbeResult[] = [];

async function executeProbe(
  id: string,
  category: ProbeResult['category'],
  name: string,
  fn: () => Promise<{ passed: boolean; isVulnerabilityOrGap: boolean; details: string; reproductionNotes?: string; recommendation?: string }>
): Promise<void> {
  const t0 = Date.now();
  console.log(`\n${colors.yellow}⏳ [${id}] ${name}...${colors.reset}`);
  try {
    const outcome = await fn();
    const durationMs = Date.now() - t0;
    const statusTag = outcome.passed
      ? `${colors.green}✔ PROBE VERIFIED${colors.reset}`
      : `${colors.red}✘ PROBE FAILED${colors.reset}`;

    const gapTag = outcome.isVulnerabilityOrGap
      ? ` ${colors.red}${colors.bold}[GAP CONFIRMED]${colors.reset}`
      : ` ${colors.green}[ROBUST]${colors.reset}`;

    console.log(`${statusTag}${gapTag} ${colors.bold}[${id}] ${name}${colors.reset} \x1b[90m(${durationMs}ms)\x1b[0m`);
    console.log(`   ${colors.gray}↳ ${outcome.details}${colors.reset}`);
    if (outcome.reproductionNotes) {
      console.log(`   ${colors.magenta}↳ Repro: ${outcome.reproductionNotes}${colors.reset}`);
    }
    if (outcome.recommendation) {
      console.log(`   ${colors.cyan}↳ Fix: ${outcome.recommendation}${colors.reset}`);
    }

    probeResults.push({
      id,
      name,
      category,
      passed: outcome.passed,
      isVulnerabilityOrGap: outcome.isVulnerabilityOrGap,
      durationMs,
      details: outcome.details,
      reproductionNotes: outcome.reproductionNotes,
      recommendation: outcome.recommendation
    });
  } catch (err: any) {
    const durationMs = Date.now() - t0;
    console.error(`${colors.red}✘ CRASH [${id}] ${name} (${durationMs}ms)${colors.reset}`);
    console.error(`   ${colors.red}↳ Unhandled Exception: ${err.message || String(err)}${colors.reset}`);
    probeResults.push({
      id,
      name,
      category,
      passed: false,
      isVulnerabilityOrGap: true,
      durationMs,
      details: `Crash: ${err.message || String(err)}`
    });
  }
}

// ============================================================================
// MAIN EXECUTION HARNESS
// ============================================================================
async function runAllChallengerProbes() {
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}    PROBAHO ERP — TIER 5 FAULT-INJECTION & ADVERSARIAL CHALLENGER SUITE ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}`);

  const backupService = BackupService.getInstance();
  const testDbPath = ':memory:';
  const db = new DatabaseService(testDbPath);
  await db.initialize();

  // --------------------------------------------------------------------------
  // SUITE 1: Electron Main Process Security White-Box Probes
  // --------------------------------------------------------------------------

  // PROBE 1.1: Sibling Directory Traversal in db-restore without Dialog
  await executeProbe(
    'PROBE-5.1.1',
    'ELECTRON_SHELL',
    'Sibling Directory Traversal in db-restore when useDialog is false',
    async () => {
      const simulatedUserData = 'C:\\Users\\Administrator\\AppData\\Roaming\\Probaho ERP';
      const backupDir = path.resolve(path.join(simulatedUserData, 'backups'));
      const siblingEvilDir = path.resolve(path.join(simulatedUserData, 'backups_evil'));
      const maliciousTarget = path.join(siblingEvilDir, 'malicious_exploit.db');
      const legitimateTarget = path.join(backupDir, 'legitimate_backup.db');

      // Verify that electron/main.cjs implements the path.relative boundary check
      const mainCjsPath = path.resolve(__dirname, '../../electron/main.cjs');
      const mainCjsContent = fs.readFileSync(mainCjsPath, 'utf-8');

      const hasRelativeCheck =
        mainCjsContent.includes('const rel = path.relative(backupDir, resolvedTarget);') &&
        mainCjsContent.includes("if (rel.startsWith('..') || path.isAbsolute(rel))");
      const hasOldFlawedCheck = mainCjsContent.includes('!resolvedTarget.startsWith(backupDir)');

      // Emulate the IPC check logic in main.cjs:366
      const checkBoundary = (targetPath: string) => {
        const resolvedTarget = path.resolve(targetPath);
        const rel = path.relative(backupDir, resolvedTarget);
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
          throw new Error('Direct restore without dialog is restricted to the internal backups directory');
        }
        return true;
      };

      let siblingBlocked = false;
      try {
        checkBoundary(maliciousTarget);
      } catch {
        siblingBlocked = true;
      }

      let legitimateAllowed = false;
      try {
        legitimateAllowed = checkBoundary(legitimateTarget);
      } catch {}

      const isRobust = hasRelativeCheck && !hasOldFlawedCheck && siblingBlocked && legitimateAllowed;

      if (!isRobust) {
        return {
          passed: false,
          isVulnerabilityOrGap: true,
          details: `Path boundary check failed: hasRelativeCheck=${hasRelativeCheck}, hasOldFlawedCheck=${hasOldFlawedCheck}, siblingBlocked=${siblingBlocked}, legitimateAllowed=${legitimateAllowed}`
        };
      }

      return {
        passed: true,
        isVulnerabilityOrGap: false,
        details: 'Boundary check strictly verified in electron/main.cjs: path.relative enforces folder boundaries, correctly rejecting sibling directory traversal ("backups_evil") while allowing valid internal backups.'
      };
    }
  );

  // PROBE 1.2: Permissive file: Protocol Navigation in will-navigate
  await executeProbe(
    'PROBE-5.1.2',
    'ELECTRON_SHELL',
    'Permissive file: Protocol Navigation in will-navigate allows arbitrary local file access',
    async () => {
      // Verify that electron/main.cjs restricts file: protocol navigation
      const mainCjsPath = path.resolve(__dirname, '../../electron/main.cjs');
      const mainCjsContent = fs.readFileSync(mainCjsPath, 'utf-8');

      const hasRestrictedFileNav =
        mainCjsContent.includes('targetFile === path.normalize(indexPath) || targetFile.startsWith(distDir)');
      const hasUnconditionalFileReturn = mainCjsContent.includes("if (parsed.protocol === 'file:') {\n          return;\n        }");

      const indexPath = path.resolve(__dirname, '../../dist/index.html');
      const distDir = path.dirname(indexPath);

      // Emulate main.cjs navigation guard
      const allowsNavigation = (navigationUrl: string): boolean => {
        try {
          const parsed = new URL(navigationUrl);
          if (parsed.protocol === 'file:') {
            const targetFile = path.normalize(decodeURIComponent(parsed.pathname).replace(/^\/([a-zA-Z]:)/, '$1'));
            if (targetFile === path.normalize(indexPath) || targetFile.startsWith(path.normalize(distDir))) {
              return true; // allowed
            }
            return false; // prevented by event.preventDefault()
          }
        } catch {}
        return false;
      };

      const maliciousUrls = [
        'file:///C:/Windows/System32/drivers/etc/hosts',
        'file:///C:/Users/Administrator/.ssh/id_rsa',
        'file:///C:/Windows/win.ini'
      ];

      const allowedMalicious: string[] = [];
      for (const url of maliciousUrls) {
        if (allowsNavigation(url)) {
          allowedMalicious.push(url);
        }
      }

      // Verify legitimate app bundle navigation is allowed
      const bundleEntryUrl = `file:///${indexPath.replace(/\\/g, '/')}`;
      const bundleAllowed = allowsNavigation(bundleEntryUrl);

      const isRobust = hasRestrictedFileNav && !hasUnconditionalFileReturn && allowedMalicious.length === 0 && bundleAllowed;

      if (!isRobust) {
        return {
          passed: false,
          isVulnerabilityOrGap: true,
          details: `Navigation security failed: allowedMalicious=${allowedMalicious.join(', ')}, bundleAllowed=${bundleAllowed}, hasRestricted=${hasRestrictedFileNav}`
        };
      }

      return {
        passed: true,
        isVulnerabilityOrGap: false,
        details: 'will-navigate strictly verified: file: protocol is locked to application bundle (dist/index.html and dist/), preventing OS file navigation for all sensitive host files.'
      };
    }
  );

  // PROBE 1.3: SQLite Header Signature 16th Byte Null Terminator Validation
  await executeProbe(
    'PROBE-5.1.3',
    'ELECTRON_SHELL',
    'SQLite Header Signature 16th Byte Null Terminator Validation',
    async () => {
      // Verify both electron/main.cjs and src/services/db.ts require exact 16 bytes: "SQLite format 3\0"
      const mainCjsPath = path.resolve(__dirname, '../../electron/main.cjs');
      const mainCjsContent = fs.readFileSync(mainCjsPath, 'utf-8');

      const dbTsPath = path.resolve(__dirname, '../../src/services/db.ts');
      const dbTsContent = fs.readFileSync(dbTsPath, 'utf-8');

      const mainHas16ByteCheck =
        mainCjsContent.includes("buffer.subarray(0, 16).toString('utf-8')") &&
        mainCjsContent.includes("!== 'SQLite format 3\\0'");
      const dbTsHas16ByteCheck =
        dbTsContent.includes("bytes.slice(0, 16)") &&
        dbTsContent.includes("!== 'SQLite format 3\\0'");

      // Test with corrupt 16th byte buffer: 'SQLite format 3X'
      const corrupt16thByteBuf = Buffer.alloc(100);
      corrupt16thByteBuf.write('SQLite format 3X', 0, 16, 'utf-8'); // Byte 15 is 'X' (0x58), NOT '\0'

      // Test against main.cjs logic
      const headerSignature = corrupt16thByteBuf.subarray(0, 16).toString('utf-8');
      const mainCjsRejects = headerSignature !== 'SQLite format 3\0';

      // Test against real DatabaseService importDatabaseBlob
      let dbServiceRejected = false;
      let dbErrorMsg = '';
      try {
        await db.importDatabaseBlob(new Uint8Array(corrupt16thByteBuf));
      } catch (err: any) {
        dbServiceRejected = true;
        dbErrorMsg = err.message;
      }

      const isRobust = mainHas16ByteCheck && dbTsHas16ByteCheck && mainCjsRejects && dbServiceRejected;

      if (!isRobust) {
        return {
          passed: false,
          isVulnerabilityOrGap: true,
          details: `SQLite 16th byte validation failed: main=${mainHas16ByteCheck}, dbTs=${dbTsHas16ByteCheck}, mainRejects=${mainCjsRejects}, dbRejects=${dbServiceRejected}`
        };
      }

      return {
        passed: true,
        isVulnerabilityOrGap: false,
        details: `Header signature strictly validated across electron/main.cjs and src/services/db.ts: 16th byte null terminator enforced. Corrupt 16th byte correctly rejected with error: "${dbErrorMsg}".`
      };
    }
  );

  // --------------------------------------------------------------------------
  // SUITE 2: Fault Injection against backupService.ts (JSON Snapshots)
  // --------------------------------------------------------------------------

  // PROBE 2.1: Truncated & Syntactically Malformed JSON Snapshot Ingestion
  await executeProbe(
    'PROBE-5.2.1',
    'FAULT_INJECTION_JSON',
    'Fault Injection: Truncated and Syntactically Malformed JSON Snapshot',
    async () => {
      const preCount = (await db.query("SELECT COUNT(*) as c FROM suppliers;"))[0].c;
      const truncatedInputs = [
        '{"system": "PROBAHO-ERP", "data": {"suppliers": [',
        '',
        '   ',
        'null',
        '{ invalid json syntax: 123 }',
        '{"system": "PROBAHO-ERP", "version": "1.0.0"}' // missing data
      ];

      let correctlyRejected = 0;
      for (const badJson of truncatedInputs) {
        try {
          await backupService.importJsonSnapshot(badJson, db);
        } catch {
          correctlyRejected++;
        }
      }

      const postCount = (await db.query("SELECT COUNT(*) as c FROM suppliers;"))[0].c;
      const intact = preCount === postCount;

      return {
        passed: correctlyRejected === truncatedInputs.length && intact,
        isVulnerabilityOrGap: !(correctlyRejected === truncatedInputs.length && intact),
        details: `Rejected ${correctlyRejected}/${truncatedInputs.length} malformed JSON inputs. Database record integrity preserved (${postCount} suppliers intact).`
      };
    }
  );

  // PROBE 2.2: Cryptographic Checksum Tampering Detection
  await executeProbe(
    'PROBE-5.2.2',
    'FAULT_INJECTION_JSON',
    'Fault Injection: Tampered JSON Data with Mismatched SHA-256 Checksum',
    async () => {
      // 1. Export valid snapshot
      const validJsonStr = await backupService.exportJsonSnapshot(db);
      const parsed = JSON.parse(validJsonStr);

      // 2. Tamper with a supplier phone number
      const originalChecksum = parsed.checksum;
      if (parsed.data.suppliers && parsed.data.suppliers.length > 0) {
        parsed.data.suppliers[0].phone = '+8809999999999_TAMPERED';
      }

      const tamperedJsonStr = JSON.stringify(parsed);

      let errorCaught = false;
      let errorMsg = '';
      try {
        await backupService.importJsonSnapshot(tamperedJsonStr, db);
      } catch (err: any) {
        errorCaught = true;
        errorMsg = err.message;
      }

      const isChecksumError = errorMsg.includes('Checksum mismatch') || errorMsg.includes('Corrupted backup file');

      return {
        passed: errorCaught && isChecksumError,
        isVulnerabilityOrGap: !(errorCaught && isChecksumError),
        details: `Tampered snapshot was successfully intercepted by SHA-256 validation: "${errorMsg}". Database state preserved.`
      };
    }
  );

  // PROBE 2.3: Incompatible System Source Metadata Rejection
  await executeProbe(
    'PROBE-5.2.3',
    'FAULT_INJECTION_JSON',
    'Fault Injection: Incompatible Backup System Metadata (Rogue CRM/ERP)',
    async () => {
      const validJsonStr = await backupService.exportJsonSnapshot(db);
      const parsed = JSON.parse(validJsonStr);
      parsed.system = 'ROGUE_ERP_ATTACK_VECTOR';
      parsed.metadata.app = 'ROGUE_ERP_ATTACK_VECTOR';

      let errorCaught = false;
      let errorMsg = '';
      try {
        await backupService.importJsonSnapshot(JSON.stringify(parsed), db);
      } catch (err: any) {
        errorCaught = true;
        errorMsg = err.message;
      }

      const matches = errorMsg.includes('Incompatible backup source');
      return {
        passed: errorCaught && matches,
        isVulnerabilityOrGap: !(errorCaught && matches),
        details: `Incompatible system header cleanly rejected: "${errorMsg}".`
      };
    }
  );

  // PROBE 2.4: Foreign Key Constraint Violation during JSON Snapshot Restore
  await executeProbe(
    'PROBE-5.2.4',
    'FAULT_INJECTION_JSON',
    'Fault Injection: Foreign Key Constraint Violation in Snapshot (Orphaned PO)',
    async () => {
      const validJsonStr = await backupService.exportJsonSnapshot(db);
      const parsed = JSON.parse(validJsonStr);

      // Inject a purchase order referencing a non-existent supplier
      const orphanPO = {
        id: 'po_hostile_orphan_999',
        po_number: 'PO-HOSTILE-ORPHAN',
        supplier_id: 'NON_EXISTENT_SUPPLIER_ID_666',
        target_warehouse_id: parsed.data.warehouses[0]?.id || 'wh_default',
        status: 'approved',
        order_date: '2026-10-18',
        subtotal: 1000,
        tax_amount: 100,
        shipping_cost: 50,
        total_amount: 1150,
        created_by: 'adversary'
      };

      parsed.data.purchase_orders = [orphanPO];
      // Recompute checksum so it passes checksum check and reaches DB insertion & FK check
      const canonical = JSON.stringify(parsed.data);
      parsed.checksum = await backupService.computeSha256(canonical);
      parsed.metadata.checksum = parsed.checksum;

      let errorCaught = false;
      let errorMsg = '';
      try {
        await backupService.importJsonSnapshot(JSON.stringify(parsed), db);
      } catch (err: any) {
        errorCaught = true;
        errorMsg = err.message;
      }

      // Check whether active database was rolled back safely and is still queryable
      const suppliers = await db.query("SELECT * FROM suppliers;");
      const activeRestored = suppliers.length > 0;

      const passed = errorCaught && (errorMsg.includes('Foreign key') || errorMsg.includes('FOREIGN KEY') || errorMsg.includes('FOREIGN KEY constraint failed')) && activeRestored;

      return {
        passed,
        isVulnerabilityOrGap: !passed,
        details: `Orphaned foreign key detected and safely rolled back: "${errorMsg}". Active database verified intact (${suppliers.length} suppliers).`
      };
    }
  );

  // PROBE 2.5: Atomic Rollback on Mid-Restore Table Schema Constraint Failure
  await executeProbe(
    'PROBE-5.2.5',
    'FAULT_INJECTION_JSON',
    'Fault Injection: Atomic Rollback on Mid-Restore Check Constraint Violation',
    async () => {
      // 1. Snapshot initial valid state
      const initialSuppliers = await db.query("SELECT * FROM suppliers ORDER BY id;");
      const initialItems = await db.query("SELECT * FROM items ORDER BY id;");

      const validJsonStr = await backupService.exportJsonSnapshot(db);
      const parsed = JSON.parse(validJsonStr);

      // 2. Add an item with a negative cost price (violating CHECK (cost_price >= 0.0))
      if (parsed.data.items && parsed.data.items.length > 0) {
        parsed.data.items[0].cost_price = -99999.0; // Illegal negative price
      }

      // Also change a supplier name to see if suppliers partially apply
      if (parsed.data.suppliers && parsed.data.suppliers.length > 0) {
        parsed.data.suppliers[0].name = 'DIRTY_PARTIAL_SUPPLIER_SHOULD_ROLLBACK';
      }

      const canonical = JSON.stringify(parsed.data);
      parsed.checksum = await backupService.computeSha256(canonical);
      parsed.metadata.checksum = parsed.checksum;

      let failedAndRolledBack = false;
      let caughtMsg = '';
      try {
        await backupService.importJsonSnapshot(JSON.stringify(parsed), db);
      } catch (err: any) {
        failedAndRolledBack = true;
        caughtMsg = err.message;
      }

      // 3. Verify active DB was 100% rolled back to initial state
      const postSuppliers = await db.query("SELECT * FROM suppliers ORDER BY id;");
      const postItems = await db.query("SELECT * FROM items ORDER BY id;");

      const supplierNameRolledBack = !postSuppliers.some((s: any) => s.name === 'DIRTY_PARTIAL_SUPPLIER_SHOULD_ROLLBACK');
      const suppliersIntact = postSuppliers.length === initialSuppliers.length;
      const itemsIntact = postItems.length === initialItems.length;

      const perfectlyRolledBack = failedAndRolledBack && supplierNameRolledBack && suppliersIntact && itemsIntact;

      return {
        passed: perfectlyRolledBack,
        isVulnerabilityOrGap: !perfectlyRolledBack,
        details: `Mid-restore failure properly triggered atomic rollback: "${caughtMsg}". Zero dirty state leaked into suppliers or items.`
      };
    }
  );

  // --------------------------------------------------------------------------
  // SUITE 3: Fault Injection against SQLite Binary Persistence (`src/services/db.ts`)
  // --------------------------------------------------------------------------

  // PROBE 3.1: Zero-Byte SQLite Binary Import
  await executeProbe(
    'PROBE-5.3.1',
    'FAULT_INJECTION_SQLITE',
    'Fault Injection: Zero-Byte SQLite Binary Import Rejection',
    async () => {
      const zeroBuffer = new Uint8Array(0);
      let rejected = false;
      let errorMsg = '';
      try {
        await backupService.importBinaryBlob(zeroBuffer, db);
      } catch (err: any) {
        rejected = true;
        errorMsg = err.message;
      }

      const intact = (await db.query("SELECT COUNT(*) as c FROM suppliers;"))[0].c > 0;
      return {
        passed: rejected && intact,
        isVulnerabilityOrGap: !(rejected && intact),
        details: `Zero-byte binary safely rejected: "${errorMsg}". Active database verified intact.`
      };
    }
  );

  // PROBE 3.2: Truncated Sub-Header Binary Import (< 16 bytes)
  await executeProbe(
    'PROBE-5.3.2',
    'FAULT_INJECTION_SQLITE',
    'Fault Injection: Truncated Sub-Header Binary Import (<16 bytes)',
    async () => {
      const truncated = new Uint8Array([83, 81, 76, 105, 116, 101]); // "SQLite" (6 bytes)
      let rejected = false;
      let errorMsg = '';
      try {
        await backupService.importBinaryBlob(truncated, db);
      } catch (err: any) {
        rejected = true;
        errorMsg = err.message;
      }

      const intact = (await db.query("SELECT COUNT(*) as c FROM suppliers;"))[0].c > 0;
      return {
        passed: rejected && intact,
        isVulnerabilityOrGap: !(rejected && intact),
        details: `Sub-header truncated binary rejected: "${errorMsg}". Active database verified intact.`
      };
    }
  );

  // PROBE 3.3: Corrupted SQLite Database (Header OK, Pages Scrambled)
  await executeProbe(
    'PROBE-5.3.3',
    'FAULT_INJECTION_SQLITE',
    'Fault Injection: Corrupted SQLite Database (Valid Header, Scrambled Payload)',
    async () => {
      // 1. Export genuine database blob
      const genuineBlob = await db.exportDatabaseBlob();
      // 2. Clone and corrupt page 1 beyond the 100-byte SQLite header
      const corruptBlob = new Uint8Array(genuineBlob);
      for (let i = 120; i < 400; i++) {
        corruptBlob[i] = 0xFF; // Corrupt B-Tree header & cell pointers
      }

      let caught = false;
      let errorMsg = '';
      try {
        await backupService.importBinaryBlob(corruptBlob, db);
      } catch (err: any) {
        caught = true;
        errorMsg = err.message;
      }

      // Check whether active database remained healthy
      const healthyCheck = await db.query("PRAGMA integrity_check;");
      const isOk = healthyCheck.length > 0 && healthyCheck[0].integrity_check === 'ok';

      return {
        passed: caught && isOk,
        isVulnerabilityOrGap: !(caught && isOk),
        details: `Corrupted SQLite pages detected by integrity verification: "${errorMsg}". Active DB restored to healthy state (PRAGMA integrity_check === ok).`
      };
    }
  );

  // PROBE 3.4: 16-byte Truncated SQLite Binary (Header Only, Zero Pages)
  await executeProbe(
    'PROBE-5.3.4',
    'FAULT_INJECTION_SQLITE',
    'Fault Injection: 16-Byte Header-Only Binary (Zero SQLite Pages)',
    async () => {
      const headerOnly = new Uint8Array(Buffer.from('SQLite format 3\0'));
      let caught = false;
      let errorMsg = '';
      try {
        await backupService.importBinaryBlob(headerOnly, db);
      } catch (err: any) {
        caught = true;
        errorMsg = err.message;
      }

      const suppliers = await db.query("SELECT COUNT(*) as c FROM suppliers;");
      return {
        passed: caught && suppliers[0].c > 0,
        isVulnerabilityOrGap: !(caught && suppliers[0].c > 0),
        details: `Header-only truncated database safely rejected: "${errorMsg}". Active DB intact.`
      };
    }
  );

  // --------------------------------------------------------------------------
  // SUITE 4: Relational Invariants & Constraint Cascading Probes
  // --------------------------------------------------------------------------

  // PROBE 4.1: Foreign Key Enforcement & Restricted Parent Deletion
  await executeProbe(
    'PROBE-5.4.1',
    'RELATIONAL_INVARIANTS',
    'Relational Invariant: Foreign Key Restrict on Parent Supplier Deletion',
    async () => {
      // 1. Get an existing supplier with PO
      const poRow = await db.query("SELECT supplier_id FROM purchase_orders LIMIT 1;");
      if (!poRow || poRow.length === 0) {
        return {
          passed: false,
          isVulnerabilityOrGap: false,
          details: 'No seeded purchase orders found to test restrict constraint.'
        };
      }

      const activeSupplierId = poRow[0].supplier_id;
      let caught = false;
      let errorMsg = '';
      try {
        // Attempt to delete parent supplier with child POs
        await db.execute("DELETE FROM suppliers WHERE id = ?;", [activeSupplierId]);
      } catch (err: any) {
        caught = true;
        errorMsg = err.message;
      }

      const isFkBlocked = caught && errorMsg.includes('FOREIGN KEY constraint failed');
      return {
        passed: isFkBlocked,
        isVulnerabilityOrGap: !isFkBlocked,
        details: `Parent supplier delete correctly blocked by ON DELETE RESTRICT: "${errorMsg}".`
      };
    }
  );

  // PROBE 4.2: Purchase Order Items Cascade Deletion
  await executeProbe(
    'PROBE-5.4.2',
    'RELATIONAL_INVARIANTS',
    'Relational Invariant: ON DELETE CASCADE on Purchase Order Items',
    async () => {
      // 1. Create a dummy test PO with items
      const testPoId = 'po_test_cascade_del';
      const supId = (await db.query("SELECT id FROM suppliers LIMIT 1;"))[0].id;
      const whId = (await db.query("SELECT id FROM warehouses LIMIT 1;"))[0].id;
      const itemId = (await db.query("SELECT id, sku FROM items LIMIT 1;"))[0];

      await db.execute(
        `INSERT INTO purchase_orders (id, po_number, supplier_id, target_warehouse_id, status, order_date, total_amount)
         VALUES (?, 'PO-TEST-CAS', ?, ?, 'draft', '2026-10-18', 500);`,
        [testPoId, supId, whId]
      );

      await db.execute(
        `INSERT INTO purchase_order_items (id, po_id, item_id, sku, quantity_ordered, unit_cost, subtotal)
         VALUES ('poi_test_cas_1', ?, ?, ?, 10, 50, 500);`,
        [testPoId, itemId.id, itemId.sku]
      );

      // Verify item exists
      const itemBefore = await db.query("SELECT COUNT(*) as c FROM purchase_order_items WHERE po_id = ?;", [testPoId]);
      if (itemBefore[0].c === 0) throw new Error('Failed to create test PO item');

      // Delete parent PO
      await db.execute("DELETE FROM purchase_orders WHERE id = ?;", [testPoId]);

      // Verify child item was automatically cascaded
      const itemAfter = await db.query("SELECT COUNT(*) as c FROM purchase_order_items WHERE po_id = ?;", [testPoId]);
      const cascaded = itemAfter[0].c === 0;

      return {
        passed: cascaded,
        isVulnerabilityOrGap: !cascaded,
        details: `Parent PO deleted: child PO items automatically cascaded (remaining items: ${itemAfter[0].c}).`
      };
    }
  );

  // PROBE 4.3: Reset Database to Initial Seed State
  await executeProbe(
    'PROBE-5.4.3',
    'RELATIONAL_INVARIANTS',
    'Relational Invariant: Clean Seed Reset via resetToSeedData()',
    async () => {
      // Insert dirty custom records
      await db.execute(
        `INSERT INTO suppliers (id, supplier_code, name, phone, address)
         VALUES ('sup_dirty_reset', 'SUP-DIRTY-99', 'Dirty Supplier', '123', 'Nowhere');`
      );

      // Execute clean reset
      await db.resetToSeedData();

      // Verify dirty supplier is gone
      const dirty = await db.query("SELECT * FROM suppliers WHERE id = 'sup_dirty_reset';");
      const seedSuppliers = await db.query("SELECT COUNT(*) as c FROM suppliers;");
      const seedWarehouses = await db.query("SELECT COUNT(*) as c FROM warehouses;");
      const fkState = await db.query("PRAGMA foreign_keys;");

      const success = dirty.length === 0 && seedSuppliers[0].c > 0 && seedWarehouses[0].c > 0 && fkState[0].foreign_keys === 1;

      return {
        passed: success,
        isVulnerabilityOrGap: !success,
        details: `Reset successful: Dirty records removed, seed suppliers restored (${seedSuppliers[0].c} suppliers), PRAGMA foreign_keys active (${fkState[0].foreign_keys}).`
      };
    }
  );

  // --------------------------------------------------------------------------
  // SUITE 5: Preload Bridge Attack Surface Analysis
  // --------------------------------------------------------------------------

  // PROBE 5.1: Preload Script Context Isolation & Safe Event Sanitization
  await executeProbe(
    'PROBE-5.5.1',
    'PRELOAD_BRIDGE',
    'Preload Bridge IPC Surface & Event Sanitization Inspection',
    async () => {
      const preloadPath = path.resolve('electron/preload.cjs');
      const preloadContent = fs.readFileSync(preloadPath, 'utf-8');

      // Verify no direct ipcRenderer exposure
      const exposesRawIpc = preloadContent.includes("contextBridge.exposeInMainWorld('ipcRenderer'");
      // Verify sanitization of onWindowMaximizedChange: (_event, isMax) => callback(isMax)
      const wrapsEvent = preloadContent.includes('(_event, isMax) => callback(isMax)');
      // Verify contextBridge is used
      const usesContextBridge = preloadContent.includes('contextBridge.exposeInMainWorld');

      const isSecure = !exposesRawIpc && wrapsEvent && usesContextBridge;

      return {
        passed: isSecure,
        isVulnerabilityOrGap: !isSecure,
        details: `Preload inspection: Raw ipcRenderer unexposed (${!exposesRawIpc}), window maximize event cleanly unwraps IPC event object (${wrapsEvent}), contextBridge enforced (${usesContextBridge}).`
      };
    }
  );

  await db.close();

  // ==========================================================================
  // SUMMARY REPORT GENERATION
  // ==========================================================================
  console.log(`\n${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}                     CHALLENGER SUITE SUMMARY                           ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}`);

  const totalProbes = probeResults.length;
  const verifiedProbes = probeResults.filter((p) => p.passed).length;
  const identifiedGaps = probeResults.filter((p) => p.isVulnerabilityOrGap);

  console.log(`Total Probes Executed:     ${totalProbes}`);
  console.log(`Probes Verified:           ${colors.green}${verifiedProbes} / ${totalProbes}${colors.reset}`);
  console.log(`Identified Gaps / Flaws:   ${identifiedGaps.length > 0 ? `${colors.red}${identifiedGaps.length} GAPS DETECTED${colors.reset}` : `${colors.green}0 GAPS${colors.reset}`}`);

  if (identifiedGaps.length > 0) {
    console.log(`\n${colors.red}${colors.bold}SUMMARY OF CONFIRMED GAPS:${colors.reset}`);
    identifiedGaps.forEach((g, idx) => {
      console.log(`${colors.red}${idx + 1}. [${g.id}] ${g.name}${colors.reset}`);
      console.log(`   ${colors.gray}Details: ${g.details}${colors.reset}`);
      if (g.reproductionNotes) console.log(`   ${colors.magenta}Repro:   ${g.reproductionNotes}${colors.reset}`);
      if (g.recommendation)    console.log(`   ${colors.cyan}Fix:     ${g.recommendation}${colors.reset}`);
    });
  }

  console.log(`\n${colors.bold}FINAL VERDICT: ${identifiedGaps.length > 0 ? `${colors.red}GAPS_IDENTIFIED` : `${colors.green}NO_GAPS_REMAINING`}${colors.reset}\n`);

  return {
    totalProbes,
    verifiedProbes,
    identifiedGaps
  };
}

// Run if executed directly
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  runAllChallengerProbes().then((summary) => {
    if (summary.identifiedGaps.length > 0 || summary.verifiedProbes !== summary.totalProbes) {
      process.exit(1);
    }
    process.exit(0);
  }).catch((err) => {
    console.error('Fatal crash in challenger suite:', err);
    process.exit(1);
  });
}

export { runAllChallengerProbes };
