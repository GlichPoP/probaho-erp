// ============================================================================
// PROBAHO ERP: TEST SUITE M10 — PROBAHO LOGO & COMPANY BRAND LOGO PIPELINE
// File: tests/verify-m10-company-logo.ts
// Features: ProbahoLogo SVG integrity, universal format logo processing, SQLite persistence
// ============================================================================

import { DatabaseService } from '../src/services/db';
import { processCompanyLogoFile, createCompanyFallbackBadge } from '../src/utils/imageUtils';
import * as fs from 'fs';
import * as path from 'path';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('========================================================================');
  console.log('  PROBAHO ERP — PROBAHO LOGO & COMPANY BRAND LOGO VERIFICATION (M10)    ');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void>) {
    total++;
    process.stdout.write(`  ⏳ Running [AC10-${total}] ${name}...`);
    const start = Date.now();
    try {
      await fn();
      const elapsed = Date.now() - start;
      console.log(`  ✔ PASS [AC10-${total}] ${name} (${elapsed}ms)`);
      passed++;
    } catch (err: any) {
      console.log(`  ✖ FAIL [AC10-${total}] ${name}`);
      console.error(`     ↳ Error: ${err.message || String(err)}\n`);
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: ProbahoLogo Component & SVG Palette Invariants
  // --------------------------------------------------------------------------
  await test('ProbahoLogo Component & Emerald Green Invariants', async () => {
    const logoFilePath = path.resolve(process.cwd(), 'src/components/ProbahoLogo.tsx');
    assert(fs.existsSync(logoFilePath), 'ProbahoLogo.tsx component must exist');

    const content = fs.readFileSync(logoFilePath, 'utf8');
    assert(content.includes('#059669') && content.includes('#0D9488'), 'Must include emerald/teal brand gradients');
    assert(content.includes('Monogram P Ribbon'), 'Must render iconic monogram P ribbon geometry');
    assert(content.includes('export const ProbahoLogo'), 'Must export ProbahoLogo component');
  });

  // --------------------------------------------------------------------------
  // TEST 2: Universal Logo Processing for SVG & Fallback Formats
  // --------------------------------------------------------------------------
  await test('Universal Logo Processing (SVG & Vector Ingestion)', async () => {
    const sampleSvg = `<svg width="200" height="60" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="60" fill="#10B981"/><text x="10" y="35" fill="white">TEST LOGO</text></svg>`;
    const svgBlob = new Blob([sampleSvg], { type: 'image/svg+xml' });
    const svgFile = new File([svgBlob], 'company_brand_logo.svg', { type: 'image/svg+xml' });

    const processedDataUrl = await processCompanyLogoFile(svgFile);
    assert(processedDataUrl.startsWith('data:image/svg+xml'), 'Processed SVG must output clean data URL');

    // Test fallback badge generation
    const fallbackBadge = createCompanyFallbackBadge('Apex Logistics Corp');
    assert(fallbackBadge.startsWith('data:image/svg+xml;base64,'), 'Fallback badge must output base64 data URL');
  });

  // --------------------------------------------------------------------------
  // TEST 3: SQLite Persistence of Company Logo & Legal Name
  // --------------------------------------------------------------------------
  await test('SQLite system_settings Company Name & Logo Invariants', async () => {
    const db = new DatabaseService();
    await db.initialize();

    const testCompanyName = 'Apex World Logistics Ltd.';
    const testLogoDataUrl = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCIvPjwvc3ZnPg==';

    // 1. Store company_name and company_logo in system_settings
    await db.execute(
      `INSERT INTO system_settings (key, value, category, description, updated_at)
       VALUES ('company_name', ?, 'company', 'Registered enterprise company name', datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
      [testCompanyName]
    );

    await db.execute(
      `INSERT INTO system_settings (key, value, category, description, updated_at)
       VALUES ('company_logo', ?, 'company', 'Uploaded company brand logo', datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
      [testLogoDataUrl]
    );

    // 2. Query back and verify fidelity
    const rows = await db.query<{ key: string; value: string }>(
      "SELECT key, value FROM system_settings WHERE key IN ('company_name', 'company_logo');"
    );

    const map = new Map<string, string>();
    rows.forEach(r => map.set(r.key, r.value));

    assert(map.get('company_name') === testCompanyName, 'company_name must persist with exact fidelity');
    assert(map.get('company_logo') === testLogoDataUrl, 'company_logo data URL must persist with exact fidelity');
  });

  // --------------------------------------------------------------------------
  // TEST 4: Hierarchy Invariants — TitleBar vs Sidebar
  // --------------------------------------------------------------------------
  await test('Brand Hierarchy Invariants (TitleBar vs Sidebar Independence)', async () => {
    const titleBarPath = path.resolve(process.cwd(), 'src/components/TitleBar.tsx');
    const sidebarPath = path.resolve(process.cwd(), 'src/components/Sidebar.tsx');

    const titleBarContent = fs.readFileSync(titleBarPath, 'utf8');
    const sidebarContent = fs.readFileSync(sidebarPath, 'utf8');

    // TitleBar should use native ProbahoLogo
    assert(titleBarContent.includes('<ProbahoLogo'), 'TitleBar must embed official ProbahoLogo at very top left');
    assert(!titleBarContent.includes('src="/favicon.svg"'), 'TitleBar must not use broken /favicon.svg link');

    // Sidebar should support dynamic companyLogoUrl and companyName
    assert(sidebarContent.includes('companyLogoUrl'), 'Sidebar must accept companyLogoUrl prop');
    assert(sidebarContent.includes('companyName'), 'Sidebar must accept companyName prop');
    assert(!sidebarContent.includes('src="/favicon.svg"'), 'Sidebar must not use broken /favicon.svg link');
  });

  console.log('\n========================================================================');
  console.log(`  RESULT: ${passed}/${total} TESTS PASSED (100% BRAND PIPELINE COMPLIANCE)`);
  console.log('========================================================================\n');
}

runTests().catch(err => {
  console.error('\n✖ Suite Failure:', err);
  process.exit(1);
});
