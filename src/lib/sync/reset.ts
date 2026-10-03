/**
 * Destructive resets, gated by a random on-screen OTP (sync.md §7).
 *
 * - "local"        wipes SQLite (optionally reseeding from the newest backup)
 * - "local+server" additionally hard-deletes every document in the resettable
 *   collections, using a time-boxed `resetGrants/{uid}` document that
 *   firestore.rules checks before allowing any `delete`.
 *
 * The OTP never leaves the machine: generated locally, shown in the dialog,
 * expires in 5 minutes, single use. Typing it makes the consequence
 * unambiguous ("this erases the school") before anything is destroyed.
 */
import type { DataProvider } from '../data/provider'
import { nowMs } from '../data/provider'
import { RESETTABLE_COLLECTIONS } from './schema'
import { createBackup, listBackups, restoreBackup } from './backups'
import { flush, getDb } from './sqlite'

const OTP_TTL_MS = 5 * 60 * 1000
const GRANT_TTL_MS = 10 * 60 * 1000
const DELETE_BATCH = 400

/** Remote provider + the one method Firestore alone has: hard delete. */
export interface ResettableRemote extends DataProvider {
  hardDelete(path: string, id: string): Promise<void>
}

export type ResetScope = 'local' | 'local+server'

export interface OtpChallenge {
  code: string
  expiresAt: number
  scope: ResetScope
  /** Shown next to the code so the blast radius is never a surprise. */
  targets: { label: string; count: number }[]
}

// Crockford-ish alphabet: no I/L/O/U - unambiguous when read off a screen.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function randomCode(): string {
  const bytes = new Uint8Array(6)
  globalThis.crypto.getRandomValues(bytes)
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length])
  return `${chars.slice(0, 3).join('')}-${chars.slice(3).join('')}`
}

let active: { code: string; expiresAt: number; scope: ResetScope } | null = null

export async function createOtpChallenge(scope: ResetScope, remote?: ResettableRemote | null): Promise<OtpChallenge> {
  const targets: { label: string; count: number }[] = [
    { label: 'Local documents', count: scalar('SELECT COUNT(*) c FROM docs') },
    { label: 'Pending pushes (outbox)', count: scalar('SELECT COUNT(*) c FROM outbox WHERE pushed_at IS NULL') },
    { label: 'Change history rows', count: scalar('SELECT COUNT(*) c FROM changelog') },
    { label: 'Backups kept', count: listBackups().length },
  ]
  if (scope === 'local+server' && remote) {
    for (const collection of RESETTABLE_COLLECTIONS) {
      targets.push({ label: `server · ${collection}`, count: await safeCount(remote, collection) })
    }
  }
  const code = randomCode()
  active = { code, expiresAt: nowMs() + OTP_TTL_MS, scope }
  return { code, expiresAt: active.expiresAt, scope, targets }
}

export function verifyOtp(input: string): { ok: boolean; reason?: string } {
  if (!active) return { ok: false, reason: 'no active challenge - generate a code first' }
  if (nowMs() > active.expiresAt) {
    active = null
    return { ok: false, reason: 'code expired - generate a new one' }
  }
  if (input.trim().toUpperCase().replace(/\s+/g, '') !== active.code) {
    return { ok: false, reason: 'code does not match' }
  }
  return { ok: true }
}

function consume(scope: ResetScope) {
  if (active?.scope === scope) active = null
}
export function clearOtpChallenge() {
  active = null
}

export interface ResetResult {
  ok: boolean
  reason?: string
  seededFromBackup?: string
  serverDeleted?: number
}

/** Wipes the local database. Requires the OTP typed by the user. */
export async function resetLocal(otp: string, options: { reseedFromBackup?: boolean } = {}): Promise<ResetResult> {
  const check = verifyOtp(otp)
  if (!check.ok) return check

  await createBackup('pre-reset')
  const db = getDb()
  db.run('DELETE FROM docs')
  db.run('DELETE FROM outbox')
  db.run('DELETE FROM changelog')
  db.run('DELETE FROM conflicts')
  db.run('DELETE FROM sync_state')
  db.run('DELETE FROM meta WHERE key IN (?, ?)', ['watermarks', 'lamport'])
  await flush()

  let seededFromBackup: string | undefined
  if (options.reseedFromBackup) {
    const newest = listBackups().find((b) => b.reason !== 'pre-reset')
    if (newest && (await restoreBackup(newest.id)).ok) seededFromBackup = newest.id
  }
  consume('local')
  return { ok: true, seededFromBackup }
}

/**
 * Hard-deletes the resettable collections on the server behind a short-lived
 * admin grant. `users` and `settings` are excluded on purpose: wiping them
 * would lock every admin out and destroy the school profile.
 */
export async function resetServer(otp: string, remote: ResettableRemote, userId: string): Promise<ResetResult> {
  const check = verifyOtp(otp)
  if (!check.ok) return check
  if (!userId) return { ok: false, reason: 'sign in as admin first' }

  await createBackup('pre-reset')
  await remote.create('resetGrants', { uid: userId, expiresAt: nowMs() + GRANT_TTL_MS, createdAt: nowMs() }, userId)

  let deleted = 0
  try {
    for (const collection of RESETTABLE_COLLECTIONS) {
      for (;;) {
        const page = await remote.list<{ id: string }>(collection, { limit: DELETE_BATCH })
        if (page.length === 0) break
        for (const doc of page) {
          await remote.hardDelete(collection, String(doc.id))
          deleted++
        }
      }
    }
    for (const cls of await remote.list<{ id: string }>('classes')) {
      const path = `classes/${cls.id}/subjects`
      for (;;) {
        const page = await remote.list<{ id: string }>(path, { limit: DELETE_BATCH })
        if (page.length === 0) break
        for (const doc of page) {
          await remote.hardDelete(path, String(doc.id))
          deleted++
        }
      }
    }
  } finally {
    await remote.update('resetGrants', userId, { closedAt: nowMs() })
  }
  consume('local+server')
  return { ok: true, serverDeleted: deleted }
}

// ---------------------------------------------------------------- helpers

function scalar(sql: string): number {
  const stmt = getDb().prepare(sql)
  try {
    if (!stmt.step()) return 0
    return Number(stmt.get()[0] ?? 0)
  } finally {
    stmt.free()
  }
}

async function safeCount(remote: ResettableRemote, collection: string): Promise<number> {
  try {
    const page = await remote.list(collection, { limit: DELETE_BATCH })
    return page.length
  } catch {
    return 0
  }
}