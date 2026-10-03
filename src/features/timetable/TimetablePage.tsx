import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Printer } from 'lucide-react'
import { PageHeader, InfoTip } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, Skeleton } from '@/components/ui/display'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useList } from '@/lib/data/hooks'
import { useSessionScope } from '@/app/AppShell'
import { useAuth } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { dataProvider } from '@/lib/data'
import type { AssignmentDoc, ClassDoc, StaffDoc, SubjectDoc, TimetableConfigDoc, TimetableSlotDoc } from '@/lib/types'
import { cn, WEEKDAYS } from '@/lib/utils'
import { elementToPdf } from '@/lib/pdf'

interface SlotDraft {
  subjectId: string
  teacherId: string
}

/** One teaching staff member as seen from the period being edited. */
interface TeacherRow {
  id: string
  name: string
  /** Assigned to the subject currently picked in the modal (any class). */
  teachesSubject: boolean
  /** Assigned to the subject currently picked in the modal for this very class. */
  assignedHere: boolean
  /** What the teacher already has at this day+period, if anything. */
  busy?: { subjectLabel: string; classLabel: string }
}

function TimetableGrid({
  slots,
  subjects,
  editable,
  onCellClick,
  periodCount,
  periodsForDay,
}: {
  slots: TimetableSlotDoc[]
  subjects: SubjectDoc[]
  editable: boolean
  onCellClick?: (day: number, periodNo: number, existing?: TimetableSlotDoc) => void
  periodCount: number
  /** Periods that day actually runs. Columns past it render as "day over". */
  periodsForDay: (day: number) => number
}) {
  const periods = Array.from({ length: periodCount }, (_, i) => i + 1)
  const days = [1, 2, 3, 4, 5, 6]

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="w-16 px-3 py-2 text-left text-xs font-medium text-muted-foreground">Day</th>
            {periods.map((p) => (
              <th key={p} className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">P{p}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d} className="border-b border-border/50 last:border-0">
              <td className="px-3 py-2 text-xs font-semibold text-muted-foreground">{WEEKDAYS[d - 1]}</td>
              {periods.map((p) => {
                if (p > periodsForDay(d)) {
                  return (
                    <td key={p} className="px-1.5 py-1.5">
                      <div className="flex h-12 w-full items-center justify-center rounded-lg bg-muted/30 text-[10px] font-medium text-muted-foreground/50" title="School day ends here for this class">
                        end
                      </div>
                    </td>
                  )
                }
                const slot = slots.find((s) => s.day === d && s.periodNo === p)
                const subject = subjects.find((x) => x.id === slot?.subjectId)
                return (
                  <td key={p} className="px-1.5 py-1.5">
                    <button
                      type="button"
                      disabled={!editable}
                      onClick={() => onCellClick?.(d, p, slot)}
                      className={cn(
                        'flex h-12 w-full flex-col items-center justify-center rounded-lg border text-center transition-colors',
                        slot
                          ? 'border-primary/25 bg-primary-soft hover:brightness-95'
                          : editable
                            ? 'border-dashed border-border text-muted-foreground hover:bg-muted'
                            : 'border-transparent bg-muted/40 text-muted-foreground',
                      )}
                    >
                      {slot ? (
                        <>
                          <span className="text-xs font-semibold">{subject?.name ?? slot.subjectId}</span>
                          <span className="text-[10px] text-muted-foreground">{slot.roomId ?? ''}</span>
                        </>
                      ) : (
                        <span className="text-[10px]">{editable ? '+' : '-'}</span>
                      )}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function TimetablePage() {
  const { user } = useAuth()
  const session = useSessionScope()
  const sessionId = session?.id ?? ''
  const editor = can(user?.role, 'timetable.edit')
  const isTeacher = user?.role === 'teacher'
  const { data: classes } = useList<ClassDoc>('classes')
  const { data: staff } = useList<StaffDoc>('staff')
  const { data: assignments } = useList<AssignmentDoc>('assignments')
  const { data: slots, refetch } = useList<TimetableSlotDoc>('timetable')
  const { data: configs, refetch: refetchConfig } = useList<TimetableConfigDoc>('timetableConfig')
  const [view, setView] = useState<'class' | 'teacher'>(isTeacher ? 'teacher' : 'class')
  const [classId, setClassId] = useState('')
  const [section, setSection] = useState('A')
  const [teacherId, setTeacherId] = useState('')
  const [cellEdit, setCellEdit] = useState<{ day: number; periodNo: number; existing?: TimetableSlotDoc } | null>(null)
  const [draft, setDraft] = useState<SlotDraft>({ subjectId: '', teacherId: '' })

  const cls = classes?.find((c) => c.id === classId)
  const { data: subjects } = useList<SubjectDoc>(cls ? `classes/${cls.id}/subjects` : 'classes/none/subjects', undefined, { enabled: Boolean(cls) })

  // Periods per class-section: Mon-Fri vs Saturday can differ (6 vs 8 etc).
  const config = configs?.find((c) => c.classId === classId && c.section === section)
  const weekdayPeriods = config?.weekdayPeriods ?? 6
  const saturdayPeriods = config?.saturdayPeriods ?? 6
  const periodsForDay = (day: number) => (day === 6 ? saturdayPeriods : weekdayPeriods)
  const periodCount = Math.max(weekdayPeriods, saturdayPeriods, 1)

  const setPeriods = async (patch: { weekdayPeriods?: number; saturdayPeriods?: number }) => {
    if (!classId) return
    const next = {
      classId,
      section,
      weekdayPeriods: patch.weekdayPeriods ?? weekdayPeriods,
      saturdayPeriods: patch.saturdayPeriods ?? saturdayPeriods,
    }
    if (next.weekdayPeriods < 1 || next.saturdayPeriods < 1) return
    const id = `${classId}_${section}`
    try {
      const existing = await dataProvider.get('timetableConfig', id)
      if (existing) await dataProvider.update('timetableConfig', id, next)
      else await dataProvider.create('timetableConfig', next, id)
    } catch {
      await dataProvider.create('timetableConfig', next, id).catch(() => dataProvider.update('timetableConfig', id, next))
    }
    await refetchConfig()
  }

  const shownSlots = useMemo(() => {
    const inSession = (s: TimetableSlotDoc) => !sessionId || (s.sessionId || '') === sessionId
    const all = (slots ?? []).filter(inSession)
    if (view === 'class') return all.filter((s) => s.classId === classId && s.section === section)
    return all.filter((s) => s.teacherId === (isTeacher ? user?.staffId : teacherId))
  }, [slots, view, classId, section, teacherId, isTeacher, user?.staffId, sessionId])

  const conflictFor = (day: number, periodNo: number, teacher: string, excludeId?: string) =>
    (slots ?? []).find((s) => s.day === day && s.periodNo === periodNo && s.teacherId === teacher && s.id !== excludeId)

  const subjectLabel = useCallback((id: string) => subjects?.find((s) => s.id === id)?.name ?? id, [subjects])
  const classLabel = useCallback((slot: TimetableSlotDoc) => `${classes?.find((c) => c.id === slot.classId)?.name ?? slot.classId}-${slot.section}`, [classes])

  // Teacher dropdown, ordered by how good the pick is for the period being edited:
  // free teachers first, then whoever is already booked (annotated with what they have).
  // With a subject picked, teachers of that subject float to the top of the free list.
  const teacherRows = useMemo<TeacherRow[]>(() => {
    if (!cellEdit) return []
    const pick = draft.subjectId
    const rows: TeacherRow[] = (staff ?? [])
      .filter((s) => s.staffType === 'teaching')
      .map((s) => {
        const clash = (slots ?? []).find(
          (sl) => sl.day === cellEdit.day && sl.periodNo === cellEdit.periodNo && sl.teacherId === s.id && sl.id !== cellEdit.existing?.id,
        )
        const assigned = pick ? (assignments ?? []).filter((a) => a.teacherId === s.id && a.subjectId === pick) : []
        return {
          id: s.id,
          name: s.name,
          teachesSubject: assigned.length > 0,
          assignedHere: assigned.some((a) => a.classId === cls?.id),
          busy: clash ? { subjectLabel: subjectLabel(clash.subjectId), classLabel: classLabel(clash) } : undefined,
        }
      })
    const byName = (a: TeacherRow, b: TeacherRow) => a.name.localeCompare(b.name)
    return rows.sort(
      (a, b) =>
        Number(Boolean(a.busy)) - Number(Boolean(b.busy)) ||
        Number(b.teachesSubject) - Number(a.teachesSubject) ||
        Number(Boolean(a.assignedHere)) - Number(Boolean(b.assignedHere)) ||
        byName(a, b),
    )
  }, [cellEdit, draft.subjectId, staff, slots, assignments, cls?.id, subjectLabel, classLabel])

  const freeTeachers = useMemo(() => teacherRows.filter((t) => !t.busy), [teacherRows])
  const busyTeachers = useMemo(() => teacherRows.filter((t) => t.busy), [teacherRows])
  const teacherGroups = useMemo(() => {
    if (!cellEdit) return []
    const slot = `${WEEKDAYS[cellEdit.day - 1]} · P${cellEdit.periodNo}`
    const subject = draft.subjectId ? subjectLabel(draft.subjectId) : ''
    const groups: { label: string; rows: TeacherRow[] }[] = []
    const subjectFree = freeTeachers.filter((t) => t.teachesSubject)
    if (subjectFree.length) groups.push({ label: `Free · teaches ${subject}`, rows: subjectFree })
    const others = freeTeachers.filter((t) => !t.teachesSubject)
    if (others.length) {
      groups.push({ label: subject ? `Free · other subjects (${others.length})` : `Free at ${slot} (${others.length})`, rows: others })
    }
    if (busyTeachers.length) groups.push({ label: `Busy · already booked at ${slot}`, rows: busyTeachers })
    return groups
  }, [freeTeachers, busyTeachers, cellEdit, draft.subjectId, subjectLabel])

  const selectedTeacherName = teacherRows.find((t) => t.id === draft.teacherId)?.name

  const saveSlot = async () => {
    if (!cellEdit || !cls || !draft.subjectId || !draft.teacherId) return
    const conflict = conflictFor(cellEdit.day, cellEdit.periodNo, draft.teacherId, cellEdit.existing?.id)
    if (conflict) {
      const t = staff?.find((s) => s.id === draft.teacherId)
      toast.error('Teacher double-booked', {
        description: `${t?.name ?? 'Teacher'} already has ${subjectLabel(conflict.subjectId)} with ${classLabel(conflict)} at P${conflict.periodNo} ${WEEKDAYS[conflict.day - 1]}.`,
      })
      return
    }
    if (cellEdit.existing) {
      await dataProvider.update('timetable', cellEdit.existing.id, { subjectId: draft.subjectId, teacherId: draft.teacherId })
    } else {
      await dataProvider.create('timetable', {
        sessionId, classId: cls.id, section, day: cellEdit.day, periodNo: cellEdit.periodNo,
        subjectId: draft.subjectId, teacherId: draft.teacherId,
      })
    }
    await refetch()
    setCellEdit(null)
    toast.success('Period updated')
  }

  const clearSlot = async () => {
    if (!cellEdit?.existing) return
    await dataProvider.softDelete('timetable', cellEdit.existing.id, user?.id)
    await refetch()
    setCellEdit(null)
    toast.success('Period cleared')
  }

  const printPdf = async () => {
    const el = document.getElementById('timetable-print-area')
    if (el) {
      await elementToPdf(el as HTMLElement, `timetable-${view === 'class' ? `${classId}-${section}` : teacherId || 'teacher'}.pdf`)
      toast.success('Timetable PDF downloaded')
    }
  }

  return (
    <div>
      <PageHeader
        title="Timetable"
        info="The weekly period grid per class-section. The app blocks a teacher being in two places at once. Teachers see only their own timetable; admins build it."
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={printPdf}>
            <Printer className="size-3.5" /> Print / PDF
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        {editor && (
          <div className="flex rounded-lg border border-border p-0.5">
            {(['class', 'teacher'] as const).map((v) => (
              <button
                key={v}
                className={cn('rounded-md px-3 py-1.5 text-sm font-medium capitalize', view === v ? 'bg-primary-soft text-primary' : 'text-muted-foreground')}
                onClick={() => setView(v)}
              >
                {v} view
              </button>
            ))}
          </div>
        )}
        {view === 'class' ? (
          <>
            <div className="w-40 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Class</label>
              <Select value={classId} onValueChange={(v) => { setClassId(v); const c = classes?.find((x) => x.id === v); setSection(c?.sections[0] ?? 'A') }}>
                <SelectTrigger><SelectValue placeholder="Pick class" /></SelectTrigger>
                <SelectContent>
                  {(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-24 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Section</label>
              <Select value={section} onValueChange={setSection}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(cls?.sections ?? ['A']).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {view === 'class' && classId && editor && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Periods Mon-Fri</label>
                  <div className="flex h-9 items-center gap-1 rounded-md border border-input bg-card px-1">
                    <Button variant="ghost" size="iconSm" className="size-7" aria-label="Fewer weekday periods" onClick={() => setPeriods({ weekdayPeriods: weekdayPeriods - 1 })}>-</Button>
                    <span className="w-6 text-center text-sm font-bold tabular">{weekdayPeriods}</span>
                    <Button variant="ghost" size="iconSm" className="size-7" aria-label="More weekday periods" onClick={() => setPeriods({ weekdayPeriods: weekdayPeriods + 1 })}>+</Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Periods Saturday</label>
                  <div className="flex h-9 items-center gap-1 rounded-md border border-input bg-card px-1">
                    <Button variant="ghost" size="iconSm" className="size-7" aria-label="Fewer Saturday periods" onClick={() => setPeriods({ saturdayPeriods: saturdayPeriods - 1 })}>-</Button>
                    <span className="w-6 text-center text-sm font-bold tabular">{saturdayPeriods}</span>
                    <Button variant="ghost" size="iconSm" className="size-7" aria-label="More Saturday periods" onClick={() => setPeriods({ saturdayPeriods: saturdayPeriods + 1 })}>+</Button>
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          !isTeacher && (
            <div className="w-52 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Teacher</label>
              <Select value={teacherId} onValueChange={setTeacherId}>
                <SelectTrigger><SelectValue placeholder="Pick teacher" /></SelectTrigger>
                <SelectContent>
                  {(staff ?? []).filter((s) => s.staffType === 'teaching').map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )
        )}
      </div>

      {view === 'teacher' && isTeacher && !user?.staffId ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Your user account is not linked to a staff record yet. Ask the admin to link it in People.</CardContent></Card>
      ) : !slots ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <div id="timetable-print-area">
          <TimetableGrid
            slots={shownSlots}
            subjects={subjects ?? []}
            editable={editor && view === 'class'}
            periodCount={periodCount}
            periodsForDay={periodsForDay}
            onCellClick={(day, periodNo, existing) => {
              if (!editor) return
              setCellEdit({ day, periodNo, existing })
              setDraft({ subjectId: existing?.subjectId ?? '', teacherId: existing?.teacherId ?? '' })
            }}
          />
          {view === 'class' && classId && (
            <p className="mt-2 text-xs text-muted-foreground">
              Showing {cls?.name}-{section} · {shownSlots.length} periods scheduled
            </p>
          )}
        </div>
      )}

      {/* cell editor */}
      {cellEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => setCellEdit(null)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{WEEKDAYS[cellEdit.day - 1]} · Period {cellEdit.periodNo}</p>
                <InfoTip title="Conflict check">Teachers free at this day+period are listed first, then those already booked (shown with the subject and class they have). Pick a subject and the teachers who teach it float to the top. Saving a busy teacher is blocked.</InfoTip>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Subject</label>
                <Select value={draft.subjectId} onValueChange={(v) => setDraft((d) => ({ ...d, subjectId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pick subject" /></SelectTrigger>
                  <SelectContent>
                    {(subjects ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Teacher
                  <span className="ml-1 font-normal text-muted-foreground/70">
                    · {freeTeachers.length} free · {busyTeachers.length} busy
                  </span>
                </label>
                <Select value={draft.teacherId} onValueChange={(v) => setDraft((d) => ({ ...d, teacherId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pick teacher">{selectedTeacherName}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {teacherGroups.length === 0 && (
                      <SelectItem value="__none__" disabled>No teaching staff found</SelectItem>
                    )}
                    {teacherGroups.map((g) => (
                      <SelectGroup key={g.label}>
                        <SelectLabel>{g.label}</SelectLabel>
                        {g.rows.map((t) => (
                          <SelectItem key={t.id} value={t.id} textValue={t.name}>
                            <span className="flex w-full items-center justify-between gap-3">
                              <span className="truncate">
                                {t.name}
                                {t.assignedHere && <span className="ml-1.5 text-[11px] text-primary">(assigned)</span>}
                              </span>
                              {t.busy && (
                                <span className="shrink-0 truncate text-[11px] text-muted-foreground">
                                  {t.busy.subjectLabel} · {t.busy.classLabel}
                                </span>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={saveSlot} disabled={!draft.subjectId || !draft.teacherId}>Save period</Button>
                {cellEdit.existing && (
                  <Button variant="outline" className="text-danger" onClick={clearSlot}><AlertTriangle className="size-4" /> Clear</Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
