import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Download, FileUp, Pencil, Plus, Trash2, UserRound } from 'lucide-react'
import Papa from 'papaparse'
import { DataTable, type BulkAction } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Badge, Avatar } from '@/components/ui/display'
import { Input, Label, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SheetContent, Sheet as SheetRoot } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/dialog'
import { ImageUrlField } from '@/components/shared/ImageUrlField'
import { useList, useCreate, useUpdate, useSoftDelete, useBulkWrite } from '@/lib/data/hooks'
import { useAuth } from '@/lib/auth'
import type { ClassDoc, StudentDoc } from '@/lib/types'
import { downloadCsv, fmtDate, todayStr } from '@/lib/utils'

const studentSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  gender: z.enum(['male', 'female', 'other']),
  dob: z.string().optional(),
  bloodGroup: z.string().optional(),
  classId: z.string().min(1, 'Pick a class'),
  section: z.string().min(1, 'Pick a section'),
  rollNo: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  guardianName: z.string().optional(),
  guardianPhone: z.string().optional(),
  category: z.string().optional(),
  religion: z.string().optional(),
  admissionDate: z.string().optional(),
})
type StudentForm = z.infer<typeof studentSchema>

const CLASS_NAMES = ['Nursery', 'LKG', 'UKG', ...Array.from({ length: 12 }, (_, i) => `Class ${i + 1}`)]

