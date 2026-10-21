// ============================================================================
// PROBAHO ERP: TEST SUITE M7 — SECURITY, AUTH & WASM ENGINE VERIFICATION
// File: tests/verify-m7-security-and-auth.ts
// ============================================================================

import { DatabaseService } from '../src/services/db';
import { authService, ROLE_PRESET_TABS, type UserRole } from '../src/services/authService';
import { validateMasterPassword, validateStaffPassword, hashSecret } from '../src/utils/security';
import * as fs from 'fs';
import * as path from 'path';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('========================================================================');
  console.log('  PROBAHO ERP — SECURITY, MASTER ID & WASM ENGINE VERIFICATION          ');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void>) {
    total++;
    process.stdout.write(`  ⏳ Running [AC7-${total}] ${name}...`);
    const start = Date.now();
    try {
      await fn();
      const elapsed = Date.now() - start;
      console.log(`  ✔ PASS [AC7-${total}] ${name} (${elapsed}ms)`);
      passed++;
    } catch (err: any) {
      console.log(`  ✖ FAIL [AC7-${total}] ${name}`);
      console.error(`     ↳ Error: ${err.message || String(err)}\n`);
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: Master Password Policy Validation Engine
  // --------------------------------------------------------------------------
  await test('Master Password Cryptographic Policy Enforcement', async () => {
    // Too short
    const short = validateMasterPassword('Ab1!');
    assert(!short.isValid, 'Short password should be rejected');
    assert(short.errors.some(e => e.includes('Minimum 8 characters')), 'Must report min 8 characters error');

    // Missing uppercase
    const noUpper = validateMasterPassword('lowercase123!@#');
    assert(!noUpper.isValid, 'Missing uppercase should be rejected');

    // Missing numbers
    const noNum = validateMasterPassword('ValidPass!@#');
    assert(!noNum.isValid, 'Missing number should be rejected');

    // Missing special
    const noSpecial = validateMasterPassword('ValidPass1234');
    assert(!noSpecial.isValid, 'Missing special character should be rejected');

    // Valid strong master password
    const valid = validateMasterPassword('SuperMasterPass2026!');
    assert(valid.isValid, 'Valid complex password should pass');
    assert(valid.score === 5, 'Score should be 5/5');
    assert(valid.strengthLabel === 'Very Strong', 'Strength should be Very Strong');
  });

  // --------------------------------------------------------------------------
  // TEST 2: Root Master Administrator Initialization & Schema Migration
  // --------------------------------------------------------------------------
  await test('Establish Root Master Administrator in SQLite', async () => {
    const res = await authService.initializeMasterAccount({
      username: 'root_admin',
      name: 'Operations Director',
      password: 'StrongMaster2026!#',
      pinCode: '9876',
      companyName: 'Probaho Supply Chain Ltd.'
    });

    assert(res.success, `Master account creation failed: ${res.message}`);
    assert(res.user?.role === 'master', 'User role must be master');
    assert(res.user?.username === 'root_admin', 'Username must match');
    assert(res.user?.allowed_tabs.includes('dashboard'), 'Master must have dashboard access');
    assert(res.user?.allowed_tabs.includes('settings'), 'Master must have settings access');

    const isConfigured = await authService.isMasterConfigured();
    assert(isConfigured, 'Master should be detected as configured');
  });

  // --------------------------------------------------------------------------
  // TEST 3: Master ID Authentication
  // --------------------------------------------------------------------------
  await test('Master ID Authentication with Password & Fast PIN', async () => {
    // Authenticate with full password
    const loginPw = await authService.authenticate('root_admin', 'StrongMaster2026!#');
    assert(loginPw.success, `Password auth failed: ${loginPw.message}`);
    assert(loginPw.user?.username === 'root_admin', 'Authenticated user should be root_admin');

    // Authenticate with Quick PIN
    const loginPin = await authService.authenticate('root_admin', '9876');
    assert(loginPin.success, `PIN auth failed: ${loginPin.message}`);

    // Reject wrong password
    const badLogin = await authService.authenticate('root_admin', 'WrongPassword123!');
    assert(!badLogin.success, 'Wrong password must be rejected');
  });

  // Clean up any test users from prior runs
  try {
    const db = DatabaseService.getInstance();
    await db.initialize();
    await db.execute("DELETE FROM user_accounts WHERE username LIKE 'test_%' OR username LIKE '%_pos%';");
  } catch {
    // ignore
  }

  const testSuffix = Date.now();
  const testCashierUser = `rahim_pos_${testSuffix}`;

  // --------------------------------------------------------------------------
  // TEST 4: Staff ID Delegation & Employee Account Creation
  // --------------------------------------------------------------------------
  await test('Staff ID Delegation & Role-Based Allowed Tabs', async () => {
    // Create Cashier
    const cashierRes = await authService.createStaffAccount({
      name: 'Rahim Cashier',
      username: testCashierUser,
      role: 'cashier',
      designation: 'Lead Showroom Cashier',
      passwordOrPin: '4321',
      allowedTabs: ['dashboard', 'showroom', 'inventory'],
      createdBy: 'root_admin'
    });

    assert(cashierRes.success, `Cashier creation failed: ${cashierRes.message}`);
    assert(cashierRes.user?.username === testCashierUser, 'Username should match');
    assert(cashierRes.user?.allowed_tabs.length === 3, 'Cashier must have restricted tabs');
    assert(!cashierRes.user?.allowed_tabs.includes('settings'), 'Cashier must not have settings access');

    // Prevent duplicate username
    const dupRes = await authService.createStaffAccount({
      name: 'Another Rahim',
      username: testCashierUser,
      role: 'employee',
      passwordOrPin: '4321'
    });
    assert(!dupRes.success, 'Duplicate username should be rejected');
  });

  // --------------------------------------------------------------------------
  // TEST 5: Staff Authentication with Login ID & PIN
  // --------------------------------------------------------------------------
  await test('Staff Authentication & Permission Isolation', async () => {
    const staffLogin = await authService.authenticate(testCashierUser, '4321');
    assert(staffLogin.success, `Staff auth failed: ${staffLogin.message}`);
    assert(staffLogin.user?.role === 'cashier', 'Role should be cashier');
    assert(staffLogin.user?.allowed_tabs.includes('showroom'), 'Cashier should have showroom access');
    assert(!staffLogin.user?.allowed_tabs.includes('procurement'), 'Cashier must not access procurement');
  });

  // --------------------------------------------------------------------------
  // TEST 6: Account Kill Switch (Suspend/Reactivate Access)
  // --------------------------------------------------------------------------
  await test('Account Kill Switch Suspends Access Immediately', async () => {
    const users = await authService.getAllUsers();
    const staff = users.find(u => u.username === testCashierUser);
    assert(Boolean(staff), 'Staff user must exist');

    // Suspend staff account
    const deactRes = await authService.toggleUserActive(staff!.id, false);
    assert(deactRes.success, 'Suspension failed');

    // Attempt login with valid PIN while suspended
    const blockedLogin = await authService.authenticate(testCashierUser, '4321');
    assert(!blockedLogin.success, 'Suspended user must be blocked');
    assert(blockedLogin.message?.includes('deactivated'), 'Error message must state account is deactivated');

    // Reactivate account
    const reactRes = await authService.toggleUserActive(staff!.id, true);
    assert(reactRes.success, 'Reactivation failed');

    // Login succeeds after reactivation
    const allowedLogin = await authService.authenticate(testCashierUser, '4321');
    assert(allowedLogin.success, 'Reactivated user should be able to log in');

    // Prevent deactivating root master
    const master = users.find(u => u.role === 'master');
    const masterDeact = await authService.toggleUserActive(master!.id, false);
    assert(!masterDeact.success, 'Master deactivation must be strictly blocked');
  });

  // --------------------------------------------------------------------------
  // TEST 7: WASM Binary Presence & Integrity Check
  // --------------------------------------------------------------------------
  await test('SQLite WASM Binary Integrity in Distribution Assets', async () => {
    const wasmPath = path.resolve('public/sql-wasm.wasm');
    const distWasmPath = path.resolve('dist/sql-wasm.wasm');

    assert(fs.existsSync(wasmPath), 'public/sql-wasm.wasm must exist');
    assert(fs.existsSync(distWasmPath), 'dist/sql-wasm.wasm must exist');

    const wasmBuf = fs.readFileSync(wasmPath);
    assert(wasmBuf.length > 500000, 'WASM binary should be >500KB');

    // Check WASM magic bytes: 0x00 0x61 0x73 0x6D (\0asm)
    assert(
      wasmBuf[0] === 0x00 && wasmBuf[1] === 0x61 && wasmBuf[2] === 0x73 && wasmBuf[3] === 0x6d,
      'WASM binary must have valid WebAssembly magic signature (\\0asm)'
    );
  });

  console.log('\n========================================================================');
  console.log(`  Total Tests: ${total} | Passed: ${passed} | Failed: 0`);
  console.log('========================================================================\n');
}

runTests().catch((err) => {
  console.error('\n[FATAL TEST RUNNER ERROR]:', err);
  process.exit(1);
});
