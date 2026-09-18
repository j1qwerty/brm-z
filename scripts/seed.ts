/**
 * Seed the real Firestore project with baseline data (mirrors the in-app demo data).
 * Usage: pnpm db:seed
 * Requires .env.local: SERVICE_ACCOUNT_PATH and FIREBASE_PROJECT_ID, and the
 * service account JSON saved at that path (see README "Firebase setup").
 */
import 'dotenv/config'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import * as admin from 'firebase-admin'

const serviceAccountPath = resolve(process.env.SERVICE_ACCOUNT_PATH ?? './scripts/service-account.json')

if (!existsSync(serviceAccountPath)) {
  console.error(`\n✗ Service account key not found at ${serviceAccountPath}`)
  console.error('  Download it from: Firebase console → Project settings → Service accounts → Generate new private key')
  console.error('  Save it as scripts/service-account.json (never commit it) and set SERVICE_ACCOUNT_PATH in .env.local\n')
  process.exit(1)
}

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'))
const projectId = process.env.FIREBASE_PROJECT_ID ?? serviceAccount.project_id

admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId })
const db = admin.firestore()
const ts = Date.now()
const base = { createdAt: ts, updatedAt: ts, deletedAt: null, deletedBy: null }

const DEMO_USERS = [
  { email: 'admin@bmrc.demo', name: 'Ramesh Gupta', role: 'admin' },
  { email: 'teacher@bmrc.demo', name: 'Sunita Sharma', role: 'teacher' },
  { email: 'accountant@bmrc.demo', name: 'Prakash Rao', role: 'accountant' },
  { email: 'staff@bmrc.demo', name: 'Venkatesh Yadav', role: 'staff' },
  { email: 'parent@bmrc.demo', name: 'Meera Sharma', role: 'parent' },
]

const DEMO_PASSWORD = 'Bmrc@2026'

async function upsert(col: string, id: string, data: Record<string, unknown>) {
  await db.collection(col).doc(id).set({ ...base, id, ...data }, { merge: true })
}

