/**
 * Classes + Subjects CRUD test suite.
 *
 * Verifies:
 *   - Class create (auto id + explicit id)
 *   - Subject create inside class subcollection `classes/{classId}/subjects`
 *   - Subject update
 *   - Subject soft-delete + re-create with same code (the bug we just fixed!)
 *   - Class update
 *   - Soft-delete + restore on both
 *   - List filtering and ordering for classes
 *
 * This is the most critical suite because the original code used the subject
 * code as the Firestore document id AND swallowed errors silently, so any
 * re-create-after-delete would hang the form.
 */
import type { SuiteContext, AssertAPI, TestResult } from './harness'
import { runSuite } from './harness'
import type { ClassDoc, SubjectDoc } from '../../src/lib/types'

export function classesSuite() {
  return {
    name: 'Classes & Subjects',
    run: async (ctx: SuiteContext, results: TestResult[]) => {
      const p = ctx.provider
      ctx.resetDb()

      const tests = [
        {
          name: 'create class with explicit id',
          run: async (t: AssertAPI) => {
            const id = await p.create(
              'classes',
              { name: 'Class 10', sections: ['A', 'B'], order: 5, classTeacherId: null },
              'c-10',
            )
            const got = await p.get<ClassDoc>('classes', id)
            t.equals(got!.name, 'Class 10', 'name matches')
            t.deepEquals(got!.sections, ['A', 'B'], 'sections matches')
            t.equals(got!.order, 5, 'order matches')
          },
        },
        {
          name: 'create class with auto id',
          run: async (t: AssertAPI) => {
            const id = await p.create('classes', { name: 'Class 9', sections: ['A'], order: 4, classTeacherId: null })
            t.truthy(typeof id === 'string' && id.length > 0, 'auto id should be a non-empty string')
            const got = await p.get<ClassDoc>('classes', id)
            t.equals(got!.name, 'Class 9', 'name matches')
          },
        },
        {
          name: 'subject create in class subcollection succeeds (THE BUG WE FIXED)',
          run: async (t: AssertAPI) => {
            const classId = await p.create('classes', { name: 'Class 10', sections: ['A', 'B'], order: 5, classTeacherId: null }, 'c-subj-1')
            const subjectId = await p.create(`classes/${classId}/subjects`, {
              name: 'Mathematics',
              code: 'MATH10',
              gradingMode: 'percentage',
              isElective: false,
              classId,
            })
            t.truthy(subjectId, 'subject create should return an id')
            const subjects = await p.list<SubjectDoc>(`classes/${classId}/subjects`)
            t.equals(subjects.length, 1, 'list should return 1 subject')
            t.equals(subjects[0].name, 'Mathematics', 'subject name matches')
            t.equals(subjects[0].code, 'MATH10', 'subject code matches')
            t.equals(subjects[0].classId, classId, 'subject embeds classId')
          },
        },
        {
          name: 're-create subject with same code after delete works (regression for the bug)',
          run: async (t: AssertAPI) => {
            const classId = await p.create('classes', { name: 'Class 10', sections: ['A'], order: 5, classTeacherId: null }, 'c-reg-1')
            const id1 = await p.create(`classes/${classId}/subjects`, {
              name: 'Mathematics', code: 'MATH10', gradingMode: 'percentage', isElective: false, classId,
            })
            t.truthy(id1, 'first create returns an id')
            await p.softDelete(`classes/${classId}/subjects`, id1, 'u-admin')
            const id2 = await p.create(`classes/${classId}/subjects`, {
              name: 'Mathematics', code: 'MATH10', gradingMode: 'percentage', isElective: false, classId,
            })
            t.truthy(id2, 're-create should succeed and return a new id')
            t.truthy(id2 !== id1, 'new id must differ from the deleted doc id')
            const subjects = await p.list<SubjectDoc>(`classes/${classId}/subjects`)
            t.equals(subjects.length, 1, 'only the new (non-deleted) subject should appear in list')
            t.equals(subjects[0].name, 'Mathematics', 'subject name matches')
          },
        },
        {
          name: 'subject update mutates fields',
          run: async (t: AssertAPI) => {
            const classId = await p.create('classes', { name: 'Class 11', sections: ['A'], order: 6, classTeacherId: null }, 'c-upd-1')
            const subjectId = await p.create(`classes/${classId}/subjects`, {
              name: 'Mathematics', code: 'MATH11', gradingMode: 'percentage', isElective: false, classId,
            })
            await p.update(`classes/${classId}/subjects`, subjectId, { isElective: true, gradingMode: 'grade' })
            const got = await p.get<SubjectDoc>(`classes/${classId}/subjects`, subjectId)
            t.equals(got!.isElective, true, 'isElective should be true after update')
            t.equals(got!.gradingMode, 'grade', 'gradingMode should be grade after update')
          },
        },
        {
          name: 'subject soft-delete hides it from default list',
          run: async (t: AssertAPI) => {
            const classId = await p.create('classes', { name: 'Class 12', sections: ['A'], order: 7, classTeacherId: null }, 'c-del-1')
            const s1 = await p.create(`classes/${classId}/subjects`, { name: 'Math', code: 'MATH12', gradingMode: 'percentage', isElective: false, classId })
            const s2 = await p.create(`classes/${classId}/subjects`, { name: 'Physics', code: 'PHY12', gradingMode: 'percentage', isElective: false, classId })
            await p.softDelete(`classes/${classId}/subjects`, s1, 'u-admin')
            const list = await p.list<SubjectDoc>(`classes/${classId}/subjects`)
            t.equals(list.length, 1, 'one subject should remain after delete')
            t.equals(list[0].name, 'Physics', 'the right subject survived')
          },
        },
        {
          name: 'subjects are isolated per class',
          run: async (t: AssertAPI) => {
            const classA = await p.create('classes', { name: 'Class 8', sections: ['A'], order: 4, classTeacherId: null }, 'c-iso-a')
            const classB = await p.create('classes', { name: 'Class 9', sections: ['A'], order: 4, classTeacherId: null }, 'c-iso-b')
            await p.create(`classes/${classA}/subjects`, { name: 'Mathematics', code: 'MATH08', gradingMode: 'percentage', isElective: false, classId: classA })
            await p.create(`classes/${classB}/subjects`, { name: 'Mathematics', code: 'MATH09', gradingMode: 'percentage', isElective: false, classId: classB })
            const sA = await p.list<SubjectDoc>(`classes/${classA}/subjects`)
            const sB = await p.list<SubjectDoc>(`classes/${classB}/subjects`)
            t.equals(sA.length, 1, 'classA has its own subject')
            t.equals(sB.length, 1, 'classB has its own subject')
            t.equals(sA[0].code, 'MATH08', 'classA subject code is MATH08')
            t.equals(sB[0].code, 'MATH09', 'classB subject code is MATH09')
          },
        },
        {
          name: 'class update bumps updatedAt and preserves other fields',
          run: async (t: AssertAPI) => {
            const id = await p.create('classes', { name: 'Class 7', sections: ['A'], order: 3, classTeacherId: null }, 'c-bump')
            const before = await p.get<ClassDoc>('classes', id)
            await new Promise((r) => setTimeout(r, 5))
            await p.update('classes', id, { classTeacherId: 'st-001' })
            const after = await p.get<ClassDoc>('classes', id)
            t.equals(after!.classTeacherId, 'st-001', 'classTeacherId should be set')
            t.equals(after!.name, 'Class 7', 'name preserved')
            t.deepEquals(after!.sections, ['A'], 'sections preserved')
            t.truthy((after!.updatedAt ?? 0) >= (before!.updatedAt ?? 0), 'updatedAt did not decrease')
          },
        },
        {
          name: 'class list supports order asc',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            await p.create('classes', { name: 'Class 10', sections: ['A'], order: 5, classTeacherId: null }, 'c-o-10')
            await p.create('classes', { name: 'Nursery', sections: ['A'], order: 0, classTeacherId: null }, 'c-o-nur')
            await p.create('classes', { name: 'Class 5', sections: ['A'], order: 3, classTeacherId: null }, 'c-o-5')
            const list = await p.list<ClassDoc>('classes', { orderBy: ['order', 'asc'] })
            t.deepEquals(list.map((c) => c.name), ['Nursery', 'Class 5', 'Class 10'], 'classes sorted by order asc')
          },
        },
        {
          name: 'class soft-delete + restore preserves data',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            const id = await p.create('classes', { name: 'Class 6', sections: ['A', 'B'], order: 4, classTeacherId: null }, 'c-rs')
            await p.softDelete('classes', id, 'u-admin')
            const afterDel = await p.list<ClassDoc>('classes')
            t.equals(afterDel.length, 0, 'deleted class is hidden in default list')
            await p.restore('classes', id)
            const afterRes = await p.list<ClassDoc>('classes')
            t.equals(afterRes.length, 1, 'restored class reappears in list')
            t.deepEquals(afterRes[0].sections, ['A', 'B'], 'sections preserved through delete+restore')
          },
        },
      ]

      console.log(`\n${'Classes & Subjects'.toUpperCase()} suite`)
      await runSuite('Classes & Subjects', ctx, tests, results)
    },
  }
}
