import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query'
import { dataProvider } from './index'
import type { QueryOpts, BulkOp } from './provider'

// TanStack Query hooks over the DataProvider. All app modules build on these.

export function listKey(path: string, opts?: QueryOpts) {
  return [path, opts ?? {}] as const
}

export function useList<T = Record<string, unknown>>(
  path: string,
  opts?: QueryOpts,
  options?: Partial<UseQueryOptions<T[], Error, T[], readonly unknown[]>>,
) {
  return useQuery<T[], Error, T[], readonly unknown[]>({
    queryKey: listKey(path, opts),
    queryFn: () => dataProvider.list<T>(path, opts),
    ...options,
  })
}

export function useGet<T = Record<string, unknown>>(
  path: string,
  id: string | undefined,
  options?: Partial<UseQueryOptions<T | null, Error, T | null, readonly unknown[]>>,
) {
  return useQuery<T | null, Error, T | null, readonly unknown[]>({
    queryKey: [path, 'doc', id],
    queryFn: () => (id ? dataProvider.get<T>(path, id) : Promise.resolve(null)),
    enabled: options?.enabled ?? Boolean(id),
    ...options,
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return (path: string, extra: string[] = []) => {
    void qc.invalidateQueries({ queryKey: [path] })
    for (const p of extra) void qc.invalidateQueries({ queryKey: [p] })
    void qc.invalidateQueries({ queryKey: ['notifications'] })
  }
}

export function useCreate(path: string, extraInvalidate: string[] = []) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ data, id }: { data: Record<string, unknown>; id?: string }) =>
      dataProvider.create(path, data, id),
    onSuccess: () => invalidate(path, extraInvalidate),
  })
}

export function useUpdate(path: string, extraInvalidate: string[] = []) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      dataProvider.update(path, id, data),
    onSuccess: () => invalidate(path, extraInvalidate),
  })
}

export function useSoftDelete(path: string, extraInvalidate: string[] = []) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, by }: { id: string; by?: string }) => dataProvider.softDelete(path, id, by),
    onSuccess: () => invalidate(path, [...extraInvalidate, 'trash']),
  })
}

export function useRestore(path: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => dataProvider.restore(path, id),
    onSuccess: () => invalidate(path, ['trash']),
  })
}

export function useBulkWrite(path: string, extraInvalidate: string[] = []) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (ops: BulkOp[]) => dataProvider.bulkWrite(path, ops),
    onSuccess: () => invalidate(path, extraInvalidate),
  })
}

// Convenience: run several mutations against different collections in one go (e.g. attendance batch)
export function useBatchWrite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ops: { path: string; op: BulkOp }[]) => {
      const byPath = new Map<string, BulkOp[]>()
      for (const { path, op } of ops) {
        const arr = byPath.get(path) ?? []
        arr.push(op)
        byPath.set(path, arr)
      }
      await Promise.all([...byPath.entries()].map(([path, list]) => dataProvider.bulkWrite(path, list)))
    },
    onSuccess: () => {
      void qc.invalidateQueries()
    },
  })
}
