#!/usr/bin/env node
/**
 * Probaho ERP - Milestone 5 Dedicated Acceptance Verifier
 * Target Destination: tests/verify-m5-packaging.ts
 *
 * Validates the core Acceptance Criteria from ORIGINAL_REQUEST.md & PROJECT.md for Milestone 5:
 * "Dual Windows Desktop Packaging:
 *  - Standard Windows NSIS setup installer (.exe)
 *  - Standalone portable executable (.exe)
 *  - Generated in the release output directory
 *  - Binary sizes > 40 MB (valid full Electron bundle, not empty stub)
 *  - Valid Windows PE headers (ASCII 'MZ' / bytes 0x4D, 0x5A at offset 0, valid PE signature)
 *  - Non-regression across all previous milestones (M1-M4) and E2E test suites"
 *
 * Acceptance Criteria Map:
 *   AC5-1: Output directory release/ exists.
 *   AC5-2: Windows NSIS Setup Installer exists in release/ (e.g. release/Probaho.ERP.Setup.1.0.0.exe or *Setup*.exe).
 *   AC5-3: Setup Installer binary size > 40 MB (valid full Electron bundle, not an empty stub).
 *   AC5-4: Setup Installer has valid Windows PE header (ASCII 'MZ' / bytes 0x4D, 0x5A at offset 0).
 *   AC5-5: Windows Portable executable exists in release/ (e.g. release/Probaho.ERP-Portable.exe or *Portable*.exe).
 *   AC5-6: Portable executable binary size > 40 MB.
 *   AC5-7: Portable executable has valid Windows PE header (ASCII 'MZ').
 *   AC5-8: Non-regression check ensuring all core test suites remain 100% passing.
 *
 * Execution:
 *   npx tsx tests/verify-m5-packaging.ts
 *   npm run test:m5
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ANSI Color Helpers
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
  code: string;
  name: string;
  passed: boolean;
  durationMs: number;
  details: string;
}

const stepResults: StepRecord[] = [];

// Determine Project Root and Release Directory reliably
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findProjectRoot(startDir: string): string {
  let cur = path.resolve(startDir);
  while (cur && cur !== path.dirname(cur)) {
    if (fs.existsSync(path.join(cur, 'package.json')) && fs.existsSync(path.join(cur, 'tests'))) {
      return cur;
    }
    cur = path.dirname(cur);
  }
  return process.cwd();
}

const projectRoot = findProjectRoot(__dirname);
const releaseDir = path.resolve(projectRoot, 'release');

// Threshold constants
const MIN_BINARY_SIZE_BYTES = 40 * 1024 * 1024; // 40 MB = 41,943,040 bytes

interface PEValidationResult {
  valid: boolean;
  dosMagic: string;
  peOffset: number;
  peSignature: string;
  machineType?: string;
  error?: string;
}

/**
 * Validates that a file is a valid Windows Portable Executable (PE):
 * 1. Offset 0x00 - 0x01: DOS header magic 'MZ' (0x4D, 0x5A)
 * 2. Offset 0x3C: 32-bit little-endian offset to PE header (e_lfanew)
 * 3. Offset e_lfanew: PE signature 'PE\0\0' (0x50, 0x45, 0x00, 0x00)
 * 4. Offset e_lfanew + 4: Machine architecture (AMD64 / i386)
 */
