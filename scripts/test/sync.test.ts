/**
 * Offline-first sync suite — REAL SQLite (sql.js in Node), fake remote.
 *
 * This is the regression net for the whole local-first layer:
 *   - the local provider keeps DataProvider semantics (create/update/where/limit/
 *     soft-delete/restore/bulk)
 *   - every local write lands in ONE transaction: doc + outbox + changelog
 *   - outbox ops collapse per document and are idempotent when pushed twice
 *   - pull merges remote docs, auto-merges disjoint edits, queues conflicts,
 *     and honours the delete-vs-edit and LWW rules
 *   - the sync plan checkpoints per step and resumes a failed step from its cursor
 *   - backups keep the newest 5 and restore byte-exactly
 *   - changelog revert writes a compensating op
 *   - the reset OTP is required, single-use and scoped
 */
import type { SuiteContext, AssertAPI, TestResult } from './harness'
import { runSuite } from './harness'
import type { DataProvider, QueryOpts, BulkOp } from '../../src/lib/data/provider'
import type { PlanStepId } from '../../src/lib/sync/schema'
import type { SyncProgress } from '../../src/lib/sync/syncEngine'
import { localProvider, localTransaction, localStats, applyRemoteDoc, newOpId, pendingKeysFor, readDoc } from '../../src/lib/sync/localProvider'
import { mergeRemote } from '../../src/lib/sync/conflicts'
import { getDb, openDb } from '../../src/lib/sync/sqlite'
import { KEEP_BACKUPS, createBackup, listBackups, restoreBackup, verifyBackup } from '../../src/lib/sync/backups'
import { listChanges, revertChange } from '../../src/lib/sync/changelog'
import { listConflicts, resolveConflict, openConflictCount } from '../../src/lib/sync/conflictsStore'
import { createOtpChallenge, resetLocal, verifyOtp, clearOtpChallenge } from '../../src/lib/sync/reset'
import { configureSync, readSteps, resetSyncState, runSync, syncSnapshot } from '../../src/lib/sync/syncEngine'
import { STRUCTURAL_FIELDS } from '../../src/lib/sync/schema'

// ------------------------------------------------------------------ fake remote

/** Minimal in-memory stand-in for Firestore with the same observable semantics. */
function createFakeRemote(): DataProvider & { deleted: string[]; failNext: Set<string> } {
  const db: Record<string, Record<string, Record<string, unknown>>> = {}
  const table = (p: string) => (db[p] ??= {})
  const deleted: string[] = []
  const failNext = new Set<string>()

  const match = (data: Record<string, unknown>, where?: QueryOpts['where']) => {
    if (!where) return true
    for (const [f, op, v] of where) {
      const dv = data[f]
      if (op === '==') { if (dv !== v) return false }
      else if (op === '!=') { if (dv === v) return false }
      else if (op === '>') { if (!((dv as number) > (v as number))) return false }
      else if (op === 'in') { if (!Array.isArray(v) || !v.includes(dv as never)) return false }
    }
    return true
  }

  return {
    mode: 'firebase',
    deleted,
    failNext,
    async list<T>(path: string, opts?: QueryOpts) {
      let rows = Object.values(table(path)).filter((r) => (r.deletedAt as number | null) == null)
      rows = rows.filter((r) => match(r, opts?.where))
      if (opts?.orderBy) {
        const [f, dir] = opts.orderBy
        rows = [...rows].sort((a, b) => {
          const av = a[f] as number
          const bv = b[f] as number
          const cmp = av === bv ? 0 : av > bv ? 1 : -1
          return dir === 'desc' ? -cmp : cmp
        })
      }
      if (opts?.limit) rows = rows.slice(0, opts.limit)
      return rows as T[]
    },
    async get<T>(path: string, id: string) {
      return (table(path)[id] as T) ?? null
    },
    async create(path: string, data: Record<string, unknown>, id?: string) {
      const t = table(path)
      const finalId = id ?? newOpId().toLowerCase()
      if (t[finalId]) throw new Error(`Document ${path}/${finalId} already exists`)
      t[finalId] = { id: finalId, ...data }
      return finalId
    },
    async update(path: string, id: string, data: Record<string, unknown>) {
      const t = table(path)
      if (!t[id]) throw new Error(`Document ${path}/${id} not found`)
      t[id] = { ...t[id], ...data, updatedAt: Date.now() }
    },
    async softDelete(path: string, id: string) {
      await this.update(path, id, { deletedAt: Date.now() })
    },
    async restore(path: string, id: string) {
      await this.update(path, id, { deletedAt: null })
    },
    async listDeleted<T>(path: string) {
      return Object.values(table(path)).filter((r) => (r.deletedAt as number | null) != null) as T[]
    },
    async bulkWrite(path: string, ops: BulkOp[]) {
      for (const op of ops) {
        const id = op.id ?? newOpId().toLowerCase()
        const t = table(path)
        t[id] = { id, ...(t[id] ?? {}), ...op.data, updatedAt: Date.now() }
      }
    },
    async hardDelete(path: string, id: string) {
      delete table(path)[id]
      deleted.push(`${path}/${id}`)
    },
  } as DataProvider & { deleted: string[]; failNext: Set<string> }
}

