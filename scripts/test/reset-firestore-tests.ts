/**
 * Reset LIVE test data — deletes ONLY docs whose id starts with "tst-".
 *
 *   pnpm test-reset        # asks for confirmation
 *   pnpm test-reset -- --yes   # skip confirmation (CI)
 *
 * Safe by construction: real school data never uses the "tst-" prefix, and
 * this script filters on document ID prefix before deleting anything.
 * Covers all top-level collections plus `classes/{id}/subjects` subcollections.
 */
import 'dotenv/config'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import admin from 'firebase-admin'

const P = 'tst-'
const YES = process.argv.includes('--yes') || process.argv.includes('-y')

const serviceAccountPath = resolve(process.env.SERVICE_ACCOUNT_PATH ?? './scripts/service-account.json')
if (!existsSync(serviceAccountPath)) {
  console.error(`\n✗ Service account key not found at ${serviceAccountPath}`)
  console.error('  See README "Firebase setup" step 5.\n')
  process.exit(1)
}
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'))
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID ?? serviceAccount.project_id,
})
const db = admin.firestore()

const COLLECTIONS = [
  'users', 'sessions', 'classes', 'assignments', 'students', 'staff', 'attendance',
  'feeTypes', 'feeAssignments', 'invoices', 'payments', 'exams', 'marks',
  'gradingScales', 'reportCards', 'templates', 'certificates', 'notices',
  'notifications', 'timetable', 'leaves', 'documents', 'ptms', 'messages',
  'calendarEvents', 'runHistory',
]

async function deletePrefixed(colPath: string, onlyPrefix = true): Promise<number> {
  const refs = await db.collection(colPath).listDocuments()
  const targets = onlyPrefix ? refs.filter((r) => r.id.startsWith(P)) : refs
  for (let i = 0; i < targets.length; i += 450) {
    const batch = db.batch()
    for (const ref of targets.slice(i, i + 450)) batch.delete(ref)
    await batch.commit()
  }
  return targets.length
}

async function sweepOnce(): Promise<number> {
  let total = 0
  // Subcollections FIRST: deleting a class doc leaves its subjects behind,
  // and Firestore keeps listing the now-empty parent as a phantom, so a
  // classes-first order can never converge.
  const classRefs = await db.collection('classes').listDocuments()
  for (const cref of classRefs.filter((r) => r.id.startsWith(P))) {
    // Whole subcollection: the parent class is test data, so EVERYTHING under
    // it is test data — including random-id docs the app itself created while
    // the test class was visible in the UI (subjects use auto ids).
    const n = await deletePrefixed(`${cref.path}/subjects`, false)
    if (n > 0) {
      console.log(`  ${cref.path}/subjects: ${n} test doc(s) deleted`)
      total += n
    }
  }
  for (const col of COLLECTIONS) {
    const n = await deletePrefixed(col)
    if (n > 0) {
      console.log(`  ${col}: ${n} test doc(s) deleted`)
      total += n
    }
  }
  return total
}

async function run() {
  // Repeat until a sweep finds nothing (covers phantom parents and
  // listDocuments eventual consistency). Bounded so it always terminates.
  let total = 0
  for (let pass = 1; pass <= 3; pass++) {
    const n = await sweepOnce()
    total += n
    if (n === 0) break
    if (pass === 3) console.log('  (stopped after 3 passes — re-run if anything remains)')
  }
  console.log(total === 0 ? '\nNo test data found (nothing with the "tst-" prefix).' : `\nTest reset complete: ${total} doc(s) removed. Real data untouched.`)
}

function confirmAndRun() {
  if (YES) {
    run().then(() => process.exit(0)).catch((e) => { console.error('Reset failed:', e); process.exit(1) })
    return
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  rl.question(`\nDelete ALL docs with ids starting with "${P}" in ${COLLECTIONS.length} collections? Type "DELETE-TESTS" to confirm: `, (answer) => {
    if (answer.trim() !== 'DELETE-TESTS') {
      console.log('Aborted — nothing deleted.')
      rl.close()
      process.exit(0)
      return
    }
    rl.close()
    run().then(() => process.exit(0)).catch((e) => { console.error('Reset failed:', e); process.exit(1) })
  })
}

confirmAndRun()