function validatePEHeader(filePath: string): PEValidationResult {
  if (!fs.existsSync(filePath)) {
    return { valid: false, dosMagic: '', peOffset: 0, peSignature: '', error: `File does not exist: ${filePath}` };
  }

  const fd = fs.openSync(filePath, 'r');
  try {
    const dosHeader = Buffer.alloc(64);
    const bytesRead = fs.readSync(fd, dosHeader, 0, 64, 0);
    if (bytesRead < 64) {
      return { valid: false, dosMagic: '', peOffset: 0, peSignature: '', error: `File too small to contain DOS header (${bytesRead} bytes)` };
    }

    // Check DOS magic 'MZ' (0x4D, 0x5A)
    const magic0 = dosHeader[0];
    const magic1 = dosHeader[1];
    const dosMagic = String.fromCharCode(magic0, magic1);
    if (magic0 !== 0x4D || magic1 !== 0x5A) {
      return {
        valid: false,
        dosMagic,
        peOffset: 0,
        peSignature: '',
        error: `Invalid DOS magic: expected "MZ" (0x4D 0x5A), got "${dosMagic}" (0x${magic0.toString(16)} 0x${magic1.toString(16)})`
      };
    }

    // Read e_lfanew pointer at 0x3C
    const peOffset = dosHeader.readUInt32LE(0x3C);
    if (peOffset <= 0 || peOffset > 10 * 1024 * 1024) {
      return {
        valid: false,
        dosMagic,
        peOffset,
        peSignature: '',
        error: `Invalid PE header offset: 0x${peOffset.toString(16)}`
      };
    }

    // Read PE signature (4 bytes) and COFF Machine type (2 bytes)
    const peHeader = Buffer.alloc(6);
    const peBytesRead = fs.readSync(fd, peHeader, 0, 6, peOffset);
    if (peBytesRead < 6) {
      return {
        valid: false,
        dosMagic,
        peOffset,
        peSignature: '',
        error: `Cannot read PE signature at offset 0x${peOffset.toString(16)}`
      };
    }

    // PE signature must be 'P', 'E', 0x00, 0x00
    const isValidPeSig = peHeader[0] === 0x50 && peHeader[1] === 0x45 && peHeader[2] === 0x00 && peHeader[3] === 0x00;
    const peSigStr = peHeader.subarray(0, 4).toString('latin1');
    if (!isValidPeSig) {
      return {
        valid: false,
        dosMagic,
        peOffset,
        peSignature: peSigStr,
        error: `Invalid PE signature at offset 0x${peOffset.toString(16)}: expected "PE\\0\\0", got [${peHeader[0]}, ${peHeader[1]}, ${peHeader[2]}, ${peHeader[3]}]`
      };
    }

    // Decode COFF Machine type
    const machine = peHeader.readUInt16LE(4);
    let machineType = `0x${machine.toString(16)}`;
    if (machine === 0x8664) machineType = 'x64 (AMD64)';
    else if (machine === 0x014c) machineType = 'x86 (i386)';
    else if (machine === 0xaa64) machineType = 'ARM64';

    return {
      valid: true,
      dosMagic,
      peOffset,
      peSignature: 'PE\\0\\0',
      machineType
    };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Executes a single verification step and tracks scorecard metrics.
 */
async function executeStep(
  code: string,
  name: string,
  fn: () => Promise<string>
): Promise<boolean> {
  const start = Date.now();
  process.stdout.write(`  ${colors.yellow}⏳ Running [${code}] ${name}...${colors.reset}`);
  try {
    const details = await fn();
    const durationMs = Date.now() - start;
    process.stdout.write(
      `\r  ${colors.green}✔ PASS [${code}] ${name} ${colors.gray}(${durationMs}ms)${colors.reset}\n`
    );
    if (details) {
      console.log(`     ${colors.gray}↳ ${details}${colors.reset}`);
    }
    stepResults.push({ code, name, passed: true, durationMs, details });
    return true;
  } catch (err: any) {
    const durationMs = Date.now() - start;
    process.stdout.write(
      `\r  ${colors.red}✘ FAIL [${code}] ${name} ${colors.gray}(${durationMs}ms)${colors.reset}\n`
    );
    console.error(`     ${colors.red}↳ Error: ${err.message || String(err)}${colors.reset}`);
    stepResults.push({ code, name, passed: false, durationMs, details: err.message || String(err) });
    return false;
  }
}

/**
 * Main verification runner for Milestone 5.
 */
async function runM5Verification() {
  console.log(`\n${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}     PROBAHO ERP — MILESTONE 5 PACKAGING & DISTRIBUTION VERIFIER      ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}\n`);
  console.log(`${colors.gray}Target: Dual Windows Distribution Artifacts (NSIS Setup + Portable Executable)${colors.reset}`);
  console.log(`${colors.gray}Project Root: ${projectRoot}${colors.reset}`);
  console.log(`${colors.gray}Release Dir:  ${releaseDir}${colors.reset}\n`);

  const tStart = Date.now();

  let setupFilePath: string | null = null;
  let portableFilePath: string | null = null;

  // ---------------------------------------------------------------------------
  // AC5-1: Output directory release/ exists
  // ---------------------------------------------------------------------------
  await executeStep('AC5-1', 'Release Output Directory Existence & Accessibility', async () => {
    if (!fs.existsSync(releaseDir)) {
      throw new Error(
        `Release directory "${releaseDir}" was not found. Please execute the packaging build first:\n` +
        `       npm run electron:build\n` +
        `       or npx electron-builder --win`
      );
    }
    const stat = fs.statSync(releaseDir);
    if (!stat.isDirectory()) {
      throw new Error(`Path "${releaseDir}" exists but is not a directory.`);
    }

    const entries = fs.readdirSync(releaseDir);
    return `Output directory confirmed: ${releaseDir} (contains ${entries.length} file system entries).`;
  });

  // ---------------------------------------------------------------------------
  // AC5-2: Windows NSIS Setup Installer exists in release/
  // ---------------------------------------------------------------------------
  await executeStep('AC5-2', 'Windows NSIS Setup Installer Artifact Presence', async () => {
    if (!fs.existsSync(releaseDir)) {
      throw new Error(`Release directory does not exist; cannot find setup installer.`);
    }

    const files = fs.readdirSync(releaseDir);

    // Prefer exact standard name 'Probaho.ERP.Setup.1.0.0.exe', or match *Setup*.exe
    const exactName = 'Probaho.ERP.Setup.1.0.0.exe';
    let targetFile = files.find(f => f.toLowerCase() === exactName.toLowerCase());

    if (!targetFile) {
      targetFile = files.find(f =>
        f.endsWith('.exe') &&
        !f.includes('.blockmap') &&
        /setup/i.test(f)
      );
    }

    if (!targetFile) {
      throw new Error(
        `Windows NSIS Setup Installer (.exe) was not found in "${releaseDir}".\n` +
        `       Expected: "Probaho.ERP.Setup.1.0.0.exe" or "*Setup*.exe"\n` +
        `       Found in release/: [${files.join(', ') || 'empty'}]`
      );
    }

    setupFilePath = path.join(releaseDir, targetFile);
    const stat = fs.statSync(setupFilePath);
    if (!stat.isFile()) {
      throw new Error(`Located setup path is not a regular file: ${setupFilePath}`);
    }

    return `NSIS Setup Installer confirmed: "${targetFile}" (${setupFilePath}).`;
  });

  // ---------------------------------------------------------------------------
  // AC5-3: Setup Installer binary size > 40 MB
  // ---------------------------------------------------------------------------
  await executeStep('AC5-3', 'Windows NSIS Setup Installer Binary Size (> 40 MB)', async () => {
    if (!setupFilePath || !fs.existsSync(setupFilePath)) {
      throw new Error(`Setup installer path not resolved or file missing.`);
    }

    const stat = fs.statSync(setupFilePath);
    const sizeBytes = stat.size;
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);

    if (sizeBytes < MIN_BINARY_SIZE_BYTES) {
      throw new Error(
        `NSIS Setup Installer is too small: ${sizeMB} MB (${sizeBytes.toLocaleString()} bytes).\n` +
        `       Expected minimum size: > 40.00 MB (${MIN_BINARY_SIZE_BYTES.toLocaleString()} bytes).\n` +
        `       This indicates an incomplete, truncated, or stub build.`
      );
    }

    return `Installer binary size: ${sizeMB} MB (${sizeBytes.toLocaleString()} bytes) exceeds minimum threshold of 40 MB.`;
  });

  // ---------------------------------------------------------------------------
  // AC5-4: Setup Installer has valid Windows PE header (ASCII 'MZ' / 0x4D, 0x5A)
  // ---------------------------------------------------------------------------
  await executeStep('AC5-4', 'Windows NSIS Setup Installer PE Header Magic Bytes (MZ)', async () => {
    if (!setupFilePath || !fs.existsSync(setupFilePath)) {
      throw new Error(`Setup installer path not resolved or file missing.`);
    }

    const pe = validatePEHeader(setupFilePath);
    if (!pe.valid) {
      throw new Error(`PE header verification failed on "${path.basename(setupFilePath)}": ${pe.error}`);
    }

    return (
      `Valid Windows PE binary confirmed: DOS magic "${pe.dosMagic}" (0x4D, 0x5A) at offset 0, ` +
      `PE signature "${pe.peSignature}" at offset 0x${pe.peOffset.toString(16)}, Target: ${pe.machineType}.`
    );
  });

  // ---------------------------------------------------------------------------
  // AC5-5: Windows Portable executable exists in release/
  // ---------------------------------------------------------------------------
  await executeStep('AC5-5', 'Windows Standalone Portable Executable Artifact Presence', async () => {
    if (!fs.existsSync(releaseDir)) {
      throw new Error(`Release directory does not exist; cannot find portable executable.`);
    }

    const files = fs.readdirSync(releaseDir);

    // Prefer exact standard name 'Probaho.ERP-Portable.exe', or match *Portable*.exe
    const exactName = 'Probaho.ERP-Portable.exe';
    let targetFile = files.find(f => f.toLowerCase() === exactName.toLowerCase());

    if (!targetFile) {
      targetFile = files.find(f =>
        f.endsWith('.exe') &&
        !f.includes('.blockmap') &&
        /portable/i.test(f)
      );
    }

    if (!targetFile) {
      throw new Error(
        `Windows Standalone Portable Executable (.exe) was not found in "${releaseDir}".\n` +
        `       Expected: "Probaho.ERP-Portable.exe" or "*Portable*.exe"\n` +
        `       Found in release/: [${files.join(', ') || 'empty'}]`
      );
    }

    portableFilePath = path.join(releaseDir, targetFile);
    const stat = fs.statSync(portableFilePath);
    if (!stat.isFile()) {
      throw new Error(`Located portable path is not a regular file: ${portableFilePath}`);
    }

    return `Portable executable confirmed: "${targetFile}" (${portableFilePath}).`;
  });

  // ---------------------------------------------------------------------------
  // AC5-6: Portable executable binary size > 40 MB
  // ---------------------------------------------------------------------------
  await executeStep('AC5-6', 'Windows Standalone Portable Executable Binary Size (> 40 MB)', async () => {
    if (!portableFilePath || !fs.existsSync(portableFilePath)) {
      throw new Error(`Portable executable path not resolved or file missing.`);
    }

    const stat = fs.statSync(portableFilePath);
    const sizeBytes = stat.size;
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);

    if (sizeBytes < MIN_BINARY_SIZE_BYTES) {
      throw new Error(
        `Portable executable is too small: ${sizeMB} MB (${sizeBytes.toLocaleString()} bytes).\n` +
        `       Expected minimum size: > 40.00 MB (${MIN_BINARY_SIZE_BYTES.toLocaleString()} bytes).\n` +
        `       This indicates an incomplete, truncated, or stub build.`
      );
    }

    return `Portable binary size: ${sizeMB} MB (${sizeBytes.toLocaleString()} bytes) exceeds minimum threshold of 40 MB.`;
  });

  // ---------------------------------------------------------------------------
  // AC5-7: Portable executable has valid Windows PE header (ASCII 'MZ')
  // ---------------------------------------------------------------------------
  await executeStep('AC5-7', 'Windows Standalone Portable Executable PE Header Magic Bytes (MZ)', async () => {
    if (!portableFilePath || !fs.existsSync(portableFilePath)) {
      throw new Error(`Portable executable path not resolved or file missing.`);
    }

    const pe = validatePEHeader(portableFilePath);
    if (!pe.valid) {
      throw new Error(`PE header verification failed on "${path.basename(portableFilePath)}": ${pe.error}`);
    }

    return (
      `Valid Windows PE binary confirmed: DOS magic "${pe.dosMagic}" (0x4D, 0x5A) at offset 0, ` +
      `PE signature "${pe.peSignature}" at offset 0x${pe.peOffset.toString(16)}, Target: ${pe.machineType}.`
    );
  });

  // ---------------------------------------------------------------------------
  // AC5-8: Non-regression check ensuring all core test suites remain 100% passing
  // ---------------------------------------------------------------------------
  await executeStep('AC5-8', 'Regression Guard: 100% Pass Across Core Verifiers & Master E2E Suite', async () => {
    // Check if CLI asked to skip regression
    const args = process.argv.slice(2);
    if (args.includes('--skip-regression')) {
      return `Regression testing skipped via --skip-regression command line flag.`;
    }

    const testSuites = [
      { name: 'Core Acceptance Verifier (AC1-AC8)', command: 'npx tsx tests/verify-erp-core.ts' },
      { name: 'Milestone 2 Procurement (M2-AC1..8)', command: 'npx tsx tests/verify-m2-procurement.ts' },
      { name: 'Milestone 3 Inventory (M3-AC1..8)', command: 'npx tsx tests/verify-m3-inventory.ts' },
      { name: 'Milestone 4 Fulfillment (AC4-1..8)', command: 'npx tsx tests/verify-m4-fulfillment.ts' },
      { name: 'Master E2E Suite Runner (Tiers 1-4)', command: 'npx tsx tests/run-all-tests.ts' }
    ];

    const suiteSummaries: string[] = [];

    for (const suite of testSuites) {
      const suiteStart = Date.now();
      try {
        const output = execSync(suite.command, {
          cwd: projectRoot,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, CI: '1' }
        });
        const suiteElapsed = Date.now() - suiteStart;
        suiteSummaries.push(`[${suite.name}: PASS in ${suiteElapsed}ms]`);
      } catch (err: any) {
        const suiteElapsed = Date.now() - suiteStart;
        const stdout = err.stdout ? String(err.stdout) : '';
        const stderr = err.stderr ? String(err.stderr) : '';
        const combined = (stdout + '\n' + stderr).trim();
        const snippet = combined.split('\n').slice(-15).join('\n');
        throw new Error(
          `Non-regression suite failed: ${suite.name} (elapsed ${suiteElapsed}ms)\n` +
          `Command: ${suite.command}\n` +
          `Error Details:\n${snippet || err.message}`
        );
      }
    }

    return (
      `All ${testSuites.length} core test suites executed and PASSED 100% without regression:\n` +
      `        ${suiteSummaries.join('\n        ')}`
    );
  });

  // ---------------------------------------------------------------------------
  // SCORECARD SUMMARY
  // ---------------------------------------------------------------------------
  const totalDuration = Date.now() - tStart;
  const passedCount = stepResults.filter((s) => s.passed).length;
  const failedCount = stepResults.filter((s) => !s.passed).length;

  console.log(`\n${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}          MILESTONE 5 ACCEPTANCE VERIFICATION SCORECARD                 ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`  Total Criteria: ${stepResults.length}`);
  console.log(`  Passed:         ${colors.green}${passedCount}${colors.reset}`);
  console.log(`  Failed:         ${failedCount > 0 ? `${colors.red}${failedCount}${colors.reset}` : `${colors.green}0${colors.reset}`}`);
  console.log(`  Execution Time: ${totalDuration}ms`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}\n`);

  if (failedCount > 0) {
    console.error(`${colors.red}❌ Verification FAILED with ${failedCount} error(s).${colors.reset}`);
    process.exit(1);
  } else {
    console.log(`${colors.green}✨ [SUCCESS] All Milestone 5 Acceptance Criteria PASSED! Dual Windows artifacts validated.${colors.reset}\n`);
    process.exit(0);
  }
}

runM5Verification().catch((err) => {
  console.error('Fatal crash in M5 packaging verification:', err);
  process.exit(1);
});
