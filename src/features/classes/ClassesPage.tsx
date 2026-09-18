import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Plus, Trash2, School, Network } from 'lucide-react'
import { TabbedModule } from '@/components/shared/TabbedModule'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, Badge, Skeleton, Avatar } from '@/components/ui/display'
import { Input, Label } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/toggle'
import { SheetContent, Sheet as SheetRoot } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/dialog'
import { useList, useCreate, useUpdate, useSoftDelete, useBulkWrite } from '@/lib/data/hooks'
import { useAuth } from '@/lib/auth'
import type { ClassDoc, StaffDoc, StudentDoc, SubjectDoc, AssignmentDoc, SessionDoc } from '@/lib/types'

const classSchema = z.object({
  name: z.string().min(1, 'Class name required'),
  sections: z.string().min(1, 'Add at least one section'),
  order: z.number('Enter a promotion order').int().min(0).max(30),
})

type ClassForm = z.infer<typeof classSchema>

const subjectSchema = z.object({
  name: z.string().min(1, 'Subject name required'),
  code: z.string().min(1, 'Code required'),
  gradingMode: z.enum(['percentage', 'grade']),
  isElective: z.boolean(),
})
type SubjectForm = z.infer<typeof subjectSchema>

function ClassSheet({
  open,
  onOpenChange,
  existing,
  defaultOrder,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  existing?: ClassDoc
  defaultOrder: number
}) {
  const create = useCreate('classes')
  const update = useUpdate('classes')
  const form = useForm({
    resolver: zodResolver(classSchema),
    values: existing
      ? { name: existing.name, sections: existing.sections.join(', '), order: existing.order }
      : { name: '', sections: 'A', order: defaultOrder },
  })

  const submit = async (v0: ClassForm) => {
    const v: ClassForm = { ...v0, order: Number.isFinite(v0.order) ? v0.order : 0 }
    const payload = {
      name: v.name.trim(),
      sections: v.sections.split(',').map((s: string) => s.trim().toUpperCase()).filter(Boolean),
      order: v.order,
    }
    if (!payload.sections.length) {
      form.setError('sections', { message: 'Add at least one section' })
      return
    }
    if (existing) {
      await update.mutateAsync({ id: existing.id, data: payload })
      toast.success('Class updated')
    } else {
      await create.mutateAsync({ data: payload })
      toast.success('Class created')
    }
    onOpenChange(false)
  }

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetContent title={existing ? `Edit ${existing.name}` : 'New class'} description="Sections are A/B/C style groups within a class. Order controls promotion flow (lower order = junior).">
        <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Class name</Label>
            <Input placeholder="Class 10" {...form.register('name')} />
            {form.formState.errors.name && <p className="text-xs text-danger">{form.formState.errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Sections (comma separated)</Label>
            <Input placeholder="A, B" {...form.register('sections')} />
            {form.formState.errors.sections && <p className="text-xs text-danger">{form.formState.errors.sections.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Promotion order</Label>
            <Input type="number" min={0} {...form.register('order', { valueAsNumber: true })} />
            <p className="text-xs text-muted-foreground">Nursery = 0, next class = 1, and so on. The top-most class graduates students.</p>
          </div>
          <Button type="submit" className="w-full">{existing ? 'Save changes' : 'Create class'}</Button>
        </form>
      </SheetContent>
    </SheetRoot>
  )
}

function SubjectSheet({
  classId,
  open,
  onOpenChange,
  existing,
}: {
  classId: string
  open: boolean
  onOpenChange: (o: boolean) => void
  existing?: SubjectDoc
}) {
  const create = useCreate(`classes/${classId}/subjects`, ['classes'])
  const update = useUpdate(`classes/${classId}/subjects`, ['classes'])
  const form = useForm<SubjectForm>({
    resolver: zodResolver(subjectSchema),
    values: existing
      ? { name: existing.name, code: existing.code, gradingMode: existing.gradingMode, isElective: existing.isElective }
      : { name: '', code: '', gradingMode: 'percentage', isElective: false },
  })

  const submit = async (v: SubjectForm) => {
    try {
      if (existing) {
        await update.mutateAsync({ id: existing.id, data: v })
        toast.success('Subject updated')
      } else {
        // Auto-generate the doc id (don't use the code as id, because re-creating
        // a deleted subject with the same code would otherwise throw
        // "Document already exists" and the form would silently hang).
        await create.mutateAsync({ data: { ...v, classId } })
        toast.success('Subject added')
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save subject')
    }
  }

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetContent title={existing ? 'Edit subject' : 'Add subject'} description="gradingMode decides whether teachers enter raw marks (percentage) or straight grades.">
        <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Subject name</Label>
            <Input placeholder="Mathematics" {...form.register('name')} />
            {form.formState.errors.name && <p className="text-xs text-danger">{form.formState.errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Short code</Label>
            <Input placeholder="MATH10" {...form.register('code')} />
            {form.formState.errors.code && <p className="text-xs text-danger">{form.formState.errors.code.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Grading mode</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm" {...form.register('gradingMode')}>
              <option value="percentage">Percentage marks (auto grade from scale)</option>
              <option value="grade">Direct grade entry</option>
            </select>
          </div>
          <label className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
            <span>Elective<span className="block text-xs text-muted-foreground">Electives are optional on report cards</span></span>
            <Switch checked={form.watch('isElective')} onCheckedChange={(c) => form.setValue('isElective', c)} />
          </label>
          <Button type="submit" className="w-full" disabled={create.isPending || update.isPending}>
            {existing ? 'Save' : 'Add subject'}
          </Button>
        </form>
      </SheetContent>
    </SheetRoot>
  )
}

function ClassCard({ cls, teachers }: { cls: ClassDoc; teachers: StaffDoc[] }) {
  const { user } = useAuth()
  const { data: subjects, isLoading } = useList<SubjectDoc>(`classes/${cls.id}/subjects`)
  const { data: students } = useList<StudentDoc>('students', { where: [['classId', '==', cls.id]] })
  const update = useUpdate('classes')
  const softDeleteClass = useSoftDelete('classes')
  const softDeleteSubject = useSoftDelete(`classes/${cls.id}/subjects`, ['classes'])
  const [editOpen, setEditOpen] = useState(false)
  const [subjectFor, setSubjectFor] = useState<{ open: boolean; subject?: SubjectDoc }>({ open: false })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const classTeacher = teachers.find((t) => t.id === cls.classTeacherId)

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-bold">
              {cls.name}
              <Badge variant="neutral" className="tabular">{students?.length ?? 0} students</Badge>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Sections {cls.sections.join(', ')} · promotion order {cls.order}
            </p>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}>Edit</Button>
            <Button size="sm" variant="ghost" className="text-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted/50 p-2.5">
          <Label className="shrink-0 text-xs">Class teacher</Label>
          <Select value={cls.classTeacherId ?? 'none'} onValueChange={(v) => update.mutate({ id: cls.id, data: { classTeacherId: v === 'none' ? null : v } })}>
            <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue placeholder="Assign..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not assigned</SelectItem>
              {teachers.filter((t) => t.staffType === 'teaching').map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {classTeacher && <Avatar name={classTeacher.name} size={24} />}
        </div>

        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="text-xs">Subjects</Label>
            <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => setSubjectFor({ open: true })}>
              <Plus className="size-3" /> Add
            </Button>
          </div>
          {isLoading ? (
            <Skeleton className="h-16" />
          ) : (subjects ?? []).length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
              No subjects yet. Add English, Mathematics and the rest here.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(subjects ?? []).map((s) => (
                <span key={s.id} className="group inline-flex items-center gap-1 rounded-full border border-border bg-card py-1 pl-2.5 pr-1 text-xs">
                  <button className="font-medium hover:text-primary" onClick={() => setSubjectFor({ open: true, subject: s })}>
                    {s.name}
                  </button>
                  <Badge variant="neutral" className="px-1 py-0 text-[10px]">{s.gradingMode === 'grade' ? 'grade' : 'marks'}</Badge>
                  <button
                    className="rounded-full p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                    aria-label={`Remove ${s.name}`}
                    onClick={() => softDeleteSubject.mutate({ id: s.id, by: user?.id })}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </CardContent>

      <ClassSheet open={editOpen} onOpenChange={setEditOpen} existing={cls} defaultOrder={cls.order} />
      <SubjectSheet classId={cls.id} open={subjectFor.open} onOpenChange={(o) => setSubjectFor({ open: o, subject: o ? subjectFor.subject : undefined })} existing={subjectFor.subject} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${cls.name}?`}
        description="Students in this class should be moved first. The class goes to Trash and can be restored."
        confirmLabel="Move to Trash"
        destructive
        onConfirm={() => {
          softDeleteClass.mutate({ id: cls.id, by: user?.id })
          toast.success('Class moved to Trash')
          setConfirmDelete(false)
        }}
      />
    </Card>
  )
}

function AssignmentMatrix({ classes, teachers, sessionId }: { classes: ClassDoc[]; teachers: StaffDoc[]; sessionId?: string }) {
  const { data: assignments } = useList<AssignmentDoc>('assignments')
  const bulk = useBulkWrite('assignments')
  const [pending, setPending] = useState<{ classId: string; subjectId: string; teacherId: string }[]>([])

  const currentTeacher = (classId: string, subjectId: string) =>
    assignments?.find((a) => a.classId === classId && a.subjectId === subjectId && a.teacherId)?.teacherId ?? 'none'

  const setAssignment = (classId: string, subjectId: string, teacherId: string) => {
    setPending((p) => [...p.filter((x) => !(x.classId === classId && x.subjectId === subjectId)), { classId, subjectId, teacherId }])
  }

  const flush = async () => {
    if (!pending.length) return
    try {
      const existing = assignments ?? []
      const ops = pending.map((p) => {
        const ex = existing.find((a) => a.classId === p.classId && a.subjectId === p.subjectId)
        const id = ex?.id ?? `${p.classId}_${p.subjectId}`
        return {
          id,
          data:
            p.teacherId === 'none'
              ? { classId: p.classId, subjectId: p.subjectId, teacherId: '', sessionId: sessionId ?? ex?.sessionId ?? '' }
              : { classId: p.classId, subjectId: p.subjectId, teacherId: p.teacherId, sessionId: sessionId ?? ex?.sessionId ?? '' },
        }
      })
      await bulk.mutateAsync(ops)
      setPending([])
      toast.success('Teaching assignments saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Map every class-subject to a teacher. This matrix drives timetable permissions and who can enter marks for a subject.
      </p>
      {classes.map((c) => (
        <SubjectMatrixRow key={c.id} cacheKey={`classes/${c.id}/subjects`} classId={c.id} className={c.name} teachers={teachers} currentTeacher={currentTeacher} setAssignment={setAssignment} />
      ))}
      {pending.length > 0 && (
        <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary-soft px-4 py-2.5 shadow-md">
          <span className="text-sm font-medium text-primary">{pending.length} unsaved change{pending.length > 1 ? 's' : ''}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPending([])}>Discard</Button>
            <Button size="sm" onClick={flush}>Save</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function SubjectMatrixRow({
  cacheKey,
  classId,
  className,
  teachers,
  currentTeacher,
  setAssignment,
}: {
  cacheKey: string
  classId: string
  className: string
  teachers: StaffDoc[]
  currentTeacher: (classId: string, subjectId: string) => string
  setAssignment: (classId: string, subjectId: string, teacherId: string) => void
}) {
  const { data: subjects } = useList<SubjectDoc>(cacheKey)
  return (
    <Card>
      <CardContent className="p-4">
        <p className="mb-2 flex items-center gap-2 font-semibold"><Network className="size-4 text-primary" /> {className}</p>
        {(subjects ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">No subjects in this class yet.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(subjects ?? []).map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
                <Select value={currentTeacher(classId, s.id)} onValueChange={(v) => setAssignment(classId, s.id, v)}>
                  <SelectTrigger className="h-7 w-36 text-xs"><SelectValue placeholder="Teacher" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {teachers.filter((t) => t.staffType === 'teaching').map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function ClassesPage() {
  const { data: classes, isLoading } = useList<ClassDoc>('classes')
  const { data: teachers } = useList<StaffDoc>('staff', { where: [['staffType', '==', 'teaching']] })
  const { data: sessions } = useList<SessionDoc>('sessions')
  const [sheetOpen, setSheetOpen] = useState(false)
  const activeSession = sessions?.find((s) => s.isActive)

  const sorted = useMemo(() => [...(classes ?? [])].sort((a, b) => a.order - b.order), [classes])

  return (
    <TabbedModule
      title="Classes & Subjects"
      info="Classes hold sections and subjects; each subject picks percentage or grade mode. The assignment matrix maps class-subject pairs to teachers, which controls timetable edits and marks entry."
      tabs={[
        {
          key: 'classes',
          label: 'Classes',
          badge: classes?.length,
          content: (
            <div>
              <div className="mb-3 flex justify-end">
                <Button size="sm" onClick={() => setSheetOpen(true)} className="gap-1.5"><Plus className="size-3.5" /> New class</Button>
              </div>
              {isLoading ? (
                <div className="grid gap-3 md:grid-cols-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-48 rounded-xl" />)}</div>
              ) : sorted.length === 0 ? (
                <EmptyState icon={<School className="size-5" />} title="No classes yet" hint="Start with Nursery (order 0) up to Class 12. Sections like A/B live inside each class." action={<Button onClick={() => setSheetOpen(true)}>Create first class</Button>} />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {sorted.map((c) => <ClassCard key={c.id} cls={c} teachers={teachers ?? []} />)}
                </div>
              )}
              <ClassSheet open={sheetOpen} onOpenChange={setSheetOpen} defaultOrder={sorted.length} />
            </div>
          ),
        },
        {
          key: 'matrix',
          label: 'Teacher assignment matrix',
          content: teachers && classes ? <AssignmentMatrix classes={sorted} teachers={teachers} sessionId={activeSession?.id} /> : <Skeleton className="h-64 rounded-xl" />,
        },
      ]}
    />
  )
}

