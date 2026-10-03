/**
 * LocalProvider — the local-first DataProvider.
 *
 * Every mutation goes through one choke point that, inside a single SQLite
 * transaction, (a) writes the doc row, (b) appends an outbox row so the change
 * is pushed later, and (c) appends a changelog row for History/Revert. Because
 * it is one transaction, local state can never hold a change that is not queued
 * to push, nor a queued change with no history.
 */
import type { BulkOp, DataProvider, QueryOpts, WhereOp } from '../data/provider'
import { applyBaseCreate, nowMs } from '../data/provider'
import type { BaseDoc } from '../types'
import { STRUCTURAL_FIELDS } from './schema'
import { mergeRemote, type FieldConflict } from './conflicts'
import { deviceId, flush, getDb, lamportNow, markDirty, observeLamport } from './sqlite'

export type Origin = 'local' | 'remote' | 'system'

export interface DocRow {
  collection: string
  id: string
  data: Record<string, unknown> & BaseDoc
  updated_at: number
  local_rev: number
  lamport: number
  device_id: string
  deleted_at: number | null
  dirty: number
  sync_state: string
}

// ---------------------------------------------------------------- SQL helpers

function all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  const stmt = getDb().prepare(sql)
  try {
    stmt.bind(params as never)
    const out: T[] = []
    while (stmt.step()) out.push(stmt.getAsObject() as T)
    return out
  } finally {
    stmt.free()
  }
}

function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | null {
  const rows = all<T>(sql, params)
  return rows[0] ?? null
}

function run(sql: string, params: unknown[] = []) {
  const stmt = getDb().prepare(sql)
  try {
    stmt.bind(params as never)
    stmt.step()
  } finally {
    stmt.free()
  }
}

function inTransaction<T>(fn: () => T): T {
  const db = getDb()
  db.run('BEGIN')
  try {
    const out = fn()
    db.run('COMMIT')
    return out
  } catch (e) {
    try {
      db.run('ROLLBACK')
    } catch {
      /* already rolled back */
    }
    throw e
  }
}

const j = (v: unknown) => JSON.stringify(v ?? null)
const unj = <T>(v: unknown, fallback: T): T => {
  if (typeof v !== 'string') return fallback
  try {
    return JSON.parse(v) as T
  } catch {
    return fallback
  }
}

export function newOpId(): string {
  // ULID-ish: time-sortable + unique enough for a single device's outbox.
  const t = nowMs().toString(36).padStart(9, '0')
  const r = Array.from({ length: 10 }, () => Math.floor(Math.random() * 36).toString(36)).join('')
  return `${t}${r}`.toUpperCase()
}

// ---------------------------------------------------------------- reads

/** sql.js hands back the JSON column as a string — always parse before use. */
function parseRow(row: DocRow): DocRow {
  return { ...row, data: unj<Record<string, unknown> & BaseDoc>(row.data, {} as never) }
}

export function readDoc(collection: string, id: string): DocRow | null {
  const row = one<DocRow>('SELECT * FROM docs WHERE collection = ? AND id = ?', [collection, id])
  return row ? parseRow(row) : null
}

function toDoc(row: DocRow) {
  const data = { ...row.data, id: row.id } as Record<string, unknown> & BaseDoc
  return data
}

/** WHERE clause shared by list/listDeleted. Structural values are compared as JSON. */
function matches(data: Record<string, unknown>, where?: QueryOpts['where']): boolean {
  if (!where) return true
  for (const [field, op, value] of where) {
    const dv = data[field]
    switch (op as WhereOp) {
      case '==':
        if (!same(dv, value)) return false
        break
      case '!=':
        if (same(dv, value)) return false
        break
      case 'in':
        if (!Array.isArray(value) || !value.some((v) => same(dv, v))) return false
        break
      case '<=':
        if (!((dv as never) <= (value as never))) return false
        break
      case '<':
        if (!((dv as never) < (value as never))) return false
        break
      case '>':
        if (!((dv as never) > (value as never))) return false
        break
      case '>=':
        if (!((dv as never) >= (value as never))) return false
        break
      case 'array-contains':
        if (!Array.isArray(dv) || !dv.some((v) => same(v, value))) return false
        break
    }
  }
  return true
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) || isObj(a) || Array.isArray(b) || isObj(b)) return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
  return false
}
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function sortRows(rows: DocRow[], orderBy?: QueryOpts['orderBy']): DocRow[] {
  if (!orderBy) return rows
  const [field, dir] = orderBy
  const val = (r: DocRow) => {
    const d = r.data as Record<string, unknown>
    const v = field === 'id' ? r.id : d[field]
    return v as string | number | null | undefined
  }
  return [...rows].sort((a, b) => {
    const av = val(a)
    const bv = val(b)
    const cmp = av === bv ? 0 : av === undefined || av === null ? 1 : bv === undefined || bv === null ? -1 : av > bv ? 1 : -1
    return dir === 'desc' ? -cmp : cmp
  })
}

