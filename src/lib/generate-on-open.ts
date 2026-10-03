import type { DataProvider } from './data/provider'
import { periodKeyOf } from './utils'
import type { ExamDoc, FeeAssignmentDoc, FeeTypeDoc, InvoiceDoc, NoticeDoc, SessionDoc, StudentDoc } from './types'

// See notify.ts: lazy singleton keeps pure-Node test runs working.
async function defaultProvider(): Promise<DataProvider> {
  return (await import('./data/index')).dataProvider
}

/**
 * Generate-on-open scheduler (spec: idempotent, versioned, run-once-per-period,
 * no Cloud Functions). Safe to run on every app open by any signed-in user:
 *  - notice flip + exam transitions are naturally idempotent (guarded by state)
 *  - invoice generation is gated by a runHistory key per session+period and uses
 *    deterministic document ids, so repeated runs can never duplicate invoices.
 */

const runId = (key: string) => key

async function ensureRun(key: string, fn: () => Promise<string>, provider?: DataProvider): Promise<void> {
  const db = provider ?? await defaultProvider()
  try {
    const existing = await db.get('runHistory', runId(key))
    if (existing) return
  } catch {
    // continue on read failure; creation below is the gate
  }
  try {
    const result = await fn()
    await db.create('runHistory', { ranAt: Date.now(), result }, runId(key))
  } catch (e) {
    // Two admins racing: one create wins, the loser's key already exists. Harmless.
    console.warn(`generate-on-open run "${key}" skipped/failed:`, e)
  }
}

/** Scheduled notices flip to live when their publish time arrives, and the
 *  audience is notified on the flip (immediate publishes notify in the composer). */
export async function flipScheduledNotices(provider?: DataProvider): Promise<number> {
  const db = provider ?? await defaultProvider()
  const notices = await db.list<NoticeDoc>('notices', { where: [['status', '==', 'scheduled']] })
  const now = Date.now()
  const due = notices.filter((n) => n.publishAt <= now)
  const { audienceUserIds, notifyMany } = await import('./notify')
  await Promise.all(
    due.map(async (n) => {
      await db.update('notices', n.id, { status: 'live' })
      try {
        const ids = await audienceUserIds(n.audience, {}, db)
        await notifyMany(ids, n.title, n.body.slice(0, 90), '/notices', db)
      } catch {
        // notification is best-effort; the flip itself already succeeded
      }
    }),
  )
  return due.length
}

/** Exams move forward automatically based on their schedule dates; publish stays manual. */
export async function transitionExamStatuses(provider?: DataProvider): Promise<number> {
  const db = provider ?? await defaultProvider()
  const exams = await db.list<ExamDoc>('exams')
  const today = new Date().toISOString().slice(0, 10)
  let changed = 0
  for (const ex of exams) {
    if (ex.status === 'scheduled' && ex.startDate && ex.startDate <= today && (!ex.endDate || ex.endDate >= today)) {
      await db.update('exams', ex.id, { status: 'ongoing' })
      changed++
    } else if ((ex.status === 'scheduled' || ex.status === 'ongoing') && ex.endDate && ex.endDate < today) {
      await db.update('exams', ex.id, { status: 'evaluation' })
      changed++
    }
  }
  return changed
}

function quartersFor(month: number): string[] {
  // School year starts in April. Quarter start months: Apr, Jul, Oct, Jan
  return [4, 7, 10, 1].includes(month) ? [`Q${[4, 7, 10, 1].indexOf(month) + 1}`] : []
}

function halfYearsFor(month: number): string[] {
  return month === 4 || month === 5 || month === 6 ? ['H1'] : month === 12 || month === 1 || month === 2 ? ['H2'] : []
}

export interface InvoiceGenScope {
  /** Restrict to one fee type (default: every assigned type). */
  feeTypeId?: string
  /** Restrict to these students (default: every active student). */
  studentIds?: string[]
  /** Period to generate for as yyyy-MM (default: current month). Frequencies
   *  map onto it: monthly uses it directly, quarterly/half-yearly only yield
   *  a period in their start months, yearly yields April, one-time always. */
  periodKey?: string
}

