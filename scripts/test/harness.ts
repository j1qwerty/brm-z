/**
 * Tiny test harness for the brm-z project.
 *
 * Goals:
 *   - Run end-to-end CRUD tests against the in-memory data provider
 *     (mirrors the localStorage provider 1:1, no DOM/Firebase needed)
 *   - Group tests into named suites (Sessions, Classes, Subjects, ...)
 *   - Print a clean PASS/FAIL line per assertion
 *   - On failure, print the test name, the failing assertion message,
 *     the actual vs expected, and the relevant error stack
 *   - At the end, print a summary with totals and a list of every failed
 *     test, then exit with code 1 if any failed (so `pnpm test` fails in CI)
 */

export interface AssertOpts {
  /** Pretty label shown in the line, e.g. "session create returns an id" */
  name: string
  /** Optional assertion detail shown on failure */
  expected?: string
  actual?: string
}

export type AssertFn = (t: AssertAPI) => Promise<void> | void

export interface AssertAPI {
  /** Assert `cond` is truthy. The most common primitive. */
  truthy(cond: unknown, message: string, opts?: Partial<AssertOpts>): void
  /** Assert `cond` is falsy. */
  falsy(cond: unknown, message: string, opts?: Partial<AssertOpts>): void
  /** Strict equality (uses ===). */
  equals<T>(actual: T, expected: T, message: string, opts?: Partial<AssertOpts>): void
  /** Loose deep-equality for objects/arrays (JSON stringify round-trip). */
  deepEquals<T>(actual: T, expected: T, message: string, opts?: Partial<AssertOpts>): void
  /** Assert `actual` is one of the listed values. */
  in<T>(actual: T, allowed: T[], message: string, opts?: Partial<AssertOpts>): void
  /** Assert a value is `null` or `undefined`. */
  isNil(value: unknown, message: string, opts?: Partial<AssertOpts>): void
  /** Assert a value is NOT `null` or `undefined`. */
  notNil(value: unknown, message: string, opts?: Partial<AssertOpts>): void
  /** Assert a thrown error matches (regex test on message). */
  throws(fn: () => Promise<void> | void, messagePattern: string | RegExp, message: string, opts?: Partial<AssertOpts>): Promise<void>
  /** Manually fail. */
  fail(message: string, opts?: Partial<AssertOpts>): never
}

export interface TestResult {
  suite: string
  name: string
  status: 'pass' | 'fail'
  error?: {
    message: string
    expected?: string
    actual?: string
    stack?: string
  }
  durationMs: number
}

export interface SuiteContext {
  /** The shared in-memory provider. Tests mutate this; reset between suites with `resetDb()`. */
  provider: import('../../src/lib/data/provider').DataProvider & {
    __db: import('./inMemoryProvider').Db
    __reset(): void
  }
  resetDb(): void
}

class TestFailure extends Error {
  expected?: string
  actual?: string
  constructor(message: string, opts?: { expected?: string; actual?: string; stack?: string }) {
    super(message)
    this.name = 'TestFailure'
    this.expected = opts?.expected
    this.actual = opts?.actual
    if (opts?.stack) this.stack = opts.stack
  }
}

export function makeAssert(suite: string, name: string): AssertAPI {
  const ok = (cond: boolean, message: string, opts?: Partial<AssertOpts>) => {
    if (!cond) throw new TestFailure(message, opts)
  }

  return {
    truthy: (cond, message, opts) => ok(Boolean(cond), message, opts),
    falsy: (cond, message, opts) => ok(!cond, message, opts),
    equals: (actual, expected, message, opts) => {
      ok(actual === expected, message, {
        ...opts,
        expected: opts?.expected ?? JSON.stringify(expected),
        actual: opts?.actual ?? JSON.stringify(actual),
      })
    },
    deepEquals: (actual, expected, message, opts) => {
      const a = JSON.stringify(actual)
      const e = JSON.stringify(expected)
      ok(a === e, message, {
        ...opts,
        expected: opts?.expected ?? e,
        actual: opts?.actual ?? a,
      })
    },
    in: (actual, allowed, message, opts) => {
      ok(allowed.includes(actual), message, {
        ...opts,
        expected: opts?.expected ?? `one of ${JSON.stringify(allowed)}`,
        actual: opts?.actual ?? JSON.stringify(actual),
      })
    },
    isNil: (value, message, opts) => ok(value === null || value === undefined, message, opts),
    notNil: (value, message, opts) => ok(value !== null && value !== undefined, message, opts),
    throws: async (fn, pattern, message, opts) => {
      let threw = false
      let caught: unknown = null
      try {
        await fn()
      } catch (e) {
        threw = true
        caught = e
      }
      if (!threw) {
        throw new TestFailure(message, {
          ...opts,
          expected: opts?.expected ?? `error matching ${pattern.toString()}`,
          actual: 'no error thrown',
        })
      }
      const err = caught instanceof Error ? caught.message : String(caught)
      const re = pattern instanceof RegExp ? pattern : new RegExp(pattern)
      if (!re.test(err)) {
        throw new TestFailure(message, {
          ...opts,
          expected: opts?.expected ?? `error matching ${pattern.toString()}`,
          actual: `error message: ${err}`,
        })
      }
    },
    fail: (message, opts) => {
      throw new TestFailure(message, opts)
    },
  }
}

