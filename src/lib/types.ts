// BRM Firestore data model (mirrors spec section 4)
// All timestamps are epoch millis (providers convert Firestore Timestamps).

export type Role = 'admin' | 'teacher' | 'accountant' | 'staff' | 'student' | 'parent'
export type UserStatus = 'pending' | 'active' | 'suspended'

export interface BaseDoc {
  id: string
  createdAt?: number
  updatedAt?: number
  deletedAt?: number | null
  deletedBy?: string | null
}

export interface UserDoc extends BaseDoc {
  name: string
  email: string
  phone?: string
  photoUrl?: string
  role: Role
  status: UserStatus
  studentId?: string // for student role
  staffId?: string // for teacher/staff roles
  childIds?: string[] // for parent role (multi-child)
  /** Gmail the user wants to sign in with via Google. Set by the user (or by
   *  admin / class-teacher on their behalf); must be approved before it counts. */
  linkedGmail?: string
  gmailStatus?: 'pending' | 'approved' | 'rejected'
}

export interface SessionDoc extends BaseDoc {
  name: string // "2025-2026"
  startDate: string // yyyy-MM-dd
  endDate: string
  isActive: boolean
  isCompleted: boolean
}

export interface SubjectDoc extends BaseDoc {
  classId: string
  name: string
  code: string
  gradingMode: 'percentage' | 'grade'
  isElective: boolean
}

export interface ClassDoc extends BaseDoc {
  name: string // "Class 10"
  sections: string[] // ["A","B"]
  classTeacherId?: string
  order: number // promotion order; top-most class graduates
}

export interface AssignmentDoc extends BaseDoc {
  sessionId: string
  classId: string
  sectionId: string | null
  subjectId: string
  teacherId: string
}

export interface StudentDoc extends BaseDoc {
  admissionNo: string
  rollNo?: string
  name: string
  gender: 'male' | 'female' | 'other'
  dob?: string
  bloodGroup?: string
  classId: string
  section: string
  phone?: string
  address?: string
  photoUrl?: string
  guardianName?: string
  guardianPhone?: string
  /** Gmail the student will use for Google sign-in. Set by the student or
   *  their class-teacher; the linked user account still needs approval. */
  loginEmail?: string
  parentUserId?: string
  status: 'active' | 'graduated' | 'transferred' | 'left'
  tcSerial?: string
  category?: string
  religion?: string
  admissionDate?: string
  aadharNo?: string
}

