/**
 * LIVE Firestore test — runs REAL CRUD against the REAL Firestore project.
 *
 *   pnpm test:live    # writes test data (all ids prefixed "tst-")
 *   pnpm test-reset   # deletes ONLY "tst-" docs, real school data untouched
 *
 * What it covers (every step hits the network, expect ~30-90s, NOT 0ms):
 *   - 2 sessions (create / get / where-query / edit / soft-delete / restore)
 *   - Classes 1-10, each with sections A+B (create / list / order / edit / delete+restore)
 *   - 4 subjects per class in `classes/{id}/subjects` subcollections
 *   - 6 teachers + 2 non-teaching staff (filter / edit / bulk / delete+restore)
 *   - 60 students (3 per class-section) incl. bulkWrite update path
 *   - 12 parent users with childIds
 *   - Teaching assignments linking session+class+subject+teacher
 *   - Fee types + assignments + invoices + payments (full + partial payment, edit)
 *   - Student + staff attendance for a day, student leave (pending -> approved)
 *   - Timetable: Class 5-A Monday periods 1-6 + teacher double-booking check
 *   - Exam + marks + grading scale + report card
 *   - Template + certificate + notice + notification + document + PTM + messages + event
 *
 * Safety:
 *   - EVERY doc id starts with "tst-", so `pnpm test-reset` can only ever
 *     delete test data. Uses set(merge) so re-runs are idempotent.
 *   - Uses firebase-admin (bypasses security rules, like db:seed does).
 *     Rule enforcement itself is covered separately by `pnpm rules:test`.
 * Requires: SERVICE_ACCOUNT_PATH + FIREBASE_PROJECT_ID in .env.local
 *   (same setup as `pnpm db:seed`).
 */
import 'dotenv/config'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import admin from 'firebase-admin'

const P = 'tst-' // test id prefix — reset script deletes ONLY these

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

// ---------------------------------------------------------------- helpers

interface Check {
  name: string
  ok: boolean
  detail?: string
}
const checks: Check[] = []
let writes = 0
let reads = 0

function check(name: string, cond: unknown, detail?: string) {
  const ok = Boolean(cond)
  checks.push({ name, ok, detail: ok ? undefined : detail })
  console.log(`  ${ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'} ${name}${ok || !detail ? '' : ` — ${detail}`}`)
}

function section(title: string) {
  console.log(`\n${title}`)
}

const ts = Date.now()
const base = { createdAt: ts, updatedAt: ts, deletedAt: null as null, deletedBy: null as null }

async function put(colPath: string, id: string, data: Record<string, unknown>) {
  await db.collection(colPath).doc(id).set({ ...base, id, ...data }, { merge: true })
  writes++
}

async function get<T>(colPath: string, id: string): Promise<(T & { id: string }) | null> {
  reads++
  const snap = await db.collection(colPath).doc(id).get()
  if (!snap.exists) return null
  return { id: snap.id, ...(snap.data() as T) }
}

async function edit(colPath: string, id: string, data: Record<string, unknown>) {
  await db.collection(colPath).doc(id).update({ ...data, updatedAt: Date.now() })
  writes++
}

async function softDelete(colPath: string, id: string) {
  await edit(colPath, id, { deletedAt: Date.now(), deletedBy: `${P}tester` })
}

async function restore(colPath: string, id: string) {
  await edit(colPath, id, { deletedAt: null, deletedBy: null })
}

