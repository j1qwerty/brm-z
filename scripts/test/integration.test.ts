/**
 * Integration suite: a full school-day sequence that mixes entities.
 *
 * 1. Create a session
 * 2. Create classes inside it (Nursery, Class 10)
 * 3. Add subjects to each class
 * 4. Add teachers (staff with type=teaching)
 * 5. Admit students to each class
 * 6. Create teaching assignments linking teacher + class + subject
 * 7. Verify the entire graph is consistent (no orphan refs)
 * 8. Edit one assignment, delete one student, restore it
 */
import type { SuiteContext, AssertAPI, TestResult } from './harness'
import { runSuite } from './harness'
import type { AssignmentDoc, ClassDoc, SessionDoc, StaffDoc, StudentDoc, SubjectDoc } from '../../src/lib/types'

export function integrationSuite() {
  return {
    name: 'Integration (end-to-end school setup)',
    run: async (ctx: SuiteContext, results: TestResult[]) => {
      const p = ctx.provider
      ctx.resetDb()

      const tests = [
        {
          name: 'build a small school end-to-end',
          run: async (t: AssertAPI) => {
            const sessionId = await p.create(
              'sessions',
              { name: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31', isActive: true, isCompleted: false },
              'sess-int',
            )
            const session = await p.get<SessionDoc>('sessions', sessionId)
            t.equals(session!.isActive, true, 'session is active')

            const nurseryId = await p.create('classes', { name: 'Nursery', sections: ['A'], order: 0, classTeacherId: null }, 'c-int-nur')
            const class10Id = await p.create('classes', { name: 'Class 10', sections: ['A', 'B'], order: 5, classTeacherId: null }, 'c-int-10')

            await p.create(`classes/${nurseryId}/subjects`, { name: 'Rhymes', code: 'RHY', gradingMode: 'percentage', isElective: false, classId: nurseryId }, 'sub-nur-rhy')
            const mathId = await p.create(`classes/${class10Id}/subjects`, { name: 'Mathematics', code: 'MATH10', gradingMode: 'percentage', isElective: false, classId: class10Id }, 'sub-10-math')
            const sciId = await p.create(`classes/${class10Id}/subjects`, { name: 'Science', code: 'SCI10', gradingMode: 'percentage', isElective: false, classId: class10Id }, 'sub-10-sci')

            const class10Subjects = await p.list<SubjectDoc>(`classes/${class10Id}/subjects`)
            t.equals(class10Subjects.length, 2, 'class 10 has 2 subjects')

            const t1Id = await p.create('staff', { name: 'Sunita', staffType: 'teaching', designation: 'TGT', status: 'active' }, 'st-int-1')
            const t2Id = await p.create('staff', { name: 'Rajesh', staffType: 'teaching', designation: 'PGT', status: 'active' }, 'st-int-2')

            const stuIds: string[] = []
            for (let i = 1; i <= 5; i++) {
              stuIds.push(
                await p.create('students', {
                  name: `Student ${i}`,
                  gender: i % 2 === 0 ? 'female' : 'male',
                  classId: class10Id,
                  section: i % 2 === 0 ? 'B' : 'A',
                  rollNo: String(i),
                  admissionNo: `ADM20260${i}`,
                  status: 'active',
                }, `stu-int-${i}`),
              )
            }
            await p.create('students', { name: 'Tiny Tot', gender: 'male', classId: nurseryId, section: 'A', rollNo: '1', admissionNo: 'ADM-N1', status: 'active' }, 'stu-int-nur')

            await p.create('assignments', { sessionId, classId: class10Id, sectionId: 'A', subjectId: mathId, teacherId: t1Id }, 'as-int-1')
            await p.create('assignments', { sessionId, classId: class10Id, sectionId: 'A', subjectId: sciId, teacherId: t2Id }, 'as-int-2')

            const allStudents = await p.list<StudentDoc>('students')
            const allClasses = await p.list<ClassDoc>('classes')
            const classIds = new Set(allClasses.map((c) => c.id))
            t.truthy(allStudents.every((s) => classIds.has(s.classId)), 'every student references a real class')

            const assignments = await p.list<AssignmentDoc>('assignments')
            const staffIds = new Set((await p.list<StaffDoc>('staff')).map((s) => s.id))
            t.truthy(assignments.every((a) => staffIds.has(a.teacherId)), 'every assignment references a real teacher')
            t.truthy(assignments.every((a) => classIds.has(a.classId)), 'every assignment references a real class')
            for (const a of assignments) {
              const subjects = await p.list<SubjectDoc>(`classes/${a.classId}/subjects`)
              t.truthy(subjects.some((s) => s.id === a.subjectId), `assignment ${a.id} references a real subject in its class`)
            }

            await p.update('assignments', 'as-int-1', { teacherId: t2Id })
            const upd = await p.get<AssignmentDoc>('assignments', 'as-int-1')
            t.equals(upd!.teacherId, t2Id, 'assignment teacher switched')

            await p.softDelete('students', 'stu-int-1', 'u-admin')
            const visibleAfterDelete = await p.list<StudentDoc>('students')
            t.equals(visibleAfterDelete.length, allStudents.length - 1, 'one student hidden after delete')
            await p.restore('students', 'stu-int-1')
            const visibleAfterRestore = await p.list<StudentDoc>('students')
            t.equals(visibleAfterRestore.length, allStudents.length, 'student restored')
          },
        },
        {
          name: 'class deletion does NOT cascade to subjects (subcollection stays)',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            const classId = await p.create('classes', { name: 'Class 11', sections: ['A'], order: 6, classTeacherId: null }, 'c-cascade')
            const subjId = await p.create(`classes/${classId}/subjects`, { name: 'Math', code: 'MATH11', gradingMode: 'percentage', isElective: false, classId })
            await p.softDelete('classes', classId, 'u-admin')
            const classList = await p.list<ClassDoc>('classes')
            t.equals(classList.length, 0, 'class hidden from default list')
            const subjList = await p.list<SubjectDoc>(`classes/${classId}/subjects`)
            t.equals(subjList.length, 1, 'subject still exists in subcollection (no cascade delete)')
            t.equals(subjList[0].id, subjId, 'subject identity preserved')
          },
        },
        {
          name: 'multiple sessions, only one active at a time (app invariant)',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            await p.create('sessions', { name: '2025-2026', startDate: '2025-04-01', endDate: '2026-03-31', isActive: true, isCompleted: false }, 'sess-a')
            await p.create('sessions', { name: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31', isActive: false, isCompleted: false }, 'sess-b')
            await p.update('sessions', 'sess-a', { isActive: false })
            await p.update('sessions', 'sess-b', { isActive: true })
            const active = await p.list<SessionDoc>('sessions', { where: [['isActive', '==', true]] })
            t.equals(active.length, 1, 'exactly one active session')
            t.equals(active[0].id, 'sess-b', 'new session is the active one')
          },
        },
      ]

      console.log(`\n${'Integration'.toUpperCase()} suite`)
      await runSuite('Integration', ctx, tests, results)
    },
  }
}