/** Create period invoices for a session. Safe to call repeatedly:
 *  - deterministic ids (`student_feeType_period`) mean re-runs can never duplicate
 *  - invoices that already exist (paid, partial, waived or plain unpaid) are
 *    skipped, so repeating a run never resets collected amounts.
 *  Returns the number of NEWLY created invoices. */
export async function generateInvoicesForPeriod(
  session: SessionDoc,
  current: Date = new Date(),
  scope?: InvoiceGenScope,
  provider?: DataProvider,
): Promise<number> {
  const db = provider ?? await defaultProvider()
  const periodKey = scope?.periodKey ?? periodKeyOf(current)
  const [y, m] = periodKey.split('-').map(Number)
  const month = m ?? current.getMonth() + 1
  const year = y ?? current.getFullYear()

  const [feeTypes, assignments, students, existing] = await Promise.all([
    db.list<FeeTypeDoc>('feeTypes'),
    db.list<FeeAssignmentDoc>('feeAssignments', { where: [['sessionId', '==', session.id]] }),
    db.list<StudentDoc>('students', { where: [['status', '==', 'active']] }),
    db.list<InvoiceDoc>('invoices', { where: [['sessionId', '==', session.id]] }),
  ])
  if (!assignments.length || !students.length) return 0
  const seen = new Set(existing.map((i) => i.id))
  const onlyStudents = scope?.studentIds?.length ? new Set(scope.studentIds) : null

  const ops: { id: string; data: Record<string, unknown> }[] = []
  const dueDate = `${periodKey}-10`

  for (const fa of assignments) {
    if (scope?.feeTypeId && fa.feeTypeId !== scope.feeTypeId) continue
    const ft = feeTypes.find((f) => f.id === fa.feeTypeId)
    if (!ft) continue
    let periodSuffix: string | null = null
    if (ft.frequency === 'monthly') periodSuffix = periodKey
    else if (ft.frequency === 'quarterly') periodSuffix = quartersFor(month).length ? `${year}-${quartersFor(month)[0]}` : null
    else if (ft.frequency === 'half-yearly') periodSuffix = halfYearsFor(month).length ? `${year}-${halfYearsFor(month)[0]}` : null
    else if (ft.frequency === 'yearly') periodSuffix = month === 4 ? `${year}-Y` : null
    else if (ft.frequency === 'one-time') periodSuffix = `${year}-OT`
    if (!periodSuffix) continue

    const targets = fa.targetType === 'class' ? students.filter((s) => s.classId === fa.targetId) : students.filter((s) => s.id === fa.targetId)
    for (const student of targets) {
      if (onlyStudents && !onlyStudents.has(student.id)) continue
      const id = `${student.id}_${fa.feeTypeId}_${periodSuffix}`
      if (seen.has(id)) continue // already invoiced — never touch collected money
      seen.add(id)
      ops.push({
        id,
        data: {
          sessionId: session.id,
          studentId: student.id,
          feeTypeId: ft.id,
          feeTypeName: ft.name,
          periodKey: periodSuffix,
          amount: fa.amount,
          discount: 0,
          paidAmount: 0,
          dueDate,
          status: 'unpaid',
          generatedByRunId: runId(`v1:invoices:${session.id}:${periodKey}`),
        },
      })
    }
  }
  if (ops.length) await db.bulkWrite('invoices', ops)
  return ops.length
}

/** Entry point: called by AppShell when an active user opens the app. */
export async function runGenerateOnOpen(session: SessionDoc | null): Promise<void> {
  if (!session) return
  await flipScheduledNotices()
  await transitionExamStatuses()
  await ensureRun(`v1:invoices:${session.id}:${periodKeyOf()}`, async () => {
    const n = await generateInvoicesForPeriod(session)
    return `generated ${n} invoices`
  })
}