export interface StaffDoc extends BaseDoc {
  name: string
  staffType: 'teaching' | 'nonteaching'
  designation?: string
  phone?: string
  email?: string
  joinDate?: string
  photoUrl?: string
  address?: string
  qualification?: string
  bloodGroup?: string
  status: 'active' | 'left'
  employeeNo?: string
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'half-day' | 'leave'

export interface AttendanceDoc extends BaseDoc {
  date: string // yyyy-MM-dd
  sessionId: string
  personType: 'student' | 'staff'
  personId: string
  classId?: string
  section?: string
  status: AttendanceStatus
  markedBy: string
}

export interface FeeTypeDoc extends BaseDoc {
  name: string
  frequency: 'one-time' | 'monthly' | 'quarterly' | 'half-yearly' | 'yearly'
  defaultAmount: number
  refundable: boolean
}

export interface FeeAssignmentDoc extends BaseDoc {
  sessionId: string
  feeTypeId: string
  targetType: 'class' | 'student'
  targetId: string
  amount: number
}

export interface InvoiceDoc extends BaseDoc {
  sessionId: string
  studentId: string
  feeTypeId: string
  feeTypeName?: string
  periodKey: string // "2026-04"
  amount: number
  discount: number
  paidAmount: number
  dueDate: string
  status: 'unpaid' | 'partial' | 'paid' | 'waived'
  generatedByRunId: string
}

export interface PaymentDoc extends BaseDoc {
  invoiceId: string
  studentId: string
  amount: number
  mode: 'cash' | 'upi' | 'bank' | 'cheque' | 'online'
  paidAt: number
  receiptNo: string
  collectedBy: string
  note?: string
}

export interface ExamClassConfig {
  subjectIds: string[]
  maxMarks: number
  date?: string
  includeInFinal: boolean
}

export interface ExamDoc extends BaseDoc {
  name: string
  type: 'unit' | 'half-yearly' | 'final' | 'custom'
  sessionId: string
  classIds: string[] // empty = all classes
  perClass: Record<string, ExamClassConfig>
  startDate?: string
  endDate?: string
  status: 'draft' | 'scheduled' | 'ongoing' | 'evaluation' | 'published'
}

export interface MarkDoc extends BaseDoc {
  examId: string
  studentId: string
  subjectId: string
  marks: number | null
  maxMarks: number
  grade: string
  enteredBy: string
  remark?: string
}

export interface GradeBand {
  grade: string
  min: number
  max: number
  remark: string
}

export interface GradingScaleDoc extends BaseDoc {
  name: string
  isDefault: boolean
  bands: GradeBand[]
}

export interface TemplateElement {
  id: string
  type: 'photo' | 'name' | 'text' | 'class' | 'roll' | 'dob' | 'blood' | 'phone' | 'address' | 'qr' | 'watermark' | 'school' | 'extra'
  label: string
  x: number
  y: number
  w: number
  h: number
  fontSize?: number
  fontWeight?: number
  color?: string
  align?: 'left' | 'center' | 'right'
  bgColor?: string
  borderRadius?: number
}

export interface TemplateDoc extends BaseDoc {
  kind: 'idcard-student' | 'idcard-teacher' | 'idcard-staff' | 'receipt' | 'reportcard' | 'certificate'
  name: string
  layoutJson: { page: { w: number; h: number }; elements: TemplateElement[] }
  images: { logo?: string; background?: string; extra1?: string }
  isDefault: boolean
  /** For kind === 'certificate': which certificate type this template is the
   *  design for. Lets each of TC / bonafide / character have its own default. */
  certType?: 'tc' | 'bonafide' | 'character'
}

export interface TimetableConfigDoc extends BaseDoc {
  classId: string
  section: string
  /** Periods Mon-Fri */
  weekdayPeriods: number
  /** Periods on Saturday (day 6). Days past the count render as "day over". */
  saturdayPeriods: number
}

export interface CertificateDoc extends BaseDoc {
  type: 'tc' | 'bonafide' | 'character'
  studentId: string
  serialNo: string
  issuedDate: string
  templateId?: string
  dataSnapshot: Record<string, string>
}

export interface NoticeDoc extends BaseDoc {
  title: string
  body: string
  audience: { type: 'all' | 'roles' | 'classes'; value: string[] }
  publishAt: number
  status: 'scheduled' | 'live'
  isPinned: boolean
  createdBy: string
  attachmentsUrl: string[]
}

export interface NotificationDoc extends BaseDoc {
  userId: string
  title: string
  body: string
  link?: string
  readAt: number | null
}

export interface TimetableSlotDoc extends BaseDoc {
  sessionId: string
  classId: string
  section: string
  day: number // 1=Mon ... 6=Sat
  periodNo: number
  subjectId: string
  teacherId: string
  roomId?: string
}

export interface LeaveDoc extends BaseDoc {
  personType: 'student' | 'staff'
  personId: string
  personName?: string
  type: 'sick' | 'casual' | 'emergency' | 'other'
  from: string
  to: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  decidedBy?: string
  decisionNote?: string
}

export interface DocumentDoc extends BaseDoc {
  ownerType: 'student' | 'staff'
  ownerId: string
  category: 'birth-certificate' | 'marksheet' | 'tc' | 'photo' | 'id-proof' | 'other'
  url: string
  verified: boolean
  verifiedBy?: string
}

export interface PtmSlot {
  time: string
  bookedByParentId?: string
  studentId?: string
}

export interface PtmDoc extends BaseDoc {
  teacherId: string
  classId: string
  date: string
  slots: PtmSlot[]
  status: 'scheduled' | 'completed'
  title?: string
}

export interface MessageDoc extends BaseDoc {
  threadId: string // `${parentUserId}_${teacherId}_${studentId}` (uids sorted)
  senderId: string
  senderName: string
  text: string
  sentAt: number
}

export interface CalendarEventDoc extends BaseDoc {
  date: string
  type: 'holiday' | 'event' | 'exam' | 'ptm'
  title: string
  description?: string
}

export interface SchoolSettingsDoc {
  id: 'school'
  name: string
  logoUrl?: string
  address?: string
  city?: string
  affiliation?: string
  phone?: string
  email?: string
  website?: string
  principalName?: string
  sessionDefaults?: { periodsPerDay: number; workingDays: number[] }
  updatedAt?: number
}

export interface RunHistoryDoc {
  id: string
  ranAt: number
  result?: string
}

export const COLLECTIONS = [
  'users', 'sessions', 'classes', 'assignments', 'students', 'staff', 'attendance',
  'feeTypes', 'feeAssignments', 'invoices', 'payments', 'exams', 'marks',
  'gradingScales', 'reportCards', 'templates', 'certificates', 'notices',
  'notifications', 'timetable', 'timetableConfig', 'leaves', 'documents', 'ptms', 'messages',
  'calendarEvents', 'runHistory',
] as const

export type CollectionName = (typeof COLLECTIONS)[number] | `classes/${string}/subjects`
