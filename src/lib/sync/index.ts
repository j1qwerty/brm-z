/**
 * Offline-first data layer bootstrap.
 *
 * Boots SQLite (sql.js), seeds demo data when there is no Firebase project,
 * wires the sync engine to the remote Firestore provider, and exposes the bits
 * the UI needs (status, manual sync, retry, stats).
 */
import { isFirebaseConfigured } from '../firebase'
import { localProvider, localStats, localTransaction, type LocalStats } from './localProvider'
import {
  configureSync, isOnline, lastSyncAt, resetSyncState, runSync, setPullContext,
  subscribeSync, syncSnapshot, type StepState, type SyncOptions, type SyncProgress,
} from './syncEngine'
import { deviceId, flush, flushNow, hasUnsavedChanges, openDb, persistenceKind, setJsonMeta } from './sqlite'
import { RESETTABLE_COLLECTIONS, SCHEMA_VERSION } from './schema'
import type { ResettableRemote } from './reset'

export interface LocalLayer {
  ready: boolean
  error: string | null
  demoMode: boolean
  persistence: 'idb' | 'file' | 'memory' | null
  schemaVersion: number
  deviceId: string
}

const state: LocalLayer = {
  ready: false,
  error: null,
  demoMode: !isFirebaseConfigured,
  persistence: null,
  schemaVersion: SCHEMA_VERSION,
  deviceId: '',
}

let remoteRef: ResettableRemote | null = null

export function layer(): LocalLayer {
  return { ...state }
}

/** Seeds the demo school into SQLite on first run of demo mode. */
async function seedDemoData() {
  const { buildDemoDb } = await import('../data/seed')
  const demo = buildDemoDb() as Record<string, Record<string, Record<string, unknown>>>
  localTransaction(() => {
    const { writeLocal } = localProvider
    for (const [collection, rows] of Object.entries(demo)) {
      for (const [id, doc] of Object.entries(rows)) {
        writeLocal({ collection, id, op: 'create', patch: { ...doc, id }, origin: 'system', queue: false, clean: true })
      }
    }
  })
}

let bootPromise: Promise<LocalLayer> | null = null

export function bootLocalLayer(): Promise<LocalLayer> {
  if (bootPromise) return bootPromise
  bootPromise = (async () => {
    try {
      await openDb()
      state.persistence = persistenceKind()
      state.deviceId = deviceId()
      if (state.demoMode && localStats().docs === 0) {
        await seedDemoData()
        await flush()
      }
      // Desktop: materialise the database file on first launch so the user can
      // always find (and back up) %APPDATA%/bmrc-school-management/data.
      if (state.persistence === 'file') await flush()
      state.ready = true
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e)
      console.error('[sync] local layer failed to start:', e)
    }
    return layer()
  })()
  return bootPromise
}

/** Called once the Firebase auth session exists. */
export function attachRemote(remote: ResettableRemote) {
  remoteRef = remote
  configureSync({ remote })
  setJsonMeta('remote_attached_at', Date.now())
}

export function remoteProvider(): ResettableRemote | null {
  return remoteRef
}

export {
  localProvider,
  localStats,
  localTransaction,
  runSync,
  subscribeSync,
  syncSnapshot,
  setPullContext,
  lastSyncAt,
  resetSyncState,
  isOnline,
  deviceId,
  flush,
  flushNow,
  hasUnsavedChanges,
  RESETTABLE_COLLECTIONS,
}
export type { LocalStats, StepState, SyncProgress, SyncOptions }
export { localProvider as sqliteProvider }