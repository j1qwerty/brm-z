import type { Role } from './types'

// Access matrix from spec section 3. One source of truth for sidebar, tabs, and guards.
// Server-side enforcement lives in firestore.rules; this mirrors it for the UI.
export type Capability =
  | 'users.manage'
  | 'settings.manage'
  | 'trash.manage'
  | 'sessions.manage'
  | 'classes.manage'
  | 'people.manage'
  | 'people.read'
  | 'attendance.mark'
  | 'attendance.reports'
  | 'leaves.approve'
  | 'leaves.apply'
  | 'timetable.edit'
  | 'fees.manage'
  | 'exams.manage'
  | 'marks.enter'
  | 'results.publish'
  | 'templates.manage'
  | 'certificates.manage'
  | 'notices.create'
  | 'calendar.manage'
  | 'ptm.create'
  | 'messages.use'
  | 'portal.use'
  | 'reports.view'

const MATRIX: Record<Capability, Role[]> = {
  'users.manage': ['admin'],
  'settings.manage': ['admin'],
  'trash.manage': ['admin'],
  'sessions.manage': ['admin'],
  'classes.manage': ['admin'],
  'people.manage': ['admin'],
  'people.read': ['admin', 'teacher', 'accountant', 'staff'],
  'attendance.mark': ['admin', 'teacher'],
  'attendance.reports': ['admin', 'teacher'],
  'leaves.approve': ['admin', 'teacher'],
  'leaves.apply': ['teacher', 'staff', 'student', 'parent'],
  'timetable.edit': ['admin'],
  'fees.manage': ['admin', 'accountant'],
  'exams.manage': ['admin'],
  'marks.enter': ['admin', 'teacher'],
  'results.publish': ['admin'],
  'templates.manage': ['admin'],
  'certificates.manage': ['admin'],
  'notices.create': ['admin', 'teacher'],
  'calendar.manage': ['admin'],
  'ptm.create': ['admin', 'teacher'],
  'messages.use': ['teacher', 'parent'],
  'portal.use': ['student', 'parent'],
  'reports.view': ['admin', 'teacher', 'accountant'],
}

export function can(role: Role | undefined | null, capability: Capability): boolean {
  if (!role) return false
  return MATRIX[capability]?.includes(role) ?? false
}

export const ROLE_HOME: Record<Role, string> = {
  admin: '/dashboard',
  teacher: '/dashboard',
  accountant: '/dashboard',
  staff: '/dashboard',
  student: '/portal',
  parent: '/portal',
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  teacher: 'Teacher',
  accountant: 'Accountant',
  staff: 'Staff',
  student: 'Student',
  parent: 'Parent',
}
