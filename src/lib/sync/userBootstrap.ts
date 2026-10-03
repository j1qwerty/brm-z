/**
 * Own-user bootstrap.
 *
 * The app is local-first, so `users/{uid}` is normally read from SQLite. That is
 * wrong for the one doc we cannot afford to guess: the signed-in user's own
 * profile. On a fresh browser the local DB is empty, and a stale local copy can
 * still say "pending" after an admin approved the account on another device.
 *
 * So: read local first (instant), and when it is missing or says "pending",
 * read the authoritative doc straight from Firestore (bypassing the offline
 * cache) and adopt it into the local DB as a clean remote write — no outbox
 * entry, no pending-created doc, no deadlock waiting for a sync that only runs
 * for active users.
 */
import { doc, getDocFromServer } from 'firebase/firestore'
import { getFirebase } from '../firebase'
import { dataProvider } from '../data'
import type { UserDoc } from '../types'
import { bootLocalLayer } from './index'
import { forceAdoptRemoteDoc } from './localProvider'

/** Reads `users/{uid}` from Firestore (network), or null when offline/denied. */
async function fetchOwnUserDoc(uid: string): Promise<UserDoc | null> {
  const fb = getFirebase()
  if (!fb) return null
  try {
    const snap = await getDocFromServer(doc(fb.db, 'users', uid))
    if (!snap.exists()) return null
    return { id: snap.id, ...(snap.data() as Omit<UserDoc, 'id'>) } as UserDoc
  } catch (e) {
    // Offline or rules denied: fall back to whatever we have locally.
    console.info('[auth] could not read own user doc from the server:', e instanceof Error ? e.message : e)
    return null
  }
}

/** Writes the authoritative doc into the local DB as a clean (non-queued) write. */
export async function adoptOwnUserDoc(remote: UserDoc): Promise<void> {
  await bootLocalLayer()
  forceAdoptRemoteDoc('users', { ...remote, id: remote.id })
}

/**
 * Returns the signed-in user's profile, preferring the server when the local
 * copy is missing or still pending.
 */
export async function ensureOwnUserDoc(uid: string): Promise<UserDoc | null> {
  await bootLocalLayer()
  const local = await dataProvider.get<UserDoc>('users', uid)
  if (local && local.status === 'active') return local

  const remote = await fetchOwnUserDoc(uid)
  if (!remote) return local

  // Server says active (or anything newer than our pending copy): take it.
  await adoptOwnUserDoc(remote)
  return (await dataProvider.get<UserDoc>('users', uid)) ?? remote
}