import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Download, FileDown } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardContent, Avatar, Separator } from '@/components/ui/display'
import { Input, Label, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useList, useCreate, useBulkWrite } from '@/lib/data/hooks'
import { useAuth } from '@/lib/auth'
import type { AssignmentDoc, ClassDoc, ExamDoc, GradingScaleDoc, MarkDoc, SchoolSettingsDoc, StaffDoc, StudentDoc, SubjectDoc } from '@/lib/types'
import { fmtDate, gradeFor, pct } from '@/lib/utils'
import { elementToPdf } from '@/lib/pdf'

// ---------------- Marks entry ----------------

export function MarksEntryTab({ classes }: { classes: ClassDoc[] }) {
  const { user } = useAuth()
  const { data: exams } = useList<ExamDoc>('exams')
  const { data: assignments } = useList<AssignmentDoc>('assignments')
  const { data: scale } = useList<GradingScaleDoc>('gradingScales', { where: [['isDefault', '==', true]] })
  const { data: students } = useList<StudentDoc>('students')
  const bulk = useBulkWrite('marks')
  const isAdmin = user?.role === 'admin'

  const [examId, setExamId] = useState('')
  const [classId, setClassId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [draft, setDraft] = useState<Record<string, number | null>>({})
  const [remarks, setRemarks] = useState<Record<string, string>>({})

  const exam = exams?.find((e) => e.id === examId) ?? exams?.[exams.length - 1]
  const myStaffId = user?.staffId

  // teacher restriction: only subjects where an assignment maps them to this class+subject
  const allowedSubjects = useMemo(() => {
    if (isAdmin || !classId) return null
    const mine = (assignments ?? []).filter((a) => a.classId === classId && a.teacherId === myStaffId)
    return new Set(mine.map((a) => a.subjectId))
  }, [assignments, classId, isAdmin, myStaffId])

  const { data: subjects } = useList<SubjectDoc>(classId ? `classes/${classId}/subjects` : 'classes/none/subjects', undefined, { enabled: Boolean(classId) })
  const cfg = exam?.perClass[classId]
  const examSubjects = useMemo(() => {
    const base = subjects ?? []
    if (!cfg) return base
    return base.filter((s) => cfg.subjectIds.includes(s.id))
  }, [subjects, cfg])

  const classStudents = useMemo(
    () => (students ?? []).filter((s) => s.classId === classId && s.status === 'active').sort((a, b) => (a.rollNo ?? '').localeCompare(b.rollNo ?? '')),
    [students, classId],
  )

  const { data: existingMarks, refetch } = useList<MarkDoc>(
    'marks',
    { where: [['examId', '==', exam?.id ?? 'none'], ['subjectId', '==', subjectId]] },
    { enabled: Boolean(exam?.id && subjectId) },
  )

  const existingFor = (studentId: string) => existingMarks?.find((m) => m.studentId === studentId)

  const saveAll = async () => {
    if (!exam || !subjectId || !classId) return
    const maxMarks = cfg?.maxMarks ?? 100
    const bands = scale?.[0]?.bands ?? []
    const isGradeMode = examSubjects.find((s) => s.id === subjectId)?.gradingMode === 'grade'
    const ops = classStudents.map((s) => {
      const raw = draft[s.id] ?? existingFor(s.id)?.marks ?? null
      const ex = existingFor(s.id)
      const grade = isGradeMode
        ? String(remarks[s.id] ?? ex?.grade ?? '')
        : gradeFor(pct(raw ?? 0, maxMarks), bands)
      return {
        id: ex?.id ?? `mk-${exam.id}-${s.id}-${subjectId}`,
        data: {
          examId: exam.id, studentId: s.id, subjectId,
          marks: isGradeMode ? null : raw, maxMarks, grade,
          enteredBy: user?.id ?? '', remark: remarks[s.id] ?? ex?.remark ?? null,
        },
      }
    })
    await bulk.mutateAsync(ops)
    await refetch()
    setDraft({})
    toast.success(`Marks saved for ${ops.length} students`)
  }

  if (!exams?.length) {
    return <EmptyState title="No exams yet" hint="Create an exam first in the Exams tab." icon={<FileDown className="size-5" />} />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56 space-y-1">
          <Label>Exam</Label>
          <Select value={exam?.id} onValueChange={(v) => { setExamId(v); setSubjectId('') }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{exams.map((e) => <SelectItem key={e.id} value={e.id}>{e.name} ({e.status})</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="w-44 space-y-1">
          <Label>Class</Label>
          <Select value={classId} onValueChange={(v) => { setClassId(v); setSubjectId('') }}>
            <SelectTrigger><SelectValue placeholder="Pick class" /></SelectTrigger>
            <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="w-48 space-y-1">
          <Label>Subject</Label>
          <Select value={subjectId} onValueChange={setSubjectId}>
            <SelectTrigger><SelectValue placeholder="Pick subject" /></SelectTrigger>
            <SelectContent>
              {examSubjects.map((s) => {
                const blocked = allowedSubjects ? !allowedSubjects.has(s.id) : false
                return (
                  <SelectItem key={s.id} value={s.id} disabled={blocked}>
                    {s.name}{blocked ? ' (not assigned to you)' : ''}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>
        {exam && cfg && (
          <Badge variant="outline">max {cfg.maxMarks} marks · {cfg.includeInFinal ? 'counts in final' : 'excluded from final'}</Badge>
        )}
      </div>

      {exam?.status === 'published' && (
        <Card className="border-warning/40">
          <CardContent className="p-3 text-sm text-warning">This exam is published - edits here will change what parents can see.</CardContent>
        </Card>
      )}

      {classId && subjectId ? (
        classStudents.length === 0 ? (
          <EmptyState compact title="No students in this class" />
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
                <span>{classStudents.length} students · grades auto-computed from the CBSE scale</span>
                <Button size="sm" onClick={saveAll}>Save marks</Button>
              </div>
              <div className="divide-y divide-border/60">
                {classStudents.map((s) => {
                  const ex = existingFor(s.id)
                  const value = draft[s.id] ?? ex?.marks ?? ''
                  return (
                    <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                      <span className="tabular w-8 text-xs text-muted-foreground">{s.rollNo ?? '-'}</span>
                      <Avatar src={s.photoUrl} name={s.name} size={28} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
                      {examSubjects.find((x) => x.id === subjectId)?.gradingMode === 'grade' ? (
                        <Input
                          className="h-8 w-20 text-center uppercase"
                          maxLength={2}
                          placeholder="A1"
                          value={String(remarks[s.id] ?? ex?.grade ?? '')}
                          onChange={(e) => setRemarks((r) => ({ ...r, [s.id]: e.target.value.toUpperCase() }))}
                        />
                      ) : (
                        <Input
                          type="number" className="h-8 w-20 text-center tabular"
                          max={cfg?.maxMarks ?? 100}
                          value={value === null ? '' : value}
                          onChange={(e) => setDraft((d) => ({ ...d, [s.id]: e.target.value === '' ? null : Number(e.target.value) }))}
                        />
                      )}
                      <span className="w-16 text-right text-xs tabular text-muted-foreground">
                        /{cfg?.maxMarks ?? 100}
                      </span>
                      <Input
                        className="h-8 w-44 text-xs" placeholder="Remark (optional)"
                        defaultValue={ex?.remark ?? ''}
                        onChange={(e) => setRemarks((r) => ({ ...r, [s.id]: e.target.value }))}
                      />
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )
      ) : (
        <EmptyState title="Pick exam, class and subject" hint="Teachers only see subjects assigned to them in the Classes module." />
      )}
    </div>
  )
}

// ---------------- Report cards ----------------

interface CardRow {
  subject: string
  marks: number | null
  maxMarks: number
  grade: string
}

export function ReportCardsTab({ classes }: { classes: ClassDoc[] }) {
  const { data: exams } = useList<ExamDoc>('exams')
  const { data: students } = useList<StudentDoc>('students')
  const { data: marks } = useList<MarkDoc>('marks')
  const { data: scale } = useList<GradingScaleDoc>('gradingScales', { where: [['isDefault', '==', true]] })
  const { data: settings } = useList<SchoolSettingsDoc>('settings')
  const create = useCreate('reportCards')
  const [examId, setExamId] = useState('final')
  const [classId, setClassId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [teacherRemark, setTeacherRemark] = useState('')
  const [principalRemark, setPrincipalRemark] = useState('')
  const [busy, setBusy] = useState(false)

  const publishedExams = (exams ?? []).filter((e) => e.status === 'published')
  const exam = publishedExams.find((e) => e.id === examId)
  const finalExams = publishedExams.filter((e) => e.perClass[classId]?.includeInFinal || (!e.classIds.length && e.perClass[classId]))

  const student = students?.find((s) => s.id === studentId)
  const cls = classes.find((c) => c.id === student?.classId)

  const rows: CardRow[] = useMemo(() => {
    if (!student) return []
    if (examId === 'final') {
      const combined = new Map<string, { obtained: number; max: number }>()
      for (const ex of finalExams) {
        const maxPer = ex.perClass[student.classId]?.maxMarks ?? 100
        for (const subId of ex.perClass[student.classId]?.subjectIds ?? []) {
          const m = (marks ?? []).find((mk) => mk.examId === ex.id && mk.studentId === student.id && mk.subjectId === subId)
          if (m) {
            const rec = combined.get(subId) ?? { obtained: 0, max: 0 }
            rec.obtained += m.marks ?? 0
            rec.max += maxPer
            combined.set(subId, rec)
          }
        }
      }
      return [...combined.entries()].map(([subId, r]) => ({
        subject: subId,
        marks: r.obtained,
        maxMarks: r.max,
        grade: gradeFor(pct(r.obtained, r.max), scale?.[0]?.bands ?? []),
      }))
    }
    if (!exam) return []
    const maxPer = exam.perClass[student.classId]?.maxMarks ?? 100
    return (exam.perClass[student.classId]?.subjectIds ?? []).map((subId) => {
      const m = (marks ?? []).find((mk) => mk.examId === exam.id && mk.studentId === student.id && mk.subjectId === subId)
      return {
        subject: subId,
        marks: m?.marks ?? null,
        maxMarks: maxPer,
        grade: m?.grade ?? gradeFor(pct(m?.marks ?? 0, maxPer), scale?.[0]?.bands ?? []),
      }
    })
  }, [student, exam, examId, finalExams, marks, scale])

  const totalObtained = rows.reduce((a, r) => a + (r.marks ?? 0), 0)
  const totalMax = rows.reduce((a, r) => a + r.maxMarks, 0)
  const overallPct = pct(totalObtained, totalMax)
  const overallGrade = gradeFor(overallPct, scale?.[0]?.bands ?? [])

  const { data: staff } = useList<StaffDoc>('staff')
  const classTeacher = staff?.find((s) => s.id === cls?.classTeacherId)

  const download = async () => {
    const el = document.getElementById('report-card-print')
    if (!el || !student) return
    setBusy(true)
    try {
      await elementToPdf(el as HTMLElement, `report-card-${student.name.replace(/\s+/g, '-')}-${examId}.pdf`)
      await create.mutateAsync({
        data: {
          examId: examId === 'final' ? null : examId, studentId: student.id, templateId: null,
          dataSnapshot: { rows: JSON.stringify(rows), overallPct, overallGrade, teacherRemark, principalRemark },
        },
      })
      toast.success('Report card PDF downloaded')
    } finally {
      setBusy(false)
    }
  }

  const subjectName = (id: string) => id

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56 space-y-1">
          <Label>Report</Label>
          <Select value={examId} onValueChange={setExamId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="final">Cumulative final (all included exams)</SelectItem>
              {publishedExams.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-40 space-y-1">
          <Label>Class</Label>
          <Select value={classId} onValueChange={(v) => { setClassId(v); setStudentId('') }}>
            <SelectTrigger><SelectValue placeholder="Pick class" /></SelectTrigger>
            <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="w-52 space-y-1">
          <Label>Student</Label>
          <Select value={studentId} onValueChange={setStudentId}>
            <SelectTrigger><SelectValue placeholder="Pick student" /></SelectTrigger>
            <SelectContent>
              {(students ?? []).filter((s) => s.classId === classId).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name} ({s.rollNo ?? s.admissionNo})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button className="ml-auto gap-1.5" onClick={download} disabled={!student || busy || rows.length === 0}>
          <Download className="size-4" /> {busy ? 'Preparing...' : 'Download PDF'}
        </Button>
      </div>

      {student ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          {/* The printable card */}
          <Card>
            <CardContent id="report-card-print" className="bg-white p-8 text-slate-900" >
              <div className="text-center">
                <p className="text-2xl font-extrabold text-teal-800">{settings?.[0]?.name ?? 'BMRC Public School'}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {settings?.[0]?.address ?? ''}{settings?.[0]?.affiliation ? ` · ${settings[0].affiliation}` : ''}
                </p>
                <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
                  {examId === 'final' ? 'Cumulative Final Report Card' : `${exam?.name} Report Card`}
                </p>
              </div>
              <Separator className="my-4" />
              <div className="grid grid-cols-2 gap-2 text-sm">
                <p><strong>{student.name}</strong></p>
                <p className="text-right">Class {cls?.name}-{student.section} · Roll {student.rollNo ?? '-'}</p>
                <p className="text-xs text-slate-500">Admission {student.admissionNo}</p>
                <p className="text-right text-xs text-slate-500">Session {new Date().getFullYear()}-{new Date().getFullYear() + 1}</p>
              </div>
              <table className="mt-4 w-full border border-slate-300 text-sm">
                <thead>
                  <tr className="bg-slate-100 text-left">
                    <th className="border border-slate-300 px-3 py-1.5">Subject</th>
                    <th className="border border-slate-300 px-3 py-1.5 text-right">Marks</th>
                    <th className="border border-slate-300 px-3 py-1.5 text-right">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.subject}>
                      <td className="border border-slate-300 px-3 py-1.5">{subjectName(r.subject)}</td>
                      <td className="border border-slate-300 px-3 py-1.5 text-right tabular">{r.marks ?? '-'} / {r.maxMarks}</td>
                      <td className="border border-slate-300 px-3 py-1.5 text-right font-semibold">{r.grade}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-semibold">
                    <td className="border border-slate-300 px-3 py-1.5">Total</td>
                    <td className="border border-slate-300 px-3 py-1.5 text-right tabular">{totalObtained} / {totalMax}</td>
                    <td className="border border-slate-300 px-3 py-1.5 text-right">{overallGrade}</td>
                  </tr>
                </tbody>
              </table>
              <div className="mt-4 text-sm">
                <p><strong>Overall:</strong> {overallPct}% ({overallGrade})</p>
                <p className="mt-2"><strong>Class teacher's remark:</strong> {teacherRemark || '________________________________'}</p>
                <p className="mt-1"><strong>Principal's remark:</strong> {principalRemark || '________________________________'}</p>
              </div>
              <div className="mt-8 flex items-end justify-between text-xs text-slate-500">
                <p>Generated {fmtDate(Date.now())}</p>
                <p className="text-right">{settings?.[0]?.principalName ?? 'Principal'}<br />Principal</p>
              </div>
            </CardContent>
          </Card>

          {/* Remark inputs */}
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="space-y-1.5">
                <Label>Class teacher's remark</Label>
                <Textarea value={teacherRemark} onChange={(e) => setTeacherRemark(e.target.value)} placeholder="e.g. Consistent performer; improve in Social Studies." rows={4} />
              </div>
              <div className="space-y-1.5">
                <Label>Principal's remark</Label>
                <Textarea value={principalRemark} onChange={(e) => setPrincipalRemark(e.target.value)} placeholder="Optional" rows={3} />
              </div>
              <Separator />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Included exams</p>
                {examId === 'final' ? (
                  finalExams.length ? finalExams.map((e) => <Badge key={e.id} variant="neutral" className="mr-1 mt-1">{e.name}</Badge>) : <p className="mt-1">No published exams marked "counts toward final" for this class.</p>
                ) : (
                  <p className="mt-1">{exam?.name}</p>
                )}
                {classTeacher && <p className="mt-3 text-xs">Class teacher: {classTeacher.name}</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : classId ? (
        <EmptyState compact title="Pick a student" hint="Choose a student to preview their report card." />
      ) : (
        <EmptyState title="Pick a class and student" hint="Per-exam and cumulative final report cards generate from published marks." />
      )}
    </div>
  )
}
