/**
 * Data layer entry point — offline-first.
 *
 * `dataProvider` is a thin dispatcher: every call waits for the SQLite layer to
 * boot, then goes to the local database. Reads and writes are therefore local
 * and instant whether or not there is a network; the sync engine reconciles with
 * Firestore in the background (see src/lib/sync).
 *
 * The DataProvider interface is unchanged, which is why every existing hook,
 * feature and test keeps working untouched.
 */
import { isFirebaseConfigured } from '../firebase'
import type { DataProvider, QueryOpts, BulkOp } from './provider'
import { firestoreProvider } from './firestore'
import { localProvider } from './local'
import { bootLocalLayer, attachRemote, layer } from '../sync'

export const DEMO_MODE = !isFirebaseConfigured

const boot = bootLocalLayer()

/** The app reads/writes locally; sync pushes and pulls in the background. */
export const dataProvider: DataProvider = {
  mode: 'firebase',

  async list<T = Record<string, unknown>>(path: string, opts?: QueryOpts) {
    await boot
    return localProvider.list<T>(path, opts)
  },
  async get<T = Record<string, unknown>>(path: string, id: string) {
    await boot
    return localProvider.get<T>(path, id)
  },
  async create(path: string, data: Record<string, unknown>, id?: string) {
    await boot
    return localProvider.create(path, data, id)
  },
  async update(path: string, id: string, data: Record<string, unknown>) {
    await boot
    return localProvider.update(path, id, data)
  },
  async softDelete(path: string, id: string, deletedBy?: string) {
    await boot
    return localProvider.softDelete(path, id, deletedBy)
  },
  async restore(path: string, id: string) {
    await boot
    return localProvider.restore(path, id)
  },
  async listDeleted<T = Record<string, unknown>>(path: string) {
    await boot
    return localProvider.listDeleted<T>(path)
  },
  async bulkWrite(path: string, ops: BulkOp[]) {
    await boot
    return localProvider.bulkWrite(path, ops)
  },
}

/**
 * Gives the sync engine its remote peer. Called once a Firebase session exists;
 * until then the app runs purely local (and offline).
 */
export function connectRemote(): void {
  if (!isFirebaseConfigured) return
  attachRemote(firestoreProvider as typeof firestoreProvider & { hardDelete: (p: string, id: string) => Promise<void> })
}

/** Demo mode still exposes the localStorage provider (used by scripts/tests). */
export const demoProvider = localProvider

export { layer as localLayer, bootLocalLayer }
export type { DataProvider, QueryOpts, BulkOp }