export async function runSuite(
  suiteName: string,
  ctx: SuiteContext,
  tests: { name: string; run: (t: AssertAPI) => Promise<void> | void }[],
  results: TestResult[],
) {
  for (const tc of tests) {
    const start = Date.now()
    const t = makeAssert(suiteName, tc.name)
    try {
      await tc.run(t)
      results.push({ suite: suiteName, name: tc.name, status: 'pass', durationMs: Date.now() - start })
      console.log(`  ${green('PASS')} ${tc.name} ${dim(`(${Date.now() - start}ms)`)}`)
    } catch (e) {
      const tf = e as TestFailure
      const err = {
        message: tf.message ?? String(e),
        expected: tf.expected,
        actual: tf.actual,
        stack: tf.stack,
      }
      results.push({ suite: suiteName, name: tc.name, status: 'fail', durationMs: Date.now() - start, error: err })
      console.log(`  ${red('FAIL')} ${tc.name}`)
      console.log(`        ${dim('reason:')} ${err.message}`)
      if (err.expected) console.log(`        ${dim('expected:')} ${err.expected}`)
      if (err.actual) console.log(`        ${dim('actual:')}   ${err.actual}`)
    }
  }
}

// --- ANSI colors (kept simple, no dep) ---
function green(s: string) { return `\x1b[32m${s}\x1b[0m` }
function red(s: string) { return `\x1b[31m${s}\x1b[0m` }
function yellow(s: string) { return `\x1b[33m${s}\x1b[0m` }
function dim(s: string) { return `\x1b[2m${s}\x1b[0m` }
function bold(s: string) { return `\x1b[1m${s}\x1b[0m` }
export const colors = { green, red, yellow, dim, bold }

export function printSummary(results: TestResult[]) {
  const passed = results.filter((r) => r.status === 'pass')
  const failed = results.filter((r) => r.status === 'fail')
  const total = results.length
  const durationMs = results.reduce((s, r) => s + r.durationMs, 0)

  console.log('\n' + bold('='.repeat(72)))
  console.log(bold('TEST SUMMARY'))
  console.log('='.repeat(72))
  console.log(`  Total:   ${total}`)
  console.log(`  ${green('Passed')}: ${passed.length}`)
  console.log(`  ${red('Failed')}: ${failed.length}`)
  console.log(`  Duration: ${durationMs}ms`)
  console.log(`  Pass rate: ${total ? ((passed.length / total) * 100).toFixed(1) : '0'}%`)

  if (failed.length === 0) {
    console.log(`\n  ${green('All tests passed.')}`)
  } else {
    console.log(`\n  ${red('Failed tests:')}`)
    failed.forEach((f, i) => {
      console.log(`\n  ${i + 1}. [${f.suite}] ${f.name}`)
      if (f.error) {
        console.log(`     ${dim('message:')}  ${f.error.message}`)
        if (f.error.expected) console.log(`     ${dim('expected:')} ${f.error.expected}`)
        if (f.error.actual) console.log(`     ${dim('actual:')}   ${f.error.actual}`)
        if (f.error.stack) {
          const firstLine = f.error.stack.split('\n').find((l) => l.trim().startsWith('at'))
          if (firstLine) console.log(`     ${dim('at:')}      ${firstLine.trim()}`)
        }
      }
    })
    console.log()
  }
  console.log('='.repeat(72) + '\n')
}