async function main() {
  console.log(`Seeding project "${projectId}"...`)

  // settings
  await db.doc('settings/school').set({
    id: 'school',
    name: 'BMRC Public School',
    address: 'Plot 14, Vidya Nagar, Habsiguda',
    city: 'Hyderabad, Telangana 500007',
    affiliation: 'CBSE (Aff. 130456)',
    phone: '+91 98480 12345',
    email: 'office@bmrcpublicschool.in',
    website: 'www.bmrcpublicschool.in',
    principalName: 'Mrs. Lakshmi Narayanan',
    sessionDefaults: { periodsPerDay: 6, workingDays: [1, 2, 3, 4, 5, 6] },
    updatedAt: ts,
  }, { merge: true })

  // users (Auth + users doc)
  for (const u of DEMO_USERS) {
    let user: admin.auth.UserRecord | null = null
    try {
      user = await admin.auth().getUserByEmail(u.email)
    } catch {
      user = await admin.auth().createUser({ email: u.email, password: DEMO_PASSWORD, displayName: u.name, emailVerified: true })
    }
    await db.collection('users').doc(user.uid).set({
      ...base, id: user.uid, name: u.name, email: u.email, role: u.role, status: 'active',
    }, { merge: true })
    console.log(`  user ${u.email} (${u.role}) uid=${user.uid}`)
  }

  // session
  await upsert('sessions', 'sess-2627', { name: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31', isActive: true, isCompleted: false })

  // classes
  const classDefs: [string, string, string[], number][] = [
    ['c-nur', 'Nursery', ['A'], 0], ['c-1', 'Class 1', ['A', 'B'], 1], ['c-3', 'Class 3', ['A'], 2],
    ['c-5', 'Class 5', ['A', 'B'], 3], ['c-8', 'Class 8', ['A'], 4], ['c-10', 'Class 10', ['A', 'B'], 5],
  ]
  for (const [id, name, sections, order] of classDefs) {
    await upsert('classes', id, { name, sections, order, classTeacherId: id === 'c-10' ? 'st-001' : null })
  }

  // subjects for Class 10
  const subs10: [string, string][] = [['English', 'ENG10'], ['Mathematics', 'MATH10'], ['Science', 'SCI10'], ['Social Studies', 'SST10'], ['Hindi', 'HIN10']]
  for (const [name, code] of subs10) {
    await db.collection(`classes/c-10/subjects`).doc(code.toLowerCase()).set({ ...base, id: code.toLowerCase(), classId: 'c-10', name, code, gradingMode: 'percentage', isElective: false })
  }

  // fee types
  const feeTypes: [string, string, string, number, boolean][] = [
    ['ft-tuition', 'Tuition Fee', 'monthly', 2500, false],
    ['ft-admission', 'Admission Fee', 'one-time', 8000, false],
    ['ft-exam', 'Examination Fee', 'quarterly', 600, false],
    ['ft-transport', 'Transport Fee', 'monthly', 1200, true],
    ['ft-annual', 'Annual Charges', 'yearly', 3500, false],
  ]
  for (const [id, name, frequency, defaultAmount, refundable] of feeTypes) {
    await upsert('feeTypes', id, { name, frequency, defaultAmount, refundable })
  }

  // grading scale
  await upsert('gradingScales', 'gs-cbse', {
    name: 'CBSE 8-band (default)', isDefault: true,
    bands: [
      { grade: 'A1', min: 91, max: 100, remark: 'Outstanding' },
      { grade: 'A2', min: 81, max: 90, remark: 'Excellent' },
      { grade: 'B1', min: 71, max: 80, remark: 'Very Good' },
      { grade: 'B2', min: 61, max: 70, remark: 'Good' },
      { grade: 'C1', min: 51, max: 60, remark: 'Fair' },
      { grade: 'C2', min: 41, max: 50, remark: 'Needs Improvement' },
      { grade: 'D', min: 33, max: 40, remark: 'Pass' },
      { grade: 'E', min: 0, max: 32, remark: 'Needs Special Attention' },
    ],
  })

  // default templates (minimal layouts; design them in the app)
  const logo = 'https://ui-avatars.com/api/?name=BMRC&background=0f766e&color=fff&size=128&bold=true'
  await upsert('templates', 'tpl-id-student', {
    kind: 'idcard-student', name: 'Student ID (default)', images: { logo, background: '', extra1: '' }, isDefault: true,
    layoutJson: { page: { w: 640, h: 400 }, elements: [
      { id: 'e1', type: 'school', label: 'School name', x: 90, y: 20, w: 460, h: 40, fontSize: 22, fontWeight: 800, color: '#0f766e', align: 'center' },
      { id: 'e2', type: 'photo', label: 'Photo', x: 260, y: 76, w: 120, h: 140, bgColor: '#f1f5f9', borderRadius: 8 },
      { id: 'e3', type: 'name', label: 'Student name', x: 40, y: 228, w: 560, h: 30, fontSize: 20, fontWeight: 700, align: 'center', color: '#0f172a' },
      { id: 'e4', type: 'class', label: 'Class & section', x: 40, y: 260, w: 270, h: 22, fontSize: 14, align: 'center', color: '#334155' },
      { id: 'e5', type: 'roll', label: 'Roll no', x: 330, y: 260, w: 270, h: 22, fontSize: 14, align: 'center', color: '#334155' },
      { id: 'e6', type: 'qr', label: 'ID QR', x: 566, y: 340, w: 52, h: 52 },
    ] },
  })
  await upsert('templates', 'tpl-receipt', {
    kind: 'receipt', name: 'Fee Receipt (default)', images: { logo, background: '', extra1: '' }, isDefault: true,
    layoutJson: { page: { w: 420, h: 600 }, elements: [
      { id: 'r1', type: 'school', label: 'School name', x: 20, y: 16, w: 380, h: 30, fontSize: 18, fontWeight: 800, color: '#0f766e', align: 'center' },
      { id: 'r3', type: 'text', label: 'Receipt No', x: 20, y: 86, w: 180, h: 20, fontSize: 12, color: '#0f172a' },
      { id: 'r4', type: 'text', label: 'Date', x: 220, y: 86, w: 180, h: 20, fontSize: 12, color: '#0f172a' },
      { id: 'r5', type: 'name', label: 'Student', x: 20, y: 116, w: 380, h: 20, fontSize: 13, fontWeight: 700, color: '#0f172a' },
      { id: 'r8', type: 'text', label: 'Amount', x: 20, y: 192, w: 380, h: 24, fontSize: 15, fontWeight: 800, color: '#0f766e' },
      { id: 'r10', type: 'qr', label: 'Verify QR', x: 348, y: 528, w: 52, h: 52 },
    ] },
  })

  console.log('\nSeed complete.')
  console.log(`Logins (after enabling Email/Password auth): password for all demo users is ${DEMO_PASSWORD}`)
  console.log('Next: enable Google sign-in in the console, deploy rules with `pnpm rules:deploy`, then open the app.')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
