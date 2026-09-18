/**
 * In-memory DataProvider that mirrors the localStorage-backed localProvider
 * (src/lib/data/local.ts) exactly, minus the persistence.
 *
 * Used by the test runner so tests can run in pure Node.js without a DOM
 * or Firebase project. It implements the same CRUD semantics, the same
 * soft-delete behavior, the same path-as-collection-key model, and the
 * same `applyBaseCreate` payload shape.
 */
import type { DataProvider, QueryOpts, BulkOp } from '../../src/lib/data/provider'
import { applyBaseCreate } from '../../src/lib/data/provider'

type Db = Record<string, Record<string, Record<string, unknown>>>

export function createInMemoryProvider(): DataProvider & {
  /** Expose the raw db so tests can inspect what was actually written. */
  __db: Db
  /** Reset the database (used between test groups for isolation). */
  __reset(): void
} {
  const db: Db = {}

  function table(path: string): Record<string, Record<string, unknown>> {
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

  const provider: DataProvider = {
    mode: 'demo',

    async list<T>(path: string, opts?: QueryOpts): Promise<T[]> {
      let rows = Object.values(table(path))
      if (!opts?.includeDeleted) rows = rows.filter((r) => !r.deletedAt)
      rows = rows.filter((r) => matches(r, opts))
      if (opts?.orderBy) {
        const [field, dir] = opts.orderBy
        rows.sort((a, b) => {
          const av = a[field] as string | number | null | undefined
          const bv = b[field] as string | number | null | undefined
          const cmp =
            av === bv ? 0 : av === undefined || av === null ? 1 : bv === undefined || bv === null ? -1 : av > bv ? 1 : -1
          return dir === 'desc' ? -cmp : cmp
        })
      }
      if (opts?.limit) rows = rows.slice(0, opts.limit)
      return rows as T[]
    },

    async get<T>(path: string, id: string): Promise<T | null> {
      const doc = table(path)[id]
      return (doc as T) ?? null
    },

    async create(path: string, data: Record<string, unknown>, id?: string): Promise<string> {
      const t = table(path)
      const finalId = id ?? `t-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
      if (t[finalId]) throw new Error(`Document ${path}/${finalId} already exists`)
      t[finalId] = applyBaseCreate(data, finalId)
      return finalId
    },

    async update(path: string, id: string, data: Record<string, unknown>): Promise<void> {
      const t = table(path)
      if (!t[id]) throw new Error(`Document ${path}/${id} not found`)
      t[id] = { ...t[id], ...data, updatedAt: Date.now() }
    },

    async softDelete(path: string, id: string, deletedBy?: string): Promise<void> {
      await this.update(path, id, { deletedAt: Date.now(), deletedBy: deletedBy ?? null })
    },

    async restore(path: string, id: string): Promise<void> {
      await this.update(path, id, { deletedAt: null, deletedBy: null })
    },

    async listDeleted<T>(path: string): Promise<T[]> {
      const rows = Object.values(table(path)).filter((r) => r.deletedAt)
      return rows as T[]
    },

    async bulkWrite(path: string, ops: BulkOp[]): Promise<void> {
      const t = table(path)
      for (const op of ops) {
        const finalId = op.id ?? `t-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
        if (t[finalId]) {
          t[finalId] = { ...t[finalId], ...op.data, updatedAt: Date.now() }
        } else {
          t[finalId] = applyBaseCreate(op.data, finalId)
        }
      }
    },
  }

  return {
    ...provider,
    __db: db,
    __reset() {
      for (const k of Object.keys(db)) delete db[k]
    },
  }
}
