/**
 * brm-z main test runner.
 *
 *   pnpm test     # runs all suites, prints pass/fail summary, exits 1 on failure
 *
 * Strategy:
 *   - Build an in-memory DataProvider (no DOM, no Firebase, no env vars)
 *   - Run each suite sequentially, reset the DB between suites for isolation
 *   - Print a per-test PASS/FAIL line, then a final summary with all failures
 */
// NOTE on ordering (see main()): sql.js is initialised BEFORE
// `setup.polyfills` patches `import.meta`. Patching import.meta makes tsx load
// the CJS emscripten glue as ESM, which then tries to `import()` the .wasm and
// fails with a confusing "Cannot find package 'a'" error. Suites themselves
// only touch import.meta.env lazily, so hoisted imports are safe here.
import { openDb } from '../../src/lib/sync/sqlite'
import { createInMemoryProvider, type Db } from './inMemoryProvider'
import { printSummary, type TestResult, type SuiteContext } from './harness'
import { sessionsSuite } from './sessions.test'
import { classesSuite } from './classes.test'
import { studentsSuite } from './students.test'
import { staffSuite } from './staff.test'
import { usersSuite } from './users.test'
import { generationSuite } from './generation.test'
import { templatesSuite } from './templates.test'
import { integrationSuite } from './integration.test'
import { syncSuite } from './sync.test'

async function main() {
  const isSyncSuite = process.argv.includes('--sync') || process.argv.includes('--all')

  // 1) real SQLite first (must precede the import.meta polyfill — see note above)
  if (isSyncSuite) await openDb({ fresh: true })

  // 2) then the polyfills, so `src/lib/firebase.ts` never sees an undefined env
  await import('./setup.polyfills')

  const provider = createInMemoryProvider()
  const ctx: SuiteContext = {
    provider: provider as SuiteContext['provider'],
    resetDb: () => provider.__reset(),
  }

  const results: TestResult[] = []

  const suites = [
    sessionsSuite(),
    classesSuite(),
    studentsSuite(),
    staffSuite(),
    usersSuite(),
    generationSuite(),
    templatesSuite(),
    integrationSuite(),
  ]

  if (isSyncSuite) {
    suites.push(syncSuite())
  }

  console.log(`\n${'='.repeat(72)}`)
  console.log(`Running ${suites.length} test suites`)
  console.log(`${'='.repeat(72)}\n`)

  for (const suite of suites) {
    await suite.run(ctx, results)
  }

  printSummary(results)

  const failed = results.filter((r) => r.status === 'fail').length
  if (failed > 0) {
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('Test runner crashed:', e)
  process.exit(2)
})

export type { TestResult, SuiteContext }
export type { Db }
