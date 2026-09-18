/**
 * Rules smoke test: connects to the local Firestore emulator and checks a few
 * core permission invariants with unauthenticated client access.
 * Prereqs: pnpm emulators (running in another terminal), then pnpm rules:test
 */
import 'dotenv/config'

async function main() {
  const { initializeApp } = await import('firebase/app')
  const { getFirestore, connectFirestoreEmulator, collection, getDocs } = await import('firebase/firestore')

  const projectId = process.env.FIREBASE_PROJECT_ID ?? 'bmrc-demo'
  const app = initializeApp({ projectId, apiKey: 'demo-key' })
  const db = getFirestore(app)
  connectFirestoreEmulator(db, '127.0.0.1', 8080)

  console.log(`Running rules smoke test against emulator project "${projectId}"...\n`)

  const checks: { name: string; run: () => Promise<void>; expect: 'deny' | 'allow' }[] = [
    {
      name: 'anonymous read on users is denied',
      expect: 'deny',
      run: async () => {
        await getDocs(collection(db, 'users'))
      },
    },
    {
      name: 'anonymous read on students is denied',
      expect: 'deny',
      run: async () => {
        await getDocs(collection(db, 'students'))
      },
    },
    {
      name: 'anonymous read on invoices is denied',
      expect: 'deny',
      run: async () => {
        await getDocs(collection(db, 'invoices'))
      },
    },
  ]

  let failures = 0
  for (const c of checks) {
    try {
      await c.run()
      const ok = c.expect === 'allow'
      console.log(`${ok ? '✓' : '✗'} ${c.name} (got: allow)`)
      if (!ok) failures++
    } catch {
      const ok = c.expect === 'deny'
      console.log(`${ok ? '✓' : '✗'} ${c.name} (got: deny)`)
      if (!ok) failures++
    }
  }

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`)
  console.log('Note: this is a lightweight smoke test. For deep coverage add @firebase/rules-unit-tests.')
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('Smoke test could not run (is the emulator running?):', e.message)
  process.exit(1)
})
