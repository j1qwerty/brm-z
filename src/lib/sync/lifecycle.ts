/**
 * Sync lifecycle: when a sync runs without anyone pressing a button.
 *
 * - on app start (and whenever the signed-in user changes)
 * - when the browser reports the connection came back
 * - on a timer while the tab is visible
 *
 * Everything is best-effort: failures land in the `failed` step state and are
 * retried on the next trigger or manually from Settings > Sync.
 */
import { useEffect } from 'react'
import { DEMO_MODE, connectRemote } from '../data'
import { useAuth } from '../auth'
import { isOnline, runSync, type SyncMode } from './syncEngine'

const IDLE_INTERVAL_MS = 5 * 60 * 1000

export function useSyncLifecycle() {
  const { user, status } = useAuth()

  useEffect(() => {
    const userId = user?.id
    if (DEMO_MODE || status !== 'active' || !userId) return
    connectRemote()

    let cancelled = false
    const trigger = (mode: SyncMode) => {
      if (cancelled || !isOnline()) return
      void runSync({ mode })
    }

    // Give the UI a moment to settle before the first (possibly large) sync.
    const initial = setTimeout(() => trigger('full'), 1500)
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') trigger('full')
    }, IDLE_INTERVAL_MS)
    const onOnline = () => trigger('full')
    window.addEventListener('online', onOnline)

    return () => {
      cancelled = true
      clearTimeout(initial)
      clearInterval(interval)
      window.removeEventListener('online', onOnline)
    }
  }, [user, status])
}