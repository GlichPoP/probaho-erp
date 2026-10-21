// ============================================================================
// PROBAHO ERP: TEST SUITE M9 — GUEST MODE INSTANT PREVIEW VERIFICATION
// File: tests/verify-m9-guest-mode.ts
// Features: Zero-credential bypass, guest profile invariants, session lifecycle
// ============================================================================

import { authService, GUEST_USER, ALL_ERP_MODULE_TABS, type UserAccount } from '../src/services/authService';
import { DatabaseService } from '../src/services/db';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Mock browser localStorage for Node test runner
const mockStore: Record<string, string> = {};
const mockStorageObj = {
  getItem: (k: string) => mockStore[k] || null,
  setItem: (k: string, v: string) => { mockStore[k] = String(v); },
  removeItem: (k: string) => { delete mockStore[k]; },
  clear: () => { Object.keys(mockStore).forEach(k => delete mockStore[k]); }
};
(global as any).window = {
  localStorage: mockStorageObj
};
(global as any).localStorage = mockStorageObj;

async function runTests() {
  console.log('========================================================================');
  console.log('  PROBAHO ERP — GUEST MODE & INSTANT PREVIEW VERIFICATION               ');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void>) {
    total++;
    process.stdout.write(`  ⏳ Running [AC9-${total}] ${name}...`);
    const start = Date.now();
    try {
      await fn();
      const elapsed = Date.now() - start;
      console.log(`  ✔ PASS [AC9-${total}] ${name} (${elapsed}ms)`);
      passed++;
    } catch (err: any) {
      console.log(`  ✖ FAIL [AC9-${total}] ${name}`);
      console.error(`     ↳ Error: ${err.message || String(err)}\n`);
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: Guest User Invariants & Definition
  // --------------------------------------------------------------------------
  await test('Guest Profile Specification & Module Access Invariants', async () => {
    assert(GUEST_USER.id === 'usr-guest-preview', 'Guest ID must be usr-guest-preview');
    assert(GUEST_USER.username === 'guest', 'Guest username must be guest');
    assert(GUEST_USER.role === 'employee', 'Guest role should be non-master employee role');
    assert(GUEST_USER.designation === 'Guest Previewer', 'Guest designation must state Guest Previewer');
    assert(GUEST_USER.is_active === true, 'Guest user must be active');

    // Verify all primary module tabs are accessible in guest mode
    const requiredTabs = ['dashboard', 'showroom', 'suppliers', 'procurement', 'inventory', 'warehouses', 'logistics', 'settings'];
    for (const tab of requiredTabs) {
      assert(GUEST_USER.allowed_tabs.includes(tab), `Guest mode must have access to ${tab} tab`);
    }
  });

  // --------------------------------------------------------------------------
  // TEST 2: authService.getGuestUser() & authService.isGuest() helpers
  // --------------------------------------------------------------------------
  await test('Guest Helper Functions & Type Identification', async () => {
    const guestCopy = authService.getGuestUser();
    assert(guestCopy.id === GUEST_USER.id, 'getGuestUser should return valid guest user');
    assert(authService.isGuest(guestCopy) === true, 'isGuest must identify guestCopy as true');
    assert(authService.isGuest(GUEST_USER) === true, 'isGuest must identify GUEST_USER as true');

    const masterUser: UserAccount = {
      id: 'usr-master-test',
      name: 'Root Admin',
      username: 'admin',
      role: 'master',
      allowed_tabs: ['dashboard', 'settings'],
      is_active: true,
      created_at: new Date().toISOString()
    };
    assert(authService.isGuest(masterUser) === false, 'isGuest must return false for master account');
    assert(authService.isGuest(null) === false, 'isGuest must return false for null');
    assert(authService.isGuest(undefined) === false, 'isGuest must return false for undefined');
  });

  // --------------------------------------------------------------------------
  // TEST 3: Zero-Credential Authentication Bypass
  // --------------------------------------------------------------------------
  await test('Zero-Credential Instant Login via authenticate("guest", "")', async () => {
    // Authenticate with empty password
    const res1 = await authService.authenticate('guest', '');
    assert(res1.success === true, 'authenticate should succeed for guest with empty password');
    assert(res1.user !== undefined, 'User object must be returned');
    assert(res1.user?.username === 'guest', 'Returned user must have username guest');
    assert(authService.isGuest(res1.user) === true, 'Returned user must satisfy isGuest');

    // Case-insensitive test with arbitrary secret
    const res2 = await authService.authenticate('GUEST', 'any_preview_token');
    assert(res2.success === true, 'authenticate should succeed case-insensitively for GUEST');
    assert(res2.user?.id === 'usr-guest-preview', 'Returned user ID must be usr-guest-preview');
  });

  // --------------------------------------------------------------------------
  // TEST 4: Guest Session Persistence & Clean Logout Cycle
  // --------------------------------------------------------------------------
  await test('Guest Session Storage, Restoration & Full Logout Clean-up', async () => {
    // Set guest session with keepLoggedIn = true
    const guest = authService.getGuestUser();
    authService.setCurrentUser(guest, true);

    assert(mockStore['PROBAHO_AUTH_SESSION_USER_ID'] === GUEST_USER.id, 'Session key must store guest user id');
    assert(mockStore['PROBAHO_KEEP_LOGGED_IN'] === 'true', 'Keep logged in must be recorded');

    // Restore session
    const restored = await authService.restoreSession();
    assert(restored !== null, 'Session must restore successfully for guest');
    assert(restored?.id === GUEST_USER.id, 'Restored session user must match guest ID');
    assert(authService.isGuest(restored) === true, 'Restored session must be recognized as guest');

    // Logout
    authService.logout();
    assert(mockStore['PROBAHO_AUTH_SESSION_USER_ID'] === undefined, 'Logout must remove session user ID');
    assert(mockStore['PROBAHO_KEEP_LOGGED_IN'] === undefined, 'Logout must remove keep-logged-in flag');
    assert(authService.getCurrentUser() === null, 'Current user must be null after logout');

    // Attempt restoring after logout
    const afterLogout = await authService.restoreSession();
    assert(afterLogout === null, 'restoreSession must return null after logout');
  });

  // --------------------------------------------------------------------------
  // TEST 5: Complete Verification Summary
  // --------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`  RESULT: ${passed}/${total} TESTS PASSED (100% GUEST MODE COMPLIANCE)   `);
  console.log('========================================================================\n');
}

runTests().catch(err => {
  console.error('\n✖ Suite Failure:', err);
  process.exit(1);
});
