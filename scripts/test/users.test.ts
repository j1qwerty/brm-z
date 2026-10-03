/**
 * Users + Gmail-linking workflow suite.
 *
 * Covers the Google sign-in binding flow (in-memory provider):
 *   - signup-style pending user with a linked Gmail request
 *   - admin approves / rejects the linked Gmail
 *   - admin sets + approves a linked Gmail directly
 *   - student loginEmail saved on admit and editable later
 */
import type { SuiteContext, AssertAPI, TestResult } from './harness'
import { runSuite } from './harness'
import type { StudentDoc, UserDoc } from '../../src/lib/types'

export function usersSuite() {
  return {
    name: 'Users & Gmail linking',
    run: async (ctx: SuiteContext, results: TestResult[]) => {
      const p = ctx.provider
      ctx.resetDb()

      const tests = [
        {
          name: 'google signup creates pending user with linked gmail request',
          run: async (t: AssertAPI) => {
            const id = await p.create('users', {
              name: 'New Parent', email: 'newparent@gmail.com', role: 'parent', status: 'pending',
              linkedGmail: 'newparent@gmail.com', gmailStatus: 'pending',
            })
            const got = await p.get<UserDoc>('users', id)
            t.equals(got!.status, 'pending', 'account waits for approval')
            t.equals(got!.linkedGmail, 'newparent@gmail.com', 'gmail request stored')
            t.equals(got!.gmailStatus, 'pending', 'gmail waits for approval')
          },
        },
        {
          name: 'admin approves the linked gmail',
          run: async (t: AssertAPI) => {
            const id = await p.create('users', {
              name: 'Teacher G', email: 'tg@gmail.com', role: 'teacher', status: 'active',
              linkedGmail: 'tg@gmail.com', gmailStatus: 'pending',
            }, 'u-gmail-1')
            await p.update('users', id, { gmailStatus: 'approved' })
            const got = await p.get<UserDoc>('users', id)
            t.equals(got!.gmailStatus, 'approved', 'gmail approved, stays bound to the account')
            t.equals(got!.linkedGmail, 'tg@gmail.com', 'address unchanged by approval')
          },
        },
        {
          name: 'admin rejects the linked gmail',
          run: async (t: AssertAPI) => {
            const id = await p.create('users', {
              name: 'Staff X', email: 'sx@school.in', role: 'staff', status: 'active',
              linkedGmail: 'wrong@gmail.com', gmailStatus: 'pending',
            }, 'u-gmail-2')
            await p.update('users', id, { gmailStatus: 'rejected' })
            const got = await p.get<UserDoc>('users', id)
            t.equals(got!.gmailStatus, 'rejected', 'gmail rejected')
          },
        },
        {
          name: 'admin sets and approves a linked gmail directly',
          run: async (t: AssertAPI) => {
            const id = await p.create('users', { name: 'Old Staff', email: 'old@school.in', role: 'staff', status: 'active' }, 'u-gmail-3')
            await p.update('users', id, { linkedGmail: 'old.staff@gmail.com', gmailStatus: 'approved' })
            const got = await p.get<UserDoc>('users', id)
            t.equals(got!.linkedGmail, 'old.staff@gmail.com', 'admin-set gmail stored')
            t.equals(got!.gmailStatus, 'approved', 'admin-set gmail is approved immediately')
          },
        },
        {
          name: 'pending-approval list finds users awaiting review',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            await p.create('users', { name: 'P One', email: 'p1@x.in', role: 'parent', status: 'pending' }, 'u-p-1')
            await p.create('users', { name: 'A One', email: 'a1@x.in', role: 'admin', status: 'active' }, 'u-p-2')
            const pending = await p.list<UserDoc>('users', { where: [['status', '==', 'pending']] })
            t.equals(pending.length, 1, 'one pending account')
            t.equals(pending[0].id, 'u-p-1', 'the right one')
          },
        },
        {
          name: 'student loginEmail saved on admit and editable later',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            const id = await p.create('students', {
              name: 'Gmail Kid', gender: 'female', classId: 'c-5', section: 'A',
              admissionNo: 'ADM-G1', status: 'active', loginEmail: 'kid@gmail.com',
            }, 'stu-gmail-1')
            const got = await p.get<StudentDoc>('students', id)
            t.equals(got!.loginEmail, 'kid@gmail.com', 'login gmail stored (class-teacher set-up path)')
            await p.update('students', id, { loginEmail: 'kid.new@gmail.com' })
            const upd = await p.get<StudentDoc>('students', id)
            t.equals(upd!.loginEmail, 'kid.new@gmail.com', 'login gmail editable')
          },
        },
      ]

      console.log(`\n${'Users'.toUpperCase()} suite`)
      await runSuite('Users', ctx, tests, results)
    },
  }
}
