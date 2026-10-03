/**
 * Backups — keep the last 5, restore any of them.
 *
 * A backup is the whole SQLite file, stored as one opaque byte blob in the
 * browser's origin-private storage (IndexedDB) with metadata in the `backups`
 * table. Because it is the real DB file, restoring is byte-exact — the same
 * mechanism works for the .NET app in phase 2.
 *
 * Restore always snapshots the current state first (`pre-restore`), so a restore
 * is itself undoable.
 */
import { nowMs } from '../data/provider'
import { flush, getDb, markDirty, persistenceRef } from './sqlite'

export const BACKUP_KEY_PREFIX = 'backup:'
export const KEEP_BACKUPS = 5

export type BackupReason = 'manual' | 'pre-sync' | 'daily' | 'pre-restore' | 'pre-reset'

export interface BackupMeta {
  id: string
  createdAt: number
  reason: BackupReason
  path: string
  bytes: number
  docCount: number
  sha256: string
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

/** FNV-1a — a cheap integrity marker, not a security primitive. */
export function checksum(bytes: Uint8Array): string {
  let h = 0x811c9dc5
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i] ?? 0
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

export function backupId(reason: BackupReason): string {
  const stamp = new Date(nowMs()).toISOString().replace(/[-:.]/g, '').replace('T', '-').slice(0, 15)
  // Several backups can be taken in the same second (tests, pre-sync + manual),
  // so add a monotonic counter to keep every id unique.
  seq += 1
  return `${stamp}-${String(seq).padStart(3, '0')}-${reason}`
}
let seq = 0

export async function createBackup(reason: BackupReason): Promise<BackupMeta> {
  await flush()
  const store = persistenceRef()
  const bytes = getDb().export()
  const id = backupId(reason)
  const path = `${BACKUP_KEY_PREFIX}${id}`
  if (!store) throw new Error('No persistence available for backups')
  await store.put(path, bytes)
  const meta: BackupMeta = {
    id,
    createdAt: nowMs(),
    reason,
    path,
    bytes: bytes.length,
    docCount: all<{ c: number }>('SELECT COUNT(*) c FROM docs')[0]?.c ?? 0,
    sha256: checksum(bytes),
  }
  run(
    `INSERT INTO backups (id, created_at, reason, path, bytes, doc_count, sha256) VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET created_at = excluded.created_at`,
    [meta.id, meta.createdAt, meta.reason, meta.path, meta.bytes, meta.docCount, meta.sha256],
  )
  await pruneBackups()
  markDirty()
  return meta
}

/** Keeps the newest KEEP_BACKUPS entries; older blobs are deleted, never overwritten. */
export async function pruneBackups(): Promise<string[]> {
  const rows = all<BackupMeta>('SELECT * FROM backups ORDER BY created_at DESC')
  const doomed = rows.slice(KEEP_BACKUPS)
  const store = persistenceRef()
  for (const b of doomed) {
    if (store) await store.delete(b.path)
    run('DELETE FROM backups WHERE id = ?', [b.id])
  }
  return doomed.map((b) => b.id)
}

export function listBackups(): BackupMeta[] {
  return all<BackupMeta>('SELECT * FROM backups ORDER BY created_at DESC')
}

export async function readBackup(id: string): Promise<Uint8Array | null> {
  const meta = listBackups().find((b) => b.id === id)
  if (!meta) return null
  return (await persistenceRef()?.get(meta.path)) ?? null
}

export async function deleteBackup(id: string): Promise<void> {
  const meta = listBackups().find((b) => b.id === id)
  if (!meta) return
  await persistenceRef()?.delete(meta.path)
  run('DELETE FROM backups WHERE id = ?', [id])
  markDirty()
}

export async function verifyBackup(id: string): Promise<{ ok: boolean; reason?: string }> {
  const meta = listBackups().find((b) => b.id === id)
  if (!meta) return { ok: false, reason: 'backup not found' }
  const bytes = await readBackup(id)
  if (!bytes) return { ok: false, reason: 'backup blob missing' }
  if (bytes.length !== meta.bytes) return { ok: false, reason: `size mismatch (${bytes.length} vs ${meta.bytes})` }
  const sum = checksum(bytes)
  if (sum !== meta.sha256) return { ok: false, reason: 'checksum mismatch' }
  return { ok: true }
}

/**
 * Restores a backup into the live database. Everything it changes is left
 * `dirty`, so the next sync pushes the restored state (that is how you roll the
 * server back too — see sync.md §8).
 */
export async function restoreBackup(id: string): Promise<{ ok: boolean; reason?: string }> {
  const check = await verifyBackup(id)
  if (!check.ok) return check
  const bytes = await readBackup(id)
  if (!bytes) return { ok: false, reason: 'backup blob missing' }
  await createBackup('pre-restore')
  const { replaceDbBytes } = await import('./sqlite')
  await replaceDbBytes(bytes)
  markAllDirty()
  markDirty()
  return { ok: true }
}

/** Marks every doc as needing a push (after a restore). */
export function markAllDirty() {
  run("UPDATE docs SET dirty = 1, sync_state = 'dirty' WHERE deleted_at IS NULL")
  run("UPDATE docs SET dirty = 1, sync_state = 'dirty' WHERE deleted_at IS NOT NULL")
}

/** Bytes of a backup, for "export to disk". */
export async function backupBytes(id: string): Promise<Uint8Array | null> {
  return readBackup(id)
}