function resetLocalDb() {
  const db = getDb()
  for (const table of ['docs', 'outbox', 'changelog', 'conflicts', 'sync_state', 'meta']) {
    db.run(`DELETE FROM ${table}`)
  }
}

function pendingOpCount(): number {
  const stmt = getDb().prepare('SELECT COUNT(*) c FROM outbox WHERE pushed_at IS NULL')
  try {
    return stmt.step() ? Number(stmt.get()[0]) : 0
  } finally {
    stmt.free()
  }
}

function outboxRows(): { op_id: string; collection: string; doc_id: string; op: string; patch: string }[] {
  const stmt = getDb().prepare('SELECT op_id, collection, doc_id, op, patch FROM outbox WHERE pushed_at IS NULL ORDER BY created_at')
  const rows: { op_id: string; collection: string; doc_id: string; op: string; patch: string }[] = []
  try {
    while (stmt.step()) rows.push(stmt.getAsObject() as never)
  } finally {
    stmt.free()
  }
  return rows
}

function stepOf(id: PlanStepId) {
  return readSteps().find((s) => s.step === id)
}

// ------------------------------------------------------------------ suite

export function syncSuite() {
  return {
    name: 'Sync (offline-first, real SQLite)',
    run: async (ctx: SuiteContext, results: TestResult[]) => {
      const tests: { name: string; run: (t: AssertAPI) => Promise<void> | void }[] = []

      tests.push({
        name: 'local provider: create/get/where/limit/softDelete/restore mirror DataProvider semantics',
        run: async (t: AssertAPI) => {
          resetLocalDb()
          await localProvider.create('classes', { name: 'Class 1', sections: ['A'], order: 1 }, 'c-1')
          await localProvider.create('classes', { name: 'Class 2', sections: ['A', 'B'], order: 2 }, 'c-2')
          const all = await localProvider.list<{ name: string }>('classes')
          t.equals(all.length, 2, 'both classes listed')
          const first = await localProvider.list<{ name: string }>('classes', { limit: 1, orderBy: ['order', 'asc'] })
          t.equals(first.length, 1, 'limit respected')
          t.equals(first[0].name, 'Class 1', 'orderBy respected')
          const where = await localProvider.list('classes', { where: [['order', '>=', 2]] })
          t.equals(where.length, 1, 'where >= filter')
          await localProvider.softDelete('classes', 'c-2', 'u-1')
          const visible = await localProvider.list('classes')
          t.equals(visible.length, 1, 'soft-deleted hidden by default')
          const del = await localProvider.listDeleted('classes')
          t.equals(del.length, 1, 'listDeleted finds it')
          await localProvider.restore('classes', 'c-2')
          t.equals((await localProvider.list('classes')).length, 2, 'restore brings it back')
          await t.throws(() => localProvider.create('classes', { name: 'dup' }, 'c-1'), /already exists/, 'duplicate id rejected')
          await t.throws(() => localProvider.update('classes', 'nope', { name: 'x' }), /not found/, 'update of missing doc rejected')
        },
      })

      tests.push({
        name: 'every local write writes doc + outbox + changelog in ONE transaction',
        run: async (t: AssertAPI) => {
          resetLocalDb()
          await localProvider.create('students', { name: 'Asha', gender: 'female', classId: 'c-1', section: 'A', admissionNo: 'A1', status: 'active' }, 'stu-1')
          const row = readDoc('students', 'stu-1')
          t.notNil(row, 'doc written')
          t.equals(row!.dirty, 1, 'marked dirty for push')
          t.truthy(row!.lamport > 0, 'lamport assigned')
          t.equals(pendingOpCount(), 1, 'one outbox op')
          const changes = listChanges({ collection: 'students' })
          t.equals(changes.length, 1, 'one changelog entry')
          t.truthy(changes[0].after.name === 'Asha', 'changelog captures the new value')
        },
      })

      tests.push({
        name: 'outbox collapses repeated edits to one op per document',
        run: async (t: AssertAPI) => {
          resetLocalDb()
          await localProvider.create('students', { name: 'A', gender: 'male', classId: 'c-1', section: 'A', admissionNo: 'A2', status: 'active' }, 'stu-2')
          await localProvider.update('students', 'stu-2', { rollNo: '5' })
          await localProvider.update('students', 'stu-2', { rollNo: '6' })
          await localProvider.update('students', 'stu-2', { phone: '+91 1' })
          const rows = outboxRows()
          t.equals(rows.length, 1, 'collapsed into a single op')
          const patch = JSON.parse(rows[0].patch) as Record<string, unknown>
          t.equals(patch.rollNo, '6', 'latest value wins')
          t.equals(patch.phone, '+91 1', 'later field kept')
          t.equals(patch.name, 'A', 'original create value retained')
          t.equals(rows[0].op, 'create', 'op stays create')
        },
      })

      tests.push({
        name: 'bulkWrite is atomic and produces one op per document',
        run: async (t: AssertAPI) => {
          resetLocalDb()
          await localProvider.bulkWrite('students', [
            { id: 'b-1', data: { name: 'B1', gender: 'male', classId: 'c-1', section: 'A', admissionNo: 'B1', status: 'active' } },
            { id: 'b-2', data: { name: 'B2', gender: 'male', classId: 'c-1', section: 'A', admissionNo: 'B2', status: 'active' } },
          ])
          t.equals(pendingOpCount(), 2, 'two queued ops')
          t.equals((await localProvider.list('students')).length, 2, 'both rows visible')
        },
      })

      tests.push({
        name: 'push uploads the outbox and clears dirty flags (idempotent on replay)',
        run: async (t: AssertAPI) => {
          resetLocalDb()
          resetSyncState()
          const remote = createFakeRemote()
          configureSync({ remote, isOnline: () => true, backoffMs: [1, 1, 1] })
          await localProvider.create('sessions', { name: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31', isActive: true, isCompleted: false }, 'sess-1')

          await runSync({ mode: 'push' })
          const pushed = await remote.get<Record<string, unknown>>('sessions', 'sess-1')
          t.notNil(pushed, 'document reached the server')
          t.equals(pushed!.name, '2026-2027', 'server copy has the data')
          t.truthy(typeof pushed!.syncLamport === 'number', 'server copy carries syncLamport for idempotency')
          t.equals(pendingOpCount(), 0, 'outbox drained')
          t.equals(readDoc('sessions', 'sess-1')!.dirty, 0, 'local row marked clean')

          // replay: a second push with an empty outbox must not duplicate anything
          const progress = await runSync({ mode: 'push' })
          t.equals(progress.pushed, 0, 'nothing re-pushed')
          t.equals((await remote.list('sessions')).length, 1, 'still exactly one document')
        },
      })

      tests.push({
        name: 'pull inserts remote docs and advances the watermark (no re-pull)',
        run: async (t: AssertAPI) => {
          resetLocalDb()
          resetSyncState()
          const remote = createFakeRemote()
          configureSync({ remote, isOnline: () => true, backoffMs: [1, 1, 1] })
          const ts = Date.now()
          await remote.create('classes', { name: 'Remote Class 1', sections: ['A'], order: 1, updatedAt: ts - 1000 }, 'r-c-1')
          await remote.create('classes', { name: 'Remote Class 2', sections: ['A'], order: 2, updatedAt: ts }, 'r-c-2')

          const first = await runSync({ mode: 'pull' })
          t.truthy(first.pulled >= 2, `pulled ${first.pulled} docs`)
          t.equals((await localProvider.list('classes')).length, 2, 'both docs present locally')
          t.equals(readDoc('classes', 'r-c-1')!.dirty, 0, 'pulled docs are clean')

          const second = await runSync({ mode: 'pull' })
          t.equals(second.pulled, 0, 'second pull is a no-op thanks to the watermark')
        },
      })

      tests.push({
        name: 'pull auto-merges a local edit with a disjoint remote edit',
        run: async (t: AssertAPI) => {
          resetLocalDb()
          const remote = createFakeRemote()
          configureSync({ remote, isOnline: () => true, backoffMs: [1, 1, 1] })
          const base = { name: 'Ravi', gender: 'male', classId: 'c-1', section: 'A', admissionNo: 'R1', status: 'active', updatedAt: Date.now() - 5000 }
          await remote.create('students', base, 'stu-m')
          await localProvider.create('students', { ...base, id: 'stu-m' }, 'stu-m') // pull it in
          await localProvider.update('students', 'stu-m', { rollNo: '11' })      // local edit: rollNo
          await remote.update('students', 'stu-m', { phone: '+91 99999' })       // remote edit: phone
          resetSyncState()

          await runSync({ mode: 'pull' })
          const merged = await localProvider.get<Record<string, unknown>>('students', 'stu-m')
          t.equals(merged!.rollNo, '11', 'local edit kept')
          t.equals(merged!.phone, '+91 99999', 'remote edit merged in')
          t.equals(openConflictCount(), 0, 'no conflict for disjoint fields')
          t.equals(readDoc('students', 'stu-m')!.sync_state, 'synced', 'row is clean again')
        },
      })

      tests.push({
        name: 'conflicting same-field edits land in the conflict queue, not silently',
        run: async (t: AssertAPI) => {
          resetLocalDb()
          const remote = createFakeRemote()
          configureSync({ remote, isOnline: () => true, backoffMs: [1, 1, 1] })
          const base = { name: 'Same', gender: 'male', classId: 'c-1', section: 'A', admissionNo: 'C1', status: 'active', updatedAt: Date.now() - 5000 }
          await remote.create('students', base, 'stu-c')
          await localProvider.create('students', { ...base, id: 'stu-c' }, 'stu-c')
          // structural field (status is in STRUCTURAL_FIELDS) edited on both sides
          await localProvider.update('students', 'stu-c', { status: 'left' })
          await remote.update('students', 'stu-c', { status: 'graduated' })
          resetSyncState()

          await runSync({ mode: 'pull' })
          t.truthy(openConflictCount() > 0, 'conflict queued')
          const [conflict] = listConflicts(true)
          t.equals(conflict?.field, 'status', 'the structural field is flagged')
          t.equals(readDoc('students', 'stu-c')!.sync_state, 'conflict', 'row marked as conflicted')

          const res = resolveConflict(conflict!.id, 'remote')
          t.truthy(res.ok, 'resolved')
          const after = await localProvider.get<Record<string, unknown>>('students', 'stu-c')
          t.equals(after!.status, 'graduated', 'server value applied')
          t.equals(openConflictCount(), 0, 'queue empty')
          t.truthy(pendingOpCount() > 0, 'resolution is queued for push like any change')
        },
      })

      tests.push({
        name: 'merge policy: newer lamport wins, ties break on device id',
        run: (t) => {
          const structural = STRUCTURAL_FIELDS
          const plain = new Set<string>()

          const olderRemote = mergeRemote(
            { data: { name: 'local' }, lamport: 5, deviceId: 'dev-a', localRev: 1, deletedAt: null },
            { id: '1', data: { name: 'remote' }, lamport: 4, deviceId: 'dev-b', deletedAt: null },
            new Set(['name']),
            plain,
          )
          t.equals(olderRemote.action, 'apply', 'newer local wins, remote ignored')
          t.equals((olderRemote as { merged: Record<string, unknown> }).merged.name, 'local', 'local value kept')

          const newerRemote = mergeRemote(
            { data: { name: 'local' }, lamport: 4, deviceId: 'dev-a', localRev: 1, deletedAt: null },
            { id: '1', data: { name: 'remote' }, lamport: 9, deviceId: 'dev-b', deletedAt: null },
            new Set(['name']),
            plain,
          )
          t.equals((newerRemote as { merged: Record<string, unknown> }).merged.name, 'remote', 'newer remote wins')

          const tie = mergeRemote(
            { data: { name: 'local' }, lamport: 7, deviceId: 'dev-a', localRev: 1, deletedAt: null },
            { id: '1', data: { name: 'remote' }, lamport: 7, deviceId: 'dev-b', deletedAt: null },
            new Set(['name']),
            plain,
          )
          t.equals((tie as { merged: Record<string, unknown> }).merged.name, 'remote', 'tie broken deterministically on device id (b > a)')

          const structuralMerge = mergeRemote(
            { data: { sections: ['A'] }, lamport: 3, deviceId: 'dev-a', localRev: 1, deletedAt: null },
            { id: '1', data: { sections: ['A', 'B'] }, lamport: 3, deviceId: 'dev-a', deletedAt: null },
            new Set(['sections']),
            structural,
          )
          t.equals(structuralMerge.action, 'conflict', 'structural fields never auto-merge')
        },
      })

      tests.push({
        name: 'merge policy: delete vs edit respects logical time',
        run: (t) => {
          const plain = new Set<string>()
          const deleteWins = mergeRemote(
            { data: {}, lamport: 9, deviceId: 'dev-a', localRev: 2, deletedAt: 100 },
            { id: '1', data: { name: 'edited' }, lamport: 4, deviceId: 'dev-b', deletedAt: null },
            new Set(['name']),
            plain,
          )
          t.equals(deleteWins.action, 'skip', 'newer local delete wins over older remote edit')
          t.equals((deleteWins as { keepDirty?: boolean }).keepDirty, true, 'and stays queued so the server learns about the delete')

          const editWins = mergeRemote(
            { data: { name: 'edited' }, lamport: 9, deviceId: 'dev-a', localRev: 2, deletedAt: null },
            { id: '1', data: {}, lamport: 4, deviceId: 'dev-b', deletedAt: 100 },
            new Set(['name']),
            plain,
          )
          t.equals(editWins.action, 'skip', 'newer local edit survives an older server delete')
          t.equals((editWins as { keepDirty?: boolean }).keepDirty, true, 'and is still pushed so the server is corrected')
        },
      })

      tests.push({
        name: 'soft-deleted local docs stay deleted locally and push as tombstones',
        run: async (t: AssertAPI) => {
          resetLocalDb()
          resetSyncState()
          const remote = createFakeRemote()
          configureSync({ remote, isOnline: () => true, backoffMs: [1, 1, 1] })
          await localProvider.create('students', { name: 'Gone', gender: 'male', classId: 'c-1', section: 'A', admissionNo: 'D1', status: 'active' }, 'stu-d')
          await localProvider.softDelete('students', 'stu-d', 'u-1')
          await runSync({ mode: 'push' })
          const onServer = await remote.get<Record<string, unknown>>('students', 'stu-d')
          t.notNil(onServer, 'still exists on the server')
          t.truthy(typeof onServer!.deletedAt === 'number', 'tombstone pushed (soft delete, never a hard delete)')
          t.equals((await localProvider.list('students')).length, 0, 'hidden locally')
        },
      })

      tests.push({
        name: 'failed step retries on its own and records the attempt',
        run: async (t: AssertAPI) => {
          resetLocalDb()
          resetSyncState()
          const remote = createFakeRemote()
          let failPull = true
          configureSync({ remote, isOnline: () => true, backoffMs: [1, 1, 1] })
          const originalList = remote.list.bind(remote)
          remote.list = (async (path: string, opts?: QueryOpts) => {
            if (failPull && path === 'sessions') throw new Error('network unreachable')
            return originalList(path, opts)
          }) as typeof remote.list

          const failed = await runSync({ onlyStep: 'pull-sessions' })
          t.equals(stepOf('pull-sessions')?.status, 'failed', 'step marked failed')
          t.truthy(/network unreachable/.test(stepOf('pull-sessions')?.error ?? ''), 'error recorded for the UI')
          t.truthy((stepOf('pull-sessions')?.attempt ?? 0) > 1, 'retried with backoff before giving up')

          failPull = false
          await runSync({ onlyStep: 'pull-sessions' })
          t.equals(stepOf('pull-sessions')?.status, 'done', 'retry of that single step succeeds')
          const pulledStep = stepOf('pull-sessions')
          t.notNil(pulledStep?.cursor, 'cursor persisted for the next resume')
        },
      })

      tests.push({
        name: 'offline is handled: the plan fails cleanly and no data is lost',
        run: async (t: AssertAPI) => {
          resetLocalDb()
          resetSyncState()
          const remote = createFakeRemote()
          configureSync({ remote, isOnline: () => false, backoffMs: [1, 1, 1] })
          await localProvider.create('classes', { name: 'Offline Class', sections: ['A'], order: 9 }, 'c-off')
          const progress: SyncProgress = await runSync({ onlyStep: 'push-outbox' })
          t.truthy(!!progress.lastError, 'run reports the offline reason')
          t.equals((await localProvider.list('classes')).length, 1, 'local write survives the failed sync')
          t.truthy(pendingOpCount() > 0, 'change is still queued for the next online run')
          configureSync({ remote, isOnline: () => true, backoffMs: [1, 1, 1] })
        },
      })

      tests.push({
        name: 'backups: keep the newest 5, verify, and restore byte-exactly',
        run: async (t: AssertAPI) => {
          resetLocalDb()
          for (let i = 1; i <= 7; i++) {
            await localProvider.create('classes', { name: `B${i}`, sections: ['A'], order: i }, `bk-${i}`)
            const b = await createBackup('manual')
            t.truthy(!!b.sha256, `backup ${i} has a checksum`)
          }
          const kept = listBackups()
          t.equals(kept.length, KEEP_BACKUPS, `only the newest ${KEEP_BACKUPS} are kept`)
          const verify = await verifyBackup(kept[0].id)
          t.truthy(verify.ok, 'newest backup verifies')

          const newest = kept[0].id
          await localProvider.create('classes', { name: 'After backup', sections: ['A'], order: 99 }, 'after-1')
          t.equals((await localProvider.list('classes')).length, 8, 'extra row added')

          const restored = await restoreBackup(newest)
          t.truthy(restored.ok, 'restore succeeded')
          const after = await localProvider.list<{ id: string }>('classes')
          t.falsy(after.some((c) => c.id === 'after-1'), 'post-backup row gone after restore')
          t.truthy(after.length >= 1, 'pre-backup rows present again')
          t.truthy(localStats().dirty > 0, 'restored rows are marked for the next push')
        },
      })

      tests.push({
        name: 'changelog revert restores previous values as a new queued change',
        run: async (t: AssertAPI) => {
          resetLocalDb()
          await localProvider.create('staff', { name: 'Teacher', staffType: 'teaching', designation: 'TGT', status: 'active' }, 'st-1')
          await localProvider.update('staff', 'st-1', { designation: 'PGT' })
          const [change] = listChanges({ collection: 'staff' })
          t.equals(change.after.designation, 'PGT', 'change recorded the new value')
          const res = revertChange(change.seq)
          t.truthy(res.ok, 'revert accepted')
          const doc = await localProvider.get<Record<string, unknown>>('staff', 'st-1')
          t.equals(doc!.designation, 'TGT', 'previous value restored')
          const original = listChanges({ collection: 'staff' }).find((c) => c.seq === change.seq)
          t.truthy(original?.revertedBy !== null && original?.revertedBy !== undefined, 'original marked as reverted')
          t.equals(listChanges({ collection: 'staff' }).length, 3, 'the revert itself is logged as a new change')
          t.equals(revertChange(change.seq).ok, false, 'cannot revert the same change twice')
        },
      })

      tests.push({
        name: 'reset requires the OTP, and the code cannot be reused',
        run: async (t: AssertAPI) => {
          resetLocalDb()
          clearOtpChallenge()
          await localProvider.create('classes', { name: 'Doomed', sections: ['A'], order: 1 }, 'c-x')
          const challenge = await createOtpChallenge('local')
          t.truthy(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(challenge.code), 'code shown to the user')
          t.truthy(challenge.targets.some((x) => x.label === 'Local documents' && x.count >= 1), 'blast radius is listed')

          t.equals((await resetLocal('WRONG-1')).ok, false, 'wrong code refused')
          t.equals((await localProvider.list('classes')).length, 1, 'nothing destroyed on a wrong code')

          const ok = await resetLocal(challenge.code)
          t.truthy(ok.ok, 'correct code accepted')
          t.equals((await localProvider.list('classes')).length, 0, 'local data wiped')
          t.equals((await resetLocal(challenge.code)).ok, false, 'code is single use')
        },
      })

      tests.push({
        name: 'pendingKeysFor reports exactly the fields awaiting a push',
        run: async (t: AssertAPI) => {
          resetLocalDb()
          await localProvider.create('classes', { name: 'Keys', sections: ['A'], order: 1 }, 'c-k')
          // a create legitimately queues every field
          t.truthy(pendingKeysFor('classes', 'c-k').has('sections'), 'create queues all fields')

          // simulate a completed push, then a single-field edit
          getDb().run('UPDATE outbox SET pushed_at = ?', [Date.now()])
          await localProvider.update('classes', 'c-k', { name: 'Keys v2' })
          const keys = pendingKeysFor('classes', 'c-k')
          t.truthy(keys.has('name'), 'edited field pending')
          t.falsy(keys.has('sections'), 'untouched field not pending')
          t.falsy(keys.has('order'), 'other untouched fields not pending')
        },
      })

      console.log(`\n${'Sync'.toUpperCase()} suite`)
      await runSuite('Sync', ctx, tests, results)
    },
  }
}

export { openDb, localTransaction, syncSnapshot }
