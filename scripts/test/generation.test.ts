/**
 * Invoice generation + scheduled-notice flip suite.
 *
 * Covers the new idempotent generation semantics introduced with the scoped
 * "Custom generate" dialog (scripts/test/run.ts runs this in-memory):
 *   - monthly / yearly / one-time frequency mapping onto a period month
 *   - deterministic ids, re-runs create nothing and never reset paid amounts
 *   - scoping by feeTypeId and by studentIds
 *   - class vs single-student fee assignments
 *   - flipScheduledNotices flips due notices to live AND notifies the audience
 */
import type { SuiteContext, AssertAPI, TestResult } from './harness'
import { runSuite } from './harness'
import { generateInvoicesForPeriod, flipScheduledNotices } from '../../src/lib/generate-on-open'
import type { FeeAssignmentDoc, FeeTypeDoc, InvoiceDoc, NoticeDoc, NotificationDoc, SessionDoc, StudentDoc, UserDoc } from '../../src/lib/types'

const SESS = { name: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31', isActive: true, isCompleted: false }

async function seedSchool(ctx: SuiteContext) {
  const p = ctx.provider
  ctx.resetDb()
  await p.create('sessions', SESS, 'sess-gen')
  await p.create('feeTypes', { name: 'Tuition', frequency: 'monthly', defaultAmount: 2500, refundable: false }, 'ft-tuition')
  await p.create('feeTypes', { name: 'Annual', frequency: 'yearly', defaultAmount: 3500, refundable: false }, 'ft-annual')
  await p.create('feeTypes', { name: 'Admission', frequency: 'one-time', defaultAmount: 8000, refundable: false }, 'ft-admission')
  await p.create('feeAssignments', { sessionId: 'sess-gen', feeTypeId: 'ft-tuition', targetType: 'class', targetId: 'c-gen-5', amount: 2500 }, 'fa-tuition-5')
  await p.create('students', { name: 'Gen One', gender: 'male', classId: 'c-gen-5', section: 'A', admissionNo: 'GEN-1', status: 'active' }, 'stu-gen-1')
  await p.create('students', { name: 'Gen Two', gender: 'female', classId: 'c-gen-5', section: 'A', admissionNo: 'GEN-2', status: 'active' }, 'stu-gen-2')
  await p.create('students', { name: 'Gen Other', gender: 'male', classId: 'c-gen-1', section: 'A', admissionNo: 'GEN-3', status: 'active' }, 'stu-gen-3')
  const session = await p.get<SessionDoc>('sessions', 'sess-gen')
  return session!
}

export function generationSuite() {
  return {
    name: 'Generation (invoices + notice flip)',
    run: async (ctx: SuiteContext, results: TestResult[]) => {
      const p = ctx.provider
      ctx.resetDb()

      const tests = [
        {
          name: 'monthly run bills only assigned targets (2 invoices)',
          run: async (t: AssertAPI) => {
            const session = await seedSchool(ctx)
            const n = await generateInvoicesForPeriod(session, new Date(2026, 7, 10), undefined, p as never)
            t.equals(n, 2, 'only the 2 class-assigned tuition invoices (annual/admission unassigned)')
            const inv = await p.get<InvoiceDoc>('invoices', 'stu-gen-1_ft-tuition_2026-08')
            t.notNil(inv, 'deterministic id student_feeType_period exists')
            t.equals(inv!.status, 'unpaid', 'new invoices start unpaid')
            t.equals(inv!.sessionId, 'sess-gen', 'invoice carries the scoped session')
          },
        },
        {
          name: 're-run creates nothing and never resets paid amounts',
          run: async (t: AssertAPI) => {
            const session = await seedSchool(ctx)
            await generateInvoicesForPeriod(session, new Date(2026, 7, 10), undefined, p as never)
            await p.update('invoices', 'stu-gen-1_ft-tuition_2026-08', { paidAmount: 2500, status: 'paid' })
            const n = await generateInvoicesForPeriod(session, new Date(2026, 7, 10), undefined, p as never)
            t.equals(n, 0, 'second run creates nothing new')
            const inv = await p.get<InvoiceDoc>('invoices', 'stu-gen-1_ft-tuition_2026-08')
            t.equals(inv!.paidAmount, 2500, 'paid amount preserved (the collection-money bug)')
            t.equals(inv!.status, 'paid', 'status preserved')
          },
        },
        {
          name: 'scoped run by feeTypeId bills only that type',
          run: async (t: AssertAPI) => {
            const session = await seedSchool(ctx)
            await p.create('feeAssignments', { sessionId: 'sess-gen', feeTypeId: 'ft-annual', targetType: 'class', targetId: 'c-gen-5', amount: 3500 }, 'fa-annual-5')
            const n = await generateInvoicesForPeriod(session, new Date(2026, 3, 10), { feeTypeId: 'ft-annual' }, p as never)
            t.equals(n, 2, 'annual x2 in April, tuition untouched')
            const all = await p.list<InvoiceDoc>('invoices')
            t.truthy(all.every((i) => i.feeTypeId === 'ft-annual'), 'no tuition invoices created')
          },
        },
        {
          name: 'scoped run by studentIds bills only picked students',
          run: async (t: AssertAPI) => {
            const session = await seedSchool(ctx)
            const n = await generateInvoicesForPeriod(session, new Date(2026, 7, 10), { studentIds: ['stu-gen-2'] }, p as never)
            t.equals(n, 1, 'one invoice for the picked student')
            const inv = await p.get<InvoiceDoc>('invoices', 'stu-gen-2_ft-tuition_2026-08')
            t.notNil(inv, 'picked student invoiced')
          },
        },
        {
          name: 'yearly bills in April only, one-time always bills',
          run: async (t: AssertAPI) => {
            const session = await seedSchool(ctx)
            await p.create('feeAssignments', { sessionId: 'sess-gen', feeTypeId: 'ft-annual', targetType: 'class', targetId: 'c-gen-5', amount: 3500 }, 'fa-annual-5')
            await p.create('feeAssignments', { sessionId: 'sess-gen', feeTypeId: 'ft-admission', targetType: 'student', targetId: 'stu-gen-1', amount: 8000 }, 'fa-adm-1')
            const may = await generateInvoicesForPeriod(session, new Date(2026, 4, 10), undefined, p as never)
            t.equals(may, 3, 'May: tuition x2 + one-time x1, yearly skipped')
            const ot = await p.get<InvoiceDoc>('invoices', 'stu-gen-1_ft-admission_2026-OT')
            t.notNil(ot, 'one-time uses YEAR-OT suffix')
            const apr = await generateInvoicesForPeriod(session, new Date(2026, 3, 10), { feeTypeId: 'ft-annual' }, p as never)
            t.equals(apr, 2, 'April: yearly x2')
            const y = await p.get<InvoiceDoc>('invoices', 'stu-gen-1_ft-annual_2026-Y')
            t.notNil(y, 'yearly uses YEAR-Y suffix')
          },
        },
        {
          name: 'single-student assignment bills only that student',
          run: async (t: AssertAPI) => {
            const session = await seedSchool(ctx)
            await p.create('feeAssignments', { sessionId: 'sess-gen', feeTypeId: 'ft-admission', targetType: 'student', targetId: 'stu-gen-1', amount: 8000 }, 'fa-adm-1')
            const n = await generateInvoicesForPeriod(session, new Date(2026, 7, 10), { feeTypeId: 'ft-admission' }, p as never)
            t.equals(n, 1, 'only the targeted student billed')
          },
        },
        {
          name: 'flipScheduledNotices flips due notices live and notifies the audience',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            await p.create('users', { name: 'Notify Parent', email: 'np@example.com', role: 'parent', status: 'active' }, 'u-notify-1')
            await p.create('notices', {
              title: 'Due notice', body: 'This notice is due and should flip to live for everyone.',
              audience: { type: 'all', value: [] }, publishAt: Date.now() - 1000, status: 'scheduled',
              isPinned: false, createdBy: 'u-admin', attachmentsUrl: [],
            }, 'notice-due')
            await p.create('notices', {
              title: 'Future notice', body: 'This one stays scheduled until its time comes around.',
              audience: { type: 'all', value: [] }, publishAt: Date.now() + 86400000, status: 'scheduled',
              isPinned: false, createdBy: 'u-admin', attachmentsUrl: [],
            }, 'notice-future')
            const flipped = await flipScheduledNotices(p as never)
            t.equals(flipped, 1, 'only the due notice flips')
            const due = await p.get<NoticeDoc>('notices', 'notice-due')
            t.equals(due!.status, 'live', 'due notice is live')
            const future = await p.get<NoticeDoc>('notices', 'notice-future')
            t.equals(future!.status, 'scheduled', 'future notice stays scheduled')
            const notifs = await p.list<NotificationDoc>('notifications', { where: [['userId', '==', 'u-notify-1']] })
            t.equals(notifs.length, 1, 'active user notified on the flip')
            t.equals(notifs[0].title, 'Due notice', 'notification carries the notice title')
          },
        },
      ]

      console.log(`\n${'Generation'.toUpperCase()} suite`)
      await runSuite('Generation', ctx, tests, results)
    },
  }
}

export type { FeeAssignmentDoc, FeeTypeDoc, SessionDoc, StudentDoc }
