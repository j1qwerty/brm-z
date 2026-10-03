import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { BadgeIndianRupee, Download, FileText, Landmark, Plus, Trash2, Wallet } from 'lucide-react'
import { TabbedModule } from '@/components/shared/TabbedModule'
import { DataTable, type BulkAction } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardContent, Skeleton } from '@/components/ui/display'
import { Input, Label, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/toggle'
import { SheetContent, Sheet as SheetRoot } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/dialog'
import { useList, useCreate, useUpdate, useSoftDelete, useBulkWrite } from '@/lib/data/hooks'
import { useSessionScope } from '@/app/AppShell'
import { useAuth } from '@/lib/auth'
import { notify } from '@/lib/notify'
import type { ClassDoc, FeeAssignmentDoc, FeeTypeDoc, InvoiceDoc, PaymentDoc, SessionDoc, StudentDoc, UserDoc } from '@/lib/types'
import { downloadCsv, fmtDate, inr, monthLabel } from '@/lib/utils'

// ---------------- Fee types ----------------

function FeeTypesTab() {
  const { user } = useAuth()
  const { data: feeTypes, isLoading } = useList<FeeTypeDoc>('feeTypes')
  const create = useCreate('feeTypes')
  const update = useUpdate('feeTypes')
  const softDelete = useSoftDelete('feeTypes')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<FeeTypeDoc | undefined>()
  const [name, setName] = useState('')
  const [frequency, setFrequency] = useState<FeeTypeDoc['frequency']>('monthly')
  const [amount, setAmount] = useState<number>(0)
  const [refundable, setRefundable] = useState(false)

  const submit = async () => {
    if (!name.trim() || !amount) {
      toast.error('Name and amount are required')
      return
    }
    const payload = { name: name.trim(), frequency, defaultAmount: amount, refundable }
    if (editing) {
      await update.mutateAsync({ id: editing.id, data: payload })
      toast.success('Fee type updated')
    } else {
      await create.mutateAsync({ data: payload })
      toast.success('Fee type created')
    }
    setOpen(false)
    setEditing(undefined)
    setName('')
    setAmount(0)
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}><Plus className="size-3.5" /> New fee type</Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : (feeTypes ?? []).length === 0 ? (
        <EmptyState icon={<BadgeIndianRupee className="size-5" />} title="No fee types yet" hint="Create Tuition Fee (monthly), Admission Fee (one-time), Exam Fee (quarterly) etc. Frequencies drive invoice generation." action={<Button onClick={() => setOpen(true)}>Create fee type</Button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(feeTypes ?? []).map((f) => (
            <Card key={f.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{f.name}</p>
                    <p className="mt-0.5 text-xs capitalize text-muted-foreground">{f.frequency.replace('-', ' ')}</p>
                  </div>
                  <p className="font-bold tabular text-primary">{inr(f.defaultAmount)}</p>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  {f.refundable ? <Badge variant="success">refundable</Badge> : <Badge variant="neutral">non-refundable</Badge>}
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(f); setName(f.name); setFrequency(f.frequency); setAmount(f.defaultAmount); setRefundable(f.refundable); setOpen(true) }}>Edit</Button>
                    <Button size="iconSm" variant="ghost" className="text-danger" aria-label={`Delete ${f.name}`} onClick={() => softDelete.mutate({ id: f.id, by: user?.id })}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SheetRoot open={open} onOpenChange={setOpen}>
        <SheetContent title={editing ? `Edit ${editing.name}` : 'New fee type'} description="Frequency decides when the generate-on-open routine creates invoices: monthly every month, quarterly in Apr/Jul/Oct/Jan, yearly in April.">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tuition Fee" />
            </div>
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm" value={frequency} onChange={(e) => setFrequency(e.target.value as FeeTypeDoc['frequency'])}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="half-yearly">Half-yearly</option>
                <option value="yearly">Yearly</option>
                <option value="one-time">One-time</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Default amount (₹)</Label>
              <Input type="number" value={amount || ''} onChange={(e) => setAmount(Number(e.target.value))} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={refundable} onCheckedChange={(c) => setRefundable(!!c)} /> Refundable
            </label>
            <Button className="w-full" onClick={submit}>{editing ? 'Save changes' : 'Create fee type'}</Button>
          </div>
        </SheetContent>
      </SheetRoot>
    </div>
  )
}

// ---------------- Assignments ----------------

function AssignmentsTab({ classes, feeTypes, sessionId }: { classes: ClassDoc[]; feeTypes: FeeTypeDoc[]; sessionId: string }) {
  const { user } = useAuth()
  const { data: assignments, isLoading } = useList<FeeAssignmentDoc>(
    'feeAssignments',
    sessionId ? { where: [['sessionId', '==', sessionId]] } : undefined,
  )
  const create = useCreate('feeAssignments')
  const softDelete = useSoftDelete('feeAssignments')
  const [feeTypeId, setFeeTypeId] = useState('')
  const [targetType, setTargetType] = useState<'class' | 'student'>('class')
  const [targetId, setTargetId] = useState('')
  const [amount, setAmount] = useState<number>(0)
  const { data: students } = useList<StudentDoc>('students')

  const submit = async () => {
    if (!feeTypeId || !targetId || !amount) {
      toast.error('Pick a fee type, target and amount')
      return
    }
    if (!sessionId) {
      toast.error('No session selected', { description: 'Pick a session in the top bar first.' })
      return
    }
    await create.mutateAsync({ data: { feeTypeId, targetType, targetId, amount, sessionId } })
    toast.success('Fee assigned', { description: 'Invoices are created automatically when the period opens.' })
    setTargetId('')
    setAmount(0)
  }

  const rows = useMemo(
    () =>
      (assignments ?? []).map((a) => ({
        ...a,
        feeTypeName: feeTypes.find((f) => f.id === a.feeTypeId)?.name ?? a.feeTypeId,
        targetLabel:
          a.targetType === 'class'
            ? classes.find((c) => c.id === a.targetId)?.name ?? a.targetId
            : students?.find((s) => s.id === a.targetId)?.name ?? a.targetId,
      })),
    [assignments, feeTypes, classes, students],
  )

  const columns = useMemo(
    () => [
      { id: 'feeTypeName', header: 'Fee type', accessorFn: (r: (typeof rows)[number]) => r.feeTypeName },
      { id: 'targetLabel', header: 'Assigned to', accessorFn: (r: (typeof rows)[number]) => r.targetLabel },
      {
        id: 'targetType', header: 'Scope', accessorFn: (r: (typeof rows)[number]) => r.targetType,
        cell: ({ getValue }: { getValue: () => unknown }) => <Badge variant="outline">{getValue() as string}</Badge>,
      },
      {
        id: 'amount', header: 'Amount', accessorFn: (r: (typeof rows)[number]) => r.amount,
        cell: ({ getValue }: { getValue: () => unknown }) => <span className="tabular font-medium">{inr(getValue() as number)}</span>,
      },
      {
        id: '__del', header: '', enableSorting: false,
        cell: ({ row }: { row: { original: (typeof rows)[number] } }) => (
          <div className="flex justify-end">
            <Button size="iconSm" variant="ghost" className="text-danger" aria-label="Remove assignment" onClick={() => softDelete.mutate({ id: row.original.id, by: user?.id })}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    [softDelete, user?.id],
  )

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <Label>Fee type</Label>
            <Select value={feeTypeId} onValueChange={setFeeTypeId}>
              <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
              <SelectContent>{(feeTypes ?? []).map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Scope</Label>
            <Select value={targetType} onValueChange={(v) => setTargetType(v as 'class' | 'student')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="class">Whole class</SelectItem>
                <SelectItem value="student">Single student</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{targetType === 'class' ? 'Class' : 'Student'}</Label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
              <SelectContent>
                {targetType === 'class'
                  ? (classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)
                  : (students ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.admissionNo})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Amount (₹)</Label>
            <Input type="number" value={amount || ''} onChange={(e) => setAmount(Number(e.target.value))} />
          </div>
          <div className="flex items-end">
            <Button className="w-full gap-1.5" onClick={submit}><Plus className="size-4" /> Assign</Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? <Skeleton className="h-64 rounded-xl" /> : (
        <DataTable data={rows} columns={columns as never} searchPlaceholder="Search assignments..." exportName="fee-assignments" emptyTitle="No fee assignments" emptyHint="Assign fees to classes (per-class amounts) or individual students." />
      )}
    </div>
  )
}

// ---------------- Invoices ----------------

function GenerateInvoicesDialog({
  open,
  onOpenChange,
  students,
  classes,
  session,
  onDone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  students: StudentDoc[]
  classes: ClassDoc[]
  session: SessionDoc | null | undefined
  onDone: () => void
}) {
  const { data: feeTypes } = useList<FeeTypeDoc>('feeTypes')
  const [feeTypeId, setFeeTypeId] = useState('all')
  const [mode, setMode] = useState<'all' | 'class' | 'students'>('all')
  const [classId, setClassId] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7))
  const [busy, setBusy] = useState(false)

  const candidates = (students ?? []).filter((s) => s.status === 'active')
  const shown = candidates.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.admissionNo.toLowerCase().includes(search.toLowerCase())).slice(0, 60)

  const run = async () => {
    if (!session) {
      toast.error('No session selected', { description: 'Pick a session in the top bar first.' })
      return
    }
    if (mode === 'class' && !classId) {
      toast.error('Pick a class')
      return
    }
    if (mode === 'students' && picked.length === 0) {
      toast.error('Tick at least one student')
      return
    }
    setBusy(true)
    try {
      const { generateInvoicesForPeriod } = await import('@/lib/generate-on-open')
      const studentIds =
        mode === 'all' ? undefined : mode === 'class' ? candidates.filter((s) => s.classId === classId).map((s) => s.id) : picked
      const n = await generateInvoicesForPeriod(session, new Date(`${period}-01T00:00:00`), {
        feeTypeId: feeTypeId === 'all' ? undefined : feeTypeId,
        studentIds,
        periodKey: period,
      })
      onDone()
      toast.success(n ? `Generated ${n} new invoices for ${monthLabel(period)}` : 'Nothing new to generate', {
        description: 'Existing invoices (paid or not) are never touched - re-runs are safe.',
      })
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetContent title="Generate invoices" description="Monthly uses the chosen month; quarterly/half-yearly only bill in their start months; yearly bills in April; one-time always bills. Existing invoices are skipped, never duplicated or reset.">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Fee type</Label>
            <Select value={feeTypeId} onValueChange={setFeeTypeId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All assigned types</SelectItem>
                {(feeTypes ?? []).map((f) => <SelectItem key={f.id} value={f.id}>{f.name} ({f.frequency})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Bill whom</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as 'all' | 'class' | 'students')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All students</SelectItem>
                <SelectItem value="class">One class</SelectItem>
                <SelectItem value="students">Select students</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode === 'class' && (
            <div className="space-y-1.5">
              <Label>Class</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger><SelectValue placeholder="Pick class" /></SelectTrigger>
                <SelectContent>
                  {(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {mode === 'students' && (
            <div className="space-y-1.5">
              <Label>Students ({picked.length} picked)</Label>
              <Input placeholder="Search name or admission no..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                {shown.map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                    <Checkbox
                      checked={picked.includes(s.id)}
                      onCheckedChange={(c) => setPicked((p) => (c ? [...p, s.id] : p.filter((x) => x !== s.id)))}
                    />
                    <span className="flex-1 truncate">{s.name}</span>
                    <span className="text-xs text-muted-foreground tabular">{s.admissionNo}</span>
                  </label>
                ))}
                {shown.length === 0 && <p className="p-2 text-xs text-muted-foreground">No matches.</p>}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Period (month)</Label>
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
          <Button className="w-full" onClick={run} disabled={busy}>{busy ? 'Generating...' : 'Generate invoices'}</Button>
        </div>
      </SheetContent>
    </SheetRoot>
  )
}

function InvoicesTab({ students, classes, sessionId }: { students: StudentDoc[]; classes: ClassDoc[]; sessionId: string }) {
  const { user } = useAuth()
  const { data: sessions } = useList<SessionDoc>('sessions')
  // where-only server query (single-field: no composite index needed);
  // newest-first sort happens client-side for the same reason.
  const { data: invoices, isLoading, refetch } = useList<InvoiceDoc>(
    'invoices',
    sessionId ? { where: [['sessionId', '==', sessionId]] } : undefined,
  )
  const update = useUpdate('invoices')
  const softDelete = useSoftDelete('invoices')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [waiveTarget, setWaiveTarget] = useState<InvoiceDoc | null>(null)
  const activeSession = sessions?.find((s) => s.id === sessionId)
  const [generating, setGenerating] = useState(false)
  const [genOpen, setGenOpen] = useState(false)

  const studentById = useMemo(() => new Map((students ?? []).map((s) => [s.id, s])), [students])
  const classById = useMemo(() => new Map((classes ?? []).map((c) => [c.id, c])), [classes])

  const filtered = useMemo(() => {
    let out = [...(invoices ?? [])].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    if (filters.status && filters.status !== 'all') out = out.filter((i) => i.status === filters.status)
    if (filters.classId && filters.classId !== 'all') {
      out = out.filter((i) => studentById.get(i.studentId)?.classId === filters.classId)
    }
    if (filters.periodKey && filters.periodKey !== 'all') out = out.filter((i) => i.periodKey === filters.periodKey)
    return out
  }, [invoices, filters, studentById])

  const periods = useMemo(() => [...new Set((invoices ?? []).map((i) => i.periodKey))].sort().reverse(), [invoices])

  const runGeneration = async () => {
    if (!activeSession) {
      toast.error('No active session', { description: 'Activate a session under Sessions first.' })
      return
    }
    setGenerating(true)
    try {
      const { generateInvoicesForPeriod } = await import('@/lib/generate-on-open')
      const n = await generateInvoicesForPeriod(activeSession)
      await refetch()
      toast.success(n ? `Generated ${n} invoices for ${monthLabel(new Date().toISOString().slice(0, 7))}` : 'Nothing new to generate', {
        description: 'Runs are idempotent - repeating this never creates duplicates.',
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const columns = useMemo(
    () => [
      {
        id: 'student',
        header: 'Student',
        accessorFn: (i: InvoiceDoc) => studentById.get(i.studentId)?.name ?? i.studentId,
        cell: ({ row }: { row: { original: InvoiceDoc } }) => {
          const s = studentById.get(row.original.studentId)
          return (
            <div>
              <p className="font-medium">{s?.name ?? row.original.studentId}</p>
              <p className="text-xs text-muted-foreground">{classById.get(s?.classId ?? '')?.name ?? ''}-{s?.section ?? ''}</p>
            </div>
          )
        },
      },
      { id: 'feeTypeName', header: 'Fee', accessorFn: (i: InvoiceDoc) => i.feeTypeName ?? i.feeTypeId },
      {
        id: 'periodKey', header: 'Period', accessorFn: (i: InvoiceDoc) => i.periodKey,
        cell: ({ getValue }: { getValue: () => unknown }) => {
          const v = getValue() as string
          const parts = v.split('-')
          const isMonth = parts.length === 2 && parts[1]?.length === 2
          return <span className="tabular text-xs">{isMonth ? monthLabel(v) : v}</span>
        },
      },
      {
        id: 'amount', header: 'Amount', accessorFn: (i: InvoiceDoc) => i.amount,
        cell: ({ row }: { row: { original: InvoiceDoc } }) => (
          <div className="text-right">
            <p className="tabular font-medium">{inr(row.original.amount - (row.original.discount ?? 0))}</p>
            {(row.original.discount ?? 0) > 0 && <p className="text-[11px] text-success tabular">-{inr(row.original.discount)} concession</p>}
          </div>
        ),
      },
      {
        id: 'paidAmount', header: 'Paid', accessorFn: (i: InvoiceDoc) => i.paidAmount ?? 0,
        cell: ({ getValue }: { getValue: () => unknown }) => <span className="tabular text-success">{inr(getValue() as number)}</span>,
      },
      {
        id: 'status', header: 'Status', accessorFn: (i: InvoiceDoc) => i.status,
        cell: ({ getValue }: { getValue: () => unknown }) => {
          const v = getValue() as InvoiceDoc['status']
          return <Badge variant={v === 'paid' ? 'success' : v === 'unpaid' ? 'danger' : v === 'waived' ? 'neutral' : 'warning'}>{v}</Badge>
        },
      },
      {
        id: 'dueDate', header: 'Due', accessorFn: (i: InvoiceDoc) => i.dueDate,
        cell: ({ getValue }: { getValue: () => unknown }) => <span className="text-xs tabular">{fmtDate(getValue() as string)}</span>,
      },
    ],
    [studentById, classById],
  )

  const bulkActions: BulkAction<InvoiceDoc>[] = [
    {
      label: 'Waive selected',
      variant: 'outline',
      onClick: (sel) => {
        Promise.all(sel.filter((i) => i.status !== 'paid').map((i) => update.mutateAsync({ id: i.id, data: { status: 'waived' } })))
          .then((r) => toast.success(`Waived ${r.length} invoices`))
      },
    },
  ]

  const totals = useMemo(() => {
    const billed = filtered.reduce((a, i) => a + i.amount - (i.discount ?? 0), 0)
    const paid = filtered.reduce((a, i) => a + (i.paidAmount ?? 0), 0)
    return { billed, paid, due: billed - paid }
  }, [filtered])

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Billed (filtered)</p><p className="text-lg font-bold tabular">{inr(totals.billed)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Collected</p><p className="text-lg font-bold tabular text-success">{inr(totals.paid)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Outstanding</p><p className="text-lg font-bold tabular text-danger">{inr(totals.due)}</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button className="gap-1.5" onClick={runGeneration} disabled={generating}>
          <Landmark className="size-4" /> {generating ? 'Generating...' : 'Generate this month\'s invoices'}
        </Button>
        <Button variant="outline" className="gap-1.5" onClick={() => setGenOpen(true)}>
          <FileText className="size-4" /> Custom generate...
        </Button>
        <span className="text-xs text-muted-foreground">Idempotent runs: safe to click repeatedly, never duplicates, never resets paid amounts.</span>
      </div>
      <GenerateInvoicesDialog
        open={genOpen}
        onOpenChange={setGenOpen}
        students={students}
        classes={classes}
        session={activeSession}
        onDone={() => refetch()}
      />

      <DataTable
        data={filtered}
        loading={isLoading}
        columns={columns as never}
        searchPlaceholder="Search student or fee..."
        exportName="invoices"
        bulkActions={bulkActions}
        filters={[
          { id: 'status', label: 'Status', options: [
            { label: 'Unpaid', value: 'unpaid' }, { label: 'Partial', value: 'partial' },
            { label: 'Paid', value: 'paid' }, { label: 'Waived', value: 'waived' },
          ] },
          { id: 'classId', label: 'Class', options: (classes ?? []).map((c) => ({ label: c.name, value: c.id })) },
          { id: 'periodKey', label: 'Period', options: periods.map((p) => ({ label: monthLabel(p), value: p })) },
        ]}
        filterValues={filters}
        onFilterChange={(id, v) => setFilters((f) => ({ ...f, [id]: v }))}
        emptyTitle="No invoices yet"
        emptyHint="Assign fees to classes, then click Generate. Monthly invoices are created automatically on month open too."
        actions={(i) => (
          <div className="flex justify-end gap-1">
            {i.status !== 'paid' && i.status !== 'waived' && (
              <Button size="sm" variant="ghost" onClick={() => setWaiveTarget(i)}>Waive</Button>
            )}
            <Button size="iconSm" variant="ghost" className="text-danger" aria-label="Delete invoice" onClick={() => softDelete.mutate({ id: i.id, by: user?.id })}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      />

      <ConfirmDialog
        open={Boolean(waiveTarget)}
        onOpenChange={(o) => !o && setWaiveTarget(null)}
        title="Waive this invoice?"
        description="Waived invoices are excluded from outstanding dues (e.g. staff-ward concessions). Use discounts for partial concessions instead."
        confirmLabel="Waive"
        onConfirm={() => {
          if (waiveTarget) {
            update.mutate({ id: waiveTarget.id, data: { status: 'waived' } })
            toast.success('Invoice waived')
          }
          setWaiveTarget(null)
        }}
      />
    </div>
  )
}

// ---------------- Payments ----------------

const paymentSchema = z.object({
  amount: z.number('Enter an amount').positive('Enter an amount'),
  mode: z.enum(['cash', 'upi', 'bank', 'cheque', 'online']),
  note: z.string().optional(),
})
type PaymentForm = z.infer<typeof paymentSchema>

function PaymentsTab({ students, sessionId }: { students: StudentDoc[]; sessionId: string }) {
  const { user } = useAuth()
  const { data: allInvoices } = useList<InvoiceDoc>(
    'invoices',
    sessionId ? { where: [['sessionId', '==', sessionId]] } : undefined,
  )
  const invoices = useMemo(
    () => [...(allInvoices ?? [])].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
    [allInvoices],
  )
  const { data: allPayments, isLoading } = useList<PaymentDoc>('payments', { orderBy: ['paidAt', 'desc'] })
  const invoiceSessionIds = useMemo(() => new Set((invoices ?? []).map((i) => i.id)), [invoices])
  const payments = useMemo(
    () => (sessionId ? (allPayments ?? []).filter((p) => invoiceSessionIds.has(p.invoiceId)) : allPayments),
    [allPayments, invoiceSessionIds, sessionId],
  )
  const bulkPayments = useBulkWrite('payments', ['invoices'])
  const updateInvoice = useUpdate('invoices')
  const createInvoice = useCreate('invoices')
  const { data: feeTypes } = useList<FeeTypeDoc>('feeTypes')
  const { data: users } = useList<UserDoc>('users')
  const [target, setTarget] = useState<InvoiceDoc | null>(null)
  const [adHocOpen, setAdHocOpen] = useState(false)
  const [adHocStudent, setAdHocStudent] = useState('')
  const [adHocFeeType, setAdHocFeeType] = useState('')
  const [adHocAmount, setAdHocAmount] = useState(0)
  const form = useForm<PaymentForm>({ resolver: zodResolver(paymentSchema), values: { amount: 0, mode: 'cash', note: '' } })

  const studentById = useMemo(() => new Map((students ?? []).map((s) => [s.id, s])), [students])

  const outstanding = useMemo(() => (invoices ?? []).filter((i) => i.status !== 'paid' && i.status !== 'waived'), [invoices])

  const collect = async (invoice: InvoiceDoc, v: PaymentForm) => {
    const due = invoice.amount - (invoice.discount ?? 0) - (invoice.paidAmount ?? 0)
    if (v.amount > due) {
      toast.error(`Amount exceeds due (${inr(due)})`, { description: 'Partial payments are allowed, overpayments are not.' })
      return
    }
    const receiptNo = `RCP-${new Date().getFullYear()}-${String((payments?.length ?? 0) + 1).padStart(4, '0')}`
    await bulkPayments.mutateAsync([{ data: {
      invoiceId: invoice.id, studentId: invoice.studentId, amount: v.amount, mode: v.mode,
      paidAt: Date.now(), receiptNo, collectedBy: user?.id ?? '', note: v.note ?? null,
    } }])
    const newPaid = (invoice.paidAmount ?? 0) + v.amount
    const newStatus = newPaid >= invoice.amount - (invoice.discount ?? 0) ? 'paid' : 'partial'
    await updateInvoice.mutateAsync({ id: invoice.id, data: { paidAmount: newPaid, status: newStatus } })
    const parentUserId = studentById.get(invoice.studentId)?.parentUserId
    if (parentUserId) {
      void notify(parentUserId, 'Payment received', `${inr(v.amount)} received for ${invoice.feeTypeName ?? 'fees'} (${invoice.periodKey}). Receipt ${receiptNo}.`, '/portal')
    }
    toast.success(`Payment recorded · ${receiptNo}`, { description: `Balance: ${inr(Math.max(0, due - v.amount))}` })
    setTarget(null)
    form.reset({ amount: 0, mode: 'cash', note: '' })
  }

  const collectAdHoc = async () => {
    if (!adHocStudent || !adHocFeeType || !adHocAmount) {
      toast.error('Pick student, fee type and amount')
      return
    }
    const ft = feeTypes?.find((f) => f.id === adHocFeeType)
    const invId = `${adHocStudent}_${adHocFeeType}_manual-${Date.now().toString(36)}`
    await createInvoice.mutateAsync({
      id: invId,
      data: {
        sessionId, studentId: adHocStudent, feeTypeId: adHocFeeType, feeTypeName: ft?.name,
        periodKey: new Date().toISOString().slice(0, 7), amount: adHocAmount, discount: 0, paidAmount: adHocAmount,
        dueDate: new Date().toISOString().slice(0, 10), status: 'paid', generatedByRunId: 'manual',
      },
    })
    const receiptNo = `RCP-${new Date().getFullYear()}-${String((payments?.length ?? 0) + 1).padStart(4, '0')}`
    await bulkPayments.mutateAsync([{ data: {
      invoiceId: invId, studentId: adHocStudent, amount: adHocAmount, mode: form.getValues('mode'),
      paidAt: Date.now(), receiptNo, collectedBy: user?.id ?? '',
    } }])
    toast.success(`One-time fee collected · ${receiptNo}`)
    setAdHocOpen(false)
    setAdHocAmount(0)
  }

  const columns = useMemo(
    () => [
      {
        id: 'receiptNo', header: 'Receipt', accessorFn: (p: PaymentDoc) => p.receiptNo,
        cell: ({ getValue }: { getValue: () => unknown }) => <span className="tabular font-medium">{getValue() as string}</span>,
      },
      {
        id: 'student', header: 'Student', accessorFn: (p: PaymentDoc) => studentById.get(p.studentId)?.name ?? p.studentId,
      },
      {
        id: 'amount', header: 'Amount', accessorFn: (p: PaymentDoc) => p.amount,
        cell: ({ getValue }: { getValue: () => unknown }) => <span className="tabular font-semibold text-success">{inr(getValue() as number)}</span>,
      },
      {
        id: 'mode', header: 'Mode', accessorFn: (p: PaymentDoc) => p.mode,
        cell: ({ getValue }: { getValue: () => unknown }) => <Badge variant="outline">{getValue() as string}</Badge>,
      },
      {
        id: 'paidAt', header: 'Paid at', accessorFn: (p: PaymentDoc) => p.paidAt,
        cell: ({ getValue }: { getValue: () => unknown }) => <span className="text-xs tabular">{fmtDate(getValue() as number)}</span>,
      },
      {
        id: 'collectedBy', header: 'Collected by',
        accessorFn: (p: PaymentDoc) => users?.find((u) => u.id === p.collectedBy)?.name ?? p.collectedBy,
      },
    ],
    [studentById, users],
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button className="gap-1.5" onClick={() => setAdHocOpen(true)}><Wallet className="size-4" /> One-time collection</Button>
        <Badge variant="warning">{outstanding.length} invoices awaiting payment</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">Collect against outstanding invoices</div>
          {outstanding.length === 0 ? (
            <EmptyState compact title="Nothing outstanding" hint="Every invoice is paid or waived. New invoices appear when generated." />
          ) : (
            <div className="max-h-80 divide-y divide-border/60 overflow-y-auto">
              {outstanding.slice(0, 40).map((i) => {
                const due = i.amount - (i.discount ?? 0) - (i.paidAmount ?? 0)
                const s = studentById.get(i.studentId)
                return (
                  <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <div>
                      <p className="font-medium">{s?.name ?? i.studentId} · {i.feeTypeName ?? i.feeTypeId} <span className="text-xs text-muted-foreground">({i.periodKey})</span></p>
                      <p className="text-xs text-muted-foreground tabular">Due {inr(due)} · {i.status}</p>
                    </div>
                    <Button size="sm" variant="soft" onClick={() => { setTarget(i); form.setValue('amount', due) }}>Collect</Button>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? <Skeleton className="h-64 rounded-xl" /> : (
        <DataTable
          data={payments}
          columns={columns as never}
          searchPlaceholder="Search receipt or student..."
          exportName="payments"
          emptyTitle="No payments recorded yet"
        />
      )}

      {/* collect dialog */}
      <SheetRoot open={Boolean(target)} onOpenChange={(o) => !o && setTarget(null)}>
        <SheetContent
          title="Collect payment"
          description={target ? `${studentById.get(target.studentId)?.name ?? ''} · ${target.feeTypeName} (${target.periodKey})` : ''}
        >
          <form onSubmit={form.handleSubmit((v) => target && collect(target, v))} className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <p className="flex justify-between"><span>Invoice amount</span><span className="tabular">{inr(target?.amount ?? 0)}</span></p>
              <p className="flex justify-between text-success"><span>Already paid</span><span className="tabular">{inr(target?.paidAmount ?? 0)}</span></p>
              <p className="flex justify-between font-semibold"><span>Due now</span><span className="tabular">{inr((target?.amount ?? 0) - (target?.discount ?? 0) - (target?.paidAmount ?? 0))}</span></p>
            </div>
            <div className="space-y-1.5">
              <Label>Amount being paid now (₹)</Label>
              <Input type="number" step="1" {...form.register('amount', { valueAsNumber: true })} />
              {form.formState.errors.amount && <p className="text-xs text-danger">{form.formState.errors.amount.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Mode</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm" {...form.register('mode')}>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="bank">Bank transfer</option>
                <option value="cheque">Cheque</option>
                <option value="online">Online gateway</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Textarea rows={2} {...form.register('note')} />
            </div>
            <Button type="submit" className="w-full">Record payment & get receipt</Button>
          </form>
        </SheetContent>
      </SheetRoot>

      {/* ad-hoc dialog */}
      <SheetRoot open={adHocOpen} onOpenChange={setAdHocOpen}>
        <SheetContent title="One-time collection" description="For fees collected on the spot that were not part of the generated cycle (e.g. event fee).">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Student</Label>
              <Select value={adHocStudent} onValueChange={setAdHocStudent}>
                <SelectTrigger><SelectValue placeholder="Pick student" /></SelectTrigger>
                <SelectContent>
                  {(students ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.admissionNo})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fee type</Label>
              <Select value={adHocFeeType} onValueChange={setAdHocFeeType}>
                <SelectTrigger><SelectValue placeholder="Pick fee type" /></SelectTrigger>
                <SelectContent>
                  {(feeTypes ?? []).map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Amount (₹)</Label>
              <Input type="number" value={adHocAmount || ''} onChange={(e) => setAdHocAmount(Number(e.target.value))} />
            </div>
            <Button className="w-full" onClick={collectAdHoc}>Record payment</Button>
          </div>
        </SheetContent>
      </SheetRoot>
    </div>
  )
}

// ---------------- Records (reports) ----------------

function RecordsTab({ students, classes, sessionId }: { students: StudentDoc[]; classes: ClassDoc[]; sessionId: string }) {
  const { data: invoices } = useList<InvoiceDoc>(
    'invoices',
    sessionId ? { where: [['sessionId', '==', sessionId]] } : undefined,
  )
  const { data: allPayments } = useList<PaymentDoc>('payments')
  const invoiceIds = useMemo(() => new Set((invoices ?? []).map((i) => i.id)), [invoices])
  const payments = useMemo(
    () => (sessionId ? (allPayments ?? []).filter((p) => invoiceIds.has(p.invoiceId)) : allPayments),
    [allPayments, invoiceIds, sessionId],
  )
  const studentById = useMemo(() => new Map((students ?? []).map((s) => [s.id, s])), [students])
  const classById = useMemo(() => new Map((classes ?? []).map((c) => [c.id, c])), [classes])

  const byMonth = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of payments ?? []) {
      const key = new Date(p.paidAt).toISOString().slice(0, 7)
      map.set(key, (map.get(key) ?? 0) + p.amount)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [payments])

  const defaulters = useMemo(() => {
    const due = new Map<string, number>()
    for (const i of invoices ?? []) {
      if (i.status === 'paid' || i.status === 'waived') continue
      due.set(i.studentId, (due.get(i.studentId) ?? 0) + i.amount - (i.discount ?? 0) - (i.paidAmount ?? 0))
    }
    return [...due.entries()]
      .map(([studentId, amount]) => ({ student: studentById.get(studentId), amount }))
      .filter((x) => x.student)
      .sort((a, b) => b.amount - a.amount)
  }, [invoices, studentById])

  const byClass = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of payments ?? []) {
      const s = studentById.get(p.studentId)
      const key = s ? classById.get(s.classId)?.name ?? s.classId : 'Unknown'
      map.set(key, (map.get(key) ?? 0) + p.amount)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [payments, studentById, classById])

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline" size="sm" className="gap-1.5"
          onClick={() => downloadCsv('defaulters.csv', [
            ['Student', 'Admission No', 'Class', 'Outstanding'],
            ...defaulters.map((d) => [d.student?.name ?? '', d.student?.admissionNo ?? '', classById.get(d.student?.classId ?? '')?.name ?? '', d.amount]),
          ])}
        >
          <Download className="size-3.5" /> Export defaulters
        </Button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold">Collection by month</div>
            {byMonth.length === 0 ? (
              <EmptyState compact title="No collections yet" />
            ) : (
              <div className="divide-y divide-border/60">
                {byMonth.map(([m, total]) => (
                  <div key={m} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span>{monthLabel(m)}</span>
                    <span className="tabular font-semibold text-success">{inr(total)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-0">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold">Collection by class</div>
            {byClass.length === 0 ? (
              <EmptyState compact title="No collections yet" />
            ) : (
              <div className="divide-y divide-border/60">
                {byClass.map(([c, total]) => (
                  <div key={c} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span>{c}</span>
                    <span className="tabular font-semibold">{inr(total)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">Defaulters ({defaulters.length})</div>
          {defaulters.length === 0 ? (
            <EmptyState compact title="No defaulters" hint="Every invoice is settled or waived." />
          ) : (
            <div className="divide-y divide-border/60">
              {defaulters.map((d) => (
                <div key={d.student!.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div>
                    <p className="font-medium">{d.student!.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {classById.get(d.student!.classId)?.name ?? ''}-{d.student!.section} · {d.student!.guardianPhone ?? ''}
                    </p>
                  </div>
                  <span className="tabular font-semibold text-danger">{inr(d.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------- Receipt templates pointer ----------------

function ReceiptTemplatesTab() {
  return (
    <EmptyState
      icon={<FileText className="size-5" />}
      title="Receipt templates live in the Templates module"
      hint="Open Templates > Receipts to design the printed receipt: logo, header lines, fields and QR. One template per kind is seeded as default."
      action={<a href="/templates?tab=receipts"><Button>Open receipt designer</Button></a>}
    />
  )
}

// ---------------- Page ----------------

export default function FeesPage() {
  const session = useSessionScope()
  const sessionId = session?.id ?? ''
  const { data: classes } = useList<ClassDoc>('classes')
  const { data: feeTypes } = useList<FeeTypeDoc>('feeTypes')
  const { data: students } = useList<StudentDoc>('students')

  return (
    <TabbedModule
      title="Fees"
      info="The full fee cycle: define fee types with a frequency, assign them to classes or students, generate period invoices (idempotent, no duplicates), collect partial or full payments with auto receipt numbers, and pull collection reports and defaulter lists."
      tabs={[
        { key: 'types', label: 'Fee types', badge: feeTypes?.length, content: <FeeTypesTab /> },
        { key: 'assignments', label: 'Assignments', content: <AssignmentsTab classes={classes ?? []} feeTypes={feeTypes ?? []} sessionId={sessionId} /> },
        { key: 'invoices', label: 'Invoices', content: <InvoicesTab students={students ?? []} classes={classes ?? []} sessionId={sessionId} /> },
        { key: 'payments', label: 'Payments', content: <PaymentsTab students={students ?? []} sessionId={sessionId} /> },
        { key: 'records', label: 'Records', content: <RecordsTab students={students ?? []} classes={classes ?? []} sessionId={sessionId} /> },
        { key: 'receipt-templates', label: 'Receipt templates', content: <ReceiptTemplatesTab /> },
      ]}
    />
  )
}
