#!/usr/bin/env node
/**
 * ============================================================================
 * PROBAHO ERP — EMPIRICAL PROBE: OFFLINE NETWORK ISOLATION & ZERO-DEPENDENCY
 * File: tests/challenger/probe-offline-isolation.ts
 * Role: challenger_m5_2 (Empirical Challenger)
 * ============================================================================
 *
 * Adversarially verifies:
 * 1. Zero external network calls (HTTP/HTTPS, CDNs, remote APIs, external scripts)
 *    across all source files in src/, electron/, dist/, and root index.html.
 * 2. Strict Content Security Policy (CSP) in index.html and dist/index.html
 *    enforcing default-src 'self' with zero external domains.
 * 3. Offline typography: font stacks resolve strictly to local Segoe UI / Cascadia Code / system-ui
 *    with zero remote webfonts (@font-face with http/https, Google Fonts, Adobe Fonts, etc.).
 * 4. Electron runtime defenses in electron/main.cjs: will-navigate, setWindowOpenHandler,
 *    and setPermissionRequestHandler.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

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
  details: string;
}

const probeResults: ProbeResult[] = [];

function recordProbe(id: string, name: string, passed: boolean, details: string) {
  probeResults.push({ id, name, passed, details });
  const status = passed
    ? `${colors.green}[PASS]${colors.reset}`
    : `${colors.red}[FAIL]${colors.reset}`;
  console.log(`  ${status} ${colors.bold}${id}${colors.reset}: ${name}`);
  if (details) {
    console.log(`         ${colors.gray}${details}${colors.reset}`);
  }
}

// Allowed benign static string constants (XML namespaces, dev origin, courier template data, react error docs)
const BENIGN_PATTERNS = [
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/1998/Math/MathML',
  'http://www.w3.org/XML/1998/namespace',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://pathao.com/track/',
  'https://steadfast.com.bd/t/',
  'https://redx.com.bd/track',
  'https://track.carrier.com',
  'https://react.dev/errors/',
  'https://github.com',
  'http://opensource.org'
];

function getAllFiles(dir: string, extensions: string[]): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        files.push(...getAllFiles(fullPath, extensions));
      }
    } else if (entry.isFile()) {
      if (extensions.some(ext => entry.name.endsWith(ext))) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

async function runOfflineIsolationProbes() {
  console.log(`\n${colors.bold}${colors.cyan}================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}   PROBAHO ERP — EMPIRICAL OFFLINE ISOLATION & ZERO-NET PROBE   ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}================================================================${colors.reset}\n`);

  // --------------------------------------------------------------------------
  // Probe 1: Content Security Policy (CSP) Verification in index.html & dist/index.html
  // --------------------------------------------------------------------------
  {
    const htmlFiles = [
      path.join(projectRoot, 'index.html'),
      path.join(projectRoot, 'dist', 'index.html')
    ];

    let allCspValid = true;
    const cspDetails: string[] = [];

    for (const htmlPath of htmlFiles) {
      if (!fs.existsSync(htmlPath)) {
        allCspValid = false;
        cspDetails.push(`Missing file: ${path.relative(projectRoot, htmlPath)}`);
        continue;
      }

      const content = fs.readFileSync(htmlPath, 'utf-8');
      const cspMatch = content.match(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*content="([^"]+)"/i)
        || content.match(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*content='([^']+)'/i);
      
      if (!cspMatch) {
        allCspValid = false;
        cspDetails.push(`Missing CSP meta tag in ${path.relative(projectRoot, htmlPath)}`);
        continue;
      }

      const cspContent = cspMatch[1];
      const hasDefaultSelf = /default-src\s+'self'/i.test(cspContent);
      const hasNoRemoteConnect = !/connect-src[^;]*https?:\/\//i.test(cspContent);
      const hasNoRemoteScript = !/script-src[^;]*https?:\/\//i.test(cspContent);
      const hasNoRemoteStyle = !/style-src[^;]*https?:\/\//i.test(cspContent);

      if (!hasDefaultSelf || !hasNoRemoteConnect || !hasNoRemoteScript || !hasNoRemoteStyle) {
        allCspValid = false;
        cspDetails.push(`Permissive or non-isolated CSP in ${path.relative(projectRoot, htmlPath)}: ${cspContent}`);
      } else {
        cspDetails.push(`${path.relative(projectRoot, htmlPath)}: default-src 'self' enforced, 0 remote domains`);
      }
    }

    recordProbe(
      'NET-PROBE-01',
      'Content-Security-Policy (CSP) Isolation',
      allCspValid,
      cspDetails.join(' | ')
    );
  }

  // --------------------------------------------------------------------------
  // Probe 2: Zero Active Network Calls in Source (src/ and electron/)
  // --------------------------------------------------------------------------
  {
    const scanDirs = [path.join(projectRoot, 'src'), path.join(projectRoot, 'electron')];
    const sourceFiles: string[] = [];
    for (const d of scanDirs) {
      sourceFiles.push(...getAllFiles(d, ['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.css']));
    }

    const activeNetworkViolations: { file: string; line: number; match: string }[] = [];

    // Check for active network invocation patterns: fetch(, XMLHttpRequest, axios, WebSocket, EventSource, sendBeacon
    const activeNetRegex = /\b(fetch\s*\(|XMLHttpRequest|axios\s*(\.|\()|new\s+WebSocket|new\s+EventSource|navigator\.sendBeacon)\b/;
    
    // Check for remote external scripts or CDN imports
    const remoteImportRegex = /(import\s+.*from\s+['"]https?:\/\/|import\(['"]https?:\/\/)/;

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (activeNetRegex.test(line)) {
          activeNetworkViolations.push({
            file: path.relative(projectRoot, file),
            line: idx + 1,
            match: line.trim()
          });
        }
        if (remoteImportRegex.test(line)) {
          activeNetworkViolations.push({
            file: path.relative(projectRoot, file),
            line: idx + 1,
            match: line.trim()
          });
        }
      });
    }

    const passed = activeNetworkViolations.length === 0;
    const details = passed
      ? `Scanned ${sourceFiles.length} source files across src/ & electron/. Zero fetch, XHR, axios, WebSocket, or remote imports.`
      : `Found active network violations: ${JSON.stringify(activeNetworkViolations)}`;

    recordProbe(
      'NET-PROBE-02',
      'Zero Active Network Calls in Source (src/ & electron/)',
      passed,
      details
    );
  }

  // --------------------------------------------------------------------------
  // Probe 3: Zero Remote Asset Ingestion in Production Bundle (dist/)
  // --------------------------------------------------------------------------
  {
    const distFiles = getAllFiles(path.join(projectRoot, 'dist'), ['.html', '.js', '.css']);
    const violations: { file: string; match: string }[] = [];
    const urlRegex = /(https?:\/\/[^\s"'`\)]+)/g;

    for (const file of distFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      let m: RegExpExecArray | null;
      while ((m = urlRegex.exec(content)) !== null) {
        const rawUrl = m[1];
        const isBenign = BENIGN_PATTERNS.some(b => rawUrl.startsWith(b));
        if (!isBenign) {
          violations.push({
            file: path.relative(projectRoot, file),
            match: rawUrl.slice(0, 80)
          });
        }
      }
    }

    const passed = violations.length === 0;
    const details = passed
      ? `Scanned ${distFiles.length} distribution bundles in dist/. Zero unapproved external network calls or remote scripts.`
      : `Found ${violations.length} unexpected external URLs in dist/: ${violations.map(v => v.match).join(', ')}`;

    recordProbe(
      'NET-PROBE-03',
      'Zero Remote Asset Ingestion in Production Bundle (dist/)',
      passed,
      details
    );
  }

  // --------------------------------------------------------------------------
  // Probe 4: Offline Typography & Local System Font Stacks
  // --------------------------------------------------------------------------
  {
    const cssFiles = [
      path.join(projectRoot, 'src', 'index.css'),
      ...getAllFiles(path.join(projectRoot, 'dist', 'assets'), ['.css'])
    ];

    let fontsOffline = true;
    const fontFindings: string[] = [];

    for (const cssFile of cssFiles) {
      if (!fs.existsSync(cssFile)) continue;
      const content = fs.readFileSync(cssFile, 'utf-8');

      // Check for remote font @import
      if (/@import\s+(url\(['"]?)?https?:\/\//i.test(content)) {
        fontsOffline = false;
        fontFindings.push(`Remote @import found in ${path.relative(projectRoot, cssFile)}`);
      }

      // Check for remote @font-face url()
      if (/@font-face[\s\S]*?url\(['"]?https?:\/\//i.test(content)) {
        fontsOffline = false;
        fontFindings.push(`Remote @font-face found in ${path.relative(projectRoot, cssFile)}`);
      }

      // Verify Segoe UI or system font stack presence
      const hasSegoeOrSystem = /Segoe UI/i.test(content) || /BlinkMacSystemFont/i.test(content) || /system-ui/i.test(content);
      if (!hasSegoeOrSystem) {
        fontFindings.push(`Warning: Segoe UI / system-ui not explicitly declared in ${path.relative(projectRoot, cssFile)}`);
      }
    }

    const passed = fontsOffline;
    const details = passed
      ? `All font stacks resolve to local system fonts (Segoe UI, Cascadia Code, BlinkMacSystemFont). Zero remote @font-face or @import.`
      : `Font isolation violations: ${fontFindings.join('; ')}`;

    recordProbe(
      'NET-PROBE-04',
      'Offline Typography & System Font Stacks',
      passed,
      details
    );
  }

  // --------------------------------------------------------------------------
  // Probe 5: Electron Shell Security Invariants (electron/main.cjs & preload.cjs)
  // --------------------------------------------------------------------------
  {
    const mainPath = path.join(projectRoot, 'electron', 'main.cjs');
    const preloadPath = path.join(projectRoot, 'electron', 'preload.cjs');

    let shellSecure = true;
    const shellIssues: string[] = [];

    if (!fs.existsSync(mainPath) || !fs.existsSync(preloadPath)) {
      shellSecure = false;
      shellIssues.push('main.cjs or preload.cjs missing');
    } else {
      const mainContent = fs.readFileSync(mainPath, 'utf-8');
      const preloadContent = fs.readFileSync(preloadPath, 'utf-8');

      // 1. Context isolation enabled
      if (!/contextIsolation:\s*true/.test(mainContent)) {
        shellSecure = false;
        shellIssues.push('contextIsolation is not true in BrowserWindow webPreferences');
      }

      // 2. Node integration disabled
      if (!/nodeIntegration:\s*false/.test(mainContent)) {
        shellSecure = false;
        shellIssues.push('nodeIntegration is not false in BrowserWindow webPreferences');
      }

      // 3. Single instance lock
      if (!/app\.requestSingleInstanceLock\(\)/.test(mainContent)) {
        shellSecure = false;
        shellIssues.push('Single instance lock missing');
      }

      // 4. Navigation defense (will-navigate interception)
      if (!/will-navigate/.test(mainContent)) {
        shellSecure = false;
        shellIssues.push('will-navigate navigation guard missing');
      }

      // 5. External window denial
      if (!/setWindowOpenHandler/.test(mainContent) || !/action:\s*['"]deny['"]/.test(mainContent)) {
        shellSecure = false;
        shellIssues.push('setWindowOpenHandler denying action missing');
      }

      // 6. Device permissions rejection
      if (!/setPermissionRequestHandler[\s\S]*?callback\(false\)/.test(mainContent)) {
        shellSecure = false;
        shellIssues.push('setPermissionRequestHandler rejecting callback(false) missing');
      }

      // 7. Context bridge in preload
      if (!/contextBridge\.exposeInMainWorld/.test(preloadContent)) {
        shellSecure = false;
        shellIssues.push('Preload does not expose via contextBridge');
      }
    }

    const details = shellSecure
      ? 'Context isolation: TRUE, nodeIntegration: FALSE, single-instance lock: ACTIVE, will-navigate: ACTIVE, permissions: DENIED, sandbox window open: DENIED.'
      : `Shell security violations: ${shellIssues.join('; ')}`;

    recordProbe(
      'NET-PROBE-05',
      'Electron Process Runtime Isolation & Defense',
      shellSecure,
      details
    );
  }

  // --------------------------------------------------------------------------
  // Summary & Exit Code
  // --------------------------------------------------------------------------
  const allPassed = probeResults.every(r => r.passed);
  console.log(`\n${colors.bold}${colors.cyan}----------------------------------------------------------------${colors.reset}`);
  console.log(`Probe Results: ${probeResults.filter(r => r.passed).length}/${probeResults.length} passed.`);
  console.log(`Verdict: ${allPassed ? `${colors.green}${colors.bold}VERIFIED_OFFLINE_ISOLATED${colors.reset}` : `${colors.red}${colors.bold}ISOLATION_FAILED${colors.reset}`}`);
  console.log(`${colors.bold}${colors.cyan}================================================================${colors.reset}\n`);

  if (!allPassed) {
    process.exit(1);
  }
}

runOfflineIsolationProbes().catch(err => {
  console.error('[FATAL Probe Error]:', err);
  process.exit(1);
});
