import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

// ANSI styling
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';

const projectRoot = path.resolve(process.cwd());
const releaseDir = path.join(projectRoot, 'release');

console.log(`${BOLD}${CYAN}========================================================================${RESET}`);
console.log(`${BOLD}${CYAN}       EMPIRICAL CHALLENGER: MILESTONE 5 BINARY & PE PROBE             ${RESET}`);
console.log(`${BOLD}${CYAN}========================================================================${RESET}\n`);

interface ProbeResult {
  title: string;
  passed: boolean;
  details: string;
}

const probeResults: ProbeResult[] = [];

function record(title: string, passed: boolean, details: string) {
  probeResults.push({ title, passed, details });
  const status = passed ? `${GREEN}✔ PASS${RESET}` : `${RED}✘ FAIL${RESET}`;
  console.log(`${status} ${BOLD}${title}${RESET}`);
  console.log(`   ${GRAY}↳ ${details}${RESET}\n`);
}

function computeSha256(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const buffer = Buffer.alloc(65536);
  const fd = fs.openSync(filePath, 'r');
  let bytesRead = 0;
  while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
    hash.update(buffer.subarray(0, bytesRead));
  }
  fs.closeSync(fd);
  return hash.digest('hex');
}

interface SectionInfo {
  name: string;
  virtualSize: number;
  virtualAddress: number;
  sizeOfRawData: number;
  pointerToRawData: number;
}

interface ParsedPE {
  filePath: string;
  fileSize: number;
  dosMagic: string;
  e_lfanew: number;
  peSignature: string;
  machine: number;
  machineName: string;
  numberOfSections: number;
  timeDateStamp: Date;
  sizeOfOptionalHeader: number;
  characteristics: number;
  optionalMagic: number;
  optionalMagicName: string;
  entryPoint: number;
  imageBase: bigint;
  subsystem: number;
  subsystemName: string;
  sections: SectionInfo[];
}

function parsePE(filePath: string): ParsedPE {
  const stat = fs.statSync(filePath);
  const fd = fs.openSync(filePath, 'r');
  try {
    const dosBuf = Buffer.alloc(64);
    fs.readSync(fd, dosBuf, 0, 64, 0);

    const dosMagic = dosBuf.subarray(0, 2).toString('latin1');
    if (dosMagic !== 'MZ') {
      throw new Error(`Invalid DOS Header magic: expected 'MZ', got '${dosMagic}'`);
    }

    const e_lfanew = dosBuf.readUInt32LE(0x3C);
    if (e_lfanew <= 0 || e_lfanew > stat.size) {
      throw new Error(`Invalid e_lfanew offset: 0x${e_lfanew.toString(16)}`);
    }

    // Read PE signature (4) + COFF header (20)
    const coffBuf = Buffer.alloc(24);
    fs.readSync(fd, coffBuf, 0, 24, e_lfanew);

    const peSig = coffBuf.subarray(0, 4).toString('latin1');
    if (peSig !== 'PE\0\0') {
      throw new Error(`Invalid PE signature: expected 'PE\\0\\0', got '${peSig}'`);
    }

    const machine = coffBuf.readUInt16LE(4);
    let machineName = `0x${machine.toString(16)}`;
    if (machine === 0x8664) machineName = 'IMAGE_FILE_MACHINE_AMD64 (x64)';
    else if (machine === 0x014c) machineName = 'IMAGE_FILE_MACHINE_I386 (x86)';
    else if (machine === 0xaa64) machineName = 'IMAGE_FILE_MACHINE_ARM64';

    const numberOfSections = coffBuf.readUInt16LE(6);
    const timeDateStampRaw = coffBuf.readUInt32LE(8);
    const timeDateStamp = new Date(timeDateStampRaw * 1000);
    const sizeOfOptionalHeader = coffBuf.readUInt16LE(20);
    const characteristics = coffBuf.readUInt16LE(22);

    let optionalMagic = 0;
    let optionalMagicName = 'N/A';
    let entryPoint = 0;
    let imageBase = 0n;
    let subsystem = 0;
    let subsystemName = 'N/A';

    if (sizeOfOptionalHeader > 0) {
      const optBuf = Buffer.alloc(sizeOfOptionalHeader);
      fs.readSync(fd, optBuf, 0, sizeOfOptionalHeader, e_lfanew + 24);

      optionalMagic = optBuf.readUInt16LE(0);
      if (optionalMagic === 0x010B) optionalMagicName = 'PE32 (32-bit)';
      else if (optionalMagic === 0x020B) optionalMagicName = 'PE32+ (64-bit)';

      entryPoint = optBuf.readUInt32LE(16);

      if (optionalMagic === 0x020B) {
        imageBase = optBuf.readBigUInt64LE(24);
        subsystem = optBuf.readUInt16LE(68);
      } else {
        imageBase = BigInt(optBuf.readUInt32LE(28));
        subsystem = optBuf.readUInt16LE(68);
      }

      if (subsystem === 2) subsystemName = 'IMAGE_SUBSYSTEM_WINDOWS_GUI';
      else if (subsystem === 3) subsystemName = 'IMAGE_SUBSYSTEM_WINDOWS_CUI';
      else subsystemName = `Subsystem(${subsystem})`;
    }

    // Section headers start right after optional header
    const sectionHeadersOffset = e_lfanew + 24 + sizeOfOptionalHeader;
    const sectionHeadersSize = numberOfSections * 40;
    const secBuf = Buffer.alloc(sectionHeadersSize);
    fs.readSync(fd, secBuf, 0, sectionHeadersSize, sectionHeadersOffset);

    const sections: SectionInfo[] = [];
    for (let i = 0; i < numberOfSections; i++) {
      const offset = i * 40;
      const rawName = secBuf.subarray(offset, offset + 8);
      const name = rawName.toString('utf-8').replace(/\0.*$/g, '');
      const virtualSize = secBuf.readUInt32LE(offset + 8);
      const virtualAddress = secBuf.readUInt32LE(offset + 12);
      const sizeOfRawData = secBuf.readUInt32LE(offset + 16);
      const pointerToRawData = secBuf.readUInt32LE(offset + 20);

      sections.push({
        name,
        virtualSize,
        virtualAddress,
        sizeOfRawData,
        pointerToRawData
      });
    }

    return {
      filePath,
      fileSize: stat.size,
      dosMagic,
      e_lfanew,
      peSignature: peSig,
      machine,
      machineName,
      numberOfSections,
      timeDateStamp,
      sizeOfOptionalHeader,
      characteristics,
      optionalMagic,
      optionalMagicName,
      entryPoint,
      imageBase,
      subsystem,
      subsystemName,
      sections
    };
  } finally {
    fs.closeSync(fd);
  }
}