// ---------------------------------------------------------------- writes (choke point)

export interface WriteInput {
  collection: string
  id: string
  op: 'create' | 'update' | 'delete'
  /** Only the fields that changed (used for the outbox patch + changelog). */
  patch: Record<string, unknown>
  origin?: Origin
  actor?: string | null
  /** Server push bookkeeping. */
  opId?: string
  lamport?: number
  /** Mark as needing a push (default true for local writes). */
  queue?: boolean
  /** Set after a successful push. */
  clean?: boolean
  system?: boolean
}

/**
 * Single write path. Must be called inside a transaction (inTransaction here for
 * safety, but batch callers wrap their loop in one outer transaction).
 */
function writeOnce(input: WriteInput): void {
  const d = getDb()
  const existing = readDoc(input.collection, input.id)
  const now = nowMs()
  const device = deviceId()
  const lamport = input.lamport ?? lamportNow()
  observeLamport(lamport)

  const before = existing ? (existing.data as Record<string, unknown>) : {}
  const data: Record<string, unknown> = { ...before, ...input.patch, id: input.id }
  data.updatedAt = input.patch.updatedAt ?? (existing?.data.updatedAt ?? now)
  if (!existing) {
    data.createdAt = input.patch.createdAt ?? now
    data.deletedAt = null
    data.deletedBy = null
  }
  const localRev = (existing?.local_rev ?? 0) + 1
  const queue = input.queue ?? (input.origin !== 'remote')
  const dirty = queue ? 1 : 0

  run(
    `INSERT INTO docs (collection, id, data, updated_at, local_rev, lamport, device_id, deleted_at, dirty, sync_state)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(collection, id) DO UPDATE SET
       data = excluded.data, updated_at = excluded.updated_at, local_rev = excluded.local_rev,
       lamport = excluded.lamport, device_id = excluded.device_id, deleted_at = excluded.deleted_at,
       dirty = excluded.dirty, sync_state = excluded.sync_state`,
    [
      input.collection,
      input.id,
      j(data),
      Number(data.updatedAt ?? now),
      localRev,
      lamport,
      device === input.collection ? device : device,
      typeof data.deletedAt === 'number' ? (data.deletedAt as number) : null,
      dirty,
      dirty ? 'dirty' : (input.clean ? 'synced' : (existing?.sync_state ?? 'synced')),
    ],
  )

  const opId = input.opId ?? newOpId()
  if (queue) enqueueOp({ opId, collection: input.collection, docId: input.id, op: input.op, patch: input.patch, baseRev: existing?.local_rev ?? 0, lamport })
  // History stores only the fields this change touched (with their previous
  // values), which keeps rows small and makes revert exact.
  const previous: Record<string, unknown> = {}
  for (const key of Object.keys(input.patch)) previous[key] = existing ? (before[key] ?? null) : null
  logChange({
    opId,
    collection: input.collection,
    docId: input.id,
    op: input.op,
    before: previous,
    after: input.patch,
    actor: input.actor ?? null,
    origin: input.origin ?? 'local',
  })
  markDirty()
  void d
}

