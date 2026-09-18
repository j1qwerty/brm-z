import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CalendarCheck, CheckCheck, Users } from 'lucide-react'
import { TabbedModule } from '@/components/shared/TabbedModule'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, Badge, Avatar, Skeleton } from '@/components/ui/display'
import { Input, Label } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useList, useBulkWrite } from '@/lib/data/hooks'
import { useAuth } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { notify } from '@/lib/notify'
import type { AttendanceDoc, AttendanceStatus, ClassDoc, StaffDoc, StudentDoc } from '@/lib/types'
import { cn, downloadCsv, fmtDate, pct, todayStr } from '@/lib/utils'

const STATUSES: AttendanceStatus[] = ['present', 'absent', 'late', 'half-day', 'leave']

const statusStyle: Record<AttendanceStatus, string> = {
  present: 'bg-success-soft text-success border-success/30',
  absent: 'bg-danger-soft text-danger border-danger/30',
  late: 'bg-warning-soft text-warning border-warning/30',
  'half-day': 'bg-warning-soft text-warning border-warning/30',
  leave: 'bg-muted text-muted-foreground border-border',
}

function StatusPicker({ value, onChange }: { value: AttendanceStatus; onChange: (s: AttendanceStatus) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={cn(
            'rounded-md border px-2 py-1 text-[11px] font-medium capitalize transition-all',
            value === s ? statusStyle[s] : 'border-border text-muted-foreground hover:bg-muted',
          )}
        >
          {s}
        </button>
      ))}
    </div>
  )
}

