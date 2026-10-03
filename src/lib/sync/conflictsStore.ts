/**
 * Conflict queue persistence + resolution (DB side of conflicts.ts).
 * Resolving writes a normal local op, so the decision syncs like any change and
 * can itself be reverted from History.
 */
import { nowMs } from '../data/provider'
import { readDoc, writeLocal } from './localProvider'
import { getDb, markDirty } from './sqlite'

export interface ConflictRow {
  id: number
  collection: string
  docId: string
  field: string
  localValue: unknown
  remoteValue: unknown
  localRev: number
  remoteRev: number
  detectedAt: number
  resolvedAt: number | null
  resolution: string | null
}

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

const parse = (v: unknown): unknown => {
  try {
    return JSON.parse(String(v ?? 'null'))
  } catch {
    return null
  }
}

function map(r: Record<string, unknown>): ConflictRow {
  return {
    id: Number(r.id),
    collection: String(r.collection),
    docId: String(r.doc_id),
    field: String(r.field),
    localValue: parse(r.local_value),
    remoteValue: parse(r.remote_value),
    localRev: Number(r.local_rev),
    remoteRev: Number(r.remote_rev),
    detectedAt: Number(r.detected_at),
    resolvedAt: r.resolved_at == null ? null : Number(r.resolved_at),
    resolution: r.resolution == null ? null : String(r.resolution),
  }
}

export function listConflicts(openOnly = true): ConflictRow[] {
  const rows = openOnly
    ? all<Record<string, unknown>>('SELECT * FROM conflicts WHERE resolved_at IS NULL ORDER BY detected_at DESC')
    : all<Record<string, unknown>>('SELECT * FROM conflicts ORDER BY detected_at DESC LIMIT 500')
  return rows.map(map)
}

export function openConflictCount(): number {
  return all<{ c: number }>('SELECT COUNT(*) c FROM conflicts WHERE resolved_at IS NULL')[0]?.c ?? 0
}

/**
 * @param choice 'local' | 'remote' | a JSON object of merged values
 */
export function resolveConflict(id: number, choice: 'local' | 'remote' | Record<string, unknown>): { ok: boolean; reason?: string } {
  const c = listConflicts(false).find((x) => x.id === id)
  if (!c) return { ok: false, reason: 'conflict not found' }
  if (c.resolvedAt) return { ok: false, reason: 'already resolved' }
  if (!readDoc(c.collection, c.docId)) {
    run('UPDATE conflicts SET resolved_at = ?, resolution = ? WHERE id = ?', [nowMs(), 'remote', id])
    markDirty()
    return { ok: false, reason: 'record missing locally' }
  }

  let patch: Record<string, unknown>
  let resolution: string
  if (choice === 'local') {
    patch = { [c.field]: c.localValue }
    resolution = 'local'
  } else if (choice === 'remote') {
    patch = { [c.field]: c.remoteValue }
    resolution = 'remote'
  } else {
    patch = { [c.field]: choice[c.field] ?? null }
    resolution = 'merged'
  }

  writeLocal({ collection: c.collection, id: c.docId, op: 'update', patch })
  run('UPDATE conflicts SET resolved_at = ?, resolution = ? WHERE id = ?', [nowMs(), resolution, id])
  return { ok: true }
}

/** Resolves every open conflict on a document with the same choice. */
export function resolveAllForDoc(collection: string, docId: string, choice: 'local' | 'remote'): number {
  const open = listConflicts(true).filter((c) => c.collection === collection && c.docId === docId)
  let n = 0
  for (const c of open) if (resolveConflict(c.id, choice).ok) n++
  return n
}

export function openConflictDocs(): { collection: string; docId: string; count: number }[] {
  return all<Record<string, unknown>>(
    'SELECT collection, doc_id, COUNT(*) c FROM conflicts WHERE resolved_at IS NULL GROUP BY collection, doc_id ORDER BY c DESC',
  ).map((r) => ({ collection: String(r.collection), docId: String(r.doc_id), count: Number(r.c) }))
}