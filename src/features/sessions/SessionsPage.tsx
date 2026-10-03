import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { CheckCircle2, ChevronRight, GraduationCap, Plus, Rocket } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, Badge, Skeleton } from '@/components/ui/display'
import { Input, Label } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/toggle'
import { SheetContent, Sheet as SheetRoot, Dialog as DialogRoot, DialogContent, DialogHeader } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/dialog'
import { useList, useCreate, useUpdate, useBulkWrite, useSoftDelete } from '@/lib/data/hooks'
import { IS_PROD } from '@/lib/env'
import { useAuth } from '@/lib/auth'
import type { SessionDoc, StudentDoc, ClassDoc } from '@/lib/types'
import { fmtDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

const sessionSchema = z
  .object({
    name: z.string().regex(/^\d{4}-\d{4}$/, 'Use the format 2026-2027'),
    startDate: z.string().min(1, 'Start date required'),
    endDate: z.string().min(1, 'End date required'),
  })
  .refine((v) => v.endDate > v.startDate, { message: 'End date must be after start date', path: ['endDate'] })
type SessionForm = z.infer<typeof sessionSchema>

function SessionFormSheet({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  existing?: SessionDoc
}) {
  const create = useCreate('sessions')
  const update = useUpdate('sessions')
  const form = useForm<SessionForm>({
    resolver: zodResolver(sessionSchema),
    values: existing
      ? { name: existing.name, startDate: existing.startDate, endDate: existing.endDate }
      : { name: '', startDate: '', endDate: '' },
  })

  const submit = async (v: SessionForm) => {
    try {
      if (existing) {
        await update.mutateAsync({ id: existing.id, data: v })
        toast.success('Session updated')
      } else {
        await create.mutateAsync({ data: { ...v, isActive: false, isCompleted: false } })
        toast.success('Session created', { description: 'Activate it when the new year starts.' })
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    }
  }

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetContent title={existing ? 'Edit session' : 'New session'} description="Indian academic year runs April to March, e.g. 2026-2027.">
        <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Session name</Label>
            <Input placeholder="2027-2028" {...form.register('name')} />
            {form.formState.errors.name && <p className="text-xs text-danger">{form.formState.errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Starts</Label>
              <Input type="date" {...form.register('startDate')} />
              {form.formState.errors.startDate && <p className="text-xs text-danger">{form.formState.errors.startDate.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Ends</Label>
              <Input type="date" {...form.register('endDate')} />
              {form.formState.errors.endDate && <p className="text-xs text-danger">{form.formState.errors.endDate.message}</p>}
            </div>
          </div>
          <Button type="submit" className="w-full">{existing ? 'Save changes' : 'Create session'}</Button>
        </form>
      </SheetContent>
    </SheetRoot>
  )
}

interface PromotionRow {
  student: StudentDoc
  fromClass: ClassDoc
  toClass: ClassDoc | null // null = graduated
  promote: boolean
}

function PromotionWizard({
  open,
  onOpenChange,
  fromSession,
  classes,
  students,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  fromSession: SessionDoc
  classes: ClassDoc[]
  students: StudentDoc[]
}) {
  const { data: sessions } = useList<SessionDoc>('sessions')
  const bulkStudents = useBulkWrite('students', ['sessions'])
  const updateSession = useUpdate('sessions')
  const sortedClasses = useMemo(() => [...classes].sort((a, b) => a.order - b.order), [classes])
  const nextByName = useMemo(() => {
    // map: each class's target = the class with the next higher order
    const map = new Map<string, ClassDoc | null>()
    sortedClasses.forEach((c, i) => {
      map.set(c.id, sortedClasses[i + 1] ?? null)
    })
    return map
  }, [sortedClasses])

  const [targetSessionId, setTargetSessionId] = useState<string | null>(null)
  const [rows, setRows] = useState<PromotionRow[] | null>(null)
  const [applied, setApplied] = useState(false)
  const [busy, setBusy] = useState(false)

  const activeStudents = students.filter((s) => s.status === 'active')

  const buildPreview = () => {
    const map: PromotionRow[] = activeStudents.map((student) => {
      const fromClass = classes.find((c) => c.id === student.classId)!
      const toClass = nextByName.get(student.classId) ?? null
      return { student, fromClass, toClass, promote: true }
    })
    setRows(map)
  }

  const applyPromotion = async () => {
    if (!rows || !targetSessionId) return
    setBusy(true)
    try {
      const ops = rows
        .filter((r) => r.promote)
        .map((r) => ({
          id: r.student.id,
          data: r.toClass
            ? { classId: r.toClass.id }
            : { status: 'graduated' as const },
        }))
      await bulkStudents.mutateAsync(ops)
      await updateSession.mutateAsync({ id: fromSession.id, data: { isCompleted: true, isActive: false } })
      await updateSession.mutateAsync({ id: targetSessionId, data: { isActive: true } })
      setApplied(true)
      const grads = rows.filter((r) => r.promote && !r.toClass).length
      toast.success(`Promoted ${ops.length - grads} students${grads ? `, ${grads} graduated` : ''}`, {
        description: `${fromSession.name} completed, target session activated.`,
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Promotion failed')
    } finally {
      setBusy(false)
    }
  }

  const promoteCount = rows?.filter((r) => r.promote && r.toClass).length ?? 0
  const gradCount = rows?.filter((r) => r.promote && !r.toClass).length ?? 0
  const holdCount = rows?.filter((r) => !r.promote).length ?? 0
  const allSelected = rows ? rows.every((r) => r.promote) : false
  const someSelected = rows ? rows.some((r) => r.promote) : false

  return (
    <DialogRoot open={open} onOpenChange={(o) => { if (!o) { setRows(null); setApplied(false) } onOpenChange(o) }}>
      <DialogContent wide>
        <DialogHeader
          title="Promotion wizard"
          description={`Move students from ${fromSession.name} to the next class. Everyone in the top-most class graduates. Hold-backs are per student.`}
        />
        {!rows ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Target session (becomes active after promotion)</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm"
                value={targetSessionId ?? ''}
                onChange={(e) => setTargetSessionId(e.target.value)}
              >
                <option value="" disabled>Pick a session...</option>
                {(sessions ?? []).filter((s) => !s.isCompleted && s.id !== fromSession.id).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{s.isActive ? ' (currently active)' : ''}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                No target session yet? Close this and create one first (e.g. {Number(fromSession.name.slice(0, 4)) + 1}-{Number(fromSession.name.slice(0, 4)) + 2}).
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <p className="font-medium">Dry-run preview</p>
              <p className="mt-1 text-muted-foreground">
                {activeStudents.length} active students will be lined up class by class. You can uncheck any student to hold them back (they repeat the year in the same class).
              </p>
            </div>
            <Button className="w-full" disabled={!targetSessionId} onClick={buildPreview}>
              <ChevronRight className="size-4" /> Build preview
            </Button>
          </div>
        ) : applied ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CheckCircle2 className="size-10 text-success" />
            <p className="font-semibold">Promotion applied</p>
            <p className="text-sm text-muted-foreground">
              {promoteCount} promoted, {gradCount} graduated, {holdCount} held back. {fromSession.name} is now completed.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected && !allSelected}
                  onCheckedChange={(v) => setRows(rows.map((r) => ({ ...r, promote: !!v })))}
                />
                Select all ({rows.length})
              </label>
              <Badge variant="neutral">{promoteCount} promote · {gradCount} graduate · {holdCount} hold back</Badge>
            </div>
            <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {rows.map((r) => (
                <label key={r.student.id} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40">
                  <Checkbox
                    checked={r.promote}
                    onCheckedChange={(v) => setRows(rows.map((x) => (x.student.id === r.student.id ? { ...x, promote: !!v } : x)))}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">{r.student.name}</span>
                  <span className="text-xs text-muted-foreground">{r.fromClass.name}-{r.student.section}</span>
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                  <span className={cn('w-24 text-right text-xs font-medium', !r.toClass && 'text-success')}>
                    {r.toClass ? `${r.toClass.name}${r.student.section}` : 'Graduated'}
                  </span>
                </label>
              ))}
            </div>
            <Button className="w-full gap-2" disabled={busy} onClick={applyPromotion}>
              {busy ? <GraduationCap className="size-4 animate-pulse" /> : <Rocket className="size-4" />}
              Apply promotion to {promoteCount + gradCount} students
            </Button>
          </div>
        )}
      </DialogContent>
    </DialogRoot>
  )
}

export default function SessionsPage() {
  const { user } = useAuth()
  const { data: sessions, isLoading } = useList<SessionDoc>('sessions')
  const { data: classes } = useList<ClassDoc>('classes')
  const { data: students } = useList<StudentDoc>('students')
  const update = useUpdate('sessions')
  const softDelete = useSoftDelete('sessions')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<SessionDoc | undefined>()
  const [promoteFor, setPromoteFor] = useState<SessionDoc | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<SessionDoc | null>(null)

  const activate = async (s: SessionDoc) => {
    const others = (sessions ?? []).filter((x) => x.isActive && x.id !== s.id)
    if (IS_PROD) {
      // Production invariant: exactly one active session at a time.
      for (const o of others) await update.mutateAsync({ id: o.id, data: { isActive: false } })
      await update.mutateAsync({ id: s.id, data: { isActive: true, isCompleted: false } })
      toast.success(`${s.name} is now the active session`)
    } else {
      // Development allows several active sessions side by side for testing.
      await update.mutateAsync({ id: s.id, data: { isActive: true, isCompleted: false } })
      toast.success(`${s.name} activated (dev mode: ${others.length} other session(s) left active)`, {
        description: 'Set VITE_APP_ENV=production to enforce a single active session.',
      })
    }
  }

  return (
    <div>
      <PageHeader
        title="Sessions"
        info="An academic session is one school year (April to March). Exactly one session is active at a time - fees, attendance and exams attach to it. When a year ends, run the promotion wizard to move students up and complete the session."
        actions={
          <Button onClick={() => { setEditing(undefined); setSheetOpen(true) }} className="gap-1.5">
            <Plus className="size-4" /> New session
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : (sessions ?? []).length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="size-5" />}
          title="No sessions yet"
          hint="Create your first session, e.g. 2026-2027, then activate it."
          action={<Button onClick={() => setSheetOpen(true)}>Create session</Button>}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[...(sessions ?? [])]
            .sort((a, b) => b.name.localeCompare(a.name))
            .map((s) => (
              <Card key={s.id} className={cn(s.isActive && 'border-primary/50 ring-1 ring-primary/20')}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold tabular">{s.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground tabular">
                        {fmtDate(s.startDate)} to {fmtDate(s.endDate)}
                      </p>
                    </div>
                    {s.isActive ? <Badge>active</Badge> : s.isCompleted ? <Badge variant="neutral">completed</Badge> : <Badge variant="outline">upcoming</Badge>}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {!s.isActive && !s.isCompleted && (
                      <Button size="sm" variant="soft" onClick={() => activate(s)}>Set active</Button>
                    )}
                    {s.isActive && (
                      <Button size="sm" variant="soft" className="gap-1.5" onClick={() => setPromoteFor(s)}>
                        <Rocket className="size-3.5" /> Promote & complete
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(s); setSheetOpen(true) }}>Edit</Button>
                    {user && (
                      <Button size="sm" variant="ghost" className="text-danger" onClick={() => setConfirmDelete(s)}>Delete</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      )}

      <SessionFormSheet open={sheetOpen} onOpenChange={setSheetOpen} existing={editing} />
      {promoteFor && classes && students && (
        <PromotionWizard
          open={Boolean(promoteFor)}
          onOpenChange={(o) => !o && setPromoteFor(null)}
          fromSession={promoteFor}
          classes={classes}
          students={students}
        />
      )}
      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={`Delete session ${confirmDelete?.name}?`}
        description={confirmDelete?.isActive
          ? 'This session is ACTIVE. It moves to Trash and pages fall back to the next available session. Nothing is permanently deleted.'
          : 'It moves to Trash and can be restored later. Nothing is permanently deleted.'}
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

