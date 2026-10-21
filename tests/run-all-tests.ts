/**
 * Master Test Runner for Probaho ERP E2E Test Suite (Tiers 1 - 4)
 * Runs all suites across all tiers and exits with code 0 on 100% pass, or code 1 on failure.
 */

import { runSuites } from './harness/test-runner.ts';

// Dynamically import all test suites so they register their describe() blocks
import './tier1-feature-coverage/suppliers.test.ts';
import './tier1-feature-coverage/purchase-orders.test.ts';
import './tier1-feature-coverage/inventory.test.ts';
import './tier1-feature-coverage/transfers.test.ts';
import './tier1-feature-coverage/shipments.test.ts';
import './tier1-feature-coverage/backup-restore.test.ts';
import './tier2-boundary-corner/boundary-cases.test.ts';
import './tier3-cross-feature/cross-lifecycle.test.ts';
import './tier4-enterprise-workloads/enterprise-scenarios.test.ts';

console.log('\x1b[1m\x1b[35m============================================================\x1b[0m');
console.log('\x1b[1m\x1b[35m       PROBAHO ERP — E2E TEST SUITE RUNNER (TIERS 1 - 4)    \x1b[0m');
console.log('\x1b[1m\x1b[35m============================================================\x1b[0m');

runSuites().then(res => {
  if (res.failed > 0) {
    console.error(`\x1b[31m[FAILED] Test run completed with ${res.failed} failure(s).\x1b[0m`);
    process.exit(1);
  } else {
    console.log(`\x1b[32m[PASSED] All ${res.passed} test cases passed successfully in ${res.durationMs}ms.\x1b[0m`);
    process.exit(0);
  }
}).catch(err => {
  console.error('\x1b[31m[FATAL] Test runner crashed:\x1b[0m', err);
  process.exit(1);
});