function MarkRegister({ classes }: { classes: ClassDoc[] }) {
  const { user } = useAuth()
  const [classId, setClassId] = useState(classes[0]?.id ?? '')
  const [section, setSection] = useState(classes[0]?.sections[0] ?? 'A')
  const [date, setDate] = useState(todayStr())
  const { data: students, isLoading } = useList<StudentDoc>('students', { where: [['classId', '==', classId]] })
  const { data: existing } = useList<AttendanceDoc>('attendance', {
    where: [['date', '==', date], ['personType', '==', 'student'], ['classId', '==', classId]],
  })
  const bulk = useBulkWrite('attendance')
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({})

  const sectionStudents = useMemo(
    () => (students ?? []).filter((s) => s.section === section && s.status === 'active').sort((a, b) => (a.rollNo ?? '').localeCompare(b.rollNo ?? '')),
    [students, section],
  )

  const current = useMemo(() => {
    const map = new Map<string, AttendanceStatus>()
    for (const s of sectionStudents) {
      const ex = existing?.find((a) => a.personId === s.id)
      map.set(s.id, marks[s.id] ?? ex?.status ?? 'present')
    }
    return map
  }, [sectionStudents, existing, marks])

  const dirty = sectionStudents.some((s) => {
    const ex = existing?.find((a) => a.personId === s.id)
    return (marks[s.id] ?? undefined) !== undefined && ex?.status !== marks[s.id]
  })

  const saveAll = async () => {
    const sessionId = localStorage.getItem('bmrc-active-session') ?? ''
    const ops = sectionStudents.map((s) => {
      const ex = existing?.find((a) => a.personId === s.id)
      return {
        id: ex?.id ?? `att-${date}-${s.id}`,
        data: {
          date, sessionId, personType: 'student' as const, personId: s.id,
          classId, section, status: current.get(s.id) ?? 'present', markedBy: user?.id ?? '',
        },
      }
    })
    await bulk.mutateAsync(ops)
    // notify parents of absences (fire and forget)
    for (const s of sectionStudents) {
      if (current.get(s.id) === 'absent' && s.parentUserId) {
        void notify(s.parentUserId, `Absent on ${fmtDate(date)}`, `${s.name} was marked absent today.`, '/portal')
      }
    }
    setMarks({})
    toast.success(`Attendance saved for ${sectionStudents.length} students`, { description: `${fmtDate(date)} · parents of absentees were notified` })
  }

  if (!classes.length) {
    return <EmptyState title="No classes yet" hint="Create classes first under Classes & Subjects." />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40 space-y-1">
          <Label>Class</Label>
          <Select value={classId} onValueChange={(v) => { setClassId(v); const c = classes.find((x) => x.id === v); setSection(c?.sections[0] ?? 'A') }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-28 space-y-1">
          <Label>Section</Label>
          <Select value={section} onValueChange={setSection}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(classes.find((c) => c.id === classId)?.sections ?? ['A']).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-44 space-y-1">
          <Label>Date</Label>
          <Input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            onClick={() => setMarks(Object.fromEntries(sectionStudents.map((s) => [s.id, 'present' as const])))}
            className="gap-1.5"
          >
            <CheckCheck className="size-4" /> All present
          </Button>
          <Button onClick={saveAll} disabled={!sectionStudents.length} className="gap-1.5">
            <CalendarCheck className="size-4" /> Save register
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : sectionStudents.length === 0 ? (
        <EmptyState title="No students in this section" hint="Admit students or pick another class/section." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
              <span>{sectionStudents.length} students · default is present, tap a status to change</span>
              {existing && existing.length > 0 && <Badge variant="neutral">already marked today (editing)</Badge>}
            </div>
            <div className="divide-y divide-border/60">
              {sectionStudents.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <span className="tabular w-8 text-xs text-muted-foreground">{s.rollNo ?? '-'}</span>
                  <Avatar src={s.photoUrl} name={s.name} size={30} />
                  <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                  <StatusPicker value={current.get(s.id) ?? 'present'} onChange={(st) => setMarks((m) => ({ ...m, [s.id]: st }))} />
                </div>
              ))}
            </div>
            {dirty && (
              <div className="border-t border-primary/30 bg-primary-soft px-4 py-2 text-xs text-primary">
                Unsaved changes - click Save register to apply.
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StaffAttendance() {
  const { user } = useAuth()
  const [date, setDate] = useState(todayStr())
  const { data: staff, isLoading } = useList<StaffDoc>('staff')
  const { data: existing } = useList<AttendanceDoc>('attendance', {
    where: [['date', '==', date], ['personType', '==', 'staff']],
  })
  const bulk = useBulkWrite('attendance')
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({})

  const current = (id: string): AttendanceStatus => marks[id] ?? existing?.find((a) => a.personId === id)?.status ?? 'present'

  const saveAll = async () => {
    const sessionId = localStorage.getItem('bmrc-active-session') ?? ''
    await bulk.mutateAsync(
      (staff ?? []).map((s) => {
        const ex = existing?.find((a) => a.personId === s.id)
        return {
          id: ex?.id ?? `att-stf-${date}-${s.id}`,
          data: { date, sessionId, personType: 'staff' as const, personId: s.id, status: current(s.id), markedBy: user?.id ?? '' },
        }
      }),
    )
    setMarks({})
    toast.success('Staff attendance saved')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44 space-y-1">
          <Label>Date</Label>
          <Input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Button className="ml-auto" onClick={saveAll} disabled={isLoading || !staff?.length}>
          <CalendarCheck className="size-4" /> Save staff attendance
        </Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border/60">
              {(staff ?? []).map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <Avatar src={s.photoUrl} name={s.name} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.designation}</p>
                  </div>
                  <StatusPicker value={current(s.id)} onChange={(st) => setMarks((m) => ({ ...m, [s.id]: st }))} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function AttendanceReports({ classes }: { classes: ClassDoc[] }) {
  const [classId, setClassId] = useState('')
  const [month, setMonth] = useState(todayStr().slice(0, 7))
  const { data: students } = useList<StudentDoc>('students')
  const { data: attendance, isLoading } = useList<AttendanceDoc>('attendance', {
    where: [['personType', '==', 'student'], ['classId', '==', classId || 'c-none']],
  })

  const rows = useMemo(() => {
    const inMonth = (attendance ?? []).filter((a) => a.date.startsWith(month))
    const byStudent = new Map<string, { present: number; total: number }>()
    for (const a of inMonth) {
      const rec = byStudent.get(a.personId) ?? { present: 0, total: 0 }
      rec.total++
      if (a.status === 'present' || a.status === 'late' || a.status === 'half-day') rec.present++
      byStudent.set(a.personId, rec)
    }
    return (students ?? [])
      .filter((s) => (!classId || s.classId === classId) && byStudent.has(s.id))
      .map((s) => {
        const rec = byStudent.get(s.id)!
        return { student: s, ...rec, percent: pct(rec.present, rec.total) }
      })
      .sort((a, b) => a.percent - b.percent)
  }, [attendance, students, month, classId])

  const defaulters = rows.filter((r) => r.percent < 75)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44 space-y-1">
          <Label>Class</Label>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger><SelectValue placeholder="All classes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-40 space-y-1">
          <Label>Month</Label>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <Button
          variant="outline" className="ml-auto gap-1.5"
          onClick={() =>
            downloadCsv(`attendance-${month}.csv`, [
              ['Student', 'Admission No', 'Class', 'Section', 'Present', 'Total', 'Percent'],
              ...rows.map((r) => [r.student.name, r.student.admissionNo, classes.find((c) => c.id === r.student.classId)?.name ?? '', r.student.section, r.present, r.total, `${r.percent}%`]),
            ])
          }
        >
          Export CSV
        </Button>
      </div>

      {defaulters.length > 0 && (
        <Card className="border-danger/30">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-danger">Below 75% ({defaulters.length})</p>
            <p className="mt-0.5 text-xs text-muted-foreground">These students are short of the 75% attendance requirement this month.</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {defaulters.map((r) => (
                <Badge key={r.student.id} variant="danger">{r.student.name} · {r.percent}%</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Users className="size-5" />} title="No attendance data for this month" hint="Mark attendance first - the report fills in automatically." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">Student</th>
                  <th className="px-4 py-2 text-right font-medium">Present</th>
                  <th className="px-4 py-2 text-right font-medium">Days</th>
                  <th className="px-4 py-2 text-right font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.student.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2 font-medium">{r.student.name}</td>
                    <td className="px-4 py-2 text-right tabular">{r.present}/{r.total}</td>
                    <td className="px-4 py-2 text-right tabular">{r.total}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={cn('tabular font-semibold', r.percent >= 75 ? 'text-success' : 'text-danger')}>{r.percent}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default function AttendancePage() {
  const { user } = useAuth()
  const { data: classes } = useList<ClassDoc>('classes')
  const canMark = can(user?.role, 'attendance.mark')

  return (
    <TabbedModule
      title="Attendance"
      info="Mark daily registers per class-section (everyone defaults to present, one tap to change), keep staff attendance, and pull month-wise reports with a 75% CBSE-style defaulter cutoff."
      tabs={[
        ...(canMark ? [{ key: 'mark', label: 'Mark register', content: <MarkRegister classes={classes ?? []} /> }] : []),
        { key: 'reports', label: 'Reports', content: <AttendanceReports classes={classes ?? []} /> },
        ...(canMark ? [{ key: 'staff', label: 'Staff', content: <StaffAttendance /> }] : []),
      ]}
      defaultTab={canMark ? 'mark' : 'reports'}
    />
  )
}

