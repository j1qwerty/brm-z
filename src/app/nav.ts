import {
  LayoutDashboard, GraduationCap, Clock, ClipboardCheck, Users, UserCog, CalendarOff,
  IndianRupee, Megaphone, MessagesSquare, MessageCircle, FileBadge, LayoutTemplate,
  Trash2, Settings, Contact, CalendarDays, BookOpen, UserRound, ShieldCheck,
} from 'lucide-react'
import { can, type Capability } from '@/lib/permissions'
import type { Role } from '@/lib/types'

export interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  capability: Capability
  keywords?: string
}

export interface NavSection {
  title: string
  items: NavItem[]
}

export const NAV: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, capability: 'reports.view', keywords: 'home stats charts' },
      { to: '/portal', label: 'My Portal', icon: UserRound, capability: 'portal.use', keywords: 'parent student child' },
    ],
  },
  {
    title: 'Academics',
    items: [
      { to: '/sessions', label: 'Sessions', icon: BookOpen, capability: 'sessions.manage', keywords: 'year promotion academic' },
      { to: '/classes', label: 'Classes & Subjects', icon: GraduationCap, capability: 'classes.manage', keywords: 'sections subjects teacher assignment' },
      { to: '/timetable', label: 'Timetable', icon: Clock, capability: 'reports.view', keywords: 'periods weekly schedule' },
      { to: '/attendance', label: 'Attendance', icon: ClipboardCheck, capability: 'reports.view', keywords: 'register present absent' },
      { to: '/calendar', label: 'Calendar', icon: CalendarDays, capability: 'reports.view', keywords: 'holidays events' },
    ],
  },
  {
    title: 'People',
    items: [
      { to: '/people', label: 'People', icon: Users, capability: 'people.read', keywords: 'students teachers staff parents' },
      { to: '/users', label: 'User Accounts', icon: UserCog, capability: 'users.manage', keywords: 'approve roles suspend' },
      { to: '/leaves', label: 'Leaves', icon: CalendarOff, capability: 'reports.view', keywords: 'apply approve sick casual' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { to: '/fees', label: 'Fees', icon: IndianRupee, capability: 'fees.manage', keywords: 'invoices payments receipts defaulters' },
    ],
  },
  {
    title: 'Communication',
    items: [
      { to: '/notices', label: 'Notices', icon: Megaphone, capability: 'reports.view', keywords: 'announcements pinned' },
      { to: '/ptm', label: 'PTM', icon: MessagesSquare, capability: 'reports.view', keywords: 'parent teacher meeting slots' },
      { to: '/messages', label: 'Messages', icon: MessageCircle, capability: 'messages.use', keywords: 'chat threads' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/exams', label: 'Exams & Results', icon: FileBadge, capability: 'reports.view', keywords: 'marks report cards publish' },
      { to: '/certificates', label: 'Certificates', icon: FileBadge, capability: 'certificates.manage', keywords: 'tc bonafide character' },
      { to: '/templates', label: 'Templates', icon: LayoutTemplate, capability: 'templates.manage', keywords: 'id card receipt designer' },
      { to: '/tools/contacts', label: 'Bulk Contacts', icon: Contact, capability: 'people.manage', keywords: 'sms whatsapp email list' },
      { to: '/trash', label: 'Trash', icon: Trash2, capability: 'trash.manage', keywords: 'restore deleted' },
      { to: '/settings', label: 'School Settings', icon: Settings, capability: 'settings.manage', keywords: 'profile grading theme' },
    ],
  },
]

export function navForRole(role: Role | undefined): NavSection[] {
  if (!role) return []
  return NAV.map((s) => ({ ...s, items: s.items.filter((i) => can(role, i.capability)) })).filter(
    (s) => s.items.length > 0,
  )
}

export const ALL_NAV_ITEMS = NAV.flatMap((s) => s.items)

export { ShieldCheck }