function enqueueOp(args: {
  opId: string
  collection: string
  docId: string
  op: 'create' | 'update' | 'delete'
  patch: Record<string, unknown>
  baseRev: number
  lamport: number
}) {
  // Collapse onto any pending op for the same document: keeps the earliest
  // createdAt (stable push order) and the earliest opId (stable idempotency key)
  // while merging patches (later values win).
  const pending = one<{ op_id: string; patch: string; created_at: number; op: string }>(
    'SELECT op_id, patch, created_at, op FROM outbox WHERE collection = ? AND doc_id = ? AND pushed_at IS NULL ORDER BY created_at LIMIT 1',
    [args.collection, args.docId],
  )
  if (pending) {
    const mergedPatch = { ...unj<Record<string, unknown>>(pending.patch, {}), ...args.patch }
    const op = pending.op === 'create' || args.op === 'create' ? 'create' : args.op
    run(
      `UPDATE outbox SET patch = ?, op = ?, lamport = ? WHERE op_id = ?`,
      [j(mergedPatch), op, Math.max(args.lamport, lamportOf(args.opId)), pending.op_id],
    )
    return
  }
  run(
    `INSERT INTO outbox (op_id, collection, doc_id, op, patch, base_rev, lamport, device_id, created_at, pushed_at, step)
     VALUES (?,?,?,?,?,?,?,?,?,NULL,NULL)`,
    [args.opId, args.collection, args.docId, args.op, j(args.patch), args.baseRev, args.lamport, deviceId(), nowMs()],
  )
}

function lamportOf(opId: string): number {
  const row = one<{ lamport: number }>('SELECT lamport FROM outbox WHERE op_id = ?', [opId])
  return row?.lamport ?? 0
}

