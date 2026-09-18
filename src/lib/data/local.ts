// In-browser demo provider: full app experience without a Firebase project.
// Persists to localStorage. Pair with demo auth (role switcher) in src/lib/auth.tsx.

import type { DataProvider, QueryOpts, BulkOp } from './provider'
import { applyBaseCreate } from './provider'
import { buildDemoDb } from './seed'

const KEY = 'bmrc-demo-db-v1'

type Db = Record<string, Record<string, Record<string, unknown>>>

let cache: Db | null = null

function load(): Db {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      cache = JSON.parse(raw) as Db
      return cache
    }
  } catch {
    // fallthrough to fresh seed
  }
  cache = buildDemoDb() as Db
  save()
  return cache
}

function save() {
  if (!cache) return
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch (e) {
    console.warn('Demo DB save failed', e)
  }
}

export function resetDemoDb() {
  cache = buildDemoDb() as Db
  save()
}

function table(db: Db, path: string): Record<string, Record<string, unknown>> {
  if (!db[path]) db[path] = {}
  return db[path]
}

function matches(doc: Record<string, unknown>, opts: QueryOpts | undefined): boolean {
  if (!opts?.where) return true
  for (const [field, op, value] of opts.where) {
    const dv = doc[field]
    switch (op) {
      case '==':
        if (dv !== value) return false
        break
      case '!=':
        if (dv === value) return false
        break
      case 'in':
        if (!Array.isArray(value) || !value.includes(dv as never)) return false
        break
      case '<=':
        if (!((dv as never) <= (value as never))) return false
        break
      case '>=':
        if (!((dv as never) >= (value as never))) return false
        break
      case 'array-contains':
        if (!Array.isArray(dv) || !dv.includes(value as never)) return false
        break
    }
  }
  return true
}

export const localProvider: DataProvider = {
  mode: 'demo',

  async list<T>(path: string, opts?: QueryOpts): Promise<T[]> {
    const db = load()
    let rows = Object.values(table(db, path))
    if (!opts?.includeDeleted) rows = rows.filter((r) => !r.deletedAt)
    rows = rows.filter((r) => matches(r, opts))
    if (opts?.orderBy) {
      const [field, dir] = opts.orderBy
      rows.sort((a, b) => {
        const av = a[field] as string | number | null | undefined
        const bv = b[field] as string | number | null | undefined
        const cmp = av === bv ? 0 : av === undefined || av === null ? 1 : bv === undefined || bv === null ? -1 : av > bv ? 1 : -1
        return dir === 'desc' ? -cmp : cmp
      })
    }
    if (opts?.limit) rows = rows.slice(0, opts.limit)
    return rows as T[]
  },

  async get<T>(path: string, id: string): Promise<T | null> {
    const db = load()
    const doc = table(db, path)[id]
    return (doc as T) ?? null
  },

  async create(path: string, data: Record<string, unknown>, id?: string): Promise<string> {
    const db = load()
    const t = table(db, path)
    const finalId = id ?? `l-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
    if (t[finalId]) throw new Error(`Document ${path}/${finalId} already exists`)
    t[finalId] = applyBaseCreate(data, finalId)
    save()
    return finalId
  },

  async update(path: string, id: string, data: Record<string, unknown>): Promise<void> {
    const db = load()
    const t = table(db, path)
    if (!t[id]) throw new Error(`Document ${path}/${id} not found`)
    t[id] = { ...t[id], ...data, updatedAt: Date.now() }
    save()
  },

  async softDelete(path: string, id: string, deletedBy?: string): Promise<void> {
    await this.update(path, id, { deletedAt: Date.now(), deletedBy: deletedBy ?? null })
  },

  async restore(path: string, id: string): Promise<void> {
    await this.update(path, id, { deletedAt: null, deletedBy: null })
  },

  async listDeleted<T>(path: string): Promise<T[]> {
    const db = load()
    const rows = Object.values(table(db, path)).filter((r) => r.deletedAt)
    return rows as T[]
  },

  async bulkWrite(path: string, ops: BulkOp[]): Promise<void> {
    const db = load()
    const t = table(db, path)
    for (const op of ops) {
      const finalId = op.id ?? `l-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
      if (t[finalId]) {
        t[finalId] = { ...t[finalId], ...op.data, updatedAt: Date.now() }
      } else {
        t[finalId] = applyBaseCreate(op.data, finalId)
      }
    }
    save()
  },
}
