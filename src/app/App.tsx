import { lazy, useEffect } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { Providers } from './providers'
import { RequireAuth, RequireCapability, PendingScreen, NotFound } from './guards'
import { AppShell } from './AppShell'
import { useAuth } from '@/lib/auth'
import { ROLE_HOME } from '@/lib/permissions'
import type { Capability } from '@/lib/permissions'

// Feature pages are code-split so the first paint stays fast
const LoginPage = lazy(() => import('@/features/auth/LoginPage'))
const SignupPage = lazy(() => import('@/features/auth/SignupPage'))
const CompleteProfilePage = lazy(() => import('@/features/auth/CompleteProfilePage'))
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'))
const UsersPage = lazy(() => import('@/features/users/UsersPage'))
const SessionsPage = lazy(() => import('@/features/sessions/SessionsPage'))
const ClassesPage = lazy(() => import('@/features/classes/ClassesPage'))
const PeoplePage = lazy(() => import('@/features/people/PeoplePage'))
const PersonProfilePage = lazy(() => import('@/features/people/PersonProfilePage'))
const AttendancePage = lazy(() => import('@/features/attendance/AttendancePage'))
const LeavesPage = lazy(() => import('@/features/leaves/LeavesPage'))
const TimetablePage = lazy(() => import('@/features/timetable/TimetablePage'))
const FeesPage = lazy(() => import('@/features/fees/FeesPage'))
const ExamsPage = lazy(() => import('@/features/exams/ExamsPage'))
const CertificatesPage = lazy(() => import('@/features/certificates/CertificatesPage'))
const TemplatesPage = lazy(() => import('@/features/templates/TemplatesPage'))
const NoticesPage = lazy(() => import('@/features/notices/NoticesPage'))
const PtmPage = lazy(() => import('@/features/ptm/PtmPage'))
const MessagesPage = lazy(() => import('@/features/messages/MessagesPage'))
const PortalPage = lazy(() => import('@/features/portal/PortalPage'))
const CalendarPage = lazy(() => import('@/features/calendar/CalendarPage'))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'))
const TrashPage = lazy(() => import('@/features/trash/TrashPage'))
const ContactsToolPage = lazy(() => import('@/features/tools/ContactsToolPage'))

function RoleRedirect() {
  const { user, status } = useAuth()
  useEffect(() => {
    if (status === 'active' && user) document.title = 'BMRC School Management'
  }, [user, status])
  if (status !== 'active' || !user) return <Navigate to="/login" replace />
  return <Navigate to={ROLE_HOME[user.role]} replace />
}

function guard(capability: Capability, element: React.ReactNode) {
  return <RequireCapability capability={capability}>{element}</RequireCapability>
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  { path: '/complete-profile', element: <CompleteProfilePage /> },
  { path: '/pending', element: <PendingScreen /> },
  {
    element: <RequireAuth />,
    children: [
      { element: <AppShell />, children: [
        { path: '/', element: <RoleRedirect /> },
        { path: '/dashboard', element: <DashboardPage /> },
        { path: '/users', element: guard('users.manage', <UsersPage />) },
        { path: '/sessions', element: guard('sessions.manage', <SessionsPage />) },
        { path: '/classes', element: guard('classes.manage', <ClassesPage />) },
        { path: '/people', element: <PeoplePage /> },
        { path: '/people/:id', element: <PersonProfilePage /> },
        { path: '/attendance', element: <AttendancePage /> },
        { path: '/leaves', element: <LeavesPage /> },
        { path: '/timetable', element: <TimetablePage /> },
        { path: '/fees', element: guard('fees.manage', <FeesPage />) },
        { path: '/exams', element: <ExamsPage /> },
        { path: '/certificates', element: guard('certificates.manage', <CertificatesPage />) },
        { path: '/templates', element: guard('templates.manage', <TemplatesPage />) },
        { path: '/notices', element: <NoticesPage /> },
        { path: '/ptm', element: <PtmPage /> },
        { path: '/messages', element: guard('messages.use', <MessagesPage />) },
        { path: '/portal', element: guard('portal.use', <PortalPage />) },
        { path: '/calendar', element: <CalendarPage /> },
        { path: '/settings', element: guard('settings.manage', <SettingsPage />) },
        { path: '/trash', element: guard('trash.manage', <TrashPage />) },
        { path: '/tools/contacts', element: guard('people.manage', <ContactsToolPage />) },
        { path: '*', element: <NotFound /> },
      ] },
    ],
  },
])

export default function App() {
  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  )
}