export function StudentsTable({ classes, hideHeader }: { classes: ClassDoc[]; hideHeader?: boolean }) {
  void hideHeader
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: students, isLoading } = useList<StudentDoc>('students')
  const softDelete = useSoftDelete('students')
  const bulk = useBulkWrite('students')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<StudentDoc | undefined>()
  const [importOpen, setImportOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<StudentDoc | null>(null)
  const [filters, setFilters] = useState<Record<string, string>>({})

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes])
  const filtered = useMemo(() => {
    let out = students ?? []
    if (filters.classId && filters.classId !== 'all') out = out.filter((s) => s.classId === filters.classId)
    if (filters.section && filters.section !== 'all') out = out.filter((s) => s.section === filters.section)
    if (filters.status && filters.status !== 'all') out = out.filter((s) => s.status === filters.status)
    return out
  }, [students, filters])

  const sectionOptions = useMemo(() => {
    const cid = filters.classId
    const sections = cid && cid !== 'all' ? classById.get(cid)?.sections ?? [] : [...new Set((students ?? []).map((s) => s.section))]
    return sections.map((s) => ({ label: s, value: s }))
  }, [filters.classId, classById, students])

  const columns = useMemo(
    () => [
      {
        id: 'name',
        header: 'Student',
        accessorFn: (s: StudentDoc) => `${s.name} ${s.admissionNo}`,
        cell: ({ row }: { row: { original: StudentDoc } }) => (
          <div className="flex items-center gap-2.5">
            <Avatar src={row.original.photoUrl} name={row.original.name} size={30} />
            <div className="min-w-0">
              <p className="truncate font-medium">{row.original.name}</p>
              <p className="truncate text-xs text-muted-foreground">{row.original.admissionNo}</p>
            </div>
          </div>
        ),
      },
      {
        id: 'class',
        header: 'Class',
        accessorFn: (s: StudentDoc) => classById.get(s.classId)?.name ?? s.classId,
        cell: ({ row }: { row: { original: StudentDoc } }) => {
          const c = classById.get(row.original.classId)
          return <Badge variant="outline">{c?.name ?? '?'}-{row.original.section}</Badge>
        },
      },
      {
        id: 'rollNo',
        header: 'Roll',
        accessorFn: (s: StudentDoc) => s.rollNo ?? '',
        cell: ({ getValue }: { getValue: () => unknown }) => <span className="tabular">{(getValue() as string) || '-'}</span>,
      },
      {
        id: 'guardianPhone',
        header: 'Guardian',
        accessorFn: (s: StudentDoc) => `${s.guardianName ?? ''} ${s.guardianPhone ?? ''}`,
        cell: ({ row }: { row: { original: StudentDoc } }) => (
          <div className="text-xs">
            <p>{row.original.guardianName || '-'}</p>
            <p className="text-muted-foreground tabular">{row.original.guardianPhone || ''}</p>
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (s: StudentDoc) => s.status,
        cell: ({ getValue }: { getValue: () => unknown }) => {
          const v = getValue() as StudentDoc['status']
          return v === 'active' ? <Badge variant="success">active</Badge> : <Badge variant="neutral">{v}</Badge>
        },
      },
    ],
    [classById],
  )

  const bulkActions: BulkAction<StudentDoc>[] = [
    {
      label: 'Delete selected',
      icon: <Trash2 className="size-3.5" />,
      variant: 'destructive',
      onClick: (sel) => {
        Promise.all(sel.map((s) => softDelete.mutateAsync({ id: s.id, by: user?.id }))).then(() =>
          toast.success(`${sel.length} students moved to Trash`),
        )
      },
    },
  ]

  const nextAdmission = String(1000 + (students?.length ?? 0) + 1)

  return (
    <>
      <DataTable
        data={filtered}
        loading={isLoading}
        columns={columns as never}
        searchPlaceholder="Search name, admission no..."
        exportName="students"
        bulkActions={bulkActions}
        filters={[
          { id: 'classId', label: 'Class', options: classes.map((c) => ({ label: c.name, value: c.id })) },
          { id: 'section', label: 'Section', options: sectionOptions },
          { id: 'status', label: 'Status', options: [
            { label: 'Active', value: 'active' }, { label: 'Graduated', value: 'graduated' },
            { label: 'Transferred', value: 'transferred' }, { label: 'Left', value: 'left' },
          ] },
        ]}
        filterValues={filters}
        onFilterChange={(id, v) => setFilters((f) => ({ ...f, [id]: v }))}
        onRowClick={(s) => navigate(`/people/${s.id}?kind=student`)}
        emptyTitle="No students found"
        emptyHint="Add students one by one, or import a CSV from your admission register."
        toolbarExtra={
          <>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setImportOpen(true)}>
              <FileUp className="size-3.5" /> Import CSV
            </Button>
            <Button
              size="sm" variant="outline" className="gap-1.5"
              onClick={() =>
                downloadCsv('student-import-template.csv', [
                  ['name', 'gender', 'dob', 'class', 'section', 'rollNo', 'guardianName', 'guardianPhone', 'phone', 'address'],
                  ['Aarav Sharma', 'male', '2011-05-14', 'Class 5', 'A', '12', 'Rahul Sharma', '+91 98480 11111', '', 'Vidya Nagar'],
                ])
              }
            >
              <Download className="size-3.5" /> Template
            </Button>
          </>
        }
        emptyAction={
          <Button onClick={() => { setEditing(undefined); setSheetOpen(true) }} className="gap-1.5">
            <Plus className="size-4" /> Add student
          </Button>
        }
        actions={(s) => (
          <div className="flex justify-end gap-1">
            <Button size="iconSm" variant="ghost" aria-label={`Edit ${s.name}`} onClick={(e) => { e.stopPropagation(); setEditing(s); setSheetOpen(true) }}>
              <Pencil className="size-3.5" />
            </Button>
            <Button
              size="iconSm" variant="ghost" className="text-danger" aria-label={`Delete ${s.name}`}
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(s) }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      />

      <StudentSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        existing={editing}
        classes={classes}
        _students={undefined}
        nextAdmission={`ADM${new Date().getFullYear()}${nextAdmission}`}
      />

      <CsvImportSheet
        open={importOpen}
        onOpenChange={setImportOpen}
        classes={classes}
        onImport={async (rows) => {
          await bulk.mutateAsync(rows.map((r) => ({ data: r })))
          toast.success(`Imported ${rows.length} students`)
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={`Move ${confirmDelete?.name} to Trash?`}
        description="The record is recoverable from Trash. Attendance, fees and marks history are preserved."
        confirmLabel="Move to Trash"
        destructive
        onConfirm={() => {
          if (confirmDelete) softDelete.mutate({ id: confirmDelete.id, by: user?.id })
          setConfirmDelete(null)
        }}
      />
    </>
  )
}

function StudentSheet({
  open,
  onOpenChange,
  existing,
  classes,
  _students,
  nextAdmission,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  existing?: StudentDoc
  classes: ClassDoc[]
  _students?: StudentDoc[]
  nextAdmission: string
}) {
  const create = useCreate('students')
  const update = useUpdate('students')
  const [photoUrl, setPhotoUrl] = useState(existing?.photoUrl ?? '')
  const [classId, setClassId] = useState(existing?.classId ?? '')
  const selectedClass = classes.find((c) => c.id === classId)

  const form = useForm<StudentForm>({
    resolver: zodResolver(studentSchema),
    values: existing
      ? {
          name: existing.name, gender: existing.gender, dob: existing.dob ?? '', bloodGroup: existing.bloodGroup ?? '',
          classId: existing.classId, section: existing.section, rollNo: existing.rollNo ?? '', phone: existing.phone ?? '',
          address: existing.address ?? '', guardianName: existing.guardianName ?? '', guardianPhone: existing.guardianPhone ?? '',
          category: existing.category ?? '', religion: existing.religion ?? '', admissionDate: existing.admissionDate ?? '',
        }
      : {
          name: '', gender: 'male', dob: '', bloodGroup: '', classId: '', section: '', rollNo: '', phone: '', address: '',
          guardianName: '', guardianPhone: '', category: 'General', religion: '', admissionDate: todayStr(),
        },
  })

  const submit = async (v: StudentForm) => {
    const payload: Record<string, unknown> = { ...v, photoUrl, dob: v.dob || null, admissionDate: v.admissionDate || todayStr() }
    try {
      if (existing) {
        await update.mutateAsync({ id: existing.id, data: payload })
        toast.success('Student updated')
      } else {
        const admissionNo = nextAdmission
        await create.mutateAsync({ data: { ...payload, admissionNo, status: 'active' } })
        toast.success('Student admitted', { description: `Admission no: ${admissionNo}` })
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    }
  }

  return (
    <SheetRoot open={open} onOpenChange={(o) => { if (!o) form.reset(); onOpenChange(o) }}>
      <SheetContent
        wide
        title={existing ? `Edit ${existing.name}` : 'New admission'}
        description={existing ? `Admission no ${existing.admissionNo}` : `Admission no will be ${nextAdmission}`}
      >
        <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
          <ImageUrlField value={photoUrl} onChange={setPhotoUrl} label="Photo (external URL)" allowAvatarShrink hint="Paste a direct link to the student's photo. No file is uploaded to Firebase." />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input {...form.register('name')} />
              {form.formState.errors.name && <p className="text-xs text-danger">{form.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm" {...form.register('gender')}>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Date of birth</Label>
              <Input type="date" {...form.register('dob')} />
            </div>
            <div className="space-y-1.5">
              <Label>Blood group</Label>
              <Input placeholder="O+" {...form.register('bloodGroup')} />
            </div>
            <div className="space-y-1.5">
              <Label>Class</Label>
              <Select value={classId} onValueChange={(v) => { setClassId(v); form.setValue('classId', v); form.setValue('section', '') }}>
                <SelectTrigger><SelectValue placeholder="Pick class" /></SelectTrigger>
                <SelectContent>
                  {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.formState.errors.classId && <p className="text-xs text-danger">{form.formState.errors.classId.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Section</Label>
              <Select value={form.watch('section')} onValueChange={(v) => form.setValue('section', v)}>
                <SelectTrigger><SelectValue placeholder="Pick section" /></SelectTrigger>
                <SelectContent>
                  {(selectedClass?.sections ?? []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.formState.errors.section && <p className="text-xs text-danger">{form.formState.errors.section.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Roll no</Label>
              <Input {...form.register('rollNo')} />
            </div>
            <div className="space-y-1.5">
              <Label>Admission date</Label>
              <Input type="date" {...form.register('admissionDate')} />
            </div>
            <div className="space-y-1.5">
              <Label>Guardian name</Label>
              <Input {...form.register('guardianName')} />
            </div>
            <div className="space-y-1.5">
              <Label>Guardian phone (+91)</Label>
              <Input placeholder="+91 98480 12345" {...form.register('guardianPhone')} />
            </div>
            <div className="space-y-1.5">
              <Label>Student phone</Label>
              <Input {...form.register('phone')} />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Input placeholder="General / OBC / SC / ST" {...form.register('category')} />
            </div>
            <div className="space-y-1.5">
              <Label>Religion</Label>
              <Input {...form.register('religion')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Textarea rows={2} {...form.register('address')} />
          </div>
          <Button type="submit" className="w-full" disabled={create.isPending || update.isPending}>
            {existing ? 'Save changes' : 'Admit student'}
          </Button>
        </form>
      </SheetContent>
    </SheetRoot>
  )
}

interface CsvRow {
  name: string
  gender?: string
  dob?: string
  class?: string
  section?: string
  rollNo?: string
  guardianName?: string
  guardianPhone?: string
  phone?: string
  address?: string
}

function CsvImportSheet({
  open,
  onOpenChange,
  classes,
  onImport,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  classes: ClassDoc[]
  onImport: (rows: Record<string, unknown>[]) => Promise<void>
}) {
  const [report, setReport] = useState<{ ok: Record<string, unknown>[]; errors: { line: number; message: string }[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (file: File) => {
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const errors: { line: number; message: string }[] = []
        const ok: Record<string, unknown>[] = []
        res.data.forEach((r, i) => {
          const line = i + 2
          if (!r.name || r.name.trim().length < 2) {
            errors.push({ line, message: 'Missing or too-short name' })
            return
          }
          const cls = classes.find((c) => c.name.toLowerCase() === (r.class ?? '').trim().toLowerCase())
          if (!cls) {
            errors.push({ line, message: `Class "${r.class ?? ''}" not found. Use names like ${CLASS_NAMES.slice(0, 3).join(', ')}...` })
            return
          }
          const section = (r.section ?? 'A').trim().toUpperCase()
          if (!cls.sections.includes(section)) {
            errors.push({ line, message: `Section "${section}" is not in ${cls.name} (has ${cls.sections.join(', ')})` })
            return
          }
          ok.push({
            name: r.name.trim(),
            gender: ['male', 'female', 'other'].includes((r.gender ?? '').toLowerCase()) ? (r.gender!.toLowerCase() as string) : 'male',
            dob: r.dob || null,
            classId: cls.id,
            section,
            rollNo: r.rollNo || null,
            guardianName: r.guardianName || null,
            guardianPhone: r.guardianPhone || null,
            phone: r.phone || null,
            address: r.address || null,
            admissionNo: `ADM-CSV-${Date.now().toString(36)}-${i}`,
            admissionDate: todayStr(),
            status: 'active',
          })
        })
        setReport({ ok, errors })
      },
    })
  }

  return (
    <SheetRoot open={open} onOpenChange={(o) => { setReport(null); onOpenChange(o) }}>
      <SheetContent wide title="Import students from CSV" description="Use the Template button to get the exact expected columns. Class and section must already exist.">
        <input
          ref={fileRef} type="file" accept=".csv" className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
          <FileUp className="size-4" /> Choose CSV file
        </Button>
        {report && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-border p-3 text-sm">
              <p className="font-medium text-success">{report.ok.length} rows ready to import</p>
              {report.errors.length > 0 && (
                <div className="mt-2">
                  <p className="font-medium text-danger">{report.errors.length} rows will be skipped:</p>
                  <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                    {report.errors.map((e, i) => (
                      <li key={i} className="tabular">Line {e.line}: {e.message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <Button
              className="w-full" disabled={!report.ok.length || busy}
              onClick={async () => { setBusy(true); await onImport(report.ok); setBusy(false); onOpenChange(false) }}
            >
              Import {report.ok.length} students
            </Button>
          </div>
        )}
        <div className="mt-4 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5 font-medium text-foreground"><UserRound className="size-3.5" /> How class matching works</p>
          <p className="mt-1">The <code className="font-mono">class</code> column is matched by exact name (case-insensitive), e.g. "Class 10". Sections must exist on that class. Admission numbers are auto-assigned for CSV rows.</p>
        </div>
      </SheetContent>
    </SheetRoot>
  )
}

export function StudentsEmptyHint() {
  return <EmptyState title="Students" hint="They will appear here once admitted." compact />
}

// keep fmtDate referenced for profile reuse elsewhere
export const studentDobLabel = (s: StudentDoc) => fmtDate(s.dob)
