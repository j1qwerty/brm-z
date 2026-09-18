import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowLeft, BadgeCheck, CalendarCheck, FileText, GraduationCap, IndianRupee, Plus, ClipboardList } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardContent, Avatar, Progress, Skeleton } from '@/components/ui/display'
import { Label } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SheetContent, Sheet as SheetRoot } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/toggle'
import { ImageUrlField } from '@/components/shared/ImageUrlField'
import { useGet, useList, useCreate, useUpdate } from '@/lib/data/hooks'
import { useAuth } from '@/lib/auth'
import { can } from '@/lib/permissions'
import type { AttendanceDoc, ClassDoc, DocumentDoc, ExamDoc, InvoiceDoc, LeaveDoc, MarkDoc, PaymentDoc, StaffDoc, StudentDoc, SubjectDoc } from '@/lib/types'
import { fmtDate, inr, pct } from '@/lib/utils'

export default function PersonProfilePage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const kind = params.get('kind') === 'staff' ? 'staff' : 'student'
  const navigate = useNavigate()
  const { user } = useAuth()

  const student = useGet<StudentDoc>('students', kind === 'student' ? id : undefined)
  const staff = useGet<StaffDoc>('staff', kind === 'staff' ? id : undefined)
  const { data: classes } = useList<ClassDoc>('classes')
  const person = kind === 'student' ? student.data : staff.data
  const loading = kind === 'student' ? student.isLoading : staff.isLoading

  const name = kind === 'student' ? (student.data?.name ?? '...') : (staff.data?.name ?? '...')
  const subtitle = kind === 'student'
    ? (() => {
        const s = student.data
        const c = classes?.find((cl) => cl.id === s?.classId)
        return s ? `${c?.name ?? 'Class?'}-${s.section} · Admission ${s.admissionNo}` : ''
      })()
    : staff.data
      ? `${staff.data.designation ?? 'Staff'} · ${staff.data.employeeNo ?? ''}`
      : ''

  const canSeeFees = kind === 'student' && can(user?.role, 'fees.manage')
  const canSeeMarks = kind === 'student' && can(user?.role, 'reports.view')

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-3 gap-1.5" onClick={() => navigate(-1)}>
        <ArrowLeft className="size-3.5" /> Back
      </Button>
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : !person ? (
        <EmptyState title="Record not found" hint="It may have been removed. Check Trash or search again (Ctrl K)." />
      ) : (
        <>
          <Card className="mb-5">
            <CardContent className="flex flex-wrap items-center gap-4 p-5">
              <Avatar src={person.photoUrl} name={name} size={64} />
              <div className="min-w-0 flex-1">
                <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold">
                  {name}
                  {kind === 'student' && student.data?.status !== 'active' && (
                    <Badge variant="warning">{student.data?.status}</Badge>
                  )}
                  {kind === 'staff' && <Badge variant="neutral">{staff.data?.staffType === 'teaching' ? 'Teaching' : 'Non-teaching'}</Badge>}
                </h1>
                <p className="text-sm text-muted-foreground">{subtitle}</p>
              </div>
              {kind === 'student' && can(user?.role, 'people.manage') && (
                <Button variant="outline" size="sm" onClick={() => navigate('/people?tab=students')}>
                  Edit in People
                </Button>
              )}
            </CardContent>
          </Card>

          <Tabs defaultValue="profile">
            <TabsList>
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="attendance"><CalendarCheck className="size-3.5" /> Attendance</TabsTrigger>
              {canSeeFees && <TabsTrigger value="fees"><IndianRupee className="size-3.5" /> Fees</TabsTrigger>}
              {canSeeMarks && <TabsTrigger value="marks"><GraduationCap className="size-3.5" /> Marks</TabsTrigger>}
              <TabsTrigger value="documents"><FileText className="size-3.5" /> Documents</TabsTrigger>
              <TabsTrigger value="leaves"><ClipboardList className="size-3.5" /> Leaves</TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="mt-4">
              <ProfileTab kind={kind} person={person} />
            </TabsContent>
            <TabsContent value="attendance" className="mt-4">
              <AttendanceTab personType={kind === 'student' ? 'student' : 'staff'} personId={person.id} />
            </TabsContent>
            {canSeeFees && (
              <TabsContent value="fees" className="mt-4">
                <FeesTab studentId={person.id} />
              </TabsContent>
            )}
            {canSeeMarks && (
              <TabsContent value="marks" className="mt-4">
                <MarksTab studentId={person.id} />
              </TabsContent>
            )}
            <TabsContent value="documents" className="mt-4">
              <DocumentsTab ownerType={kind === 'student' ? 'student' : 'staff'} ownerId={person.id} />
            </TabsContent>
            <TabsContent value="leaves" className="mt-4">
              <LeavesTab personType={kind === 'student' ? 'student' : 'staff'} personId={person.id} personName={name} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}

