/**
 * Portal rules check — signs in as the seeded parent/student with the CLIENT
 * SDK, so the real Firestore rules are the ones being tested (unlike
 * `pnpm test:live`, which uses firebase-admin and bypasses rules).
 *
 *   pnpm test:portal
 *
 * It proves the three things the offline pull plan depends on:
 *   1. a parent can `get` each linked child
 *   2. a parent CANNOT `get` an unlinked student (stu-201, other class)
 *   3. neither parent nor student can `list` students  -> which is exactly why
 *      the pull plan uses by-id `get`s instead of a filtered list
 *
 * Requires the demo accounts from `pnpm db:seed` plus the VITE_FIREBASE_* vars.
 */
import { existsSync } from 'node:fs'
import { config as loadEnv } from 'dotenv'

// This repo keeps its vars in .env.local, which plain `dotenv/config` ignores.
if (existsSync('.env.local')) loadEnv({ path: '.env.local' })
loadEnv()

const apiKey = process.env.VITE_FIREBASE_API_KEY
const authDomain = process.env.VITE_FIREBASE_AUTH_DOMAIN
const projectId = process.env.VITE_FIREBASE_PROJECT_ID
if (!apiKey || !projectId || !authDomain) {
  console.error('✗ Set VITE_FIREBASE_API_KEY / VITE_FIREBASE_AUTH_DOMAIN / VITE_FIREBASE_PROJECT_ID in .env.local')
  process.exit(1)
}

const { initializeApp } = await import('firebase/app')
const { getAuth, signInWithEmailAndPassword, signOut } = await import('firebase/auth')
const { getFirestore, doc, getDoc, getDocs, collection } = await import('firebase/firestore')

const PASSWORD = 'Bmrc@2026'
const results: { name: string; ok: boolean; note: string }[] = []
function check(name: string, ok: boolean, note = '') {
  results.push({ name, ok, note })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${note ? ` — ${note}` : ''}`)
}

const app = initializeApp({ apiKey, authDomain, projectId })

async function asUser(email: string) {
  const auth = getAuth(app)
  const cred = await signInWithEmailAndPassword(auth, email, PASSWORD)
  const db = getFirestore(app)
  return {
    uid: cred.user.uid,
    async getStudent(id: string) {
      try {
        return (await getDoc(doc(db, 'students', id))).exists()
      } catch (e) {
        return `denied: ${(e as Error).message.slice(0, 60)}`
      }
    },
    async listStudents() {
      try {
        return (await getDocs(collection(db, 'students'))).size
      } catch (e) {
        return `denied: ${(e as Error).message.slice(0, 60)}`
      }
    },
    async signOut() {
      await signOut(auth)
    },
  }
}

// ---------------------------------------------------------------- parent

const parent = await asUser('parent@bmrc.demo')
console.log(`\nSigned in as parent (uid ${parent.uid})\n`)

check('parent can read linked child stu-101', (await parent.getStudent('stu-101')) === true)
check('parent can read linked child stu-102', (await parent.getStudent('stu-102')) === true)

const leaked = await parent.getStudent('stu-201')
check(
  'parent CANNOT read unlinked student stu-201',
  leaked !== true,
  typeof leaked === 'string' ? leaked : 'READ SUCCEEDED — DATA LEAK',
)

const parentList = await parent.listStudents()
check(
  'parent cannot list students',
  typeof parentList === 'string',
  typeof parentList === 'string' ? parentList : `listed ${parentList} docs — rules allow a list`,
)
await parent.signOut()

// ---------------------------------------------------------------- student

const student = await asUser('student@bmrc.demo')
console.log(`\nSigned in as student (uid ${student.uid})\n`)

check('student can read own profile stu-101', (await student.getStudent('stu-101')) === true)

const ownSiblings = await student.getStudent('stu-102')
check(
  'student CANNOT read a classmate stu-102',
  ownSiblings !== true,
  typeof ownSiblings === 'string' ? ownSiblings : 'READ SUCCEEDED — DATA LEAK',
)

const studentList = await student.listStudents()
check(
  'student cannot list students',
  typeof studentList === 'string',
  typeof studentList === 'string' ? studentList : `listed ${studentList} docs — rules allow a list`,
)
await student.signOut()

// ---------------------------------------------------------------- summary

const failed = results.filter((r) => !r.ok)
console.log(`\n${'='.repeat(60)}`)
console.log(`  ${results.length - failed.length}/${results.length} passed`)
console.log(`  Pass rate: ${(((results.length - failed.length) / results.length) * 100).toFixed(1)}%`)
console.log(`${'='.repeat(60)}\n`)

if (failed.length) {
  console.log('FAILED:')
  for (const f of failed) console.log(`  - ${f.name} ${f.note}`)
  process.exit(1)
}
console.log('All portal rule checks passed.\n')