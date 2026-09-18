import { useMemo } from 'react'
import { Link } from 'react-router'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer,
} from 'recharts'
import { CalendarCheck, ClipboardCheck, IndianRupee, TrendingUp, UserCheck, Users, FileWarning, Hourglass } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardContent, Avatar, Skeleton } from '@/components/ui/display'
import { useList } from '@/lib/data/hooks'
import { useAuth } from '@/lib/auth'
import { useWelcomeTour } from '@/components/shared/tour'
import type { AttendanceDoc, ClassDoc, FeeTypeDoc, InvoiceDoc, LeaveDoc, NoticeDoc, PaymentDoc, StaffDoc, StudentDoc, TimetableSlotDoc, UserDoc, ExamDoc, AssignmentDoc } from '@/lib/types'
import { inr, pct, todayStr, WEEKDAYS } from '@/lib/utils'

const CHART_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

function StatCard({ label, value, hint, icon, tone = 'default', to }: { label: string; value: string; hint?: string; icon: React.ReactNode; tone?: 'default' | 'success' | 'danger' | 'warning'; to?: string }) {
  const body = (
    <Card className="h-full transition-shadow hover:shadow-sm">
      <CardContent className="flex items-start gap-3 p-5">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
          tone === 'success' ? 'bg-success-soft text-success' : tone === 'danger' ? 'bg-danger-soft text-danger' : tone === 'warning' ? 'bg-warning-soft text-warning' : 'bg-primary-soft text-primary'
        }`}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="truncate text-xl font-bold tabular">{value}</p>
          {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  )
  return to ? <Link to={to} className="block">{body}</Link> : body
}

function AdminDashboard() {
  const { data: students } = useList<StudentDoc>('students')
  const { data: staff } = useList<StaffDoc>('staff')
  const { data: classes } = useList<ClassDoc>('classes')
  const { data: attendanceToday } = useList<AttendanceDoc>('attendance', { where: [['date', '==', todayStr()], ['personType', '==', 'student']] })
  const { data: invoices } = useList<InvoiceDoc>('invoices')
  const { data: payments } = useList<PaymentDoc>('payments')
  const { data: leaves } = useList<LeaveDoc>('leaves', { where: [['status', '==', 'pending']] })
  const { data: users } = useList<UserDoc>('users', { where: [['status', '==', 'pending']] })
  const { data: notices } = useList<NoticeDoc>('notices', { orderBy: ['publishAt', 'desc'], limit: 3 })
  const { data: feeTypes } = useList<FeeTypeDoc>('feeTypes')

  const activeStudents = (students ?? []).filter((s) => s.status === 'active')
  const attPct = useMemo(() => {
    const rs = attendanceToday ?? []
    const present = rs.filter((r) => ['present', 'late', 'half-day'].includes(r.status)).length
    return rs.length ? pct(present, rs.length) : null
  }, [attendanceToday])

  const collection = useMemo(() => {
    const billed = (invoices ?? []).reduce((a, i) => a + i.amount - (i.discount ?? 0), 0)
    const paid = (invoices ?? []).reduce((a, i) => a + (i.paidAmount ?? 0), 0)
    return { billed, paid, pctv: pct(paid, billed) }
  }, [invoices])

  const defaulters = useMemo(() => {
    const due = new Map<string, number>()
    for (const i of invoices ?? []) {
      if (i.status === 'paid' || i.status === 'waived') continue
      due.set(i.studentId, (due.get(i.studentId) ?? 0) + i.amount - (i.discount ?? 0) - (i.paidAmount ?? 0))
    }
    return due.size
  }, [invoices])

  const enrollmentData = useMemo(
    () =>
      (classes ?? []).map((c) => ({
        name: c.name.replace('Class ', ''),
        students: activeStudents.filter((s) => s.classId === c.id).length,
      })),
    [classes, activeStudents],
  )

  const monthlyCollection = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of payments ?? []) {
      const key = new Date(p.paidAt).toISOString().slice(0, 7)
      map.set(key, (map.get(key) ?? 0) + p.amount)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ month: k.slice(5) + '/' + k.slice(2, 4), amount: v }))
  }, [payments])

  const attDonut = useMemo(() => {
    const rs = attendanceToday ?? []
    const counts = { present: 0, absent: 0, late: 0, other: 0 }
    for (const r of rs) {
      if (r.status === 'present') counts.present++
      else if (r.status === 'absent') counts.absent++
      else if (r.status === 'late') counts.late++
      else counts.other++
    }
    return [
      { name: 'Present', value: counts.present },
      { name: 'Absent', value: counts.absent },
      { name: 'Late', value: counts.late },
      { name: 'Other', value: counts.other },
    ].filter((x) => x.value > 0)
  }, [attendanceToday])

  useWelcomeTour('admin', [
    { element: '[data-tour="stats"]', popover: { title: 'Your school at a glance', description: 'Live numbers for enrolment, attendance, fee collection and pending approvals.' } },
    { element: '[data-tour="charts"]', popover: { title: 'Trends', description: 'Enrolment by class, monthly collections and today\'s attendance split.' } },
    { element: '[data-tour="quick"]', popover: { title: 'Quick actions', description: 'Jump straight into the most common admin tasks.' } },
  ])

  if (students === undefined) return <Skeleton className="h-96 rounded-xl" />

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-tour="stats">
        <StatCard label="Active students" value={String(activeStudents.length)} hint={`${(classes ?? []).length} classes`} icon={<Users className="size-5" />} to="/people?tab=students" />
        <StatCard label="Staff" value={String((staff ?? []).length)} hint={`${(staff ?? []).filter((s) => s.staffType === 'teaching').length} teaching`} icon={<UserCheck className="size-5" />} to="/people?tab=teachers" />
        <StatCard
          label="Today's attendance"
          value={attPct === null ? 'not marked' : `${attPct}%`}
          hint={attPct === null ? 'Mark the register to see it here' : `${(attendanceToday ?? []).length} students`}
          icon={<CalendarCheck className="size-5" />}
          tone={attPct !== null && attPct < 75 ? 'danger' : 'success'}
          to="/attendance"
        />
        <StatCard
          label="Fee collection"
          value={`${collection.pctv}%`}
          hint={`${inr(collection.paid)} of ${inr(collection.billed)}`}
          icon={<IndianRupee className="size-5" />}
          tone={collection.pctv >= 80 ? 'success' : 'warning'}
          to="/fees?tab=invoices"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-tour="quick">
        <StatCard label="Fee defaulters" value={String(defaulters)} hint="students with outstanding dues" icon={<FileWarning className="size-5" />} tone={defaulters > 0 ? 'danger' : 'success'} to="/fees?tab=records" />
        <StatCard label="Pending approvals" value={String((users ?? []).length)} hint="user accounts awaiting approval" icon={<Hourglass className="size-5" />} tone={(users ?? []).length ? 'warning' : 'success'} to="/users" />
        <StatCard label="Pending leaves" value={String((leaves ?? []).length)} hint="awaiting decision" icon={<ClipboardCheck className="size-5" />} to="/leaves" />
        <StatCard label="Fee types" value={String((feeTypes ?? []).length)} hint="configured" icon={<IndianRupee className="size-5" />} to="/fees?tab=types" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3" data-tour="charts">
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <p className="mb-3 text-sm font-semibold">Monthly collection</p>
            {monthlyCollection.length === 0 ? (
              <EmptyState compact title="No collections yet" hint="Record a payment under Fees > Payments." />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={monthlyCollection}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickFormatter={(v: number) => `₹${Math.round(v / 1000)}k`} />
                  <RTooltip formatter={(v) => inr(Number(v))} contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="amount" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="mb-3 text-sm font-semibold">Today's attendance split</p>
            {attDonut.length === 0 ? (
              <EmptyState compact title="Attendance not marked today" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={attDonut} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                    {attDonut.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <RTooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="mb-3 text-sm font-semibold">Enrolment by class</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={enrollmentData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" allowDecimals={false} />
                <RTooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="students" radius={[6, 6, 0, 0]}>
                  {enrollmentData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <p className="text-sm font-semibold">Recent notices</p>
              <Link to="/notices" className="text-xs font-medium text-primary hover:underline">View all</Link>
            </div>
            {(notices ?? []).length === 0 ? (
              <EmptyState compact title="No notices yet" />
            ) : (
              <div className="divide-y divide-border/60">
                {(notices ?? []).map((n) => (
                  <div key={n.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{n.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{n.body}</p>
                    </div>
                    <Badge variant={n.status === 'live' ? 'success' : 'warning'}>{n.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function TeacherDashboard() {
  const { user } = useAuth()
  const { data: classes } = useList<ClassDoc>('classes')
  const { data: slots } = useList<TimetableSlotDoc>('timetable', { where: [['teacherId', '==', user?.staffId ?? 'none']] })
  const { data: students } = useList<StudentDoc>('students')
  const { data: leaves } = useList<LeaveDoc>('leaves', { where: [['status', '==', 'pending']] })
  const { data: exams } = useList<ExamDoc>('exams')
  const { data: assignments } = useList<AssignmentDoc>('assignments')

  const myClassTeacherOf = (classes ?? []).find((c) => c.classTeacherId === user?.staffId)
  const todayDow = new Date().getDay() === 0 ? 1 : new Date().getDay()
  const todaySlots = (slots ?? []).filter((s) => s.day === todayDow).sort((a, b) => a.periodNo - b.periodNo)
  const myStudents = myClassTeacherOf ? (students ?? []).filter((s) => s.classId === myClassTeacherOf.id && s.status === 'active') : []
  const evaluationExams = (exams ?? []).filter((e) => e.status === 'evaluation')

  useWelcomeTour('teacher', [
    { element: '[data-tour="t-today"]', popover: { title: 'Your day', description: 'Today\'s periods from the school timetable.' } },
    { element: '[data-tour="t-actions"]', popover: { title: 'Shortcuts', description: 'Attendance, marks entry and leave approvals one click away.' } },
  ])

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-tour="t-actions">
        <StatCard label="My class" value={myClassTeacherOf?.name ?? 'not assigned'} hint={myClassTeacherOf ? `${myStudents.length} students as class teacher` : 'Ask admin to assign'} icon={<Users className="size-5" />} to="/people?tab=students" />
        <StatCard label="Today's periods" value={String(todaySlots.length)} hint={WEEKDAYS[todayDow - 1]} icon={<CalendarCheck className="size-5" />} to="/timetable" />
        <StatCard label="Pending leaves" value={String((leaves ?? []).length)} hint="to approve" icon={<ClipboardCheck className="size-5" />} tone={(leaves ?? []).length ? 'warning' : 'success'} to="/leaves" />
        <StatCard label="Exams in evaluation" value={String(evaluationExams.length)} hint="marks entry open" icon={<TrendingUp className="size-5" />} to="/exams?tab=entry" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2" data-tour="t-today">
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <p className="text-sm font-semibold">Today's timetable</p>
              <Link to="/timetable" className="text-xs font-medium text-primary hover:underline">Full week</Link>
            </div>
            {todaySlots.length === 0 ? (
              <EmptyState compact title="No periods today" hint="Enjoy the breather - or check the full week." />
            ) : (
              <div className="divide-y divide-border/60">
                {todaySlots.map((s) => {
                  const cls = classes?.find((c) => c.id === s.classId)
                  const sub = (assignments ?? []).find((a) => a.subjectId === s.subjectId)
                  return (
                    <div key={s.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                      <Badge variant="neutral" className="tabular">P{s.periodNo}</Badge>
                      <span className="font-medium">{s.subjectId}</span>
                      <span className="text-xs text-muted-foreground">{cls?.name}-{s.section} {s.roomId ? `· ${s.roomId}` : ''}</span>
                      {sub && <Badge variant="outline" className="ml-auto">{sub.subjectId}</Badge>}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <p className="text-sm font-semibold">My class students</p>
              {myClassTeacherOf && <Link to="/attendance" className="text-xs font-medium text-primary hover:underline">Mark attendance</Link>}
            </div>
            {myStudents.length === 0 ? (
              <EmptyState compact title="No class-teacher assignment" hint="The admin assigns class teachers under Classes & Subjects." />
            ) : (
              <div className="max-h-72 divide-y divide-border/60 overflow-y-auto">
                {myStudents.slice(0, 8).map((s) => (
                  <Link key={s.id} to={`/people/${s.id}?kind=student`} className="flex items-center gap-3 px-5 py-2 text-sm hover:bg-muted/40">
                    <Avatar src={s.photoUrl} name={s.name} size={26} />
                    <span className="font-medium">{s.name}</span>
                    <span className="ml-auto text-xs tabular text-muted-foreground">Roll {s.rollNo ?? '-'}</span>
                  </Link>
                ))}
                {myStudents.length > 8 && (
                  <p className="px-5 py-2 text-center text-xs text-muted-foreground">+ {myStudents.length - 8} more</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function SimpleDashboard({ role }: { role: string }) {
  const { user } = useAuth()
  useWelcomeTour(role, [
    { element: '[data-tour="s-main"]', popover: { title: 'Welcome to BMRC', description: 'Your work areas are in the sidebar. Start with the portal for everything about you.' } },
  ])
  return (
    <div data-tour="s-main" className="space-y-5">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-6">
          <Avatar src={user?.photoUrl} name={user?.name ?? ''} size={56} />
          <div className="flex-1">
            <p className="text-lg font-bold">Welcome, {user?.name?.split(' ')[0]}</p>
            <p className="text-sm text-muted-foreground">Your {role} workspace is ready. Use the sidebar to move around, or Ctrl K to search.</p>
          </div>
          <Link to="/portal"><Button>Open my portal</Button></Link>
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="My leaves" value="history & apply" icon={<ClipboardCheck className="size-5" />} to="/leaves" />
        <StatCard label="Notices" value="school board" icon={<CalendarCheck className="size-5" />} to="/notices" />
        <StatCard label="Calendar" value="events & holidays" icon={<TrendingUp className="size-5" />} to="/calendar" />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  if (!user) return null
  const role = user.role

  return (
    <div>
      <PageHeader
        title="Dashboard"
        info={
          role === 'admin'
            ? 'Live school overview: enrolment, attendance, fee collection health and pending approvals. Numbers update as staff work.'
            : role === 'teacher'
              ? 'Your teaching day: today\'s periods, your class, pending approvals and marks entry shortcuts.'
              : 'Your personal workspace.'
        }
      />
      {role === 'admin' ? <AdminDashboard /> : role === 'teacher' ? <TeacherDashboard /> : <SimpleDashboard role={role} />}
    </div>
  )
}
