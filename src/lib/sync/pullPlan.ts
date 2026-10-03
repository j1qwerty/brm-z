/**
 * Permission-aware pull plan.
 *
 * Firestore Security Rules are evaluated PER DOCUMENT, so a plain `list()` on a
 * collection whose rule reads `resource.data.something` is rejected with
 * "Missing or insufficient permissions" — the query can't be proven safe. That
 * is what used to fail the whole "pull communication" step.
 *
 * So for every collection we declare how it may be read for the current role:
 *   - plain      : `list()` is provably fine (rule only checks the role)
 *   - filtered   : `list(where [...])` whose filter guarantees the rule
 *   - per-parent : fan out one filtered query per parent doc (e.g. marks per
 *                  published exam, certificates per student)
 *   - skip       : this role may read it, but not via a list query (the UI
 *                  reads it scoped, e.g. one record at a time)
 */
import type { WhereOp } from '../data/provider'
import type { Role } from '../types'

export interface PullTarget {
  collection: string
  where?: [string, WhereOp, unknown][]
  /** Fan out: one query per value of this field across the given parent collection. */
  fanout?: { collection: string; whereField: string; values: (docs: Record<string, unknown>[]) => string[] }
}

export interface PullContext {
  role: Role
  uid: string
  /** studentId for the student role */
  studentId?: string
  /** staffId for teacher/staff roles */
  staffId?: string
  /** childIds for the parent role */
  childIds?: string[]
}

/** Collections every active user may list outright (role-only rules). */
const COMMON_ALL = ['sessions', 'classes', 'timetable', 'timetableConfig', 'gradingScales', 'calendarEvents', 'ptms', 'assignments']

