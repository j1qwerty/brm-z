import { dataProvider } from './data/index'
import { periodKeyOf } from './utils'
import type { ExamDoc, FeeAssignmentDoc, FeeTypeDoc, NoticeDoc, SessionDoc, StudentDoc } from './types'

/**
 * Generate-on-open scheduler (spec: idempotent, versioned, run-once-per-period,
 * no Cloud Functions). Safe to run on every app open by any signed-in user:
 *  - notice flip + exam transitions are naturally idempotent (guarded by state)
 *  - invoice generation is gated by a runHistory key per session+period and uses
 *    deterministic document ids, so repeated runs can never duplicate invoices.
 */

const runId = (key: string) => key

async function ensureRun(key: string, fn: () => Promise<string>): Promise<void> {
  try {
    const existing = await dataProvider.get('runHistory', runId(key))
    if (existing) return
  } catch {
    // continue on read failure; creation below is the gate
  }
  try {
    const result = await fn()
    await dataProvider.create('runHistory', { ranAt: Date.now(), result }, runId(key))
  } catch (e) {
    // Two admins racing: one create wins, the loser's key already exists. Harmless.
    console.warn(`generate-on-open run "${key}" skipped/failed:`, e)
  }
}

/** Scheduled notices flip to live when their publish time arrives. */
export async function flipScheduledNotices(): Promise<number> {
  const notices = await dataProvider.list<NoticeDoc>('notices', { where: [['status', '==', 'scheduled']] })
  const now = Date.now()
  const due = notices.filter((n) => n.publishAt <= now)
  await Promise.all(due.map((n) => dataProvider.update('notices', n.id, { status: 'live' })))
  return due.length
}

/** Exams move forward automatically based on their schedule dates; publish stays manual. */
export async function transitionExamStatuses(): Promise<number> {
  const exams = await dataProvider.list<ExamDoc>('exams')
  const today = new Date().toISOString().slice(0, 10)
  let changed = 0
  for (const ex of exams) {
    if (ex.status === 'scheduled' && ex.startDate && ex.startDate <= today && (!ex.endDate || ex.endDate >= today)) {
      await dataProvider.update('exams', ex.id, { status: 'ongoing' })
      changed++
    } else if ((ex.status === 'scheduled' || ex.status === 'ongoing') && ex.endDate && ex.endDate < today) {
      await dataProvider.update('exams', ex.id, { status: 'evaluation' })
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

/** Create period invoices for the active session. Deterministic ids guarantee no duplicates. */
export async function generateInvoicesForPeriod(
  session: SessionDoc,
  current: Date = new Date(),
): Promise<number> {
  const periodKey = periodKeyOf(current)
  const month = current.getMonth() + 1
  const year = current.getFullYear()

  const [feeTypes, assignments, students] = await Promise.all([
    dataProvider.list<FeeTypeDoc>('feeTypes'),
    dataProvider.list<FeeAssignmentDoc>('feeAssignments', { where: [['sessionId', '==', session.id]] }),
    dataProvider.list<StudentDoc>('students', { where: [['status', '==', 'active']] }),
  ])
  if (!assignments.length || !students.length) return 0

  const ops: { id: string; data: Record<string, unknown> }[] = []
  const dueDate = `${periodKey}-10`

  for (const fa of assignments) {
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
      ops.push({
        id: `${student.id}_${fa.feeTypeId}_${periodSuffix}`,
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
  if (ops.length) await dataProvider.bulkWrite('invoices', ops)
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