async function listAll(colPath: string): Promise<Record<string, unknown>[]> {
  reads++
  const snap = await db.collection(colPath).get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

function visible(rows: Record<string, unknown>[]) {
  return rows.filter((r) => (r.deletedAt as number | null) == null)
}
function deleted(rows: Record<string, unknown>[]) {
  return rows.filter((r) => (r.deletedAt as number | null) != null)
}
function onlyPrefix(rows: Record<string, unknown>[]) {
  return rows.filter((r) => String(r.id).startsWith(P))
}

async function batchPut(ops: { col: string; id: string; data: Record<string, unknown> }[]) {
  for (let i = 0; i < ops.length; i += 450) {
    const batch = db.batch()
    for (const op of ops.slice(i, i + 450)) {
      batch.set(db.collection(op.col).doc(op.id), { ...base, id: op.id, ...op.data }, { merge: true })
    }
    await batch.commit()
    writes += Math.min(450, ops.length - i)
  }
}

// ---------------------------------------------------------------- main

async function main() {
  console.log(`\n${'='.repeat(72)}`)
  console.log(`LIVE Firestore test against project "${projectId}" (prefix "${P}")`)
  console.log(`${'='.repeat(72)}`)

  // ---- sessions (2) ----
  section('SESSIONS (2)')
  await put('sessions', `${P}sess-2526`, { name: '2025-2026', startDate: '2025-04-01', endDate: '2026-03-31', isActive: false, isCompleted: true })
  await put('sessions', `${P}sess-2627`, { name: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31', isActive: true, isCompleted: false })
  const sess = await get<Record<string, unknown>>('sessions', `${P}sess-2627`)
  check('create + get active session', sess?.name === '2026-2027' && sess?.id === `${P}sess-2627`, JSON.stringify(sess))
  reads++
  const activeSnap = await db.collection('sessions').where('isActive', '==', true).get()
  const activeTests = activeSnap.docs.map((d) => d.id).filter((id) => id.startsWith(P))
  check('where isActive==true finds the test session', activeTests.includes(`${P}sess-2627`), activeTests.join(','))
  await edit('sessions', `${P}sess-2627`, { name: '2026-2027 (edited)' })
  const sessEdited = await get<Record<string, unknown>>('sessions', `${P}sess-2627`)
  check('edit session name', sessEdited?.name === '2026-2027 (edited)', String(sessEdited?.name))
  await edit('sessions', `${P}sess-2627`, { name: '2026-2027' }) // restore canonical name
  await softDelete('sessions', `${P}sess-2526`)
  const sessDel = await get<Record<string, unknown>>('sessions', `${P}sess-2526`)
  check('soft-delete sets deletedAt', (sessDel?.deletedAt as number) > 0, String(sessDel?.deletedAt))
  const sessVisible = visible(onlyPrefix(await listAll('sessions')))
  check('soft-deleted session hidden from default view', !sessVisible.some((r) => r.id === `${P}sess-2526`))
  await restore('sessions', `${P}sess-2526`)
  const sessRestored = await get<Record<string, unknown>>('sessions', `${P}sess-2526`)
  check('restore clears deletedAt', sessRestored?.deletedAt == null, String(sessRestored?.deletedAt))

  // ---- classes 1-10, sections A+B ----
  section('CLASSES 1-10 (sections A, B)')
  const classOps = Array.from({ length: 10 }, (_, i) => ({
    col: 'classes',
    id: `${P}c-${i + 1}`,
    data: { name: `Class ${i + 1}`, sections: ['A', 'B'], order: i + 1, classTeacherId: null as string | null },
  }))
  await batchPut(classOps)
  const allClasses = onlyPrefix(await listAll('classes'))
  check('10 test classes exist', allClasses.length >= 10, `${allClasses.length} found`)
  check('every test class has sections A+B', allClasses.every((c) => JSON.stringify((c.sections as string[]).slice().sort()) === '["A","B"]'))
  await edit('classes', `${P}c-5`, { classTeacherId: `${P}st-t1` })
  const c5 = await get<Record<string, unknown>>('classes', `${P}c-5`)
  check('edit class 5 sets classTeacherId', c5?.classTeacherId === `${P}st-t1`, String(c5?.classTeacherId))
  await softDelete('classes', `${P}c-10`)
  const classesVisible = visible(onlyPrefix(await listAll('classes')))
  check('soft-deleted class 10 hidden', !classesVisible.some((c) => c.id === `${P}c-10`))
  await restore('classes', `${P}c-10`)

  // ---- subjects: 4 per class ----
  section('SUBJECTS (4 per class = 40)')
  const SUBS: [string, string][] = [['English', 'ENG'], ['Mathematics', 'MAT'], ['Science', 'SCI'], ['Hindi', 'HIN']]
  const subOps: { col: string; id: string; data: Record<string, unknown> }[] = []
  for (let c = 1; c <= 10; c++) {
    for (const [name, code] of SUBS) {
      const sid = `${P}s-c${c}-${code.toLowerCase()}`
      subOps.push({ col: `classes/${P}c-${c}/subjects`, id: sid, data: { classId: `${P}c-${c}`, name, code: `${code}${c}`, gradingMode: 'percentage', isElective: false } })
    }
  }
  await batchPut(subOps)
  const c5subs = await listAll(`classes/${P}c-5/subjects`)
  check('class 5 has 4 subjects', onlyPrefix(c5subs).length === 4, `${onlyPrefix(c5subs).length}`)
  await edit(`classes/${P}c-5/subjects`, `${P}s-c5-mat`, { name: 'Mathematics (edited)' })
  const matEdited = await get<Record<string, unknown>>(`classes/${P}c-5/subjects`, `${P}s-c5-mat`)
  check('edit subject name', matEdited?.name === 'Mathematics (edited)', String(matEdited?.name))
  await edit(`classes/${P}c-5/subjects`, `${P}s-c5-mat`, { name: 'Mathematics' })
  await softDelete(`classes/${P}c-5/subjects`, `${P}s-c5-hin`)
  const subsVisible = visible(onlyPrefix(await listAll(`classes/${P}c-5/subjects`)))
  check('soft-deleted subject hidden (3 visible)', subsVisible.length === 3, `${subsVisible.length}`)
  await restore(`classes/${P}c-5/subjects`, `${P}s-c5-hin`)

  // ---- staff: 6 teaching + 2 non-teaching ----
  section('STAFF (6 teachers + 2 non-teaching)')
  const staffOps = [
    ...['Asha Verma', 'Ravi Kumar', 'Sunita Sharma', 'Rajesh Iyer', 'Kavita Rao', 'Manoj Singh'].map((name, i) => ({
      col: 'staff', id: `${P}st-t${i + 1}`,
      data: { name, staffType: 'teaching', designation: i < 2 ? 'PGT' : 'TGT', phone: `+91 90000 1000${i}`, status: 'active', employeeNo: `${P}EMP-T${i + 1}` },
    })),
    ...['Prakash Rao', 'Venkatesh Yadav'].map((name, i) => ({
      col: 'staff', id: `${P}st-nt${i + 1}`,
      data: { name, staffType: 'nonteaching', designation: i === 0 ? 'Accountant' : 'Driver', status: 'active', employeeNo: `${P}EMP-N${i + 1}` },
    })),
  ]
  await batchPut(staffOps)
  reads++
  const teachingSnap = await db.collection('staff').where('staffType', '==', 'teaching').get()
  const teachingTests = teachingSnap.docs.map((d) => d.id).filter((id) => id.startsWith(P))
  check('where staffType==teaching finds 6 test teachers', teachingTests.length === 6, `${teachingTests.length}`)
  await edit('staff', `${P}st-t1`, { designation: 'Vice Principal', phone: '+91 90000 99999' })
  const t1 = await get<Record<string, unknown>>('staff', `${P}st-t1`)
  check('edit teacher designation+phone', t1?.designation === 'Vice Principal' && t1?.phone === '+91 90000 99999')
  await softDelete('staff', `${P}st-nt2`)
  const staffVisible = visible(onlyPrefix(await listAll('staff')))
  check('soft-deleted staff hidden (7 visible)', staffVisible.length === 7, `${staffVisible.length}`)
  const staffDeleted = deleted(onlyPrefix(await listAll('staff')))
  check('listDeleted finds the soft-deleted staff', staffDeleted.some((s) => s.id === `${P}st-nt2`))
  await restore('staff', `${P}st-nt2`)

  // ---- students: 3 per class-section = 60 ----
  section('STUDENTS (60 = 10 classes x 2 sections x 3)')
  const studentOps: { col: string; id: string; data: Record<string, unknown> }[] = []
  let n = 0
  for (let c = 1; c <= 10; c++) {
    for (const sec of ['A', 'B']) {
      for (let k = 1; k <= 3; k++) {
        n++
        studentOps.push({
          col: 'students', id: `${P}stu-c${c}${sec.toLowerCase()}${k}`,
          data: {
            admissionNo: `${P}ADM-${c}${sec}${k}`, rollNo: String(k), name: `Test Student ${n}`,
            gender: n % 2 === 0 ? 'female' : 'male', dob: '2015-06-01', classId: `${P}c-${c}`, section: sec,
            phone: `+91 91111 200${String(n).padStart(2, '0')}`, guardianName: `Guardian ${n}`, guardianPhone: `+91 92222 200${String(n).padStart(2, '0')}`,
            status: 'active', admissionDate: '2026-04-01',
          },
        })
      }
    }
  }
  await batchPut(studentOps)
  reads++
  const c1aSnap = await db.collection('students').where('classId', '==', `${P}c-1`).get()
  const c1Tests = c1aSnap.docs.map((d) => d.id).filter((id) => id.startsWith(P))
  check('where classId==c-1 finds 6 test students', c1Tests.length === 6, `${c1Tests.length}`)
  const oneStu = await get<Record<string, unknown>>('students', `${P}stu-c1a1`)
  check('get student by id', oneStu?.admissionNo === `${P}ADM-1A1`, String(oneStu?.admissionNo))
  await edit('students', `${P}stu-c1a1`, { rollNo: '99', guardianPhone: '+91 90000 00001' })
  const stuEdited = await get<Record<string, unknown>>('students', `${P}stu-c1a1`)
  check('edit student rollNo+guardianPhone', stuEdited?.rollNo === '99', String(stuEdited?.rollNo))
  await edit('students', `${P}stu-c1a1`, { rollNo: '1' })
  // bulkWrite path: batch-update 2 students at once
  {
    const batch = db.batch()
    batch.update(db.collection('students').doc(`${P}stu-c2a1`), { rollNo: '31', updatedAt: Date.now() })
    batch.update(db.collection('students').doc(`${P}stu-c2a2`), { rollNo: '32', updatedAt: Date.now() })
    await batch.commit()
    writes += 2
  }
  const bulk1 = await get<Record<string, unknown>>('students', `${P}stu-c2a1`)
  check('bulk update students', bulk1?.rollNo === '31', String(bulk1?.rollNo))
  await softDelete('students', `${P}stu-c3a1`)
  const stuVisible = visible(onlyPrefix(await listAll('students')))
  check('soft-deleted student hidden (59 visible)', stuVisible.length === 59, `${stuVisible.length}`)
  await restore('students', `${P}stu-c3a1`)
  const stuRestoredCount = visible(onlyPrefix(await listAll('students')))
  check('restored student back (60 visible)', stuRestoredCount.length === 60, `${stuRestoredCount.length}`)
  // referential integrity: every test student points at a real test class
  const classIds = new Set(allClasses.map((c) => String(c.id)))
  check('every student references a real class', stuRestoredCount.every((s) => classIds.has(String(s.classId))))

  // ---- parent users (12) ----
  section('PARENTS / USERS (12)')
  const parentOps = Array.from({ length: 12 }, (_, i) => {
    const childId = `${P}stu-c${(i % 10) + 1}a1`
    return {
      col: 'users', id: `${P}u-parent${i + 1}`,
      data: { name: `Test Parent ${i + 1}`, email: `testparent${i + 1}@example.com`, role: 'parent', status: 'active', childIds: [childId] },
    }
  })
  await batchPut(parentOps)
  const par1 = await get<Record<string, unknown>>('users', `${P}u-parent1`)
  check('parent has childIds link', Array.isArray(par1?.childIds) && (par1?.childIds as string[]).length === 1, JSON.stringify(par1?.childIds))
  await edit('users', `${P}u-parent1`, { phone: '+91 93333 00001' })
  const parEdited = await get<Record<string, unknown>>('users', `${P}u-parent1`)
  check('edit parent phone', parEdited?.phone === '+91 93333 00001', String(parEdited?.phone))
  await softDelete('users', `${P}u-parent12`)
  const usersVisible = visible(onlyPrefix(await listAll('users')))
  check('soft-deleted parent hidden', !usersVisible.some((u) => u.id === `${P}u-parent12`))
  await restore('users', `${P}u-parent12`)

  // ---- assignments ----
  section('ASSIGNMENTS (4)')
  await put('assignments', `${P}as-1`, { sessionId: `${P}sess-2627`, classId: `${P}c-5`, sectionId: 'A', subjectId: `${P}s-c5-mat`, teacherId: `${P}st-t1` })
  await put('assignments', `${P}as-2`, { sessionId: `${P}sess-2627`, classId: `${P}c-5`, sectionId: 'A', subjectId: `${P}s-c5-sci`, teacherId: `${P}st-t2` })
  await put('assignments', `${P}as-3`, { sessionId: `${P}sess-2627`, classId: `${P}c-1`, sectionId: 'B', subjectId: `${P}s-c1-eng`, teacherId: `${P}st-t3` })
  await put('assignments', `${P}as-4`, { sessionId: `${P}sess-2627`, classId: `${P}c-10`, sectionId: 'A', subjectId: `${P}s-c10-mat`, teacherId: `${P}st-t4` })
  await edit('assignments', `${P}as-1`, { teacherId: `${P}st-t2` })
  const as1 = await get<Record<string, unknown>>('assignments', `${P}as-1`)
  check('edit assignment teacher', as1?.teacherId === `${P}st-t2`, String(as1?.teacherId))
  await edit('assignments', `${P}as-1`, { teacherId: `${P}st-t1` })
  await softDelete('assignments', `${P}as-4`)
  const asVisible = visible(onlyPrefix(await listAll('assignments')))
  check('soft-deleted assignment hidden (3 visible)', asVisible.length === 3, `${asVisible.length}`)
  await restore('assignments', `${P}as-4`)

  // ---- fees: types + assignments + invoices + payments ----
  section('FEES (types, assignments, invoices, payments)')
  await put('feeTypes', `${P}ft-tuition`, { name: 'Test Tuition Fee', frequency: 'monthly', defaultAmount: 2500, refundable: false })
  await put('feeTypes', `${P}ft-exam`, { name: 'Test Exam Fee', frequency: 'quarterly', defaultAmount: 600, refundable: false })
  await put('feeTypes', `${P}ft-transport`, { name: 'Test Transport Fee', frequency: 'monthly', defaultAmount: 1200, refundable: true })
  await put('feeAssignments', `${P}fa-1`, { sessionId: `${P}sess-2627`, feeTypeId: `${P}ft-tuition`, targetType: 'class', targetId: `${P}c-5`, amount: 2500 })
  await put('feeAssignments', `${P}fa-2`, { sessionId: `${P}sess-2627`, feeTypeId: `${P}ft-exam`, targetType: 'class', targetId: `${P}c-5`, amount: 600 })
  const invoiceStudents = [`${P}stu-c5a1`, `${P}stu-c5a2`, `${P}stu-c5a3`, `${P}stu-c5b1`, `${P}stu-c5b2`]
  for (const [i, sid] of invoiceStudents.entries()) {
    await put('invoices', `${P}inv-${i + 1}`, {
      sessionId: `${P}sess-2627`, studentId: sid, feeTypeId: `${P}ft-tuition`, feeTypeName: 'Test Tuition Fee',
      periodKey: '2026-04', amount: 2500, discount: 0, paidAmount: 0, dueDate: '2026-04-10', status: 'unpaid', generatedByRunId: `${P}run-1`,
    })
  }
  // full payment on invoice 1
  await put('payments', `${P}pay-1`, { invoiceId: `${P}inv-1`, studentId: invoiceStudents[0], amount: 2500, mode: 'upi', paidAt: Date.now(), receiptNo: `${P}R-001`, collectedBy: `${P}st-nt1` })
  await edit('invoices', `${P}inv-1`, { paidAmount: 2500, status: 'paid' })
  const inv1 = await get<Record<string, unknown>>('invoices', `${P}inv-1`)
  check('full payment marks invoice paid', inv1?.status === 'paid' && inv1?.paidAmount === 2500, JSON.stringify({ s: inv1?.status, p: inv1?.paidAmount }))
  // partial payment on invoice 2
  await put('payments', `${P}pay-2`, { invoiceId: `${P}inv-2`, studentId: invoiceStudents[1], amount: 1000, mode: 'cash', paidAt: Date.now(), receiptNo: `${P}R-002`, collectedBy: `${P}st-nt1` })
  await edit('invoices', `${P}inv-2`, { paidAmount: 1000, status: 'partial' })
  const inv2 = await get<Record<string, unknown>>('invoices', `${P}inv-2`)
  check('partial payment marks invoice partial', inv2?.status === 'partial' && inv2?.paidAmount === 1000)
  await edit('payments', `${P}pay-2`, { note: 'edited note' })
  const pay2 = await get<Record<string, unknown>>('payments', `${P}pay-2`)
  check('edit payment note', pay2?.note === 'edited note', String(pay2?.note))
  await softDelete('payments', `${P}pay-2`)
  const payVisible = visible(onlyPrefix(await listAll('payments')))
  check('soft-deleted payment hidden (1 visible)', payVisible.length === 1, `${payVisible.length}`)
  await restore('payments', `${P}pay-2`)

  // ---- attendance (students + staff) + leave ----
  section('ATTENDANCE + LEAVES')
  const attDate = '2026-08-10'
  const c1aStudents = [`${P}stu-c1a1`, `${P}stu-c1a2`, `${P}stu-c1a3`, `${P}stu-c1b1`, `${P}stu-c1b2`, `${P}stu-c1b3`]
  const attOps: { col: string; id: string; data: Record<string, unknown> }[] = c1aStudents.map((sid, i) => ({
    col: 'attendance', id: `${P}att-${attDate}-${i + 1}`,
    data: {
      date: attDate, sessionId: `${P}sess-2627`, personType: 'student', personId: sid,
      classId: `${P}c-1`, section: i < 3 ? 'A' : 'B', status: sid === `${P}stu-c1a2` ? 'absent' : 'present', markedBy: `${P}st-t1`,
    },
  }))
  attOps.push(
    { col: 'attendance', id: `${P}att-staff-1`, data: { date: attDate, sessionId: `${P}sess-2627`, personType: 'staff', personId: `${P}st-t1`, status: 'present', markedBy: `${P}st-nt1` } },
    { col: 'attendance', id: `${P}att-staff-2`, data: { date: attDate, sessionId: `${P}sess-2627`, personType: 'staff', personId: `${P}st-t2`, status: 'leave', markedBy: `${P}st-nt1` } },
  )
  await batchPut(attOps)
  reads++
  const daySnap = await db.collection('attendance').where('date', '==', attDate).get()
  const dayTests = daySnap.docs.map((d) => d.id).filter((id) => id.startsWith(P))
  check('8 attendance rows for the day', dayTests.length === 8, `${dayTests.length}`)
  await edit('attendance', `${P}att-${attDate}-2`, { status: 'present' })
  const attEdited = await get<Record<string, unknown>>('attendance', `${P}att-${attDate}-2`)
  check('edit attendance absent->present', attEdited?.status === 'present', String(attEdited?.status))
  await edit('attendance', `${P}att-${attDate}-2`, { status: 'absent' })
  await put('leaves', `${P}leave-1`, { personType: 'student', personId: `${P}stu-c1a2`, personName: 'Test Student 2', type: 'sick', from: attDate, to: attDate, reason: 'Fever', status: 'pending' })
  await edit('leaves', `${P}leave-1`, { status: 'approved', decidedBy: `${P}st-t1`, decisionNote: 'Get well soon' })
  const leave = await get<Record<string, unknown>>('leaves', `${P}leave-1`)
  check('leave pending->approved', leave?.status === 'approved', String(leave?.status))
  await softDelete('leaves', `${P}leave-1`)
  const leavesVisible = visible(onlyPrefix(await listAll('leaves')))
  check('soft-deleted leave hidden', leavesVisible.length === 0, `${leavesVisible.length}`)
  await restore('leaves', `${P}leave-1`)

  // ---- timetable: Class 5-A Monday periods 1-6 ----
  section('TIMETABLE (Class 5-A, Monday, periods 1-6)')
  const ttSubs = [`${P}s-c5-eng`, `${P}s-c5-mat`, `${P}s-c5-sci`, `${P}s-c5-eng`, `${P}s-c5-mat`, `${P}s-c5-hin`]
  const ttTeachers = [`${P}st-t1`, `${P}st-t2`, `${P}st-t3`, `${P}st-t4`, `${P}st-t5`, `${P}st-t6`]
  for (let p = 1; p <= 6; p++) {
    await put('timetable', `${P}tt-5a-mon-${p}`, {
      sessionId: `${P}sess-2627`, classId: `${P}c-5`, section: 'A', day: 1, periodNo: p,
      subjectId: ttSubs[p - 1], teacherId: ttTeachers[p - 1], roomId: `R-${p}`,
    })
  }
  reads++
  const ttSnap = await db.collection('timetable').where('classId', '==', `${P}c-5`).get()
  const ttTests = ttSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.id.startsWith(P))
  check('6 timetable slots for class 5', ttTests.length === 6, `${ttTests.length}`)
  // conflict detection: no teacher double-booked in the same day+period
  {
    const seen = new Set<string>()
    let conflict = false
    for (const s of ttTests) {
      const d = s as unknown as { day: number; periodNo: number; teacherId: string }
      const key = `${d.day}:${d.periodNo}:${d.teacherId}`
      if (seen.has(key)) conflict = true
      seen.add(key)
    }
    check('no teacher double-booked same day+period', !conflict)
  }
  await edit('timetable', `${P}tt-5a-mon-1`, { roomId: 'R-101' })
  const ttEdited = await get<Record<string, unknown>>('timetable', `${P}tt-5a-mon-1`)
  check('edit timetable room', ttEdited?.roomId === 'R-101', String(ttEdited?.roomId))
  await softDelete('timetable', `${P}tt-5a-mon-6`)
  const ttVisible = visible(onlyPrefix(await listAll('timetable')))
  check('soft-deleted slot hidden (5 visible)', ttVisible.length === 5, `${ttVisible.length}`)
  await restore('timetable', `${P}tt-5a-mon-6`)

  // ---- exams + marks + grading + report card ----
  section('EXAMS + MARKS + GRADING + REPORT CARD')
  await put('gradingScales', `${P}gs-test`, {
    name: 'Test CBSE scale', isDefault: false,
    bands: [
      { grade: 'A1', min: 91, max: 100, remark: 'Outstanding' },
      { grade: 'D', min: 33, max: 40, remark: 'Pass' },
      { grade: 'E', min: 0, max: 32, remark: 'Needs Attention' },
    ],
  })
  await put('exams', `${P}exam-ut1`, {
    name: 'Test Unit Test 1', type: 'unit', sessionId: `${P}sess-2627`, classIds: [`${P}c-5`],
    perClass: { [`${P}c-5`]: { subjectIds: [`${P}s-c5-eng`, `${P}s-c5-mat`], maxMarks: 50, includeInFinal: true } },
    startDate: '2026-08-01', endDate: '2026-08-05', status: 'draft',
  })
  await edit('exams', `${P}exam-ut1`, { status: 'scheduled' })
  const exam = await get<Record<string, unknown>>('exams', `${P}exam-ut1`)
  check('edit exam draft->scheduled', exam?.status === 'scheduled', String(exam?.status))
  const markStudents = [`${P}stu-c5a1`, `${P}stu-c5a2`, `${P}stu-c5a3`]
  const markSubs = [`${P}s-c5-eng`, `${P}s-c5-mat`]
  const markScores = [42, 35, 28]
  for (const [si, sid] of markStudents.entries()) {
    for (const [mi, sub] of markSubs.entries()) {
      const score = Math.min(50, markScores[si] + mi)
      await put('marks', `${P}mark-${si + 1}-${mi + 1}`, {
        examId: `${P}exam-ut1`, studentId: sid, subjectId: sub, marks: score, maxMarks: 50,
        grade: score >= 41 ? 'A2' : score >= 33 ? 'D' : 'E', enteredBy: `${P}st-t1`,
      })
    }
  }
  reads++
  const marksSnap = await db.collection('marks').where('examId', '==', `${P}exam-ut1`).get()
  const marksTests = marksSnap.docs.map((d) => d.id).filter((id) => id.startsWith(P))
  check('6 marks rows for the exam', marksTests.length === 6, `${marksTests.length}`)
  await edit('marks', `${P}mark-1-1`, { marks: 45, grade: 'A2', remark: 'rechecked' })
  const markEdited = await get<Record<string, unknown>>('marks', `${P}mark-1-1`)
  check('edit marks value', markEdited?.marks === 45, String(markEdited?.marks))
  await put('reportCards', `${P}rc-1`, { examId: `${P}exam-ut1`, studentId: markStudents[0], data: { total: 87 } })
  const rc = await get<Record<string, unknown>>('reportCards', `${P}rc-1`)
  check('report card created', rc?.studentId === markStudents[0], String(rc?.studentId))

  // ---- templates + certificates ----
  section('TEMPLATES + CERTIFICATES')
  await put('templates', `${P}tpl-test`, {
    kind: 'idcard-student', name: 'Test Student ID', isDefault: false,
    images: { logo: '', background: '', extra1: '' },
    layoutJson: { page: { w: 640, h: 400 }, elements: [{ id: 'e1', type: 'name', label: 'Name', x: 10, y: 10, w: 200, h: 30 }] },
  })
  await edit('templates', `${P}tpl-test`, { name: 'Test Student ID (edited)', isDefault: true })
  const tpl = await get<Record<string, unknown>>('templates', `${P}tpl-test`)
  check('edit template name + make default', tpl?.name === 'Test Student ID (edited)' && tpl?.isDefault === true)
  await softDelete('templates', `${P}tpl-test`)
  const tplVisible = visible(onlyPrefix(await listAll('templates')))
  check('soft-deleted template hidden', !tplVisible.some((t) => t.id === `${P}tpl-test`))
  await restore('templates', `${P}tpl-test`)
  await put('certificates', `${P}cert-1`, {
    type: 'bonafide', studentId: `${P}stu-c5a1`, serialNo: `${P}BON-001`, issuedDate: '2026-08-01',
    dataSnapshot: { name: 'Test Student 25', class: 'Class 5-A' },
  })
  const cert = await get<Record<string, unknown>>('certificates', `${P}cert-1`)
  check('certificate created', cert?.serialNo === `${P}BON-001`, String(cert?.serialNo))

  // ---- notices, notifications, documents, PTM, messages, calendar ----
  section('NOTICES + COMMS + PTM + CALENDAR')
  await put('notices', `${P}notice-1`, {
    title: 'Test Holiday Notice', body: 'School closed on Monday for testing.',
    audience: { type: 'all', value: [] }, publishAt: Date.now(), status: 'live', isPinned: false,
    createdBy: `${P}st-nt1`, attachmentsUrl: [],
  })
  await edit('notices', `${P}notice-1`, { isPinned: true })
  const notice = await get<Record<string, unknown>>('notices', `${P}notice-1`)
  check('edit notice pin', notice?.isPinned === true, String(notice?.isPinned))
  await put('notifications', `${P}notif-1`, { userId: `${P}u-parent1`, title: 'Test fee reminder', body: 'Tuition due April 10', readAt: null })
  await edit('notifications', `${P}notif-1`, { readAt: Date.now() })
  const notif = await get<Record<string, unknown>>('notifications', `${P}notif-1`)
  check('notification marked read', (notif?.readAt as number) > 0, String(notif?.readAt))
  await put('documents', `${P}doc-1`, { ownerType: 'student', ownerId: `${P}stu-c5a1`, category: 'birth-certificate', url: 'https://example.com/test-doc.pdf', verified: false })
  await edit('documents', `${P}doc-1`, { verified: true, verifiedBy: `${P}st-nt1` })
  const doc = await get<Record<string, unknown>>('documents', `${P}doc-1`)
  check('document verified', doc?.verified === true, String(doc?.verified))
  await put('ptms', `${P}ptm-1`, {
    teacherId: `${P}st-t1`, classId: `${P}c-5`, date: '2026-08-20', status: 'scheduled', title: 'Test PTM',
    slots: [{ time: '10:00' }, { time: '10:15' }],
  })
  await edit('ptms', `${P}ptm-1`, { slots: [{ time: '10:00', bookedByParentId: `${P}u-parent1`, studentId: `${P}stu-c5a1` }, { time: '10:15' }] })
  const ptm = await get<Record<string, unknown>>('ptms', `${P}ptm-1`)
  check('PTM slot booked', (ptm?.slots as { bookedByParentId?: string }[])?.[0]?.bookedByParentId === `${P}u-parent1`)
  const threadId = `${P}thread-1`
  await put('messages', `${P}msg-1`, { threadId, senderId: `${P}u-parent1`, senderName: 'Test Parent 1', text: 'Hello teacher', sentAt: Date.now() })
  await put('messages', `${P}msg-2`, { threadId, senderId: `${P}st-t1`, senderName: 'Asha Verma', text: 'Hello parent', sentAt: Date.now() })
  reads++
  const msgSnap = await db.collection('messages').where('threadId', '==', threadId).get()
  check('2 messages in thread', msgSnap.docs.filter((d) => d.id.startsWith(P)).length === 2)
  await put('calendarEvents', `${P}ev-1`, { date: '2026-08-15', type: 'holiday', title: 'Test Independence Day' })
  const ev = await get<Record<string, unknown>>('calendarEvents', `${P}ev-1`)
  check('calendar event created', ev?.title === 'Test Independence Day', String(ev?.title))
  await put('runHistory', `${P}run-1`, { ranAt: Date.now(), result: 'live-test' })
  const run = await get<Record<string, unknown>>('runHistory', `${P}run-1`)
  check('run history written', run?.result === 'live-test', String(run?.result))

  // ---- missing-doc read ----
  section('NEGATIVE CHECKS')
  const missing = await get('students', `${P}does-not-exist`)
  check('get on missing id returns null', missing === null, String(missing))

  // ---- summary ----
  const passed = checks.filter((c) => c.ok).length
  const failed = checks.filter((c) => !c.ok)
  console.log(`\n${'='.repeat(72)}`)
  console.log('LIVE TEST SUMMARY')
  console.log(`${'='.repeat(72)}`)
  console.log(`  Checks:  ${checks.length}`)
  console.log(`  Passed:  ${passed}`)
  console.log(`  Failed:  ${failed.length}`)
  console.log(`  Writes:  ~${writes}   Reads: ~${reads}  (real network I/O — nothing here runs in 0ms)`)
  if (failed.length > 0) {
    console.log('\n  Failed checks:')
    for (const f of failed) console.log(`   - ${f.name}${f.detail ? `: ${f.detail}` : ''}`)
  } else {
    console.log('\n  All live checks passed.')
  }
  console.log(`\n  Test data is isolated under ids starting with "${P}".`)
  console.log('  Remove it any time with: pnpm test-reset')
  console.log(`${'='.repeat(72)}\n`)
  process.exit(failed.length > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('Live test crashed:', e)
  process.exit(2)
})
