/**
 * Small hook for the sidebar sync badge: how much is waiting to sync and how
 * many conflicts need a human. Polls cheaply (the outbox/conflict counts are
 * local SQLite reads) and bumps immediately whenever a sync step changes.
 */
import { useEffect, useState } from 'react'
import { subscribeSync } from './syncEngine'
import { localStats, type LocalStats } from './localProvider'

export interface SyncBadge {
  pending: number
  conflicts: number
}

const EMPTY: SyncBadge = { pending: 0, conflicts: 0 }

export function useSyncBadge(): SyncBadge | null {
  const [badge, setBadge] = useState<SyncBadge | null>(null)

  useEffect(() => {
    let alive = true
    const read = () => {
      try {
        const s: LocalStats = localStats()
        if (alive) setBadge({ pending: s.pendingOps, conflicts: s.conflicts })
      } catch {
        if (alive) setBadge(EMPTY)
      }
    }
    read()
    const timer = setInterval(read, 5000)
    const unsubscribe = subscribeSync(() => read())
    return () => {
      alive = false
      clearInterval(timer)
      unsubscribe()
    }
  }, [])

  if (!badge) return null
  if (badge.pending === 0 && badge.conflicts === 0) return null
  return badge
}