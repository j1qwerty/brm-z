import type { BaseDoc } from '../types'

export type WhereOp = '==' | 'in' | '!=' | '<' | '<=' | '>' | '>=' | 'array-contains'

export interface QueryOpts {
  where?: [string, WhereOp, unknown][]
  orderBy?: [string, 'asc' | 'desc']
  limit?: number
  includeDeleted?: boolean
}

export interface BulkOp {
  id?: string
  data: Record<string, unknown>
}

export interface DataProvider {
  readonly mode: 'firebase' | 'demo'
  list<T = BaseDoc>(path: string, opts?: QueryOpts): Promise<T[]>
  get<T = BaseDoc>(path: string, id: string): Promise<T | null>
  create(path: string, data: Record<string, unknown>, id?: string): Promise<string>
  update(path: string, id: string, data: Record<string, unknown>): Promise<void>
  softDelete(path: string, id: string, deletedBy?: string): Promise<void>
  restore(path: string, id: string): Promise<void>
  listDeleted<T = BaseDoc>(path: string): Promise<T[]>
  bulkWrite(path: string, ops: BulkOp[]): Promise<void>
}

export function nowMs() {
  return Date.now()
}

export function applyBaseCreate(data: Record<string, unknown>, id?: string): Record<string, unknown> {
  const ts = nowMs()
  return {
    createdAt: data.createdAt ?? ts,
    updatedAt: ts,
    deletedAt: null,
    deletedBy: null,
    ...data,
    ...(id ? { id } : {}),
  }
}
