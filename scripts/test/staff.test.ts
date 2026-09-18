/**
 * Staff / Teachers CRUD test suite.
 *
 * Tests both teaching and non-teaching staff. Mirrors
 * src/features/people/staff.tsx.
 */
import type { SuiteContext, AssertAPI, TestResult } from './harness'
import { runSuite } from './harness'
import type { StaffDoc } from '../../src/lib/types'

export function staffSuite() {
  return {
    name: 'Staff & Teachers',
    run: async (ctx: SuiteContext, results: TestResult[]) => {
      const p = ctx.provider
      ctx.resetDb()

      const tests = [
        {
          name: 'create teacher (teaching staff)',
          run: async (t: AssertAPI) => {
            const id = await p.create('staff', {
              name: 'Sunita Sharma',
              staffType: 'teaching',
              designation: 'TGT Mathematics',
              qualification: 'B.Sc, B.Ed',
              phone: '+91 98480 22222',
              email: 'sunita@bmrc.demo',
              employeeNo: 'EMP001',
              joinDate: '2022-06-10',
              bloodGroup: 'B+',
              address: 'Hyderabad',
              status: 'active',
            })
            const got = await p.get<StaffDoc>('staff', id)
            t.equals(got!.staffType, 'teaching', 'staffType matches')
            t.equals(got!.name, 'Sunita Sharma', 'name matches')
            t.equals(got!.status, 'active', 'status is active by default')
          },
        },
        {
          name: 'create non-teaching staff',
          run: async (t: AssertAPI) => {
            const id = await p.create('staff', {
              name: 'Venkatesh Yadav',
              staffType: 'nonteaching',
              designation: 'Librarian',
              phone: '+91 98480 44444',
              status: 'active',
            })
            const got = await p.get<StaffDoc>('staff', id)
            t.equals(got!.staffType, 'nonteaching', 'staffType is nonteaching')
          },
        },
        {
          name: 'list filters staffType=teaching returns only teachers',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            await p.create('staff', { name: 'T1', staffType: 'teaching', status: 'active' }, 'st-t1')
            await p.create('staff', { name: 'T2', staffType: 'teaching', status: 'active' }, 'st-t2')
            await p.create('staff', { name: 'NT1', staffType: 'nonteaching', status: 'active' }, 'st-nt1')
            const teachers = await p.list<StaffDoc>('staff', { where: [['staffType', '==', 'teaching']] })
            t.equals(teachers.length, 2, 'two teachers')
            t.truthy(teachers.every((s) => s.staffType === 'teaching'), 'all returned docs are teachers')
          },
        },
        {
          name: 'list filters staffType=nonteaching returns only non-teaching',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            await p.create('staff', { name: 'T1', staffType: 'teaching', status: 'active' }, 'st-t1')
            await p.create('staff', { name: 'NT1', staffType: 'nonteaching', status: 'active' }, 'st-nt1')
            await p.create('staff', { name: 'NT2', staffType: 'nonteaching', status: 'active' }, 'st-nt2')
            const nonteaching = await p.list<StaffDoc>('staff', { where: [['staffType', '==', 'nonteaching']] })
            t.equals(nonteaching.length, 2, 'two non-teaching staff')
          },
        },
        {
          name: 'edit teacher designation + phone',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            const id = await p.create('staff', { name: 'Sunita', staffType: 'teaching', designation: 'TGT', phone: '111', status: 'active' }, 'st-e1')
            await p.update('staff', id, { designation: 'PGT Mathematics', phone: '999' })
            const got = await p.get<StaffDoc>('staff', id)
            t.equals(got!.designation, 'PGT Mathematics', 'designation updated')
            t.equals(got!.phone, '999', 'phone updated')
            t.equals(got!.name, 'Sunita', 'name preserved')
          },
        },
        {
          name: 'soft-delete teacher hides from list',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            const id = await p.create('staff', { name: 'Sunita', staffType: 'teaching', status: 'active' }, 'st-d1')
            await p.softDelete('staff', id, 'u-admin')
            const list = await p.list<StaffDoc>('staff', { where: [['staffType', '==', 'teaching']] })
            t.equals(list.length, 0, 'deleted teacher is hidden')
            const trash = await p.listDeleted<StaffDoc>('staff')
            t.equals(trash.length, 1, 'teacher is in trash')
          },
        },
        {
          name: 'restore teacher keeps staffType intact',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            const id = await p.create('staff', { name: 'Sunita', staffType: 'teaching', status: 'active' }, 'st-r1')
            await p.softDelete('staff', id, 'u-admin')
            await p.restore('staff', id)
            const got = await p.get<StaffDoc>('staff', id)
            t.equals(got!.staffType, 'teaching', 'staffType preserved through restore')
            t.isNil(got!.deletedAt, 'deletedAt cleared')
          },
        },
        {
          name: 'duplicate staff id create throws',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            await p.create('staff', { name: 'X', staffType: 'teaching', status: 'active' }, 'st-x')
            await t.throws(
              () => p.create('staff', { name: 'Y', staffType: 'teaching', status: 'active' }, 'st-x'),
              /already exists/i,
              'duplicate id create should throw',
            )
          },
        },
        {
          name: 'bulk create multiple teachers via bulkWrite',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            const rows = [
              { name: 'T1', staffType: 'teaching' as const, status: 'active' as const, designation: 'TGT', phone: '111' },
              { name: 'T2', staffType: 'teaching' as const, status: 'active' as const, designation: 'PGT', phone: '222' },
              { name: 'T3', staffType: 'teaching' as const, status: 'active' as const, designation: 'PRT', phone: '333' },
            ]
            await p.bulkWrite('staff', rows.map((r) => ({ data: r })))
            const list = await p.list<StaffDoc>('staff', { where: [['staffType', '==', 'teaching']] })
            t.equals(list.length, 3, 'three teachers created via bulkWrite')
          },
        },
      ]

      console.log(`\n${'Staff & Teachers'.toUpperCase()} suite`)
      await runSuite('Staff & Teachers', ctx, tests, results)
    },
  }
}
