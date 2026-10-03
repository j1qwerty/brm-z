// Demo dataset for BRM's in-browser demo mode (no Firebase needed to explore the app).
// Realistic Indian school data, deterministic ids. Loaded into localStorage by the local provider.

type Doc = Record<string, unknown>
type Db = Record<string, Record<string, Doc>>

const ts = Date.now()
const base = (extra: Doc = {}): Doc => ({ createdAt: ts, updatedAt: ts, deletedAt: null, deletedBy: null, ...extra })

const d = (s: string) => s // date passthrough for readability

export function buildDemoDb(): Db {
  const db: Db = {}

  const put = (path: string, id: string, doc: Doc) => {
    if (!db[path]) db[path] = {}
    db[path][id] = { ...base(), id, ...doc }
  }

  // ---------------- settings ----------------
  put('settings', 'school', {
    name: 'BRM International Public School',
    logoUrl: 'https://ui-avatars.com/api/?name=BRM&background=0f766e&color=fff&size=128&bold=true',
    address: 'Plot 14, Vidya Nagar, Habsiguda',
    city: 'Hyderabad, Telangana 500007',
    affiliation: 'CBSE (Aff. 130456)',
    phone: '+91 98480 12345',
    email: 'office@bmrcpublicschool.in',
    website: 'www.bmrcpublicschool.in',
    principalName: 'Mrs. Lakshmi Narayanan',
    sessionDefaults: { periodsPerDay: 6, workingDays: [1, 2, 3, 4, 5, 6] },
  })

  // ---------------- users ----------------
  put('users', 'u-admin', { name: 'Ramesh Gupta', email: 'admin@bmrc.demo', role: 'admin', status: 'active', phone: '+91 98480 11111', photoUrl: 'https://i.pravatar.cc/150?img=52' })
  put('users', 'u-teacher', { name: 'Sunita Sharma', email: 'teacher@bmrc.demo', role: 'teacher', status: 'active', phone: '+91 98480 22222', photoUrl: 'https://i.pravatar.cc/150?img=45', staffId: 'st-001' })
  put('users', 'u-accountant', { name: 'Prakash Rao', email: 'accountant@bmrc.demo', role: 'accountant', status: 'active', phone: '+91 98480 33333', photoUrl: 'https://i.pravatar.cc/150?img=12' })
  put('users', 'u-staff', { name: 'Venkatesh Yadav', email: 'staff@bmrc.demo', role: 'staff', status: 'active', phone: '+91 98480 44444', photoUrl: 'https://i.pravatar.cc/150?img=60', staffId: 'st-009' })
  put('users', 'u-student', { name: 'Aarav Sharma', email: 'student@bmrc.demo', role: 'student', status: 'active', photoUrl: 'https://i.pravatar.cc/150?img=15', studentId: 'stu-101' })
  put('users', 'u-parent', { name: 'Meera Sharma', email: 'parent@bmrc.demo', role: 'parent', status: 'active', phone: '+91 98480 55555', photoUrl: 'https://i.pravatar.cc/150?img=32', childIds: ['stu-101', 'stu-102'] })
  put('users', 'u-pending', { name: 'Kavya Iyer', email: 'kavya@bmrc.demo', role: 'teacher', status: 'pending', phone: '+91 98480 66666', photoUrl: 'https://i.pravatar.cc/150?img=27' })

  // ---------------- session ----------------
  put('sessions', 'sess-2627', { name: '2026-2027', startDate: d('2026-04-01'), endDate: d('2027-03-31'), isActive: true, isCompleted: false })
  put('sessions', 'sess-2526', { name: '2025-2026', startDate: d('2025-04-01'), endDate: d('2026-03-31'), isActive: false, isCompleted: true })

  // ---------------- classes + subjects ----------------
  const classDefs: [string, string, string[], number, string | null][] = [
    ['c-nur', 'Nursery', ['A'], 0, 'st-005'],
    ['c-1', 'Class 1', ['A', 'B'], 1, 'st-007'],
    ['c-3', 'Class 3', ['A'], 2, 'st-006'],
    ['c-5', 'Class 5', ['A', 'B'], 3, 'st-006'],
    ['c-8', 'Class 8', ['A'], 4, 'st-002'],
    ['c-10', 'Class 10', ['A', 'B'], 5, 'st-001'],
  ]
  for (const [id, name, sections, order, classTeacherId] of classDefs) {
    put('classes', id, { name, sections, order, classTeacherId })
  }

  const subjectDefs: Record<string, [string, string][]> = {
    'c-nur': [['Rhymes & Play', 'NUR-RP'], ['Number Fun', 'NUR-NF']],
    'c-1': [['English', 'ENG01'], ['Mathematics', 'MATH01'], ['EVS', 'EVS01']],
    'c-3': [['English', 'ENG03'], ['Mathematics', 'MATH03'], ['EVS', 'EVS03'], ['Hindi', 'HIN03']],
    'c-5': [['English', 'ENG05'], ['Mathematics', 'MATH05'], ['Science', 'SCI05'], ['Social Studies', 'SST05'], ['Hindi', 'HIN05']],
    'c-8': [['English', 'ENG08'], ['Mathematics', 'MATH08'], ['Science', 'SCI08'], ['Social Studies', 'SST08'], ['Hindi', 'HIN08'], ['Computer Science', 'CS08']],
    'c-10': [['English', 'ENG10'], ['Mathematics', 'MATH10'], ['Science', 'SCI10'], ['Social Studies', 'SST10'], ['Hindi', 'HIN10']],
  }
  for (const [classId, subs] of Object.entries(subjectDefs)) {
    subs.forEach(([name, code], i) => {
      put(`classes/${classId}/subjects`, code.toLowerCase(), {
        classId, name, code, gradingMode: 'percentage', isElective: false, order: i,
      })
    })
  }

  // ---------------- staff ----------------
  const staffDefs: [string, string, 'teaching' | 'nonteaching', string, string, string][] = [
    ['st-001', 'Sunita Sharma', 'teaching', 'Mathematics', 'TGT Mathematics', '+91 98480 22222'],
    ['st-002', 'Rajesh Kumar', 'teaching', 'Science', 'PGT Physics', '+91 98480 71002'],
    ['st-003', 'Anita Desai', 'teaching', 'English', 'PGT English', '+91 98480 71003'],
    ['st-004', 'Vikram Singh', 'teaching', 'Social Studies', 'TGT Social Science', '+91 98480 71004'],
    ['st-005', 'Priya Nair', 'teaching', 'Hindi', 'TGT Hindi', '+91 98480 71005'],
    ['st-006', 'Farhan Ali', 'teaching', 'Mathematics & Science', 'TGT Maths/Science', '+91 98480 71006'],
    ['st-007', 'Deepa Krishnan', 'teaching', 'English', 'PRT', '+91 98480 71007'],
    ['st-008', 'Mohan Rao', 'teaching', 'Physical Education', 'PET', '+91 98480 71008'],
    ['st-009', 'Venkatesh Yadav', 'nonteaching', 'Library', 'Librarian', '+91 98480 44444'],
    ['st-010', 'Shanti Devi', 'nonteaching', 'Front Office', 'Office Assistant', '+91 98480 71010'],
  ]
  for (const [id, name, staffType, designation, qualification, phone] of staffDefs) {
    put('staff', id, {
      name, staffType, designation, qualification, phone,
      employeeNo: `EMP${id.replace('st-', '')}`,
      email: `${id}@bmrc.demo`,
      joinDate: d('2022-06-10'),
      photoUrl: `https://i.pravatar.cc/150?img=${60 - Number(id.replace('st-', '')) * 2}`,
      address: 'Staff Quarters, Vidya Nagar, Hyderabad',
      bloodGroup: id === 'st-001' ? 'B+' : 'O+',
      status: 'active',
    })
  }

  // ---------------- assignments (teaching responsibility, drives timetable + marks permissions) ----------------
  const assignments: [string, string, string | null, string, string][] = [
    ['as-01', 'c-10', 'A', 'math10', 'st-001'],
    ['as-02', 'c-10', 'B', 'math10', 'st-001'],
    ['as-03', 'c-10', 'A', 'sci10', 'st-002'],
    ['as-04', 'c-10', 'A', 'eng10', 'st-003'],
    ['as-05', 'c-10', 'B', 'eng10', 'st-003'],
    ['as-06', 'c-10', 'A', 'sst10', 'st-004'],
    ['as-07', 'c-10', 'A', 'hin10', 'st-005'],
    ['as-08', 'c-10', 'B', 'hin10', 'st-005'],
    ['as-09', 'c-8', 'A', 'math08', 'st-001'],
    ['as-10', 'c-8', 'A', 'sci08', 'st-002'],
    ['as-11', 'c-8', 'A', 'eng08', 'st-007'],
    ['as-12', 'c-5', 'A', 'math05', 'st-006'],
    ['as-13', 'c-5', 'A', 'sci05', 'st-006'],
    ['as-14', 'c-1', 'A', 'eng01', 'st-007'],
  ]
  for (const [id, classId, sectionId, subjectId, teacherId] of assignments) {
    put('assignments', id, { sessionId: 'sess-2627', classId, sectionId, subjectId, teacherId })
  }

  // ---------------- students ----------------
  const stuDefs: [string, string, 'male' | 'female', string, string, string, number, string, string][] = [
    ['stu-101', 'Aarav Sharma', 'male', 'c-10', 'A', '12', 15, 'Rajesh Sharma', '+91 98480 80101'],
    ['stu-102', 'Ananya Sharma', 'female', 'c-5', 'A', '8', 32, 'Rajesh Sharma', '+91 98480 80101'],
    ['stu-103', 'Ishaan Verma', 'male', 'c-10', 'A', '3', 51, 'Suresh Verma', '+91 98480 80103'],
    ['stu-104', 'Diya Patel', 'female', 'c-10', 'A', '7', 9, 'Nilesh Patel', '+91 98480 80104'],
    ['stu-105', 'Arjun Reddy', 'male', 'c-10', 'A', '21', 33, 'Krishna Reddy', '+91 98480 80105'],
    ['stu-106', 'Sara Khan', 'female', 'c-10', 'A', '15', 26, 'Imran Khan', '+91 98480 80106'],
    ['stu-107', 'Rohan Joshi', 'male', 'c-10', 'A', '18', 44, 'Amit Joshi', '+91 98480 80107'],
    ['stu-108', 'Pooja Iyer', 'female', 'c-10', 'A', '24', 5, 'Ramesh Iyer', '+91 98480 80108'],
    ['stu-110', 'Karthik Rao', 'male', 'c-10', 'B', '2', 13, 'Srinivas Rao', '+91 98480 80110'],
    ['stu-111', 'Meenakshi Sundaram', 'female', 'c-10', 'B', '9', 47, 'Venkat Sundaram', '+91 98480 80111'],
    ['stu-112', 'Zoya Sheikh', 'female', 'c-10', 'B', '11', 23, 'Asif Sheikh', '+91 98480 80112'],
    ['stu-113', 'Aditya Menon', 'male', 'c-10', 'B', '16', 38, 'Hari Menon', '+91 98480 80113'],
    ['stu-120', 'Tanvi Agarwal', 'female', 'c-8', 'A', '5', 20, 'Sanjay Agarwal', '+91 98480 80120'],
    ['stu-121', 'Dev Malhotra', 'male', 'c-8', 'A', '10', 17, 'Nikhil Malhotra', '+91 98480 80121'],
    ['stu-122', 'Riya Choudhury', 'female', 'c-8', 'A', '14', 41, 'Abhijit Choudhury', '+91 98480 80122'],
    ['stu-130', 'Kabir Bansal', 'male', 'c-5', 'A', '4', 28, 'Mohit Bansal', '+91 98480 80130'],
    ['stu-131', 'Nithya Raman', 'female', 'c-5', 'A', '19', 36, 'Suresh Raman', '+91 98480 80131'],
    ['stu-132', 'Ved Kulkarni', 'male', 'c-5', 'A', '22', 11, 'Girish Kulkarni', '+91 98480 80132'],
  ]
  for (const [id, name, gender, classId, section, rollNo, img, guardianName, guardianPhone] of stuDefs) {
    put('students', id, {
      name, gender, classId, section, rollNo,
      admissionNo: `ADM2026${String(Number(id.replace('stu-', ''))).padStart(4, '0')}`,
      dob: d(`201${(Number(id.replace('stu-', '')) % 5) + 0}-0${(Number(id.replace('stu-', '')) % 9) + 1}-1${Number(id.replace('stu-', '')) % 9}`),
      bloodGroup: ['A+', 'B+', 'O+', 'AB+'][Number(id.replace('stu-', '')) % 4],
      phone: guardianPhone,
      guardianName, guardianPhone,
      parentUserId: id === 'stu-101' || id === 'stu-102' ? 'u-parent' : undefined,
      photoUrl: `https://i.pravatar.cc/150?img=${img}`,
      address: 'Vidya Nagar, Hyderabad',
      status: 'active',
      admissionDate: d('2026-04-12'),
      category: 'General',
    })
  }

  // ---------------- fee types + assignments ----------------
  const feeTypes: [string, string, string, number, boolean][] = [
    ['ft-tuition', 'Tuition Fee', 'monthly', 2500, false],
    ['ft-admission', 'Admission Fee', 'one-time', 8000, false],
    ['ft-exam', 'Examination Fee', 'quarterly', 600, false],
    ['ft-transport', 'Transport Fee', 'monthly', 1200, true],
    ['ft-annual', 'Annual Charges', 'yearly', 3500, false],
  ]
  for (const [id, name, frequency, defaultAmount, refundable] of feeTypes) {
    put('feeTypes', id, { name, frequency, defaultAmount, refundable })
  }

  const feeAssignments: [string, string, 'class' | 'student', string, number][] = [
    ['fa-01', 'ft-tuition', 'class', 'c-10', 2800],
    ['fa-02', 'ft-tuition', 'class', 'c-8', 2600],
    ['fa-03', 'ft-tuition', 'class', 'c-5', 2400],
    ['fa-04', 'ft-tuition', 'class', 'c-3', 2200],
    ['fa-05', 'ft-tuition', 'class', 'c-1', 2000],
    ['fa-06', 'ft-tuition', 'class', 'c-nur', 1900],
    ['fa-07', 'ft-exam', 'class', 'c-10', 600],
    ['fa-08', 'ft-exam', 'class', 'c-8', 600],
    ['fa-09', 'ft-transport', 'class', 'c-10', 1200],
    ['fa-10', 'ft-annual', 'class', 'c-10', 3500],
    ['fa-11', 'ft-admission', 'class', 'c-nur', 8000],
  ]
  for (const [id, feeTypeId, targetType, targetId, amount] of feeAssignments) {
    put('feeAssignments', id, { sessionId: 'sess-2627', feeTypeId, targetType, targetId, amount })
  }

  // ---------------- invoices + payments (Jul-Sep 2026 for class 10 & 8) ----------------
  let receiptNo = 0
  const months = ['2026-07', '2026-08', '2026-09']
  const class10 = stuDefs.filter((s) => s[3] === 'c-10')
  const class8 = stuDefs.filter((s) => s[3] === 'c-8')
  let invCount = 0
  for (const [mi, periodKey] of months.entries()) {
    for (const [si, s] of [...class10, ...class8].entries()) {
      const [, , , classId] = s
      const amount = classId === 'c-10' ? 2800 : 2600
      const roll = (mi * 7 + si) % 10
      const status = roll < 6 ? 'paid' : roll < 8 ? 'partial' : 'unpaid'
      invCount++
      const invId = `inv-${String(invCount).padStart(3, '0')}`
      const paid = status === 'paid' ? amount : status === 'partial' ? Math.round(amount / 2 / 10) * 10 : 0
      put('invoices', invId, {
        sessionId: 'sess-2627', studentId: s[0], feeTypeId: 'ft-tuition', feeTypeName: 'Tuition Fee',
        periodKey, amount, discount: 0, paidAmount: paid,
        dueDate: d(`${periodKey}-10`),
        status, generatedByRunId: 'seed-v1',
      })
      if (paid > 0) {
        receiptNo++
        put('payments', `pay-${String(receiptNo).padStart(3, '0')}`, {
          invoiceId: invId, studentId: s[0], amount: paid,
          mode: (['cash', 'upi', 'bank'] as const)[(si + mi) % 3],
          paidAt: new Date(`${periodKey}-0${(si % 8) + 1}T10:30:00`).getTime(),
          receiptNo: `RCP-2026-${String(receiptNo).padStart(4, '0')}`,
          collectedBy: 'u-accountant',
          note: status === 'partial' ? 'Part payment, balance pending' : undefined,
        })
      }
    }
  }
  // One annual-charge invoice (unpaid) + one exam fee (paid) for variety
  put('invoices', 'inv-annual-101', { sessionId: 'sess-2627', studentId: 'stu-101', feeTypeId: 'ft-annual', feeTypeName: 'Annual Charges', periodKey: '2026-04', amount: 3500, discount: 0, paidAmount: 0, dueDate: d('2026-04-30'), status: 'unpaid', generatedByRunId: 'seed-v1' })
  put('invoices', 'inv-exam-101', { sessionId: 'sess-2627', studentId: 'stu-101', feeTypeId: 'ft-exam', feeTypeName: 'Examination Fee', periodKey: '2026-Q1', amount: 600, discount: 0, paidAmount: 600, dueDate: d('2026-07-15'), status: 'paid', generatedByRunId: 'seed-v1' })
  put('payments', 'pay-exam-101', { invoiceId: 'inv-exam-101', studentId: 'stu-101', amount: 600, mode: 'upi', paidAt: new Date('2026-07-12T11:00:00').getTime(), receiptNo: `RCP-2026-${String(receiptNo + 1).padStart(4, '0')}`, collectedBy: 'u-accountant' })

  // ---------------- attendance (last 12 weekdays) ----------------
  const weekdays: string[] = []
  const cursor = new Date()
  while (weekdays.length < 12) {
    cursor.setDate(cursor.getDate() - 1)
    const dow = cursor.getDay()
    if (dow >= 1 && dow <= 6) weekdays.push(cursor.toISOString().slice(0, 10))
  }
  const attStudents = [...class10.map((s) => s[0]), ...class8.map((s) => s[0])]
  let attCount = 0
  for (const [di, date] of weekdays.entries()) {
    for (const [i, stuId] of attStudents.entries()) {
      const r = (di * 5 + i * 3) % 13
      const status = r === 4 ? 'absent' : r === 9 ? 'late' : r === 11 ? 'leave' : 'present'
      attCount++
      put('attendance', `att-${String(attCount).padStart(4, '0')}`, {
        date, sessionId: 'sess-2627', personType: 'student', personId: stuId,
        classId: attStudents.indexOf(stuId) < class10.length ? 'c-10' : 'c-8',
        section: attStudents.indexOf(stuId) < class10.length ? (i % 2 === 0 ? 'A' : 'B') : 'A',
        status, markedBy: 'u-teacher',
      })
    }
    for (const st of staffDefs.slice(0, 8)) {
      const r = (di * 7 + Number(st[0].replace('st-', ''))) % 15
      put('attendance', `att-stf-${st[0]}-${date}`, {
        date, sessionId: 'sess-2627', personType: 'staff', personId: st[0],
        status: r === 6 ? 'absent' : r === 12 ? 'leave' : 'present', markedBy: 'u-admin',
      })
    }
  }

  // ---------------- grading scale (CBSE style) ----------------
  put('gradingScales', 'gs-cbse', {
    name: 'CBSE 8-band (default)',
    isDefault: true,
    bands: [
      { grade: 'A1', min: 91, max: 100, remark: 'Outstanding' },
      { grade: 'A2', min: 81, max: 90, remark: 'Excellent' },
      { grade: 'B1', min: 71, max: 80, remark: 'Very Good' },
      { grade: 'B2', min: 61, max: 70, remark: 'Good' },
      { grade: 'C1', min: 51, max: 60, remark: 'Fair' },
      { grade: 'C2', min: 41, max: 50, remark: 'Needs Improvement' },
      { grade: 'D', min: 33, max: 40, remark: 'Pass' },
      { grade: 'E', min: 0, max: 32, remark: 'Needs Special Attention' },
    ],
  })

  // ---------------- exams + marks ----------------
  put('exams', 'exam-ut1', {
    name: 'Unit Test 1', type: 'unit', sessionId: 'sess-2627', classIds: ['c-10'],
    perClass: { 'c-10': { subjectIds: ['eng10', 'math10', 'sci10'], maxMarks: 25, includeInFinal: true } },
    startDate: d('2026-07-20'), endDate: d('2026-07-24'), status: 'published',
  })
  put('exams', 'exam-hy', {
    name: 'Half-Yearly Examination', type: 'half-yearly', sessionId: 'sess-2627', classIds: [],
    perClass: {
      'c-10': { subjectIds: ['eng10', 'math10', 'sci10', 'sst10', 'hin10'], maxMarks: 80, includeInFinal: true },
      'c-8': { subjectIds: ['eng08', 'math08', 'sci08', 'sst08', 'hin08'], maxMarks: 80, includeInFinal: true },
      'c-5': { subjectIds: ['eng05', 'math05', 'sci05', 'sst05', 'hin05'], maxMarks: 60, includeInFinal: true },
    },
    startDate: d('2026-09-21'), endDate: d('2026-09-30'), status: 'evaluation',
  })

  const bands = [
    { grade: 'A1', min: 91, max: 100 }, { grade: 'A2', min: 81, max: 90 }, { grade: 'B1', min: 71, max: 80 },
    { grade: 'B2', min: 61, max: 70 }, { grade: 'C1', min: 51, max: 60 }, { grade: 'C2', min: 41, max: 50 },
    { grade: 'D', min: 33, max: 40 }, { grade: 'E', min: 0, max: 32 },
  ]
  const gradeOf = (p: number) => bands.find((b) => p >= b.min && p <= b.max)?.grade ?? 'E'
  let markCount = 0
  for (const s of class10) {
    for (const sub of ['eng10', 'math10', 'sci10']) {
      const marks = 10 + ((Number(s[0].replace('stu-', '')) * 7 + sub.length * 3) % 15)
      markCount++
      put('marks', `mk-${String(markCount).padStart(4, '0')}`, {
        examId: 'exam-ut1', studentId: s[0], subjectId: sub, marks, maxMarks: 25,
        grade: gradeOf(Math.round((marks / 25) * 100)), enteredBy: 'u-teacher',
      })
    }
  }

  // ---------------- templates (one default per kind) ----------------
  const logo = 'https://ui-avatars.com/api/?name=BRM&background=0f766e&color=fff&size=128&bold=true'
  put('templates', 'tpl-id-student', {
    kind: 'idcard-student', name: 'Student ID (default)', images: { logo, background: '', extra1: '' },
    isDefault: true,
    layoutJson: {
      page: { w: 640, h: 400 },
      elements: [
        { id: 'e1', type: 'school', label: 'School name', x: 90, y: 20, w: 460, h: 40, fontSize: 22, fontWeight: 800, color: '#0f766e', align: 'center' },
        { id: 'e2', type: 'photo', label: 'Photo', x: 260, y: 76, w: 120, h: 140, bgColor: '#f1f5f9', borderRadius: 8 },
        { id: 'e3', type: 'name', label: 'Student name', x: 40, y: 228, w: 560, h: 30, fontSize: 20, fontWeight: 700, align: 'center', color: '#0f172a' },
        { id: 'e4', type: 'class', label: 'Class & section', x: 40, y: 260, w: 270, h: 22, fontSize: 14, fontWeight: 500, align: 'center', color: '#334155' },
        { id: 'e5', type: 'roll', label: 'Roll no', x: 330, y: 260, w: 270, h: 22, fontSize: 14, fontWeight: 500, align: 'center', color: '#334155' },
        { id: 'e6', type: 'dob', label: 'DOB', x: 40, y: 288, w: 270, h: 22, fontSize: 13, align: 'center', color: '#475569' },
        { id: 'e7', type: 'blood', label: 'Blood group', x: 330, y: 288, w: 270, h: 22, fontSize: 13, align: 'center', color: '#475569' },
        { id: 'e8', type: 'phone', label: 'Contact', x: 40, y: 316, w: 270, h: 22, fontSize: 13, align: 'center', color: '#475569' },
        { id: 'e9', type: 'address', label: 'Address', x: 330, y: 316, w: 270, h: 22, fontSize: 13, align: 'center', color: '#475569' },
        { id: 'e10', type: 'qr', label: 'ID QR', x: 566, y: 340, w: 52, h: 52 },
        { id: 'e11', type: 'watermark', label: 'Watermark', x: 160, y: 60, w: 320, h: 320, fontSize: 54, color: '#0f766e14' },
      ],
    },
  })
  put('templates', 'tpl-id-teacher', {
    kind: 'idcard-teacher', name: 'Teacher ID (default)', images: { logo, background: '', extra1: '' },
    isDefault: true,
    layoutJson: {
      page: { w: 640, h: 400 },
      elements: [
        { id: 't1', type: 'school', label: 'School name', x: 90, y: 20, w: 460, h: 40, fontSize: 22, fontWeight: 800, color: '#0f766e', align: 'center' },
        { id: 't2', type: 'photo', label: 'Photo', x: 260, y: 80, w: 120, h: 140, bgColor: '#f1f5f9', borderRadius: 8 },
        { id: 't3', type: 'name', label: 'Staff name', x: 40, y: 232, w: 560, h: 30, fontSize: 20, fontWeight: 700, align: 'center', color: '#0f172a' },
        { id: 't4', type: 'text', label: 'Designation', x: 40, y: 264, w: 560, h: 22, fontSize: 14, fontWeight: 500, align: 'center', color: '#334155' },
        { id: 't5', type: 'phone', label: 'Contact', x: 40, y: 292, w: 560, h: 22, fontSize: 13, align: 'center', color: '#475569' },
        { id: 't6', type: 'qr', label: 'ID QR', x: 566, y: 340, w: 52, h: 52 },
      ],
    },
  })
  put('templates', 'tpl-receipt', {
    kind: 'receipt', name: 'Fee Receipt (default)', images: { logo, background: '', extra1: '' }, isDefault: true,
    layoutJson: {
      page: { w: 420, h: 600 },
      elements: [
        { id: 'r1', type: 'school', label: 'School name', x: 20, y: 16, w: 380, h: 30, fontSize: 18, fontWeight: 800, color: '#0f766e', align: 'center' },
        { id: 'r2', type: 'text', label: 'Fee Receipt', x: 20, y: 46, w: 380, h: 20, fontSize: 13, fontWeight: 600, align: 'center', color: '#64748b' },
        { id: 'r3', type: 'text', label: 'Receipt No', x: 20, y: 86, w: 180, h: 20, fontSize: 12, color: '#0f172a' },
        { id: 'r4', type: 'text', label: 'Date', x: 220, y: 86, w: 180, h: 20, fontSize: 12, color: '#0f172a' },
        { id: 'r5', type: 'name', label: 'Student', x: 20, y: 116, w: 380, h: 20, fontSize: 13, fontWeight: 700, color: '#0f172a' },
        { id: 'r6', type: 'class', label: 'Class', x: 20, y: 140, w: 380, h: 20, fontSize: 12, color: '#334155' },
        { id: 'r7', type: 'text', label: 'Fee details', x: 20, y: 170, w: 380, h: 18, fontSize: 12, color: '#334155' },
        { id: 'r8', type: 'text', label: 'Amount', x: 20, y: 192, w: 380, h: 24, fontSize: 15, fontWeight: 800, color: '#0f766e' },
        { id: 'r9', type: 'text', label: 'Mode', x: 20, y: 222, w: 380, h: 20, fontSize: 12, color: '#334155' },
        { id: 'r10', type: 'qr', label: 'Verify QR', x: 348, y: 528, w: 52, h: 52 },
        { id: 'r11', type: 'text', label: 'Collector', x: 20, y: 540, w: 300, h: 20, fontSize: 11, color: '#64748b' },
      ],
    },
  })
  put('templates', 'tpl-reportcard', {
    kind: 'reportcard', name: 'Report Card (default)', images: { logo, background: '', extra1: '' }, isDefault: true,
    layoutJson: {
      page: { w: 800, h: 1130 },
      elements: [
        { id: 'rc1', type: 'school', label: 'School name', x: 40, y: 30, w: 720, h: 40, fontSize: 28, fontWeight: 800, color: '#0f766e', align: 'center' },
        { id: 'rc2', type: 'text', label: 'Report card title', x: 40, y: 74, w: 720, h: 24, fontSize: 15, fontWeight: 600, align: 'center', color: '#64748b' },
        { id: 'rc3', type: 'name', label: 'Student', x: 40, y: 130, w: 400, h: 24, fontSize: 15, fontWeight: 700, color: '#0f172a' },
        { id: 'rc4', type: 'class', label: 'Class', x: 460, y: 130, w: 300, h: 24, fontSize: 14, color: '#334155' },
        { id: 'rc5', type: 'roll', label: 'Roll', x: 40, y: 158, w: 400, h: 22, fontSize: 13, color: '#334155' },
        { id: 'rc6', type: 'text', label: 'Marks table', x: 40, y: 200, w: 720, h: 520, fontSize: 13, color: '#0f172a' },
        { id: 'rc7', type: 'text', label: 'Remarks', x: 40, y: 760, w: 720, h: 140, fontSize: 13, color: '#0f172a' },
        { id: 'rc8', type: 'text', label: 'Result', x: 40, y: 920, w: 720, h: 26, fontSize: 15, fontWeight: 800, color: '#0f172a' },
      ],
    },
  })
  put('templates', 'tpl-certificate', {
    kind: 'certificate', name: 'Certificate (default)', images: { logo, background: '', extra1: '' }, isDefault: true,
    layoutJson: {
      page: { w: 1000, h: 700 },
      elements: [
        { id: 'ce1', type: 'school', label: 'School name', x: 100, y: 46, w: 800, h: 44, fontSize: 30, fontWeight: 800, color: '#0f766e', align: 'center' },
        { id: 'ce2', type: 'text', label: 'Certificate title', x: 100, y: 100, w: 800, h: 30, fontSize: 18, fontWeight: 600, align: 'center', color: '#64748b' },
        { id: 'ce3', type: 'photo', label: 'Photo', x: 440, y: 150, w: 120, h: 140, bgColor: '#f1f5f9', borderRadius: 8 },
        { id: 'ce4', type: 'text', label: 'Body', x: 120, y: 320, w: 760, h: 200, fontSize: 15, align: 'center', color: '#0f172a' },
        { id: 'ce5', type: 'name', label: 'Student', x: 200, y: 540, w: 600, h: 30, fontSize: 20, fontWeight: 700, align: 'center', color: '#0f172a' },
        { id: 'ce6', type: 'text', label: 'Serial', x: 100, y: 640, w: 400, h: 20, fontSize: 12, color: '#64748b' },
        { id: 'ce7', type: 'qr', label: 'Verify QR', x: 880, y: 620, w: 60, h: 60 },
      ],
    },
  })

  // ---------------- notices ----------------
  put('notices', 'n-1', {
    title: 'Annual Sports Day - 14 November',
    body: 'The Annual Sports Day will be held on the school grounds from 8:00 AM. Parents are warmly invited. Students must report in house uniform.',
    audience: { type: 'all', value: [] }, publishAt: ts - 86400000 * 3, status: 'live', isPinned: true, createdBy: 'u-admin', attachmentsUrl: [],
  })
  put('notices', 'n-2', {
    title: 'Half-Yearly Examination schedule released',
    body: 'The Half-Yearly Examination begins 21 September for Classes 5, 8 and 10. The detailed date sheet is on the class notice board.',
    audience: { type: 'all', value: [] }, publishAt: ts - 86400000, status: 'live', isPinned: false, createdBy: 'u-admin', attachmentsUrl: [],
  })
  put('notices', 'n-3', {
    title: 'PTM this Saturday, 10 AM to 12 PM',
    body: 'Parent-Teacher Meeting for Class 10 sections A and B. Please book your slot from the Parent Portal.',
    audience: { type: 'roles', value: ['parent'] }, publishAt: ts - 86400000 * 2, status: 'live', isPinned: false, createdBy: 'u-teacher', attachmentsUrl: [],
  })
  put('notices', 'n-4', {
    title: 'Second term fee reminder',
    body: 'Kindly clear pending term fees before the end of this month. Receipts are available in the Fees section of the portal.',
    audience: { type: 'all', value: [] }, publishAt: ts + 86400000, status: 'scheduled', isPinned: false, createdBy: 'u-accountant', attachmentsUrl: [],
  })

  // ---------------- notifications ----------------
  put('notifications', 'nt-1', { userId: 'u-parent', title: 'Unit Test 1 results published', body: 'Marks for Unit Test 1 are now available for Aarav Sharma.', link: '/portal', readAt: null })
  put('notifications', 'nt-2', { userId: 'u-parent', title: 'Tuition fee due for September', body: 'Tuition Fee of ₹2,800 for September 2026 is due on 10 Sep.', link: '/portal', readAt: null })
  put('notifications', 'nt-3', { userId: 'u-admin', title: 'Approval pending', body: 'Kavya Iyer signed up as Teacher and is waiting for approval.', link: '/users', readAt: null })

  // ---------------- timetable (Class 10 A & B, 6 periods) ----------------
  const a: [string, string][] = [['eng10', 'st-003'], ['math10', 'st-001'], ['sci10', 'st-002'], ['sst10', 'st-004'], ['hin10', 'st-005'], ['math10', 'st-001']]
  const b: [string, string][] = [['sci10', 'st-002'], ['sst10', 'st-004'], ['hin10', 'st-005'], ['math10', 'st-001'], ['eng10', 'st-003'], ['sci10', 'st-002']]
  for (let day = 1; day <= 6; day++) {
    for (let p = 1; p <= 6; p++) {
      const pa = a[p - 1]!
      const pb = b[p - 1]!
      put('timetable', `tt-a-${day}-${p}`, { sessionId: 'sess-2627', classId: 'c-10', section: 'A', day, periodNo: p, subjectId: pa[0], teacherId: pa[1], roomId: `R-${p}` })
      put('timetable', `tt-b-${day}-${p}`, { sessionId: 'sess-2627', classId: 'c-10', section: 'B', day, periodNo: p, subjectId: pb[0], teacherId: pb[1], roomId: `R-${p + 6}` })
    }
  }
  // Class 8 A: 4 periods
  const c8: [string, string][] = [['math08', 'st-001'], ['sci08', 'st-002'], ['eng08', 'st-007'], ['sst08', 'st-004']]
  for (let day = 1; day <= 6; day++) {
    for (let p = 1; p <= 4; p++) {
      const pc = c8[p - 1]!
      put('timetable', `tt-8a-${day}-${p}`, { sessionId: 'sess-2627', classId: 'c-8', section: 'A', day, periodNo: p, subjectId: pc[0], teacherId: pc[1] })
    }
  }

  // ---------------- leaves ----------------
  put('leaves', 'lv-1', { personType: 'staff', personId: 'st-002', personName: 'Rajesh Kumar', type: 'sick', from: d('2026-09-10'), to: d('2026-09-11'), reason: 'Fever and viral infection, doctor advised rest.', status: 'pending' })
  put('leaves', 'lv-2', { personType: 'student', personId: 'stu-103', personName: 'Ishaan Verma', type: 'emergency', from: d('2026-08-28'), to: d('2026-08-29'), reason: 'Family function out of town.', status: 'approved', decidedBy: 'u-teacher', decisionNote: 'Approved. Class work will be shared.' })
  put('leaves', 'lv-3', { personType: 'staff', personId: 'st-007', personName: 'Deepa Krishnan', type: 'casual', from: d('2026-09-04'), to: d('2026-09-04'), reason: 'Personal work at home.', status: 'rejected', decidedBy: 'u-admin', decisionNote: 'Exams approaching, please plan later.' })

  // ---------------- documents ----------------
  put('documents', 'doc-1', { ownerType: 'student', ownerId: 'stu-101', category: 'birth-certificate', url: 'https://picsum.photos/seed/bmrc-bcert/600/800', verified: true, verifiedBy: 'u-admin' })
  put('documents', 'doc-2', { ownerType: 'student', ownerId: 'stu-101', category: 'marksheet', url: 'https://picsum.photos/seed/bmrc-marks/600/800', verified: false })

  // ---------------- PTM ----------------
  const nextSat = (() => {
    const d0 = new Date()
    const diff = (6 - d0.getDay() + 7) % 7 || 7
    d0.setDate(d0.getDate() + diff)
    return d0.toISOString().slice(0, 10)
  })()
  put('ptms', 'ptm-1', {
    teacherId: 'st-001', classId: 'c-10', date: nextSat, title: 'Class 10 PTM - Half-yearly progress',
    status: 'scheduled',
    slots: [
      { time: '10:00', bookedByParentId: 'u-parent', studentId: 'stu-101' },
      { time: '10:20' }, { time: '10:40' }, { time: '11:00' },
    ],
  })

  // ---------------- messages ----------------
  put('messages', 'msg-1', { threadId: 'u-teacher_u-parent_stu-101', senderId: 'u-parent', senderName: 'Meera Sharma', text: 'Hello ma\'am, is the maths re-test scheduled for this Friday?', sentAt: ts - 86400000 * 2 })
  put('messages', 'msg-2', { threadId: 'u-teacher_u-parent_stu-101', senderId: 'u-teacher', senderName: 'Sunita Sharma', text: 'Yes, Friday second period. Syllabus is chapters 4 and 5.', sentAt: ts - 86400000 * 2 + 3600000 })

  // ---------------- calendar ----------------
  put('calendarEvents', 'cal-1', { date: d('2026-10-20'), type: 'holiday', title: 'Diwali break begins', description: 'School reopens on 27 October.' })
  put('calendarEvents', 'cal-2', { date: d('2026-11-14'), type: 'event', title: 'Annual Sports Day', description: 'March past at 8:00 AM, all houses.' })
  put('calendarEvents', 'cal-3', { date: d('2026-09-21'), type: 'exam', title: 'Half-Yearly begins (Classes 5, 8, 10)' })
  put('calendarEvents', 'cal-4', { date: nextSat, type: 'ptm', title: 'Parent-Teacher Meeting, Class 10' })

  put('runHistory', 'v1:examstatus:sess-2627', { ranAt: ts, result: 'seeded' })

  return db
}
