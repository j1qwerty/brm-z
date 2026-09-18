import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FileBadge, Plus, Send, Trash2, Wand2 } from 'lucide-react'
import { TabbedModule } from '@/components/shared/TabbedModule'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardContent, Skeleton } from '@/components/ui/display'
import { Checkbox } from '@/components/ui/toggle'
import { Input, Label } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SheetContent, Sheet as SheetRoot } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/dialog'
import { useList, useCreate, useUpdate, useSoftDelete } from '@/lib/data/hooks'
import { useAuth } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { notifyMany, audienceUserIds } from '@/lib/notify'
import type { ClassDoc, ExamClassConfig, ExamDoc, MarkDoc, SessionDoc, StudentDoc, SubjectDoc } from '@/lib/types'
import { fmtDate, pct } from '@/lib/utils'
import { MarksEntryTab, ReportCardsTab } from './examEntry'

const STATUS_FLOW: ExamDoc['status'][] = ['draft', 'scheduled', 'ongoing', 'evaluation', 'published']

const statusVariant = (s: ExamDoc['status']) =>
  s === 'published' ? 'success' : s === 'evaluation' ? 'warning' : s === 'ongoing' ? 'default' : 'neutral'

function ExamSheet({
  open,
  onOpenChange,
  existing,
  classes,
  sessionId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  existing?: ExamDoc
  classes: ClassDoc[]
  sessionId: string
}) {
  const create = useCreate('exams')
  const update = useUpdate('exams')
  const [name, setName] = useState(existing?.name ?? '')
  const [type, setType] = useState<ExamDoc['type']>(existing?.type ?? 'unit')
  const [selectedClasses, setSelectedClasses] = useState<string[]>(existing?.classIds ?? [])
  const [startDate, setStartDate] = useState(existing?.startDate ?? '')
  const [endDate, setEndDate] = useState(existing?.endDate ?? '')
  const [perClass, setPerClass] = useState<Record<string, ExamClassConfig>>(existing?.perClass ?? {})

  const toggleClass = (id: string) => {
    setSelectedClasses((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]))
  }

  const submit = async () => {
    if (!name.trim()) {
      toast.error('Exam name is required')
      return
    }
    const payload = {
      name: name.trim(), type, sessionId,
      classIds: selectedClasses, // empty = all classes
      perClass: Object.fromEntries(Object.entries(perClass).filter(([k]) => selectedClasses.includes(k))),
      startDate: startDate || null, endDate: endDate || null,
    }
    if (existing) {
      await update.mutateAsync({ id: existing.id, data: payload })
      toast.success('Exam updated')
    } else {
      await create.mutateAsync({ data: { ...payload, status: 'draft' } })
      toast.success('Exam created as draft', { description: 'Schedule it, then publish after evaluation.' })
    }
    onOpenChange(false)
  }

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetContent
        wide
        title={existing ? `Edit ${existing.name}` : 'New exam'}
        description="Pick classes (none = all), auto-fill subjects from each class, set max marks and whether the exam counts toward the final cumulative report card."
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Exam name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Half-Yearly Examination" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm" value={type} onChange={(e) => setType(e.target.value as ExamDoc['type'])}>
                <option value="unit">Unit test</option>
                <option value="half-yearly">Half-yearly</option>
                <option value="final">Final</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Starts</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Ends</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Classes {selectedClasses.length === 0 && <span className="text-xs font-normal text-muted-foreground">(none selected = ALL classes)</span>}</Label>
            <div className="flex flex-wrap gap-1.5">
              {classes.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:text-primary">
                  <Checkbox checked={selectedClasses.includes(c.id)} onCheckedChange={() => toggleClass(c.id)} />
                  {c.name}
                </label>
              ))}
            </div>
          </div>

          {selectedClasses.length > 0 && (
            <div className="space-y-2">
              <Label>Per-class configuration</Label>
              {selectedClasses.map((cid) => (
                <ClassConfigRow
                  key={cid}
                  classId={cid}
                  classes={classes}
                  examType={type}
                  cfg={perClass[cid]}
                  onChange={(cfg) => setPerClass((p) => ({ ...p, [cid]: cfg }))}
                />
              ))}
            </div>
          )}

          <Button className="w-full" onClick={submit}>{existing ? 'Save changes' : 'Create exam'}</Button>
        </div>
      </SheetContent>
    </SheetRoot>
  )
}