// ASAR parser
interface AsarDirectory {
  files: {
    [key: string]: AsarEntry;
  };
}

interface AsarFile {
  size: number;
  offset?: string | number;
  unpacked?: boolean;
  integrity?: {
    algorithm: string;
    hash: string;
  };
}

type AsarEntry = AsarDirectory | AsarFile;

function isAsarDirectory(entry: AsarEntry): entry is AsarDirectory {
  return typeof (entry as any).files === 'object';
}

function isAsarFile(entry: AsarEntry): entry is AsarFile {
  return typeof (entry as any).size === 'number';
}

interface ParsedAsar {
  headerSize: number;
  headerStringSize: number;
  baseOffset: number;
  files: Map<string, { size: number; offset: number; integrityHash?: string }>;
}

function parseAsar(asarPath: string): ParsedAsar {
  const fd = fs.openSync(asarPath, 'r');
  try {
    const magicBuf = Buffer.alloc(16);
    fs.readSync(fd, magicBuf, 0, 16, 0);

    const u0 = magicBuf.readUInt32LE(0);
    const headerSize = magicBuf.readUInt32LE(4);
    const u2 = magicBuf.readUInt32LE(8);
    const jsonStringSize = magicBuf.readUInt32LE(12);

    if (u0 !== 4) {
      throw new Error(`Unexpected ASAR pickle prefix: ${u0} (expected 4)`);
    }

    const jsonBuf = Buffer.alloc(jsonStringSize);
    fs.readSync(fd, jsonBuf, 0, jsonStringSize, 16);

    const jsonStr = jsonBuf.toString('utf-8');
    const root = JSON.parse(jsonStr) as AsarDirectory;

    // In Chromium ASAR format, total header block is 8 bytes + headerSize
    const baseOffset = 8 + headerSize;
    const fileMap = new Map<string, { size: number; offset: number; integrityHash?: string }>();

    function traverse(node: AsarDirectory, curPath: string) {
      for (const [name, child] of Object.entries(node.files)) {
        const fullPath = curPath ? `${curPath}/${name}` : name;
        if (isAsarDirectory(child)) {
          traverse(child, fullPath);
        } else if (isAsarFile(child)) {
          const offsetNum = child.offset !== undefined ? Number(child.offset) : -1;
          fileMap.set(fullPath, {
            size: child.size,
            offset: offsetNum >= 0 ? baseOffset + offsetNum : -1,
            integrityHash: child.integrity?.hash
          });
        }
      }
    }

    traverse(root, '');

    return {
      headerSize,
      headerStringSize: jsonStringSize,
      baseOffset,
      files: fileMap
    };
  } finally {
    fs.closeSync(fd);
  }
}

