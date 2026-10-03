/**
 * Change history & revert.
 *
 * Every local write, push and pull lands in `changelog` (see localProvider).
 * Revert writes a NEW op built from the original `before` snapshot, marks the
 * original row with `reverted_by`, and pushes normally — so a revert is itself
 * revertible and syncs to other devices like any other change.
 */
import { nowMs } from '../data/provider'
import { readDoc, writeLocal } from './localProvider'
import { deviceId, getDb, markDirty } from './sqlite'

export interface ChangeRow {
  seq: number
  collection: string
  docId: string
  op: string
  before: Record<string, unknown>
  after: Record<string, unknown>
  actor: string | null
  origin: string
  deviceId: string
  at: number
  revertedBy: number | null
}

function parseChange(r: Record<string, unknown>): ChangeRow {
  const p = (v: unknown) => {
    try {
      return JSON.parse(String(v ?? '{}')) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return {
    seq: Number(r.seq),
    collection: String(r.collection),
    docId: String(r.doc_id),
    op: String(r.op),
    before: p(r.before),
    after: p(r.after),
    actor: r.actor ? String(r.actor) : null,
    origin: String(r.origin),
    deviceId: String(r.device_id),
    at: Number(r.at),
    revertedBy: r.reverted_by == null ? null : Number(r.reverted_by),
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

function all(sql: string, params: unknown[] = []): Record<string, unknown>[] {
  const stmt = getDb().prepare(sql)
  try {
    stmt.bind(params as never)
    const out: Record<string, unknown>[] = []
    while (stmt.step()) out.push(stmt.getAsObject())
    return out
  } finally {
    stmt.free()
  }
}

export interface HistoryFilter {
  collection?: string
  actor?: string
  origin?: 'local' | 'remote' | 'system'
  deviceId?: string
  docId?: string
  since?: number
  limit?: number
}

export function listChanges(filter: HistoryFilter = {}): ChangeRow[] {
  const where: string[] = []
  const params: unknown[] = []
  if (filter.collection) { where.push('collection = ?'); params.push(filter.collection) }
  if (filter.docId) { where.push('doc_id = ?'); params.push(filter.docId) }
  if (filter.actor) { where.push('actor = ?'); params.push(filter.actor) }
  if (filter.origin) { where.push('origin = ?'); params.push(filter.origin) }
  if (filter.deviceId) { where.push('device_id = ?'); params.push(filter.deviceId) }
  if (filter.since) { where.push('at >= ?'); params.push(filter.since) }
  const sql = `SELECT * FROM changelog ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY seq DESC LIMIT ?`
  params.push(filter.limit ?? 100)
  return all(sql, params).map(parseChange)
}

export function getChange(seq: number): ChangeRow | null {
  const rows = all('SELECT * FROM changelog WHERE seq = ?', [seq])
  return rows[0] ? parseChange(rows[0]) : null
}

/** Reverts one change: restores the previous values of the fields it touched. */
export function revertChange(seq: number): { ok: boolean; reason?: string } {
  const change = getChange(seq)
  if (!change) return { ok: false, reason: 'change not found' }
  if (change.revertedBy) return { ok: false, reason: 'already reverted' }
  if (!readDoc(change.collection, change.docId)) return { ok: false, reason: 'record no longer exists locally' }

  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(change.before)) patch[k] = v
  // Fields that did not exist before the change must go back to null
  for (const k of Object.keys(change.after)) if (!(k in change.before) && !(k in patch)) patch[k] = null

  writeLocal({ collection: change.collection, id: change.docId, op: 'update', patch, actor: change.actor })
  run('UPDATE changelog SET reverted_by = ? WHERE seq = ?', [nowMs(), seq])
  markDirty()
  return { ok: true }
}

/** Prunes the log to a retention window (rows remain recoverable from backups). */
export function pruneHistory(olderThanMs: number, keepRows: number): number {
  const cutoff = nowMs() - olderThanMs
  run('DELETE FROM changelog WHERE at < ? AND seq NOT IN (SELECT seq FROM changelog ORDER BY seq DESC LIMIT ?)', [cutoff, keepRows])
  return Number((all('SELECT COUNT(*) c FROM changelog')[0]?.c as number) ?? 0)
}

/** Collections that actually changed, for the History filter dropdown. */
export function historyCollections(): string[] {
  return all('SELECT DISTINCT collection FROM changelog ORDER BY collection').map((r) => String(r.collection))
}

export const currentDeviceId = () => deviceId()