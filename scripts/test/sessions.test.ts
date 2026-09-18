/**
 * Sessions CRUD test suite.
 *
 * Verifies: create (auto id), read by id, list (active filter, soft-delete filter),
 * update, soft-delete, restore. Mirrors src/features/sessions/SessionsPage.tsx usage.
 */
import type { SuiteContext, AssertAPI, TestResult } from './harness'
import { runSuite } from './harness'
import type { SessionDoc } from '../../src/lib/types'

export function sessionsSuite() {
  return {
    name: 'Sessions',
    run: async (ctx: SuiteContext, results: TestResult[]) => {
      const p = ctx.provider
      ctx.resetDb()

      const tests = [
        {
          name: 'create session with auto id returns a string id',
          run: async (t: AssertAPI) => {
            const id = await p.create('sessions', {
              name: '2026-2027',
              startDate: '2026-04-01',
              endDate: '2027-03-31',
              isActive: false,
              isCompleted: false,
            })
            t.truthy(typeof id === 'string' && id.length > 0, 'should return a string id')
          },
        },
        {
          name: 'create session with explicit id is retrievable',
          run: async (t: AssertAPI) => {
            const id = await p.create(
              'sessions',
              { name: '2027-2028', startDate: '2027-04-01', endDate: '2028-03-31', isActive: false, isCompleted: false },
              'sess-2728',
            )
            const got = await p.get<SessionDoc>('sessions', id)
            t.notNil(got, 'doc must exist after create')
            t.equals(got!.name, '2027-2028', 'name should match')
            t.equals(got!.id, 'sess-2728', 'id should match the explicit id')
            t.notNil(got!.createdAt, 'createdAt should be set by base apply')
            t.notNil(got!.updatedAt, 'updatedAt should be set')
            t.isNil(got!.deletedAt, 'deletedAt should be null on create')
          },
        },
        {
          name: 'duplicate id create throws Document already exists',
          run: async (t: AssertAPI) => {
            await p.create('sessions', { name: '2028-2029', startDate: '2028-04-01', endDate: '2029-03-31', isActive: false, isCompleted: false }, 'sess-dup')
            await t.throws(
              () =>
                p.create(
                  'sessions',
                  { name: '2028-2029 dupe', startDate: '2028-04-01', endDate: '2029-03-31', isActive: false, isCompleted: false },
                  'sess-dup',
                ),
              /already exists/i,
              'duplicate id create should throw',
            )
          },
        },
        {
          name: 'list returns only non-deleted sessions by default',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            await p.create('sessions', { name: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31', isActive: true, isCompleted: false }, 'sess-a')
            await p.create('sessions', { name: '2025-2026', startDate: '2025-04-01', endDate: '2026-03-31', isActive: false, isCompleted: true }, 'sess-b')
            await p.create('sessions', { name: '2024-2025', startDate: '2024-04-01', endDate: '2025-03-31', isActive: false, isCompleted: true }, 'sess-c')
            await p.softDelete('sessions', 'sess-c', 'u-admin')
            const list = await p.list<SessionDoc>('sessions')
            t.equals(list.length, 2, 'should return 2 (deleted excluded)')
            t.truthy(list.every((s) => !s.deletedAt), 'no deleted docs in default list')
            const deleted = await p.list<SessionDoc>('sessions', { includeDeleted: true })
            t.equals(deleted.length, 3, 'includeDeleted should return all 3')
          },
        },
        {
          name: 'list with where filter returns matching rows only',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            await p.create('sessions', { name: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31', isActive: true, isCompleted: false }, 'sess-active')
            await p.create('sessions', { name: '2025-2026', startDate: '2025-04-01', endDate: '2026-03-31', isActive: false, isCompleted: true }, 'sess-past')
            const active = await p.list<SessionDoc>('sessions', { where: [['isActive', '==', true]] })
            t.equals(active.length, 1, 'only active session')
            t.equals(active[0].name, '2026-2027', 'matches the right name')
          },
        },
        {
          name: 'update mutates fields and bumps updatedAt',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            const id = await p.create('sessions', { name: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31', isActive: false, isCompleted: false }, 'sess-u')
            const before = await p.get<SessionDoc>('sessions', id)
            await new Promise((r) => setTimeout(r, 5))
            await p.update('sessions', id, { isActive: true })
            const after = await p.get<SessionDoc>('sessions', id)
            t.equals(after!.isActive, true, 'isActive should be true after update')
            t.truthy((after!.updatedAt ?? 0) >= (before!.updatedAt ?? 0), 'updatedAt should not decrease')
          },
        },
        {
          name: 'softDelete sets deletedAt and deletedBy',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            const id = await p.create('sessions', { name: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31', isActive: false, isCompleted: false }, 'sess-d')
            await p.softDelete('sessions', id, 'u-admin')
            const got = await p.get<SessionDoc>('sessions', id)
            t.notNil(got!.deletedAt, 'deletedAt must be set')
            t.equals(got!.deletedBy, 'u-admin', 'deletedBy must match')
          },
        },
        {
          name: 'restore clears deletedAt and deletedBy',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            const id = await p.create('sessions', { name: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31', isActive: false, isCompleted: false }, 'sess-r')
            await p.softDelete('sessions', id, 'u-admin')
            await p.restore('sessions', id)
            const got = await p.get<SessionDoc>('sessions', id)
            t.isNil(got!.deletedAt, 'deletedAt should be null after restore')
            t.isNil(got!.deletedBy, 'deletedBy should be null after restore')
          },
        },
        {
          name: 'listDeleted returns only soft-deleted docs',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            await p.create('sessions', { name: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31', isActive: false, isCompleted: false }, 'sess-1')
            await p.create('sessions', { name: '2027-2028', startDate: '2027-04-01', endDate: '2028-03-31', isActive: false, isCompleted: false }, 'sess-2')
            await p.softDelete('sessions', 'sess-1', 'u-admin')
            const del = await p.listDeleted<SessionDoc>('sessions')
            t.equals(del.length, 1, 'one deleted session')
            t.equals(del[0].name, '2026-2027', 'correct deleted session')
          },
        },
        {
          name: 'update on non-existent id throws not found',
          run: async (t: AssertAPI) => {
            await t.throws(
              () => p.update('sessions', 'does-not-exist', { isActive: true }),
              /not found/i,
              'updating non-existent doc should throw',
            )
          },
        },
      ]

      console.log(`\n${'Sessions'.toUpperCase()} suite`)
      await runSuite('Sessions', ctx, tests, results)
    },
  }
}
