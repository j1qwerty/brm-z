/**
 * Sync queue views — the data behind the two tables in Settings > Sync.
 *
 *  - `pendingChanges()` : everything changed locally that is NOT on the server
 *    yet (the outbox, joined with the document so the row is readable).
 *  - `recentRuns()`     : what the last runs actually did, step by step.
 *  - `discardPending()` : throw away a local change and go back to the server
 *    copy (the escape hatch when a device produced junk while offline).
 */
import type { DataProvider } from '../data/provider'
import { nowMs } from '../data/provider'
import { getDb, markDirty } from './sqlite'
import { readDoc } from './localProvider'

function all<T>(sql: string, params: unknown[] = []): T[] {
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
function run(sql: string, params: unknown[] = []) {
  const stmt = getDb().prepare(sql)
  try {
    stmt.bind(params as never)
    while (stmt.step()) { /* drain */ }
  } finally {
    stmt.free()
  }
}

export interface PendingChange {
  /** Same as opId — satisfies the DataTable row contract. */
  id: string
  opId: string
  collection: string
  docId: string
  op: string
  /** Human label of the record (name / title / code, else the id). */
  label: string
  /** Fields touched by this change. */
  fields: string[]
  at: number
  lamport: number
  ageMs: number
  /** Steps that failed with this collection, so the UI can hint at a cause. */
  lastError: string | null
}

const LABEL_KEYS = ['name', 'title', 'fullName', 'code', 'admissionNo', 'receiptNo', 'serialNo', 'periodKey']

function labelFor(collection: string, docId: string): string {
  const row = readDoc(collection, docId)
  if (!row) return docId
  const data = row.data as Record<string, unknown>
  for (const key of LABEL_KEYS) {
    const v = data[key]
    if (typeof v === 'string' && v.trim()) return v
  }
  return docId
}

export function pendingChanges(): PendingChange[] {
  const rows = all<{
    op_id: string
    collection: string
    doc_id: string
    op: string
    patch: string
    lamport: number
    created_at: number
  }>('SELECT op_id, collection, doc_id, op, patch, lamport, created_at FROM outbox WHERE pushed_at IS NULL ORDER BY created_at ASC')

  const failedSteps = all<{ step: string; error: string }>("SELECT step, error FROM sync_state WHERE status = 'failed'")
  const errorFor = (collection: string) => {
    for (const step of failedSteps) {
      if (step.error && step.error.toLowerCase().includes(collection.toLowerCase())) return `${step.step}: ${step.error}`
    }
    return failedSteps.length ? `${failedSteps.length} sync step(s) failing — check the plan below` : null
  }

  const now = nowMs()
  return rows.map((r) => ({
    id: r.op_id,
    opId: r.op_id,
    collection: r.collection,
    docId: r.doc_id,
    op: r.op,
    label: labelFor(r.collection, r.doc_id),
    fields: Object.keys(safeParse(r.patch, {})),
    at: Number(r.created_at),
    lamport: Number(r.lamport),
    ageMs: now - Number(r.created_at),
    lastError: errorFor(r.collection),
  }))
}

export function pendingSummary(): { total: number; byCollection: { collection: string; count: number }[]; oldestMs: number } {
  const rows = pendingChanges()
  const byCollection = new Map<string, number>()
  for (const r of rows) byCollection.set(r.collection, (byCollection.get(r.collection) ?? 0) + 1)
  return {
    total: rows.length,
    byCollection: [...byCollection.entries()].map(([collection, count]) => ({ collection, count })).sort((a, b) => b.count - a.count),
    oldestMs: rows.length ? Math.max(...rows.map((r) => r.ageMs)) : 0,
  }
}

/**
 * Discards a local change: drops the queued op and puts the record back to its
 * last-synced state (or marks it clean so the next pull re-fetches it).
 */
export function discardPending(opId: string): { ok: boolean; reason?: string } {
  const row = all<{ collection: string; doc_id: string }>('SELECT collection, doc_id FROM outbox WHERE op_id = ?', [opId])[0]
  if (!row) return { ok: false, reason: 'change no longer queued' }
  run('DELETE FROM outbox WHERE op_id = ?', [opId])
  run("UPDATE docs SET dirty = 0, sync_state = 'synced' WHERE collection = ? AND id = ?", [row.collection, row.doc_id])
  run(
    `INSERT INTO changelog (op_id, collection, doc_id, op, before, after, actor, origin, device_id, at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [opId, row.collection, row.doc_id, 'discard', '{}', '{}', null, 'system', 'local', nowMs()],
  )
  markDirty()
  return { ok: true }
}

/** Re-queues a discarded document by marking it dirty with its current values. */
export async function retryCollection(remote: DataProvider, collection: string): Promise<number> {
  const rows = all<{ id: string; data: string }>("SELECT id, data FROM docs WHERE collection = ? AND deleted_at IS NULL", [collection])
  let n = 0
  for (const r of rows) {
    let data: Record<string, unknown>
    try {
      data = JSON.parse(r.data) as Record<string, unknown>
    } catch {
      continue
    }
    try {
      await remote.update(collection, r.id, { ...data, updatedAt: nowMs() })
      run("UPDATE docs SET dirty = 0, sync_state = 'synced' WHERE collection = ? AND id = ?", [collection, r.id])
      n++
    } catch {
      // leave it dirty; the next plan step reports the failure
    }
  }
  markDirty()
  return n
}

// ---------------------------------------------------------------- run history

export interface RunStepSnapshot {
  step: string
  status: string
  detail?: string
  error?: string | null
  attempt?: number
  durationMs?: number | null
}

export interface SyncRun {
  id: string
  startedAt: number
  finishedAt: number | null
  mode: string
  status: string
  pushed: number
  pulled: number
  conflicts: number
  failedStep: string | null
  error: string | null
  steps: RunStepSnapshot[]
  durationMs: number | null
}

export function startRun(mode: string): string {
  const id = `${nowMs().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  run(
    `INSERT INTO sync_runs (id, started_at, mode, status) VALUES (?,?,?,'running')`,
    [id, nowMs(), mode],
  )
  // keep the last 20 runs
  run('DELETE FROM sync_runs WHERE id NOT IN (SELECT id FROM sync_runs ORDER BY started_at DESC LIMIT 20)')
  markDirty()
  return id
}

export function finishRun(id: string, patch: {
  status: string
  pushed: number
  pulled: number
  conflicts: number
  failedStep?: string | null
  error?: string | null
  steps: RunStepSnapshot[]
}): void {
  run(
    `UPDATE sync_runs SET finished_at = ?, status = ?, pushed = ?, pulled = ?, conflicts = ?,
       failed_step = ?, error = ?, steps_json = ? WHERE id = ?`,
    [
      nowMs(), patch.status, patch.pushed, patch.pulled, patch.conflicts,
      patch.failedStep ?? null, patch.error ?? null, JSON.stringify(patch.steps), id,
    ],
  )
  markDirty()
}

export function recentRuns(limit = 20): SyncRun[] {
  return all<Record<string, unknown>>('SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT ?', [limit]).map((r) => ({
    id: String(r.id),
    startedAt: Number(r.started_at),
    finishedAt: r.finished_at == null ? null : Number(r.finished_at),
    mode: String(r.mode),
    status: String(r.status),
    pushed: Number(r.pushed),
    pulled: Number(r.pulled),
    conflicts: Number(r.conflicts),
    failedStep: r.failed_step == null ? null : String(r.failed_step),
    error: r.error == null ? null : String(r.error),
    steps: safeParse<RunStepSnapshot[]>(String(r.steps_json), []),
    durationMs: r.finished_at == null ? null : Number(r.finished_at) - Number(r.started_at),
  }))
}

export function lastRun(): SyncRun | null {
  return recentRuns(1)[0] ?? null
}

export function clearRuns(): void {
  run('DELETE FROM sync_runs')
  markDirty()
}

function safeParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}