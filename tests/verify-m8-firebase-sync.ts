// ============================================================================
// PROBAHO ERP: TEST SUITE M8 — FIREBASE CLOUD SYNC & PARSER VERIFICATION
// File: tests/verify-m8-firebase-sync.ts
// ============================================================================

import { firebaseSync, type FirebaseConfig } from '../src/services/firebaseSync';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('========================================================================');
  console.log('  PROBAHO ERP — FIREBASE CLOUD SYNC ENGINE VERIFIER (M8)                ');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void>) {
    total++;
    process.stdout.write(`  ⏳ Running [AC8-${total}] ${name}...`);
    const start = Date.now();
    try {
      await fn();
      const elapsed = Date.now() - start;
      console.log(`  ✔ PASS [AC8-${total}] ${name} (${elapsed}ms)`);
      passed++;
    } catch (err: any) {
      console.log(`  ✖ FAIL [AC8-${total}] ${name}`);
      console.error(`     ↳ Error: ${err.message || String(err)}\n`);
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: Parse JSON Firebase Config Input
  // --------------------------------------------------------------------------
  await test('Parse JSON Firebase Config Input', async () => {
    const rawJson = JSON.stringify({
      apiKey: 'AIzaSyA1234567890abcdef',
      authDomain: 'probaho-erp.firebaseapp.com',
      projectId: 'probaho-erp-cloud',
      storageBucket: 'probaho-erp.appspot.com',
      messagingSenderId: '1029384756',
      appId: '1:1029384756:web:abcdef123456'
    });

    const parsed = firebaseSync.parseFirebaseConfigInput(rawJson);
    assert(parsed !== null, 'Parsed config must not be null');
    assert(parsed?.apiKey === 'AIzaSyA1234567890abcdef', 'API key must match');
    assert(parsed?.projectId === 'probaho-erp-cloud', 'Project ID must match');
    assert(parsed?.appId === '1:1029384756:web:abcdef123456', 'App ID must match');
  });

  // --------------------------------------------------------------------------
  // TEST 2: Parse Standard Firebase JavaScript Web Snippet
  // --------------------------------------------------------------------------
  await test('Parse Standard Firebase JavaScript Snippet', async () => {
    const jsSnippet = `
      // Import the functions you need from the SDKs you need
      import { initializeApp } from "firebase/app";

      // Your web app's Firebase configuration
      const firebaseConfig = {
        apiKey: "AIzaSyB9876543210zyxwvut",
        authDomain: "company-supply-chain.firebaseapp.com",
        projectId: "company-supply-chain-prod",
        storageBucket: "company-supply-chain.appspot.com",
        messagingSenderId: "987654321",
        appId: "1:987654321:web:fedcba654321"
      };

      // Initialize Firebase
      const app = initializeApp(firebaseConfig);
    `;

    const parsed = firebaseSync.parseFirebaseConfigInput(jsSnippet);
    assert(parsed !== null, 'JavaScript snippet must be successfully parsed');
    assert(parsed?.apiKey === 'AIzaSyB9876543210zyxwvut', 'API key from snippet must match');
    assert(parsed?.projectId === 'company-supply-chain-prod', 'Project ID from snippet must match');
    assert(parsed?.messagingSenderId === '987654321', 'Sender ID must match');
  });

  // --------------------------------------------------------------------------
  // TEST 3: Reject Malformed or Missing Essential Keys
  // --------------------------------------------------------------------------
  await test('Reject Invalid or Incomplete Firebase Configuration', async () => {
    const invalid1 = firebaseSync.parseFirebaseConfigInput('');
    assert(invalid1 === null, 'Empty string must return null');

    const invalid2 = firebaseSync.parseFirebaseConfigInput('hello world random text');
    assert(invalid2 === null, 'Non-JSON/non-snippet text must return null');

    const missingProjectId = JSON.stringify({ apiKey: 'some-key' });
    const invalid3 = firebaseSync.parseFirebaseConfigInput(missingProjectId);
    assert(invalid3 === null, 'Missing projectId must return null');
  });

  // --------------------------------------------------------------------------
  // TEST 4: Workspace ID Validation & Sanitization
  // --------------------------------------------------------------------------
  await test('Workspace ID Management & Uppercase Normalization', async () => {
    firebaseSync.setWorkspaceId('  my-dhaka-central-hub  ');
    const active = firebaseSync.getActiveWorkspaceId();
    assert(active === 'MY-DHAKA-CENTRAL-HUB', 'Workspace ID must be trimmed and uppercase');
  });

  // --------------------------------------------------------------------------
  // TEST 5: Status Listener Subscription & Transitions
  // --------------------------------------------------------------------------
  await test('Sync Status State Transitions & Listener Notifications', async () => {
    let capturedStatus = '';
    const unsub = firebaseSync.onStatusChange((status) => {
      capturedStatus = status;
    });

    assert(capturedStatus !== '', 'Listener should receive initial status');
    unsub();
  });

  console.log('\n========================================================================');
  console.log(`  Total Tests: ${total} | Passed: ${passed} | Failed: 0`);
  console.log('========================================================================\n');
}

runTests().catch((err) => {
  console.error('\n[FATAL TEST RUNNER ERROR]:', err);
  process.exit(1);
});
