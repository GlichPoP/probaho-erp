/**
 * Zero-dependency, lightweight, ANSI-colored Test Runner for Probaho ERP E2E Test Suite.
 */

interface TestCase {
  title: string;
  fn: () => void | Promise<void>;
}

interface TestSuite {
  name: string;
  beforeEachHooks: Array<() => void | Promise<void>>;
  tests: TestCase[];
}

let currentSuite: TestSuite | null = null;
const allSuites: TestSuite[] = [];

export function describe(name: string, fn: () => void): void {
  const suite: TestSuite = {
    name,
    beforeEachHooks: [],
    tests: []
  };
  currentSuite = suite;
  allSuites.push(suite);
  fn();
  currentSuite = null;
}

export function beforeEach(fn: () => void | Promise<void>): void {
  if (currentSuite) {
    currentSuite.beforeEachHooks.push(fn);
  }
}

export function it(title: string, fn: () => void | Promise<void>): void {
  if (currentSuite) {
    currentSuite.tests.push({ title, fn });
  } else {
    // Top level test
    const defaultSuite: TestSuite = {
      name: 'Default Suite',
      beforeEachHooks: [],
      tests: [{ title, fn }]
    };
    allSuites.push(defaultSuite);
  }
}

export function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} (type: ${typeof expected}) but got ${JSON.stringify(actual)} (type: ${typeof actual})`);
      }
    },
    toEqual(expected: any) {
      const a = JSON.stringify(actual);
      const e = JSON.stringify(expected);
      if (a !== e) {
        throw new Error(`Expected deep equal:\nExpected: ${e}\nReceived: ${a}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected truthy value but got: ${JSON.stringify(actual)}`);
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected falsy value but got: ${JSON.stringify(actual)}`);
      }
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null but got: ${JSON.stringify(actual)}`);
      }
    },
    toBeDefined() {
      if (actual === undefined) {
        throw new Error('Expected value to be defined, but got undefined');
      }
    },
    toBeGreaterThan(expected: number) {
      if (!(actual > expected)) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toBeGreaterThanOrEqual(expected: number) {
      if (!(actual >= expected)) {
        throw new Error(`Expected ${actual} to be >= ${expected}`);
      }
    },
    toBeLessThan(expected: number) {
      if (!(actual < expected)) {
        throw new Error(`Expected ${actual} to be less than ${expected}`);
      }
    },
    toBeLessThanOrEqual(expected: number) {
      if (!(actual <= expected)) {
        throw new Error(`Expected ${actual} to be <= ${expected}`);
      }
    },
    toContain(item: any) {
      if (Array.isArray(actual)) {
        if (!actual.includes(item)) {
          throw new Error(`Expected array to contain ${JSON.stringify(item)}`);
        }
      } else if (typeof actual === 'string') {
        if (!actual.includes(item)) {
          throw new Error(`Expected string "${actual}" to contain "${item}"`);
        }
      } else {
        throw new Error(`toContain not supported on type ${typeof actual}`);
      }
    },
    toHaveLength(len: number) {
      const length = actual?.length;
      if (length !== len) {
        throw new Error(`Expected length ${len} but got ${length}`);
      }
    },
    async toReject(messageSnippet?: string) {
      let threw = false;
      let caughtError: any = null;
      try {
        if (typeof actual === 'function') {
          await actual();
        } else {
          await actual;
        }
      } catch (err: any) {
        threw = true;
        caughtError = err;
      }
      if (!threw) {
        throw new Error('Expected asynchronous operation to reject, but it resolved successfully');
      }
      if (messageSnippet && !String(caughtError?.message || caughtError).includes(messageSnippet)) {
        throw new Error(`Expected error message to include "${messageSnippet}", got: "${caughtError?.message}"`);
      }
    },
    toThrow(messageSnippet?: string) {
      let threw = false;
      let caughtError: any = null;
      try {
        actual();
      } catch (err: any) {
        threw = true;
        caughtError = err;
      }
      if (!threw) {
        throw new Error('Expected function to throw, but it executed without error');
      }
      if (messageSnippet && !String(caughtError?.message || caughtError).includes(messageSnippet)) {
        throw new Error(`Expected thrown error message to include "${messageSnippet}", got: "${caughtError?.message}"`);
      }
    }
  };
}

export async function runSuites(): Promise<{ passed: number; failed: number; total: number; durationMs: number }> {
  const startTime = Date.now();
  let passed = 0;
  let failed = 0;
  const failures: Array<{ suite: string; test: string; error: any }> = [];

  for (const suite of allSuites) {
    console.log(`\n\x1b[1m\x1b[36m▶ Suite: ${suite.name}\x1b[0m`);
    for (const test of suite.tests) {
      try {
        for (const hook of suite.beforeEachHooks) {
          await hook();
        }
        const t0 = Date.now();
        await test.fn();
        const tDiff = Date.now() - t0;
        console.log(`  \x1b[32m✔\x1b[0m ${test.title} \x1b[90m(${tDiff}ms)\x1b[0m`);
        passed++;
      } catch (err: any) {
        console.log(`  \x1b[31m✘ ${test.title}\x1b[0m`);
        console.log(`    \x1b[31m${err.message || err}\x1b[0m`);
        failed++;
        failures.push({ suite: suite.name, test: test.title, error: err });
      }
    }
  }

  const durationMs = Date.now() - startTime;
  const total = passed + failed;

  console.log('\n============================================================');
  console.log(`\x1b[1mTest Results Summary:\x1b[0m`);
  console.log(`  Total Tests: ${total}`);
  console.log(`  Passed:      \x1b[32m${passed}\x1b[0m`);
  console.log(`  Failed:      ${failed > 0 ? `\x1b[31m${failed}\x1b[0m` : `\x1b[32m0\x1b[0m`}`);
  console.log(`  Duration:    ${durationMs}ms`);
  console.log('============================================================\n');

  if (failed > 0) {
    console.log('\x1b[31mFailures detail:\x1b[0m');
    failures.forEach((f, idx) => {
      console.log(`  ${idx + 1}) [${f.suite}] ${f.test}`);
      console.log(`     ${f.error.stack || f.error.message || f.error}`);
    });
  }

  return { passed, failed, total, durationMs };
}
