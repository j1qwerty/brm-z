/**
 * Wipe ALL collections in the project (dangerous, confirms first).
 * Usage: pnpm db:reset
 */
import 'dotenv/config'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import admin from 'firebase-admin'

const serviceAccountPath = resolve(process.env.SERVICE_ACCOUNT_PATH ?? './scripts/service-account.json')
if (!existsSync(serviceAccountPath)) {
  console.error('Service account key missing. See README "Firebase setup".')
  process.exit(1)
}
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: process.env.FIREBASE_PROJECT_ID ?? serviceAccount.project_id })
const db = admin.firestore()

const COLLECTIONS = ['users', 'sessions', 'classes', 'assignments', 'students', 'staff', 'attendance', 'feeTypes', 'feeAssignments', 'invoices', 'payments', 'exams', 'marks', 'gradingScales', 'reportCards', 'templates', 'certificates', 'notices', 'notifications', 'timetable', 'leaves', 'documents', 'ptms', 'messages', 'calendarEvents', 'runHistory', 'settings']

async function deleteCollection(colPath: string) {
  const snap = await db.collection(colPath).get()
  const batch = db.batch()
  snap.docs.forEach((d) => batch.delete(d.ref))
  await batch.commit()
  return snap.size
}

const rl = createInterface({ input: process.stdin, output: process.stdout })
rl.question(`\n⚠  This deletes EVERY document in ${COLLECTIONS.length} collections. Type "DELETE" to confirm: `, async (answer) => {
  if (answer.trim() !== 'DELETE') {
    console.log('Aborted.')
    rl.close()
    process.exit(0)
  }
  try {
    for (const col of COLLECTIONS) {
      const n = await deleteCollection(col)
      if (n > 0) console.log(`  ${col}: ${n} deleted`)
    }
    // class subjects subcollections
    const classes = await db.collection('classes').listDocuments()
    for (const cd of classes) {
      const n = await deleteCollection(`${cd.path}/subjects`)
      if (n > 0) console.log(`  ${cd.path}/subjects: ${n} deleted`)
    }
    console.log('Reset complete.')
  } finally {
    rl.close()
    process.exit(0)
  }
})
