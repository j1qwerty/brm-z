import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/lib/auth'
import { useList } from '@/lib/data/hooks'
import { PageHeader, InfoTip } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardContent, Progress, Separator, Skeleton } from '@/components/ui/display'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { AttendanceDoc, CalendarEventDoc, ClassDoc, ExamDoc, InvoiceDoc, MarkDoc, NoticeDoc, PtmDoc, StudentDoc, TimetableSlotDoc } from '@/lib/types'
import { fmtDate, inr, pct, WEEKDAYS } from '@/lib/utils'


export default function PortalPage() {
  const { user } = useAuth()
  const isParent = user?.role === 'parent'

  const { data: students } = useList<StudentDoc>('students', undefined, { enabled: Boolean(user) })
  const { data: classes } = useList<ClassDoc>('classes')
  const myChildren = useMemo(() => (students ?? []).filter((s) => (isParent ? user?.childIds?.includes(s.id) : s.id === user?.studentId)), [students, user, isParent])
  const [childOverride, setChildOverride] = useState<string | null>(null)
  const child = myChildren.find((c) => c.id === childOverride) ?? myChildren[0]

  const { data: attendance } = useList<AttendanceDoc>('attendance', child ? { where: [['personType', '==', 'student'], ['personId', '==', child.id]] } : undefined, { enabled: Boolean(child) })
  const { data: invoices } = useList<InvoiceDoc>('invoices', child ? { where: [['studentId', '==', child.id]] } : undefined, { enabled: Boolean(child) })
  const { data: exams } = useList<ExamDoc>('exams', { where: [['status', '==', 'published']] })
  const { data: marks } = useList<MarkDoc>('marks', child ? { where: [['studentId', '==', child.id]] } : undefined, { enabled: Boolean(child) })
  const { data: notices } = useList<NoticeDoc>('notices', { orderBy: ['publishAt', 'desc'], limit: 4 })
  const { data: ptms } = useList<PtmDoc>('ptms', undefined, { enabled: isParent })
  const { data: events } = useList<CalendarEventDoc>('calendarEvents', { orderBy: ['date', 'asc'], limit: 5 })
  const { data: slots } = useList<TimetableSlotDoc>('timetable', child ? { where: [['classId', '==', child.classId], ['section', '==', child.section]] } : undefined, { enabled: Boolean(child) })

  const attendancePct = useMemo(() => {
    const rs = attendance ?? []
    const present = rs.filter((r) => ['present', 'late', 'half-day'].includes(r.status)).length
    return pct(present, rs.length)
  }, [attendance])

  const feeSummary = useMemo(() => {
    const inv = invoices ?? []
    const billed = inv.reduce((a, i) => a + i.amount - (i.discount ?? 0), 0)
    const paid = inv.reduce((a, i) => a + (i.paidAmount ?? 0), 0)
    return { billed, paid, due: billed - paid }
  }, [invoices])

  const latestExam = exams?.[exams.length - 1]
  const examMarks = useMemo(
    () => (marks ?? []).filter((m) => latestExam && m.examId === latestExam.id),
    [marks, latestExam],
  )

  const upcomingPtm = (ptms ?? []).find((p) => p.classId === child?.classId && p.date >= new Date().toISOString().slice(0, 10))
  const cls = classes?.find((c) => c.id === child?.classId)
  const todayDow = new Date().getDay()
  const todaySlots = (slots ?? []).filter((s) => s.day === (todayDow === 0 ? 1 : todayDow)).sort((a, b) => a.periodNo - b.periodNo)

  if (!myChildren.length && students !== undefined) {
    return (
      <EmptyState
        title={isParent ? 'No children linked yet' : 'Student profile not linked'}
        hint={isParent ? 'The school office links children to parent accounts. Ask them to link yours in People > Parents.' : 'Your user account is not linked to a student record yet. Ask the office to set it up.'}
      />
    )
  }

  return (
    <div>
      <PageHeader
        title={isParent ? 'Parent Portal' : 'Student Portal'}
        info="Everything about your child in one place: attendance, published marks, fees with receipts, timetable, notices and PTM booking."
        actions={
          myChildren.length > 1 ? (
            <Select value={child?.id} onValueChange={setChildOverride}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Child" /></SelectTrigger>
              <SelectContent>
                {myChildren.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : undefined
        }
      />

      {!child ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : (
        <div className="space-y-5">
          {/* child header */}
          <Card>
            <CardContent className="flex flex-wrap items-center gap-4 p-5">
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold">{child.name}</p>
                <p className="text-sm text-muted-foreground">
                  {cls?.name}-{child.section} · Roll {child.rollNo ?? '-'} · {child.admissionNo}
                </p>
              </div>
              <Link to="/ptm"><Button variant="outline" size="sm">Book PTM slot</Button></Link>
              {isParent && <Link to="/leaves"><Button variant="outline" size="sm">Apply leave</Button></Link>}
              <Link to="/messages"><Button size="sm">Message class teacher</Button></Link>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            {/* attendance */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-semibold">Attendance</p>
                  <span className={`text-2xl font-bold tabular ${attendancePct >= 75 ? 'text-success' : 'text-danger'}`}>{attendancePct}%</span>
                </div>
                <Progress className="mt-2" value={attendancePct} barColor={attendancePct >= 75 ? 'bg-success' : 'bg-danger'} />
                <p className="mt-2 text-xs text-muted-foreground">{attendancePct >= 75 ? 'Meets the 75% requirement' : 'Below 75% - please ensure regular attendance'}</p>
              </CardContent>
            </Card>
            {/* fees */}
            <Card>
              <CardContent className="p-5">
                <p className="text-sm font-semibold">Fees</p>
                <p className="mt-1 flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">Outstanding</span>
                  <span className={`text-xl font-bold tabular ${feeSummary.due > 0 ? 'text-danger' : 'text-success'}`}>{inr(feeSummary.due)}</span>
                </p>
                <Separator className="my-2.5" />
                <p className="flex justify-between text-xs text-muted-foreground"><span>Paid to date</span><span className="tabular">{inr(feeSummary.paid)}</span></p>
              </CardContent>
            </Card>
            {/* latest result */}
            <Card>
              <CardContent className="p-5">
                <p className="text-sm font-semibold">Latest result</p>
                {latestExam ? (
                  <>
                    <p className="mt-1 text-xs text-muted-foreground">{latestExam.name}</p>
                    <div className="mt-2 space-y-1">
                      {examMarks.slice(0, 3).map((m) => (
                        <p key={m.id} className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{m.subjectId}</span>
                          <span className="tabular font-medium">{m.marks ?? '-'}/{m.maxMarks} · {m.grade}</span>
                        </p>
                      ))}
                      {examMarks.length === 0 && <p className="text-xs text-muted-foreground">Marks not entered yet.</p>}
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">No results published yet.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* today timetable */}
            <Card>
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <p className="text-sm font-semibold">Today's timetable</p>
                  <InfoTip title="Timetable">Period-wise schedule for {child.name}'s class. Days without periods mean holidays.</InfoTip>
                </div>
                {todaySlots.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">No periods today.</p>
                ) : (
                  <div className="divide-y divide-border/60">
                    {todaySlots.map((s) => (
                      <div key={s.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                        <Badge variant="neutral" className="tabular">P{s.periodNo}</Badge>
                        <span className="font-medium">{s.subjectId}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{WEEKDAYS[s.day - 1]}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            {/* notices + events */}
            <Card>
              <CardContent className="p-0">
                <div className="border-b border-border px-4 py-3 text-sm font-semibold">School notices & events</div>
                <div className="divide-y divide-border/60">
                  {(notices ?? []).slice(0, 2).map((n) => (
                    <div key={n.id} className="px-4 py-2.5">
                      <p className="text-sm font-medium">{n.title}</p>
                      <p className="line-clamp-1 text-xs text-muted-foreground">{n.body}</p>
                    </div>
                  ))}
                  {(events ?? []).slice(0, 2).map((e) => (
                    <div key={e.id} className="flex items-center gap-2 px-4 py-2.5">
                      <Badge variant={e.type === 'holiday' ? 'success' : e.type === 'exam' ? 'danger' : 'default'}>{e.type}</Badge>
                      <span className="text-sm">{e.title}</span>
                      <span className="ml-auto text-xs tabular text-muted-foreground">{fmtDate(e.date)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {upcomingPtm && (
            <Card className="border-primary/30">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div>
                  <p className="font-semibold">PTM on {fmtDate(upcomingPtm.date)}</p>
                  <p className="text-xs text-muted-foreground">Book your slot for {child.name}</p>
                </div>
                <Link to="/ptm"><Button size="sm">Book now</Button></Link>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