function ClassConfigRow({
  classId,
  classes,
  examType,
  cfg,
  onChange,
}: {
  classId: string
  classes: ClassDoc[]
  examType: ExamDoc['type']
  cfg: ExamClassConfig | undefined
  onChange: (cfg: ExamClassConfig) => void
}) {
  const { data: subjects } = useList<SubjectDoc>(`classes/${classId}/subjects`)
  const current = cfg ?? { subjectIds: (subjects ?? []).map((s) => s.id), maxMarks: examType === 'unit' ? 25 : 80, includeInFinal: true }
  const cls = classes.find((c) => c.id === classId)

  return (
    <Card>
      <CardContent className="space-y-2.5 p-3.5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">{cls?.name}</p>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox checked={current.includeInFinal} onCheckedChange={(c) => onChange({ ...current, includeInFinal: !!c })} />
            counts toward final
          </label>
        </div>
        <div className="flex flex-wrap gap-1">
          {(subjects ?? []).map((s) => (
            <label key={s.id} className="flex cursor-pointer items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
              <Checkbox
                className="size-3"
                checked={current.subjectIds.includes(s.id)}
                onCheckedChange={(c) =>
                  onChange({ ...current, subjectIds: c ? [...current.subjectIds, s.id] : current.subjectIds.filter((x) => x !== s.id) })
                }
              />
              {s.name}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Label className="shrink-0 text-xs">Max marks</Label>
          <Input
            type="number" className="h-8 w-24" value={current.maxMarks}
            onChange={(e) => onChange({ ...current, maxMarks: Number(e.target.value) })}
          />
        </div>
      </CardContent>
    </Card>
  )
}

export function ExamsTab({ classes, sessionId }: { classes: ClassDoc[]; sessionId: string }) {
  const { user } = useAuth()
  const { data: exams, isLoading } = useList<ExamDoc>('exams')
  const update = useUpdate('exams')
  const softDelete = useSoftDelete('exams')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ExamDoc | undefined>()
  const [confirmDelete, setConfirmDelete] = useState<ExamDoc | null>(null)
  const publisher = can(user?.role, 'results.publish')

  const publish = async (ex: ExamDoc) => {
    await update.mutateAsync({ id: ex.id, data: { status: 'published' } })
    // notify parents + students
    try {
      const ids = await audienceUserIds({ type: 'all', value: [] }, {})
      await notifyMany(ids, `${ex.name} results published`, 'Marks are now visible in your portal.', '/portal')
    } catch {
      // notification is best-effort
    }
    toast.success('Exam published', { description: 'Students and parents can see marks now.' })
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}><Plus className="size-3.5" /> New exam</Button>
      </div>
      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">{[1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}</div>
      ) : (exams ?? []).length === 0 ? (
        <EmptyState icon={<FileBadge className="size-5" />} title="No exams yet" hint="Create unit tests, half-yearly or final exams. Subjects auto-fill from each class." action={<Button onClick={() => setOpen(true)}>Create exam</Button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {[...(exams ?? [])].reverse().map((ex) => (
            <Card key={ex.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{ex.name}</p>
                    <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                      {ex.type} · {ex.classIds.length ? ex.classIds.map((c) => classes.find((cl) => cl.id === c)?.name ?? c).join(', ') : 'All classes'}
                    </p>
                    {ex.startDate && (
                      <p className="mt-0.5 text-xs text-muted-foreground tabular">{fmtDate(ex.startDate)} to {fmtDate(ex.endDate)}</p>
                    )}
                  </div>
                  <Badge variant={statusVariant(ex.status)}>{ex.status}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {ex.status !== 'published' && (
                    <Button size="sm" variant="ghost" onClick={() => {
                      const idx = STATUS_FLOW.indexOf(ex.status)
                      const next = STATUS_FLOW[Math.min(idx + 1, STATUS_FLOW.length - 2)] // manual cap at evaluation
                      update.mutate({ id: ex.id, data: { status: next } })
                      toast.success(`Status moved to ${next}`)
                    }}>
                      <Wand2 className="size-3.5" /> Advance status
                    </Button>
                  )}
                  {publisher && ex.status === 'evaluation' && (
                    <Button size="sm" variant="soft" className="gap-1.5" onClick={() => publish(ex)}>
                      <Send className="size-3.5" /> Publish results
                    </Button>
                  )}
                  {publisher && ex.status === 'published' && (
                    <Button size="sm" variant="ghost" onClick={() => { update.mutate({ id: ex.id, data: { status: 'evaluation' } }); toast.success('Unpublished - hidden from students/parents') }}>
                      Unpublish
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(ex); setOpen(true) }}>Edit</Button>
                  <Button size="iconSm" variant="ghost" className="text-danger" aria-label="Delete exam" onClick={() => setConfirmDelete(ex)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ExamSheet open={open} onOpenChange={setOpen} existing={editing} classes={classes} sessionId={sessionId} />
      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={`Delete ${confirmDelete?.name}?`}
        description="Marks entered for this exam stay in Trash with it and can be restored."
        confirmLabel="Move to Trash"
        destructive
        onConfirm={() => {
          if (confirmDelete) softDelete.mutate({ id: confirmDelete.id, by: user?.id })
          setConfirmDelete(null)
        }}
      />
    </div>
  )
}

export function ResultsTab({ classes }: { classes: ClassDoc[] }) {
  const { data: exams } = useList<ExamDoc>('exams', { where: [['status', '==', 'published']] })
  const { data: marks } = useList<MarkDoc>('marks')
  const { data: students } = useList<StudentDoc>('students')
  const [examId, setExamId] = useState('')

  const exam = exams?.find((e) => e.id === examId) ?? exams?.[0]

  const classStats = useMemo(() => {
    if (!exam) return []
    return classes.map((c) => {
      const cfg = exam.perClass[c.id]
      const classStudents = (students ?? []).filter((s) => s.classId === c.id)
      const studentRows = classStudents.map((st) => {
        const ms = (marks ?? []).filter((m) => m.examId === exam.id && m.studentId === st.id)
        const total = ms.reduce((a, m) => a + (m.marks ?? 0), 0)
        const max = ms.reduce((a, m) => a + m.maxMarks, 0)
        return { student: st, percent: pct(total, max) }
      })
      const avg = studentRows.length ? Math.round(studentRows.reduce((a, r) => a + r.percent, 0) / studentRows.length) : 0
      const pass = studentRows.filter((r) => r.percent >= 33).length
      return { cls: c, cfg, avg, pass, total: studentRows.length, toppers: [...studentRows].sort((a, b) => b.percent - a.percent).slice(0, 3) }
    }).filter((r) => r.total > 0)
  }, [exam, classes, marks, students])

  if (!exams?.length) {
    return <EmptyState title="No published exams yet" hint="Publish an exam to see class-wise result summaries here." icon={<FileBadge className="size-5" />} />
  }

  return (
    <div className="space-y-4">
      <div className="w-64 space-y-1">
        <Label>Exam</Label>
        <Select value={exam?.id} onValueChange={setExamId}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {exams.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {classStats.map((r) => (
        <Card key={r.cls.id}>
          <CardContent className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{r.cls.name}</p>
              <div className="flex gap-2">
                <Badge variant="default">avg {r.avg}%</Badge>
                <Badge variant="success">{r.pass}/{r.total} pass</Badge>
                {r.cfg?.includeInFinal && <Badge variant="outline">in final</Badge>}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {r.toppers.map((t) => (
                <Badge key={t.student.id} variant="neutral">{t.student.name} · {t.percent}%</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
      {classStats.length === 0 && <EmptyState compact title="No marks found for this exam" hint="Enter marks in the Marks Entry tab first." />}
    </div>
  )
}

export default function ExamsPage() {
  const { user } = useAuth()
  const { data: classes } = useList<ClassDoc>('classes')
  const { data: sessions } = useList<SessionDoc>('sessions')
  const { data: exams } = useList<ExamDoc>('exams')
  const activeSession = sessions?.find((s) => s.isActive)
  const canEnter = can(user?.role, 'marks.enter')

  return (
    <TabbedModule
      title="Exams & Results"
      info="Create exams with per-class subject configs, enter marks (teachers only for their assigned class-subjects), auto-grade from the CBSE scale, publish results (nothing is visible to students/parents before publish), and generate per-exam or cumulative final report cards."
      tabs={[
        { key: 'exams', label: 'Exams', badge: exams?.length, content: <ExamsTab classes={classes ?? []} sessionId={activeSession?.id ?? ''} /> },
        ...(canEnter ? [{ key: 'entry', label: 'Marks entry', content: <MarksEntryTab classes={classes ?? []} /> }] : []),
        { key: 'results', label: 'Results', content: <ResultsTab classes={classes ?? []} /> },
        { key: 'reportcards', label: 'Report cards', content: <ReportCardsTab classes={classes ?? []} /> },
      ]}
    />
  )
}
