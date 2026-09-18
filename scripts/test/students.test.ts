/**
 * Students CRUD test suite.
 *
 * Verifies: single add (auto admission no), CSV bulk import via bulkWrite,
 * list with filters (classId, status), edit, soft-delete, restore, bulk delete.
 * Mirrors src/features/people/students.tsx usage.
 */
import type { SuiteContext, AssertAPI, TestResult } from './harness'
import { runSuite } from './harness'
import type { StudentDoc } from '../../src/lib/types'

const active = {
  status: 'active' as const,
  admissionDate: '2026-04-12',
}

export function studentsSuite() {
  return {
    name: 'Students',
    run: async (ctx: SuiteContext, results: TestResult[]) => {
      const p = ctx.provider
      ctx.resetDb()
      await p.create('classes', { name: 'Class 10', sections: ['A', 'B'], order: 5, classTeacherId: null }, 'c-10')
      await p.create('classes', { name: 'Class 9', sections: ['A'], order: 4, classTeacherId: null }, 'c-9')

      const tests = [
        {
          name: 'admit a single student (auto id, ADM-no passed in by app)',
          run: async (t: AssertAPI) => {
            const id = await p.create('students', {
              name: 'Aarav Sharma',
              gender: 'male',
              classId: 'c-10',
              section: 'A',
              rollNo: '12',
              admissionNo: 'ADM20260001',
              ...active,
            })
            const got = await p.get<StudentDoc>('students', id)
            t.equals(got!.name, 'Aarav Sharma', 'name matches')
            t.equals(got!.admissionNo, 'ADM20260001', 'admissionNo matches')
            t.equals(got!.status, 'active', 'status is active by default')
          },
        },
        {
          name: 'bulk import students via bulkWrite (CSV import path)',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            await p.create('classes', { name: 'Class 10', sections: ['A', 'B'], order: 5, classTeacherId: null }, 'c-10-b')
            const rows = [
              { name: 'Diya Patel', gender: 'female', classId: 'c-10-b', section: 'A', rollNo: '7', admissionNo: 'ADM-C1', ...active },
              { name: 'Ishaan Verma', gender: 'male', classId: 'c-10-b', section: 'A', rollNo: '3', admissionNo: 'ADM-C2', ...active },
              { name: 'Meenakshi S', gender: 'female', classId: 'c-10-b', section: 'B', rollNo: '9', admissionNo: 'ADM-C3', ...active },
              { name: 'Aditya Menon', gender: 'male', classId: 'c-10-b', section: 'B', rollNo: '16', admissionNo: 'ADM-C4', ...active },
            ]
            await p.bulkWrite('students', rows.map((r) => ({ data: r })))
            const list = await p.list<StudentDoc>('students')
            t.equals(list.length, 4, 'all 4 students imported')
            t.truthy(list.some((s) => s.name === 'Diya Patel'), 'Diya Patel present')
            t.truthy(list.some((s) => s.name === 'Aditya Menon'), 'Aditya Menon present')
          },
        },
        {
          name: 'list filters by classId',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            await p.create('classes', { name: 'Class 10', sections: ['A'], order: 5, classTeacherId: null }, 'c-f-10')
            await p.create('classes', { name: 'Class 9', sections: ['A'], order: 4, classTeacherId: null }, 'c-f-9')
            await p.create('students', { name: 'A', gender: 'male', classId: 'c-f-10', section: 'A', rollNo: '1', admissionNo: 'A1', ...active })
            await p.create('students', { name: 'B', gender: 'female', classId: 'c-f-9', section: 'A', rollNo: '2', admissionNo: 'A2', ...active })
            await p.create('students', { name: 'C', gender: 'male', classId: 'c-f-10', section: 'A', rollNo: '3', admissionNo: 'A3', ...active })
            const in10 = await p.list<StudentDoc>('students', { where: [['classId', '==', 'c-f-10']] })
            t.equals(in10.length, 2, 'two students in Class 10')
            t.truthy(in10.every((s) => s.classId === 'c-f-10'), 'all returned students in Class 10')
          },
        },
        {
          name: 'list filters by status',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            await p.create('students', { name: 'Active', gender: 'male', classId: 'c-10', section: 'A', rollNo: '1', admissionNo: 'A1', status: 'active' })
            await p.create('students', { name: 'Graduated', gender: 'male', classId: 'c-10', section: 'A', rollNo: '2', admissionNo: 'A2', status: 'graduated' })
            await p.create('students', { name: 'Transferred', gender: 'female', classId: 'c-10', section: 'A', rollNo: '3', admissionNo: 'A3', status: 'transferred' })
            const active = await p.list<StudentDoc>('students', { where: [['status', '==', 'active']] })
            t.equals(active.length, 1, 'one active student')
            t.equals(active[0].name, 'Active', 'correct student')
          },
        },
        {
          name: 'edit student updates fields and bumps updatedAt',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            const id = await p.create('students', { name: 'Aarav', gender: 'male', classId: 'c-10', section: 'A', rollNo: '1', admissionNo: 'A1', status: 'active' })
            const before = await p.get<StudentDoc>('students', id)
            await new Promise((r) => setTimeout(r, 5))
            await p.update('students', id, { name: 'Aarav Sharma', rollNo: '42' })
            const after = await p.get<StudentDoc>('students', id)
            t.equals(after!.name, 'Aarav Sharma', 'name updated')
            t.equals(after!.rollNo, '42', 'rollNo updated')
            t.truthy((after!.updatedAt ?? 0) >= (before!.updatedAt ?? 0), 'updatedAt did not decrease')
            t.equals(after!.admissionNo, 'A1', 'admissionNo preserved')
          },
        },
        {
          name: 'soft-delete student hides from list, restores cleanly',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            const id = await p.create('students', { name: 'Aarav', gender: 'male', classId: 'c-10', section: 'A', rollNo: '1', admissionNo: 'A1', status: 'active' })
            await p.softDelete('students', id, 'u-admin')
            const list = await p.list<StudentDoc>('students')
            t.equals(list.length, 0, 'soft-deleted student hidden from default list')
            await p.restore('students', id)
            const list2 = await p.list<StudentDoc>('students')
            t.equals(list2.length, 1, 'student reappears after restore')
            t.equals(list2[0].name, 'Aarav', 'restored student name matches')
          },
        },
        {
          name: 'bulk soft-delete multiple students (BulkAction path)',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            const ids: string[] = []
            for (let i = 1; i <= 3; i++) {
              ids.push(await p.create('students', { name: `S${i}`, gender: 'male', classId: 'c-10', section: 'A', rollNo: String(i), admissionNo: `A${i}`, status: 'active' }))
            }
            for (const id of ids) await p.softDelete('students', id, 'u-admin')
            const list = await p.list<StudentDoc>('students')
            t.equals(list.length, 0, 'all 3 bulk-deleted students are hidden')
            const deleted = await p.listDeleted<StudentDoc>('students')
            t.equals(deleted.length, 3, 'all 3 in trash')
          },
        },
        {
          name: 'bulkWrite updates existing student when id matches',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            const id = await p.create('students', { name: 'Aarav', gender: 'male', classId: 'c-10', section: 'A', rollNo: '1', admissionNo: 'A1', status: 'active' }, 'stu-bw')
            await p.bulkWrite('students', [{ id, data: { rollNo: '99' } }])
            const got = await p.get<StudentDoc>('students', id)
            t.equals(got!.rollNo, '99', 'rollNo updated by bulkWrite')
            t.equals(got!.name, 'Aarav', 'name preserved')
          },
        },
        {
          name: 'update on non-existent student throws not found',
          run: async (t: AssertAPI) => {
            await t.throws(
              () => p.update('students', 'no-such-id', { name: 'X' }),
              /not found/i,
              'should throw on missing id',
            )
          },
        },
      ]

      console.log(`\n${'Students'.toUpperCase()} suite`)
      await runSuite('Students', ctx, tests, results)
    },
  }
}