function logChange(args: {
  opId: string
  collection: string
  docId: string
  op: string
  before: Record<string, unknown>
  after: Record<string, unknown>
  actor: string | null
  origin: Origin
}) {
  run(
    `INSERT INTO changelog (op_id, collection, doc_id, op, before, after, actor, origin, device_id, at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [args.opId, args.collection, args.docId, args.op, j(args.before), j(args.after), args.actor, args.origin, deviceId(), nowMs()],
  )
}

/** Public: run many writes in ONE transaction (bulk actions stay atomic). */
export function localTransaction<T>(fn: () => T): T {
  return inTransaction(fn)
}

/** Public: a single local write. */
export function writeLocal(input: WriteInput): void {
  inTransaction(() => writeOnce(input))
}

// ---------------------------------------------------------------- remote apply

export interface RemoteApplyResult {
  status: 'inserted' | 'updated' | 'skipped' | 'conflict'
  conflicts?: FieldConflict[]
  note?: string
}

/**
 * Applies a document pulled from the server. Merges against pending local
 * changes (see conflicts.ts) and records anything ambiguous in the conflicts
 * queue. Never touches the outbox for remote-only changes.
 */
export function applyRemoteDoc(collection: string, remote: Record<string, unknown> & { id: string }): RemoteApplyResult {
  return inTransaction(() => {
    const id = String(remote.id)
    const existing = readDoc(collection, id)
    const remoteLamport = Number(remote.syncLamport ?? 0)
    const remoteDevice = String(remote.syncDeviceId ?? 'remote')
    observeLamport(remoteLamport)

    if (!existing) {
      writeOnce({
        collection, id, op: 'create', patch: stripSyncFields(remote),
        origin: 'remote', queue: false, clean: true, lamport: remoteLamport || lamportNow(),
      })
      return { status: 'inserted' }
    }

    const pendingKeys = pendingKeysFor(collection, id)
    const decision = mergeRemote(
      {
        data: existing.data as Record<string, unknown>,
        lamport: existing.lamport,
        deviceId: existing.device_id,
        localRev: existing.local_rev,
        deletedAt: existing.deleted_at,
      },
      {
        id,
        data: stripSyncFields(remote),
        lamport: remoteLamport,
        deviceId: remoteDevice,
        deletedAt: typeof remote.deletedAt === 'number' ? (remote.deletedAt as number) : null,
      },
      pendingKeys,
      STRUCTURAL_FIELDS,
    )

    if (decision.action === 'skip') {
      // keepDirty: our side is newer, so the change must still be pushed.
      if (decision.keepDirty) {
        clearDocFlag(collection, id, 1, 'dirty')
      } else {
        clearDocFlag(collection, id, 0, 'synced')
      }
      return { status: 'skipped', note: decision.note }
    }

    if (decision.action === 'conflict') {
      for (const c of decision.conflicts) insertConflict(collection, id, c, existing.local_rev, remoteLamport)
      clearDocFlag(collection, id, 1, 'conflict')
      return { status: 'conflict', conflicts: decision.conflicts }
    }

    writeOnce({
      collection, id, op: 'update', patch: diffFields(existing.data as Record<string, unknown>, decision.merged),
      origin: 'remote', queue: false, clean: true, lamport: Math.max(remoteLamport, existing.lamport),
    })
    // Fields that the server confirmed can leave the outbox.
    if (pendingKeys.size > 0) dropPushedKeys(collection, id, pendingKeys)
    return { status: 'updated', note: decision.note }
  })
}

/**
 * Force-adopts a server document: the server copy wins outright and any queued
 * local op for it is dropped. Used only where the server is authoritative by
 * definition (the signed-in user's own profile), never for normal pulls —
 * normal pulls go through mergeRemote so offline edits are not lost.
 */
export function forceAdoptRemoteDoc(collection: string, remote: Record<string, unknown> & { id: string }): void {
  inTransaction(() => {
    const id = String(remote.id)
    run('DELETE FROM outbox WHERE collection = ? AND doc_id = ?', [collection, id])
    writeOnce({
      collection,
      id,
      op: readDoc(collection, id) ? 'update' : 'create',
      patch: stripSyncFields(remote),
      origin: 'remote',
      queue: false,
      clean: true,
      lamport: Number(remote.syncLamport ?? 0) || lamportNow(),
    })
  })
}

function stripSyncFields(data: Record<string, unknown>): Record<string, unknown> {
  const { syncLamport: _a, syncOpId: _b, syncDeviceId: _c, id: _d, ...rest } = data
  return rest
}

function diffFields(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(after)) {
    if (JSON.stringify(before[k] ?? null) !== JSON.stringify(v ?? null)) patch[k] = v
  }
  return patch
}

/** Fields with unsent local edits for a document (union of pending patches). */
export function pendingKeysFor(collection: string, id: string): Set<string> {
  const rows = all<{ patch: string }>(
    'SELECT patch FROM outbox WHERE collection = ? AND doc_id = ? AND pushed_at IS NULL',
    [collection, id],
  )
  const keys = new Set<string>()
  for (const r of rows) for (const k of Object.keys(unj<Record<string, unknown>>(r.patch, {}))) keys.add(k)
  return keys
}

function dropPushedKeys(collection: string, id: string, keys: Set<string>) {
  const rows = all<{ op_id: string; patch: string }>(
    'SELECT op_id, patch FROM outbox WHERE collection = ? AND doc_id = ? AND pushed_at IS NULL',
    [collection, id],
  )
  for (const r of rows) {
    const patch = unj<Record<string, unknown>>(r.patch, {})
    const remaining: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (!keys.has(k)) remaining[k] = v
    if (Object.keys(remaining).length === 0) {
      run('DELETE FROM outbox WHERE op_id = ?', [r.op_id])
    } else {
      run('UPDATE outbox SET patch = ? WHERE op_id = ?', [j(remaining), r.op_id])
    }
  }
}

function clearDocFlag(collection: string, id: string, dirty: number, syncState: string) {
  run('UPDATE docs SET dirty = ?, sync_state = ? WHERE collection = ? AND id = ?', [dirty, syncState, collection, id])
}

function insertConflict(collection: string, docId: string, c: FieldConflict, localRev: number, remoteRev: number) {
  run(
    `INSERT INTO conflicts (collection, doc_id, field, local_value, remote_value, local_rev, remote_rev, detected_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [collection, docId, c.field, j(c.localValue), j(c.remoteValue), localRev, remoteRev, nowMs()],
  )
}

// ---------------------------------------------------------------- provider

export const localProvider: DataProvider & {
  applyRemoteDoc: typeof applyRemoteDoc
  forceAdoptRemoteDoc: typeof forceAdoptRemoteDoc
  writeLocal: typeof writeLocal
  localTransaction: typeof localTransaction
  pendingKeysFor: typeof pendingKeysFor
} = {
  mode: 'demo',
  applyRemoteDoc,
  forceAdoptRemoteDoc,
  writeLocal,
  localTransaction,
  pendingKeysFor,

  async list<T>(path: string, opts?: QueryOpts): Promise<T[]> {
    const rows = all<DocRow>('SELECT * FROM docs WHERE collection = ?', [path]).map(parseRow)
    let visible = opts?.includeDeleted ? rows : rows.filter((r) => r.deleted_at == null)
    visible = visible.filter((r) => matches(r.data as Record<string, unknown>, opts?.where))
    visible = sortRows(visible, opts?.orderBy)
    if (opts?.limit) visible = visible.slice(0, opts.limit)
    return visible.map((r) => toDoc(r) as T)
  },

  async get<T>(path: string, id: string): Promise<T | null> {
    const row = readDoc(path, id)
    return row ? (toDoc(row) as T) : null
  },

  async create(path: string, data: Record<string, unknown>, id?: string): Promise<string> {
    const finalId = id ?? newOpId().toLowerCase()
    if (readDoc(path, finalId)) throw new Error(`Document ${path}/${finalId} already exists`)
    const payload = applyBaseCreate({ ...data, ...(id ? { id } : {}) })
    writeLocal({ collection: path, id: finalId, op: 'create', patch: stripId(payload) })
    return finalId
  },

  async update(path: string, id: string, data: Record<string, unknown>): Promise<void> {
    if (!readDoc(path, id)) throw new Error(`Document ${path}/${id} not found`)
    writeLocal({ collection: path, id, op: 'update', patch: { ...data, updatedAt: nowMs() } })
  },

  async softDelete(path: string, id: string, deletedBy?: string): Promise<void> {
    writeLocal({
      collection: path,
      id,
      op: 'delete',
      patch: { deletedAt: nowMs(), deletedBy: deletedBy ?? null, updatedAt: nowMs() },
    })
  },

  async restore(path: string, id: string): Promise<void> {
    writeLocal({ collection: path, id, op: 'update', patch: { deletedAt: null, deletedBy: null, updatedAt: nowMs() } })
  },

  async listDeleted<T>(path: string): Promise<T[]> {
    const rows = all<DocRow>('SELECT * FROM docs WHERE collection = ? AND deleted_at IS NOT NULL', [path]).map(parseRow)
    return rows.map((r) => toDoc(r) as T)
  },

  async bulkWrite(path: string, ops: BulkOp[]): Promise<void> {
    inTransaction(() => {
      for (const op of ops) {
        const id = op.id ?? newOpId().toLowerCase()
        const existing = readDoc(path, id)
        if (existing) {
          writeOnce({ collection: path, id, op: 'update', patch: { ...op.data, updatedAt: nowMs() } })
        } else {
          writeOnce({ collection: path, id, op: 'create', patch: stripId(applyBaseCreate({ ...op.data, id })) })
        }
      }
    })
    void flush()
  },
}

function stripId(data: Record<string, unknown>): Record<string, unknown> {
  const { id: _drop, ...rest } = data
  return rest
}

// ---------------------------------------------------------------- stats

export interface LocalStats {
  docs: number
  dirty: number
  conflicts: number
  pendingOps: number
  logRows: number
  bytes: number
  collections: number
}

export function localStats(): LocalStats {
  const docs = one<{ c: number }>('SELECT COUNT(*) c FROM docs')?.c ?? 0
  const dirty = one<{ c: number }>('SELECT COUNT(*) c FROM docs WHERE dirty = 1')?.c ?? 0
  const collections = one<{ c: number }>('SELECT COUNT(DISTINCT collection) c FROM docs')?.c ?? 0
  const pendingOps = one<{ c: number }>('SELECT COUNT(*) c FROM outbox WHERE pushed_at IS NULL')?.c ?? 0
  const logRows = one<{ c: number }>('SELECT COUNT(*) c FROM changelog')?.c ?? 0
  const conflicts = one<{ c: number }>('SELECT COUNT(*) c FROM conflicts WHERE resolved_at IS NULL')?.c ?? 0
  let bytes = 0
  try {
    bytes = getDb().export().length
  } catch {
    bytes = 0
  }
  return { docs, dirty, conflicts, pendingOps, logRows, bytes, collections }
}

/** Collection names currently present locally (used by the plan + UI). */
export function localCollections(): string[] {
  return all<{ collection: string }>('SELECT DISTINCT collection FROM docs ORDER BY collection').map((r) => r.collection)
}

/** Marks a document as fully synced with the server. */
export function markClean(collection: string, id: string) {
  clearDocFlag(collection, id, 0, 'synced')
  markDirty()
}