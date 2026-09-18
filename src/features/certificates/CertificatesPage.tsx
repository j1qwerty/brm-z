import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Download } from 'lucide-react'
import { TabbedModule } from '@/components/shared/TabbedModule'
import { DataTable } from '@/components/shared/DataTable'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardContent, Skeleton } from '@/components/ui/display'
import { Input, Label } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useList, useCreate } from '@/lib/data/hooks'
import type { CertificateDoc, ClassDoc, SchoolSettingsDoc, StudentDoc } from '@/lib/types'
import { fmtDate } from '@/lib/utils'
import { elementToPdf } from '@/lib/pdf'

const KIND_META = {
  tc: { title: 'Transfer Certificate', serialPrefix: 'TC' },
  bonafide: { title: 'Bonafide Certificate', serialPrefix: 'BF' },
  character: { title: 'Character Certificate', serialPrefix: 'CC' },
} as const

type CertKind = keyof typeof KIND_META

function IssueSheet({
  open: _open,
  onOpenChange,
  kind,
  students,
  classes,
  settings,
  existingSerials,
  onIssued,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  kind: CertKind
  students: StudentDoc[]
  classes: ClassDoc[]
  settings: SchoolSettingsDoc[] | undefined
  existingSerials: number
  onIssued: () => void
}) {
  const create = useCreate('certificates')
  const [studentId, setStudentId] = useState('')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [conduct, setConduct] = useState('Good')
  const [reason, setReason] = useState('Parent request')
  const [busy, setBusy] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  const student = students.find((s) => s.id === studentId)
  const cls = classes.find((c) => c.id === student?.classId)
  const serial = `${KIND_META[kind].serialPrefix}-${new Date().getFullYear()}-${String(existingSerials + 1).padStart(3, '0')}`
  const school = settings?.[0]

  const bodyText = useMemo(() => {
    if (!student) return ''
    const base = `This is to certify that ${student.name} (Admission No. ${student.admissionNo}), son/daughter of ${student.guardianName ?? '-'}, is/was a bonafide student of ${school?.name ?? 'this school'}, studying in ${cls?.name ?? ''}-${student.section} during the academic session ${new Date().getFullYear()}-${String(new Date().getFullYear() + 1).slice(2)}.`
    if (kind === 'bonafide') return `${base} This certificate is issued for ${reason.toLowerCase()}.`
    if (kind === 'character') return `${base} His/Her conduct during the period was ${conduct}.`
    return `${base} All fees have been paid in full. He/She is eligible for admission to a higher class. The Transfer Certificate is issued on ${fmtDate(issueDate)} at the request of the guardian (${reason.toLowerCase()}).`
  }, [student, cls, kind, school, conduct, reason, issueDate])

  const issue = async () => {
    if (!student) {
      toast.error('Pick a student first')
      return
    }
    setBusy(true)
    try {
      await create.mutateAsync({
        data: {
          type: kind, studentId: student.id, serialNo: serial, issuedDate: issueDate, templateId: null,
          dataSnapshot: { body: bodyText, conduct, reason },
        },
      })
      onIssued()
      toast.success(`${KIND_META[kind].title} issued`, { description: `Serial ${serial}` })
      onOpenChange(false)
      setStudentId('')
    } finally {
      setBusy(false)
    }
  }

  const download = async () => {
    const el = previewRef.current
    if (!el || !student) return
    await elementToPdf(el as HTMLElement, `${serial}-${student.name.replace(/\s+/g, '-')}.pdf`)
    toast.success('PDF downloaded')
  }

  return (
    <Card>
      <CardContent className="grid gap-5 p-5 lg:grid-cols-[340px_1fr]">
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Student</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger><SelectValue placeholder="Pick student" /></SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name} ({s.admissionNo})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Issue date</Label>
            <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          {kind === 'character' && (
            <div className="space-y-1">
              <Label>Conduct</Label>
              <Select value={conduct} onValueChange={setConduct}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Excellent', 'Very Good', 'Good', 'Satisfactory'].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {kind !== 'character' && (
            <div className="space-y-1">
              <Label>Reason / purpose</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Admission elsewhere / passport" />
            </div>
          )}
          <p className="rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
            Next serial: <span className="tabular font-semibold text-foreground">{serial}</span> (auto-assigned per certificate type)
          </p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={issue} disabled={!student || busy}>Issue certificate</Button>
            <Button variant="outline" onClick={download} disabled={!student}><Download className="size-4" /></Button>
          </div>
        </div>

        {/* preview */}
        <div className="overflow-hidden rounded-xl border border-border bg-muted/30 p-4">
          <div ref={previewRef} className="mx-auto bg-white p-10 text-slate-900" style={{ width: 700 }}>
            <div className="text-center">
              <p className="text-2xl font-extrabold text-teal-800">{school?.name ?? 'BMRC Public School'}</p>
              <p className="mt-1 text-xs text-slate-500">{school?.address ?? ''} · {school?.affiliation ?? ''}</p>
              <p className="mt-4 text-lg font-bold uppercase tracking-widest">{KIND_META[kind].title}</p>
              <p className="mt-1 text-xs tabular text-slate-500">Serial No: {serial}</p>
            </div>
            <div className="mt-6 text-[15px] leading-7">
              {bodyText || <span className="text-slate-400">Pick a student to see the certificate body.</span>}
            </div>
            {student && (
              <div className="mt-6 grid grid-cols-2 gap-1 text-sm text-slate-700">
                <p>Class at issue: <strong>{cls?.name}-{student.section}</strong></p>
                <p>Admission No: <strong className="tabular">{student.admissionNo}</strong></p>
                <p>Date of birth: <strong>{fmtDate(student.dob)}</strong></p>
                <p>Guardian: <strong>{student.guardianName ?? '-'}</strong></p>
              </div>
            )}
            <div className="mt-10 flex items-end justify-between text-xs text-slate-500">
              <p>Date: {fmtDate(issueDate)}</p>
              <p className="text-center">{school?.principalName ?? 'Principal'}<br /><span className="mt-1 inline-block border-t border-slate-400 pt-1">Principal</span></p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function CertificatesPage() {
  const { data: students } = useList<StudentDoc>('students')
  const { data: classes } = useList<ClassDoc>('classes')
  const { data: settings } = useList<SchoolSettingsDoc>('settings')
  const { data: certificates, isLoading, refetch } = useList<CertificateDoc>('certificates')

  const registryColumns = useMemo(
    () => [
      {
        id: 'serialNo', header: 'Serial', accessorFn: (c: CertificateDoc) => c.serialNo,
        cell: ({ getValue }: { getValue: () => unknown }) => <span className="tabular font-medium">{getValue() as string}</span>,
      },
      {
        id: 'type', header: 'Type', accessorFn: (c: CertificateDoc) => c.type,
        cell: ({ getValue }: { getValue: () => unknown }) => <Badge variant="outline">{KIND_META[getValue() as CertKind].title}</Badge>,
      },
      {
        id: 'student', header: 'Student', accessorFn: (c: CertificateDoc) => (students ?? []).find((s) => s.id === c.studentId)?.name ?? c.studentId,
      },
      {
        id: 'issuedDate', header: 'Issued', accessorFn: (c: CertificateDoc) => c.issuedDate,
        cell: ({ getValue }: { getValue: () => unknown }) => <span className="tabular text-xs">{fmtDate(getValue() as string)}</span>,
      },
      {
        id: 'createdAt', header: 'Registered', accessorFn: (c: CertificateDoc) => c.createdAt,
        cell: ({ getValue }: { getValue: () => unknown }) => <span className="text-xs tabular text-muted-foreground">{fmtDate(getValue() as number)}</span>,
      },
    ],
    [students],
  )

  return (
    <TabbedModule
      title="Certificates"
      info="Issue Transfer Certificates (with auto TC serial numbers), Bonafide and Character certificates from a live preview, and keep a registry of everything issued."
      tabs={[
        { key: 'tc', label: 'Transfer Certificate (TC)', content: <IssueSheet open onOpenChange={() => {}} kind="tc" students={students ?? []} classes={classes ?? []} settings={settings} existingSerials={(certificates ?? []).filter((c) => c.type === 'tc').length} onIssued={refetch} /> },
        { key: 'bonafide', label: 'Bonafide', content: <IssueSheet open onOpenChange={() => {}} kind="bonafide" students={students ?? []} classes={classes ?? []} settings={settings} existingSerials={(certificates ?? []).filter((c) => c.type === 'bonafide').length} onIssued={refetch} /> },
        { key: 'character', label: 'Character', content: <IssueSheet open onOpenChange={() => {}} kind="character" students={students ?? []} classes={classes ?? []} settings={settings} existingSerials={(certificates ?? []).filter((c) => c.type === 'character').length} onIssued={refetch} /> },
        {
          key: 'registry',
          label: 'Issued registry',
          badge: certificates?.length,
          content: isLoading ? <Skeleton className="h-64 rounded-xl" /> : (
            <DataTable
              data={certificates}
              columns={registryColumns as never}
              searchPlaceholder="Search serial or student..."
              exportName="certificate-registry"
              emptyTitle="No certificates issued yet"
              emptyHint="Everything you issue from the other tabs is registered here with its serial number."
              
            />
          ),
        },
      ]}
    />
  )
}