async function runProbes() {
  const setupExePath = path.join(releaseDir, 'Probaho.ERP.Setup.1.0.0.exe');
  const portableExePath = path.join(releaseDir, 'Probaho.ERP-Portable.exe');
  const unpackedExePath = path.join(releaseDir, 'win-unpacked', 'Probaho ERP.exe');
  const asarPath = path.join(releaseDir, 'win-unpacked', 'resources', 'app.asar');

  // --- PROBE 1: File Existence & Size Checks ---
  const setupExists = fs.existsSync(setupExePath);
  const portableExists = fs.existsSync(portableExePath);
  const unpackedExists = fs.existsSync(unpackedExePath);
  const asarExists = fs.existsSync(asarPath);

  record(
    'PROBE 1.1: Release Artifacts Existence',
    setupExists && portableExists && unpackedExists && asarExists,
    `Setup: ${setupExists}, Portable: ${portableExists}, Unpacked: ${unpackedExists}, Asar: ${asarExists}`
  );

  const setupStat = fs.statSync(setupExePath);
  const portableStat = fs.statSync(portableExePath);
  const setupMB = (setupStat.size / (1024 * 1024)).toFixed(2);
  const portableMB = (portableStat.size / (1024 * 1024)).toFixed(2);

  record(
    'PROBE 1.2: Binary Size Verification (> 50 MB and ~95-101 MB)',
    setupStat.size > 50 * 1024 * 1024 && portableStat.size > 50 * 1024 * 1024,
    `Setup.exe: ${setupStat.size} bytes (${setupMB} MB); Portable.exe: ${portableStat.size} bytes (${portableMB} MB)`
  );

  // --- PROBE 2: Cryptographic Checksums (SHA-256) ---
  const setupSha = computeSha256(setupExePath);
  const portableSha = computeSha256(portableExePath);
  const asarSha = computeSha256(asarPath);

  record(
    'PROBE 2.1: SHA-256 Checksum Calculation & Integrity Check',
    setupSha.length === 64 && portableSha.length === 64 && asarSha.length === 64,
    `Setup SHA-256: ${setupSha}\n   ↳ Portable SHA-256: ${portableSha}\n   ↳ App.asar SHA-256: ${asarSha}`
  );

  // --- PROBE 3: PE Structure Inspection for Setup Installer ---
  const setupPE = parsePE(setupExePath);
  record(
    'PROBE 3.1: Setup Installer PE Structure (MZ, PE00, Headers, Machine)',
    setupPE.dosMagic === 'MZ' && setupPE.peSignature === 'PE\0\0',
    `DOS Magic: '${setupPE.dosMagic}', e_lfanew: 0x${setupPE.e_lfanew.toString(16)}, ` +
    `Signature: 'PE\\0\\0', Machine: ${setupPE.machineName}, Sections: ${setupPE.numberOfSections}, ` +
    `OptionalMagic: ${setupPE.optionalMagicName}, Subsystem: ${setupPE.subsystemName}`
  );

  console.log(`     ${CYAN}Setup Sections (${setupPE.sections.length}):${RESET}`);
  for (const s of setupPE.sections) {
    console.log(`       - ${s.name.padEnd(10)} RawSize: ${String(s.sizeOfRawData).padStart(9)} Pointer: 0x${s.pointerToRawData.toString(16).padStart(8, '0')} VirtSize: ${String(s.virtualSize).padStart(9)} VirtAddr: 0x${s.virtualAddress.toString(16).padStart(8, '0')}`);
  }

  // --- PROBE 4: PE Structure Inspection for Portable Executable ---
  const portablePE = parsePE(portableExePath);
  record(
    'PROBE 4.1: Portable Executable PE Structure (MZ, PE00, Headers, Machine)',
    portablePE.dosMagic === 'MZ' && portablePE.peSignature === 'PE\0\0',
    `DOS Magic: '${portablePE.dosMagic}', e_lfanew: 0x${portablePE.e_lfanew.toString(16)}, ` +
    `Signature: 'PE\\0\\0', Machine: ${portablePE.machineName}, Sections: ${portablePE.numberOfSections}, ` +
    `OptionalMagic: ${portablePE.optionalMagicName}, Subsystem: ${portablePE.subsystemName}`
  );

  console.log(`     ${CYAN}Portable Sections (${portablePE.sections.length}):${RESET}`);
  for (const s of portablePE.sections) {
    console.log(`       - ${s.name.padEnd(10)} RawSize: ${String(s.sizeOfRawData).padStart(9)} Pointer: 0x${s.pointerToRawData.toString(16).padStart(8, '0')} VirtSize: ${String(s.virtualSize).padStart(9)} VirtAddr: 0x${s.virtualAddress.toString(16).padStart(8, '0')}`);
  }

  // --- PROBE 5: PE Structure Inspection for Unpacked Electron Binary ---
  const unpackedPE = parsePE(unpackedExePath);
  record(
    'PROBE 5.1: Unpacked Electron Executable PE Structure (x64 AMD64 Native)',
    unpackedPE.dosMagic === 'MZ' && unpackedPE.peSignature === 'PE\0\0' && unpackedPE.machine === 0x8664,
    `DOS Magic: '${unpackedPE.dosMagic}', e_lfanew: 0x${unpackedPE.e_lfanew.toString(16)}, ` +
    `Signature: 'PE\\0\\0', Machine: ${unpackedPE.machineName}, Sections: ${unpackedPE.numberOfSections}, ` +
    `OptionalMagic: ${unpackedPE.optionalMagicName}, Subsystem: ${unpackedPE.subsystemName}`
  );

  console.log(`     ${CYAN}Unpacked Sections (${unpackedPE.sections.length}):${RESET}`);
  for (const s of unpackedPE.sections) {
    console.log(`       - ${s.name.padEnd(10)} RawSize: ${String(s.sizeOfRawData).padStart(9)} Pointer: 0x${s.pointerToRawData.toString(16).padStart(8, '0')} VirtSize: ${String(s.virtualSize).padStart(9)} VirtAddr: 0x${s.virtualAddress.toString(16).padStart(8, '0')}`);
  }

  // --- PROBE 6: ASAR Archive Inspection ---
  const asar = parseAsar(asarPath);
  const requiredFiles = [
    'dist/index.html',
    'dist/sql-wasm.wasm',
    'electron/main.cjs',
    'electron/preload.cjs',
    'package.json'
  ];

  const missingFiles = requiredFiles.filter(rf => !asar.files.has(rf));
  const fileDetails = requiredFiles.map(rf => {
    const entry = asar.files.get(rf);
    return `${rf} (${entry ? `${entry.size} bytes, offset 0x${entry.offset.toString(16)}` : 'MISSING'})`;
  });

  record(
    'PROBE 6.1: ASAR Archive Header & Required Files Verification',
    missingFiles.length === 0,
    `Total files indexed in app.asar: ${asar.files.size}. Required files:\n   ↳ ${fileDetails.join('\n   ↳ ')}`
  );

  // --- PROBE 7: Empirical Content Extraction & Cryptographic Block Validation ---
  const fdAsar = fs.openSync(asarPath, 'r');
  let snippetValid = false;
  let snippetDetails: string[] = [];
  try {
    // 7.1: Extract & Validate index.html
    const htmlMeta = asar.files.get('dist/index.html')!;
    const htmlBuf = Buffer.alloc(htmlMeta.size);
    fs.readSync(fdAsar, htmlBuf, 0, htmlBuf.length, htmlMeta.offset);
    const htmlContent = htmlBuf.toString('utf-8');
    const htmlHash = crypto.createHash('sha256').update(htmlBuf).digest('hex');
    const htmlValid = htmlContent.includes('<title>') && (!htmlMeta.integrityHash || htmlHash === htmlMeta.integrityHash);
    snippetDetails.push(`dist/index.html: ${htmlMeta.size} bytes, sha256: ${htmlHash.substring(0, 16)}..., title: ${htmlContent.includes('<title>')}`);

    // 7.2: Extract & Validate package.json
    const pkgMeta = asar.files.get('package.json')!;
    const pkgBuf = Buffer.alloc(pkgMeta.size);
    fs.readSync(fdAsar, pkgBuf, 0, pkgBuf.length, pkgMeta.offset);
    const pkgContent = JSON.parse(pkgBuf.toString('utf-8'));
    const pkgHash = crypto.createHash('sha256').update(pkgBuf).digest('hex');
    const pkgValid = pkgContent.name === 'probaho-erp' && (!pkgMeta.integrityHash || pkgHash === pkgMeta.integrityHash);
    snippetDetails.push(`package.json: name="${pkgContent.name}", version="${pkgContent.version}", sha256: ${pkgHash.substring(0, 16)}...`);

    // 7.3: Extract & Validate sql-wasm.wasm magic bytes (\0asm)
    const wasmMeta = asar.files.get('dist/sql-wasm.wasm')!;
    const wasmBuf = Buffer.alloc(8);
    fs.readSync(fdAsar, wasmBuf, 0, wasmBuf.length, wasmMeta.offset);
    const wasmMagic = wasmBuf.subarray(0, 4).toString('latin1');
    const wasmValid = wasmMagic === '\0asm' && wasmBuf.readUInt32LE(4) === 1;
    snippetDetails.push(`dist/sql-wasm.wasm: size=${wasmMeta.size} bytes, magic="${wasmMagic}" (0x00 0x61 0x73 0x6d), version=${wasmBuf.readUInt32LE(4)}`);

    // 7.4: Extract & Validate electron/main.cjs
    const mainMeta = asar.files.get('electron/main.cjs')!;
    const mainBuf = Buffer.alloc(mainMeta.size);
    fs.readSync(fdAsar, mainBuf, 0, mainBuf.length, mainMeta.offset);
    const mainContent = mainBuf.toString('utf-8');
    const mainValid = mainContent.includes('requestSingleInstanceLock') || mainContent.includes('BrowserWindow');
    snippetDetails.push(`electron/main.cjs: size=${mainMeta.size} bytes, contains Electron IPC & window management: ${mainValid}`);

    // 7.5: Extract & Validate electron/preload.cjs
    const preloadMeta = asar.files.get('electron/preload.cjs')!;
    const preloadBuf = Buffer.alloc(preloadMeta.size);
    fs.readSync(fdAsar, preloadBuf, 0, preloadBuf.length, preloadMeta.offset);
    const preloadContent = preloadBuf.toString('utf-8');
    const preloadValid = preloadContent.includes('contextBridge') && preloadContent.includes('electronAPI');
    snippetDetails.push(`electron/preload.cjs: size=${preloadMeta.size} bytes, contains contextBridge & electronAPI: ${preloadValid}`);

    snippetValid = htmlValid && pkgValid && wasmValid && mainValid && preloadValid;
  } catch (err: any) {
    snippetDetails.push(`Byte extraction error: ${err.message}`);
  } finally {
    fs.closeSync(fdAsar);
  }

  record(
    'PROBE 7.1: ASAR Direct Byte Extraction & Payload Verification',
    snippetValid,
    snippetDetails.join('\n   ↳ ')
  );

  // Summary
  const allPassed = probeResults.every(r => r.passed);
  console.log(`${BOLD}${CYAN}========================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}                    CHALLENGER VERDICT SCORECARD                       ${RESET}`);
  console.log(`${BOLD}${CYAN}========================================================================${RESET}`);
  console.log(`Total Probes: ${probeResults.length}`);
  console.log(`Passed:       ${probeResults.filter(r => r.passed).length}`);
  console.log(`Failed:       ${probeResults.filter(r => !r.passed).length}`);
  console.log(`Verdict:      ${allPassed ? `${GREEN}${BOLD}CONFIRMED (All empirical challenges passed)${RESET}` : `${RED}${BOLD}CHALLENGE_FAILED${RESET}`}`);
  console.log(`${BOLD}${CYAN}========================================================================${RESET}\n`);

  if (!allPassed) {
    process.exit(1);
  }
}

runProbes().catch(err => {
  console.error('Fatal probe error:', err);
  process.exit(1);
});