export function buildPullPlan(ctx: PullContext): { targets: PullTarget[]; skipped: string[] } {
  const targets: PullTarget[] = []
  const skipped: string[] = []

  for (const c of COMMON_ALL) targets.push({ collection: c })

  switch (ctx.role) {
    case 'admin':
      targets.push(
        { collection: 'users' },
        { collection: 'students' },
        { collection: 'staff' },
        { collection: 'attendance' },
        { collection: 'notices' },
        { collection: 'leaves' },
        { collection: 'exams' },
        { collection: 'marks' },
        { collection: 'certificates' },
        { collection: 'templates' },
        { collection: 'feeTypes' },
        { collection: 'feeAssignments' },
        { collection: 'invoices' },
        { collection: 'payments' },
        { collection: 'documents' },
        { collection: 'messages' },
        { collection: 'notifications', where: [['userId', '==', ctx.uid]] },
      )
      break

    case 'teacher':
      targets.push(
        { collection: 'students' },
        { collection: 'staff' },
        // teachers may only read users whose status is active
        { collection: 'users', where: [['status', '==', 'active']] },
        { collection: 'attendance' },
        { collection: 'notices' },
        { collection: 'leaves' },
        { collection: 'exams' },
        { collection: 'marks' },
        { collection: 'documents', where: ctx.staffId ? [['ownerId', '==', ctx.staffId]] : [['ownerId', '==', '__none__']] },
        { collection: 'messages' },
        { collection: 'notifications', where: [['userId', '==', ctx.uid]] },
      )
      // fees/certificates/templates are admin/accountant territory
      skipped.push('feeTypes', 'feeAssignments', 'invoices', 'payments', 'certificates', 'templates')
      break

    case 'accountant':
      targets.push(
        { collection: 'attendance' },
        { collection: 'feeTypes' },
        { collection: 'feeAssignments' },
        { collection: 'invoices' },
        { collection: 'payments' },
        // accountant may only read receipt templates
        { collection: 'templates', where: [['kind', '==', 'receipt']] },
        { collection: 'notifications', where: [['userId', '==', ctx.uid]] },
      )
      skipped.push('users', 'students', 'staff', 'notices', 'leaves', 'exams', 'marks', 'certificates', 'messages', 'documents')
      break

    case 'staff':
      targets.push(
        { collection: 'students' },
        { collection: 'attendance', where: ctx.staffId ? [['personId', '==', ctx.staffId]] : [['personId', '==', '__none__']] },
        { collection: 'notices', where: [['status', '==', 'live']] },
        { collection: 'documents', where: ctx.staffId ? [['ownerId', '==', ctx.staffId]] : [['ownerId', '==', '__none__']] },
        { collection: 'notifications', where: [['userId', '==', ctx.uid]] },
      )
      skipped.push('users', 'staff', 'leaves', 'exams', 'marks', 'certificates', 'messages', 'feeTypes', 'feeAssignments', 'invoices', 'payments', 'templates')
      break

    case 'student': {
      const id = ctx.studentId
      targets.push(
        { collection: 'notices', where: [['status', '==', 'live']] },
        { collection: 'exams', where: [['status', '==', 'published']] },
        // marks are only visible when the parent exam is published -> fan out per exam
        {
          collection: 'marks',
          fanout: {
            collection: 'exams',
            whereField: 'id',
            values: (exams) =>
              exams
                .filter((e) => e.status === 'published')
                .flatMap((e) => (id ? [String(e.id)] : [])),
          },
        },
        { collection: 'invoices', where: id ? [['studentId', '==', id]] : [['studentId', '==', '__none__']] },
        { collection: 'payments', where: id ? [['studentId', '==', id]] : [['studentId', '==', '__none__']] },
        { collection: 'certificates', where: id ? [['studentId', '==', id]] : [['studentId', '==', '__none__']] },
        { collection: 'attendance', where: id ? [['personId', '==', id]] : [['personId', '==', '__none__']] },
        { collection: 'documents', where: id ? [['ownerId', '==', id]] : [['ownerId', '==', '__none__']] },
        { collection: 'messages' },
        { collection: 'notifications', where: [['userId', '==', ctx.uid]] },
      )
      skipped.push('users', 'staff', 'leaves', 'feeTypes', 'feeAssignments', 'templates')
      break
    }

    case 'parent': {
      const kids = ctx.childIds ?? []
      const inKids: [string, WhereOp, unknown][] = kids.length ? [['studentId', 'in', kids]] : [['studentId', '==', '__none__']]
      const ownerIn: [string, WhereOp, unknown][] = kids.length ? [['ownerId', 'in', kids]] : [['ownerId', '==', '__none__']]
      const personIn: [string, WhereOp, unknown][] = kids.length ? [['personId', 'in', kids]] : [['personId', '==', '__none__']]
      targets.push(
        { collection: 'notices', where: [['status', '==', 'live']] },
        { collection: 'exams', where: [['status', '==', 'published']] },
        {
          collection: 'marks',
          fanout: {
            collection: 'exams',
            whereField: 'id',
            values: (exams) => exams.filter((e) => e.status === 'published').map((e) => String(e.id)),
          },
        },
        { collection: 'invoices', where: inKids },
        { collection: 'payments', where: inKids },
        { collection: 'certificates', where: inKids },
        { collection: 'attendance', where: personIn },
        { collection: 'documents', where: ownerIn },
        { collection: 'messages' },
        { collection: 'notifications', where: [['userId', '==', ctx.uid]] },
      )
      skipped.push('users', 'staff', 'leaves', 'feeTypes', 'feeAssignments', 'templates')
      break
    }
  }

  return { targets, skipped: [...new Set(skipped)] }
}

/**
 * `messages` cannot be listed with a rule-proof filter (`threadId.split('_')`
 * contains the uid), so we learn the user's thread ids from their own messages
 * and then fetch each thread.
 */
export function messageThreadQuery(ctx: PullContext): { where: [string, WhereOp, unknown][] } {
  return { where: [['senderId', '==', ctx.uid]] }
}

/** Collections a plain `list()` is never safe for. Used by tests + docs. */
export const PER_DOCUMENT_ONLY = ['notifications', 'messages', 'documents', 'certificates', 'invoices', 'payments', 'attendance', 'marks']