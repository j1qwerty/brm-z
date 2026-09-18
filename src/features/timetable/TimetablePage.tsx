import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Printer } from 'lucide-react'
import { PageHeader, InfoTip } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, Skeleton } from '@/components/ui/display'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useList } from '@/lib/data/hooks'
import { useAuth } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { dataProvider } from '@/lib/data'
import type { AssignmentDoc, ClassDoc, StaffDoc, SubjectDoc, TimetableSlotDoc } from '@/lib/types'
import { cn, WEEKDAYS } from '@/lib/utils'
import { elementToPdf } from '@/lib/pdf'

interface SlotDraft {
  subjectId: string
  teacherId: string
}

function TimetableGrid({
  slots,
  subjects,
  editable,
  onCellClick,
  periodCount,
}: {
  slots: TimetableSlotDoc[]
  subjects: SubjectDoc[]
  editable: boolean
  onCellClick?: (day: number, periodNo: number, existing?: TimetableSlotDoc) => void
  periodCount: number
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
  const editor = can(user?.role, 'timetable.edit')
  const isTeacher = user?.role === 'teacher'
  const { data: classes } = useList<ClassDoc>('classes')
  const { data: staff } = useList<StaffDoc>('staff')
  const { data: assignments } = useList<AssignmentDoc>('assignments')
  const { data: slots, refetch } = useList<TimetableSlotDoc>('timetable')
  const [view, setView] = useState<'class' | 'teacher'>(isTeacher ? 'teacher' : 'class')
  const [classId, setClassId] = useState('')
  const [section, setSection] = useState('A')
  const [teacherId, setTeacherId] = useState('')
  const [cellEdit, setCellEdit] = useState<{ day: number; periodNo: number; existing?: TimetableSlotDoc } | null>(null)
  const [draft, setDraft] = useState<SlotDraft>({ subjectId: '', teacherId: '' })

  const cls = classes?.find((c) => c.id === classId)
  const { data: subjects } = useList<SubjectDoc>(cls ? `classes/${cls.id}/subjects` : 'classes/none/subjects', undefined, { enabled: Boolean(cls) })

  const shownSlots = useMemo(() => {
    const all = slots ?? []
    if (view === 'class') return all.filter((s) => s.classId === classId && s.section === section)
    return all.filter((s) => s.teacherId === (isTeacher ? user?.staffId : teacherId))
  }, [slots, view, classId, section, teacherId, isTeacher, user?.staffId])

  const conflictFor = (day: number, periodNo: number, teacher: string, excludeId?: string) =>
    (slots ?? []).find((s) => s.day === day && s.periodNo === periodNo && s.teacherId === teacher && s.id !== excludeId)

  const saveSlot = async () => {
    if (!cellEdit || !cls || !draft.subjectId || !draft.teacherId) return
    const conflict = conflictFor(cellEdit.day, cellEdit.periodNo, draft.teacherId, cellEdit.existing?.id)
    if (conflict) {
      const t = staff?.find((s) => s.id === draft.teacherId)
      const cc = classes?.find((c) => c.id === conflict.classId)
      toast.error('Teacher double-booked', {
        description: `${t?.name ?? 'Teacher'} already has ${conflict.subjectId} with ${cc?.name ?? conflict.classId}-${conflict.section} at P${conflict.periodNo} ${WEEKDAYS[conflict.day - 1]}.`,
      })
      return
    }
    const sessionId = localStorage.getItem('bmrc-active-session') ?? ''
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
            periodCount={6}
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
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{WEEKDAYS[cellEdit.day - 1]} · Period {cellEdit.periodNo}</p>
                <InfoTip title="Conflict check">When you save, the app verifies this teacher is not already scheduled in another section for the same period.</InfoTip>
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
                <label className="text-xs font-medium text-muted-foreground">Teacher</label>
                <Select value={draft.teacherId} onValueChange={(v) => setDraft((d) => ({ ...d, teacherId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pick teacher" /></SelectTrigger>
                  <SelectContent>
                    {(assignments ?? [])
                      .filter((a) => a.classId === cls?.id && a.subjectId === draft.subjectId && a.teacherId)
                      .map((a) => {
                        const t = staff?.find((s) => s.id === a.teacherId)
                        return <SelectItem key={a.teacherId} value={a.teacherId}>{t?.name ?? a.teacherId} (assigned)</SelectItem>
                      })}
                    {(staff ?? []).filter((s) => s.staffType === 'teaching').map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
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