function ProfileTab({ kind, person }: { kind: 'student' | 'staff'; person: StudentDoc | StaffDoc }) {
  const rows: [string, string][] =
    kind === 'student'
      ? (() => {
          const s = person as StudentDoc
          return [
            ['Admission no', s.admissionNo], ['Roll no', s.rollNo ?? '-'], ['Date of birth', fmtDate(s.dob)],
            ['Blood group', s.bloodGroup ?? '-'], ['Guardian', s.guardianName ?? '-'], ['Guardian phone', s.guardianPhone ?? '-'],
            ['Phone', s.phone ?? '-'], ['Category', s.category ?? '-'], ['Religion', s.religion ?? '-'],
            ['Admission date', fmtDate(s.admissionDate)], ['Address', s.address ?? '-'],
          ]
        })()
      : (() => {
          const s = person as StaffDoc
          return [
            ['Employee no', s.employeeNo ?? '-'], ['Designation', s.designation ?? '-'], ['Qualification', s.qualification ?? '-'],
            ['Phone', s.phone ?? '-'], ['Email', s.email ?? '-'], ['Join date', fmtDate(s.joinDate)],
            ['Blood group', s.bloodGroup ?? '-'], ['Address', s.address ?? '-'],
          ]
        })()

  return (
    <Card>
      <CardContent className="grid gap-x-8 gap-y-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([k, v]) => (
          <div key={k}>
            <p className="text-xs font-medium text-muted-foreground">{k}</p>
            <p className="text-sm font-medium">{v}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function AttendanceTab({ personType, personId }: { personType: 'student' | 'staff'; personId: string }) {
  const { data: records, isLoading } = useList<AttendanceDoc>('attendance', {
    where: [['personType', '==', personType], ['personId', '==', personId]],
    orderBy: ['date', 'desc'],
    limit: 60,
  })

  const stats = useMemo(() => {
    const rs = records ?? []
    const present = rs.filter((r) => r.status === 'present' || r.status === 'late' || r.status === 'half-day').length
    return { total: rs.length, present, pctv: pct(present, rs.length) }
  }, [records])

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-6 p-5">
          <div>
            <p className="text-3xl font-bold tabular">{stats.total ? `${stats.pctv}%` : '-'}</p>
            <p className="text-xs text-muted-foreground">attendance (last {stats.total} records)</p>
          </div>
          <div className="flex-1 min-w-48">
            <Progress value={stats.pctv} barColor={stats.pctv >= 75 ? 'bg-success' : 'bg-danger'} />
            <p className="mt-1.5 text-xs text-muted-foreground">
              {stats.pctv >= 75 ? 'Meets the 75% requirement' : 'Below 75% - at risk of detention per CBSE norms'}
            </p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-8" />)}</div>
          ) : (records ?? []).length === 0 ? (
            <EmptyState compact title="No attendance records yet" hint="Mark attendance from the Attendance module." />
          ) : (
            <div className="divide-y divide-border/60">
              {(records ?? []).slice(0, 20).map((r) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span className="tabular">{fmtDate(r.date)}</span>
                  <Badge variant={r.status === 'present' ? 'success' : r.status === 'absent' ? 'danger' : 'warning'}>{r.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function FeesTab({ studentId }: { studentId: string }) {
  const { data: invoices } = useList<InvoiceDoc>('invoices', { where: [['studentId', '==', studentId]], orderBy: ['createdAt', 'desc'] })
  const { data: payments } = useList<PaymentDoc>('payments', { where: [['studentId', '==', studentId]] })
  const totals = useMemo(() => {
    const inv = invoices ?? []
    const billed = inv.reduce((a, i) => a + i.amount - (i.discount ?? 0), 0)
    const paid = inv.reduce((a, i) => a + (i.paidAmount ?? 0), 0)
    return { billed, paid, due: billed - paid }
  }, [invoices])

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total billed</p><p className="text-lg font-bold tabular">{inr(totals.billed)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Collected</p><p className="text-lg font-bold tabular text-success">{inr(totals.paid)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Outstanding</p><p className="text-lg font-bold tabular text-danger">{inr(totals.due)}</p></CardContent></Card>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">Invoices</div>
          {(invoices ?? []).length === 0 ? (
            <EmptyState compact title="No invoices" hint="Invoices appear when fee generation runs for the active session." />
          ) : (
            <div className="divide-y divide-border/60">
              {(invoices ?? []).map((i) => (
                <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <div>
                    <p className="font-medium">{i.feeTypeName ?? i.feeTypeId} <span className="text-xs text-muted-foreground">· {i.periodKey}</span></p>
                    <p className="text-xs text-muted-foreground tabular">Due {fmtDate(i.dueDate)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular">{inr(i.amount)}</span>
                    <Badge variant={i.status === 'paid' ? 'success' : i.status === 'unpaid' ? 'danger' : 'warning'}>{i.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">Payments ({payments?.length ?? 0})</div>
          {(payments ?? []).length === 0 ? (
            <EmptyState compact title="No payments recorded" />
          ) : (
            <div className="divide-y divide-border/60">
              {(payments ?? []).map((p) => (
                <div key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div>
                    <p className="font-medium tabular">{p.receiptNo}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(p.paidAt)} · {p.mode}</p>
                  </div>
                  <span className="font-semibold tabular text-success">{inr(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function MarksTab({ studentId }: { studentId: string }) {
  const { data: marks } = useList<MarkDoc>('marks', { where: [['studentId', '==', studentId]] })
  const { data: exams } = useList<ExamDoc>('exams', { where: [['status', '==', 'published']] })
  const { data: allSubjects } = useList<SubjectDoc>('classes/c-10/subjects')
  void allSubjects

  const publishedExamIds = useMemo(() => new Set((exams ?? []).map((e) => e.id)), [exams])
  const visibleMarks = useMemo(() => (marks ?? []).filter((m) => publishedExamIds.has(m.examId)), [marks, publishedExamIds])

  const byExam = useMemo(() => {
    const map = new Map<string, MarkDoc[]>()
    for (const m of visibleMarks) {
      const arr = map.get(m.examId) ?? []
      arr.push(m)
      map.set(m.examId, arr)
    }
    return map
  }, [visibleMarks])

  return (
    <div className="space-y-4">
      {(exams ?? []).length === 0 ? (
        <EmptyState title="No published exams yet" hint="Marks become visible here only after the exam is published." icon={<GraduationCap className="size-5" />} />
      ) : (
        (exams ?? []).map((ex) => {
          const ms = byExam.get(ex.id) ?? []
          return (
            <Card key={ex.id}>
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <p className="text-sm font-semibold">{ex.name}</p>
                  <Badge variant="success">published</Badge>
                </div>
                {ms.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-muted-foreground">No marks recorded for this student.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                        <th className="px-4 py-2 text-left font-medium">Subject</th>
                        <th className="px-4 py-2 text-right font-medium">Marks</th>
                        <th className="px-4 py-2 text-right font-medium">Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ms.map((m) => (
                        <tr key={m.id} className="border-b border-border/50 last:border-0">
                          <td className="px-4 py-2">{m.subjectId}</td>
                          <td className="px-4 py-2 text-right tabular">{m.marks ?? '-'} / {m.maxMarks}</td>
                          <td className="px-4 py-2 text-right font-semibold">{m.grade}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          )
        })
      )}
    </div>
  )
}

function DocumentsTab({ ownerType, ownerId }: { ownerType: 'student' | 'staff'; ownerId: string }) {
  const { user } = useAuth()
  const { data: docs } = useList<DocumentDoc>('documents', { where: [['ownerId', '==', ownerId]] })
  const create = useCreate('documents')
  const update = useUpdate('documents')
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [category, setCategory] = useState<string>('birth-certificate')

  const categories = ['birth-certificate', 'marksheet', 'tc', 'photo', 'id-proof', 'other']

  return (
    <div>
      <div className="mb-3 flex justify-end">
        {can(user?.role, 'people.manage') && (
          <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}><Plus className="size-3.5" /> Add document</Button>
        )}
      </div>
      {(docs ?? []).length === 0 ? (
        <EmptyState title="No documents on file" hint="Birth certificates, marksheets and IDs are attached as external links with a verified toggle." icon={<FileText className="size-5" />} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(docs ?? []).map((d) => (
            <Card key={d.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <Badge variant="outline">{d.category}</Badge>
                  {d.verified ? (
                    <Badge variant="success"><BadgeCheck className="size-3" /> verified</Badge>
                  ) : can(user?.role, 'people.manage') ? (
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { update.mutate({ id: d.id, data: { verified: true, verifiedBy: user?.id } }); toast.success('Marked verified') }}>
                      Verify
                    </Button>
                  ) : (
                    <Badge variant="warning">unverified</Badge>
                  )}
                </div>
                <a href={d.url} target="_blank" rel="noreferrer" className="mt-2 block truncate text-sm font-medium text-primary hover:underline">
                  {d.url}
                </a>
                <img src={d.url} alt={d.category} loading="lazy" className="mt-2 h-28 w-full rounded-md border border-border object-cover" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SheetRoot open={open} onOpenChange={setOpen}>
        <SheetContent title="Add document" description="Documents are external links (no file storage). Paste a scan hosted anywhere.">
          <div className="space-y-4">
            <ImageUrlField value={url} onChange={setUrl} label="Document URL" />
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full" disabled={!url}
              onClick={async () => {
                await create.mutateAsync({ data: { ownerType, ownerId, category, url, verified: false } })
                toast.success('Document added')
                setUrl('')
                setOpen(false)
              }}
            >
              Add document
            </Button>
          </div>
        </SheetContent>
      </SheetRoot>
    </div>
  )
}

function LeavesTab({ personType, personId, personName }: { personType: 'student' | 'staff'; personId: string; personName: string }) {
  const { data: leaves } = useList<LeaveDoc>('leaves', { where: [['personId', '==', personId]] })
  void personType
  return (
    <Card>
      <CardContent className="p-0">
        {(leaves ?? []).length === 0 ? (
          <EmptyState compact title="No leave history" hint={`Leaves applied by or for ${personName} appear here with approve/reject decisions.`} />
        ) : (
          <div className="divide-y divide-border/60">
            {(leaves ?? []).map((l) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{l.type} leave · <span className="tabular">{fmtDate(l.from)} to {fmtDate(l.to)}</span></p>
                  <p className="text-xs text-muted-foreground">{l.reason}</p>
                  {l.decisionNote && <p className="mt-0.5 text-xs text-primary">Note: {l.decisionNote}</p>}
                </div>
                <Badge variant={l.status === 'approved' ? 'success' : l.status === 'rejected' ? 'danger' : 'warning'}>{l.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// route-out link helper (keeps Import of Link used meaningfully)
export function BackToPeople({ kind }: { kind: string }) {
  return <Link to={`/people?tab=${kind}`}>Back</Link>
}
