import {
  collection, doc, getDoc, getDocs, query, where as fsWhere, orderBy as fsOrderBy,
  limit as fsLimit, addDoc, setDoc, updateDoc, writeBatch, deleteDoc, Timestamp,
} from 'firebase/firestore'
import { getFirebase } from '../firebase'
import type { DataProvider, QueryOpts, BulkOp } from './provider'
import { applyBaseCreate } from './provider'
import type { BaseDoc } from '../types'

function toMillis(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toMillis()
  if (v && typeof v === 'object' && 'seconds' in (v as Record<string, unknown>) && 'nanoseconds' in (v as Record<string, unknown>)) {
    return (v as Timestamp).toMillis()
  }
  return v
}

function normalize<T>(snapData: Record<string, unknown>, id: string): T {
  const out: Record<string, unknown> = { id }
  for (const [k, v] of Object.entries(snapData)) out[k] = toMillis(v)
  return out as T
}

function constraints(path: string, opts: QueryOpts | undefined) {
  const cs = []
  if (opts?.where) {
    for (const [field, op, value] of opts.where) {
      cs.push(fsWhere(field, op, op === 'in' || op === '!=' ? value : (op === 'array-contains' ? value : toMillis(value))))
    }
  }
  if (opts?.orderBy) cs.push(fsOrderBy(opts.orderBy[0], opts.orderBy[1]))
  if (opts?.limit) cs.push(fsLimit(opts.limit))
  void path
  return cs
}

export const firestoreProvider: DataProvider & {
  /** Used only by the settings "reset server data" flow (see firestore.rules). */
  hardDelete: (path: string, id: string) => Promise<void>
} = {
  mode: 'firebase',

  async list<T>(path: string, opts?: QueryOpts): Promise<T[]> {
    const { db } = getFirebase()!
    const cs = constraints(path, opts)
    // NOTE: soft-deleted docs are filtered client-side (see below), NOT with a
    // server `where('deletedAt', '==', null)`. A server-side deletedAt filter
    // turns EVERY filtered/sorted query into a composite query, which needs a
    // dedicated composite index per collection — without it Firestore throws
    // failed-precondition and lists silently stay in "loading" forever
    // (notifications bell, notices manage, PTM upcoming, assignment matrix...).
    // Filtering here matches the local/demo provider behavior exactly.
    // Trade-off: when `limit` is set, a soft-deleted doc can eat a slot, so a
    // page may show a few rows less. Deleted docs are rare (Trash module), so
    // this is negligible — and `includeDeleted`/`listDeleted` are unaffected.
    const q = cs.length ? query(collection(db, path), ...cs) : collection(db, path)
    const snap = await getDocs(q)
    let rows = snap.docs.map((d) => normalize<T>(d.data(), d.id)) as (T & { deletedAt?: number | null })[]
    if (!opts?.includeDeleted) rows = rows.filter((r) => r.deletedAt == null)
    return rows as T[]
  },

  async get<T>(path: string, id: string): Promise<T | null> {
    const { db } = getFirebase()!
    const snap = await getDoc(doc(db, path, id))
    if (!snap.exists()) return null
    return normalize<T>(snap.data(), snap.id)
  },

  async create(path: string, data: Record<string, unknown>, id?: string): Promise<string> {
    const { db } = getFirebase()!
    const payload = applyBaseCreate(data, id)
    if (id) {
      const ref = doc(db, path, id)
      const existing = await getDoc(ref)
      if (existing.exists()) throw new Error(`Document ${path}/${id} already exists`)
      await setDoc(ref, payload)
      return id
    }
    const ref = await addDoc(collection(db, path), payload)
    return ref.id
  },

  async update(path: string, id: string, data: Record<string, unknown>): Promise<void> {
    const { db } = getFirebase()!
    await updateDoc(doc(db, path, id), { ...data, updatedAt: Date.now() })
  },

  async softDelete(path: string, id: string, deletedBy?: string): Promise<void> {
    const { db } = getFirebase()!
    await updateDoc(doc(db, path, id), { deletedAt: Date.now(), deletedBy: deletedBy ?? null, updatedAt: Date.now() })
  },

  async restore(path: string, id: string): Promise<void> {
    const { db } = getFirebase()!
    await updateDoc(doc(db, path, id), { deletedAt: null, deletedBy: null, updatedAt: Date.now() })
  },

  async listDeleted<T>(path: string): Promise<T[]> {
    const { db } = getFirebase()!
    const q = query(collection(db, path), fsWhere('deletedAt', '!=', null))
    const snap = await getDocs(q)
    return snap.docs.map((d) => normalize<T>(d.data(), d.id))
  },

  async bulkWrite(path: string, ops: BulkOp[]): Promise<void> {
    const { db } = getFirebase()!
    let batch = writeBatch(db)
    let count = 0
    for (const op of ops) {
      const id = op.id
      const payload = applyBaseCreate(op.data, id)
      const existing = id ? await getDoc(doc(db, path, id)) : null
      if (id && existing?.exists()) {
        batch.update(doc(db, path, id), { ...op.data, updatedAt: Date.now() })
      } else {
        batch.set(doc(db, path, id ?? doc(collection(db, path)).id), payload)
      }
      if (++count >= 400) {
        await batch.commit()
        batch = writeBatch(db)
        count = 0
      }
    }
    if (count > 0) await batch.commit()
  },

  /**
   * Hard delete — used ONLY by the settings "reset server data" flow, and only
   * while a live admin `resetGrants/{uid}` document exists (enforced in
   * firestore.rules). Everywhere else the app soft-deletes.
   */
  async hardDelete(path: string, id: string): Promise<void> {
    const { db } = getFirebase()!
    await deleteDoc(doc(db, path, id))
  },
}

export type { BaseDoc }
