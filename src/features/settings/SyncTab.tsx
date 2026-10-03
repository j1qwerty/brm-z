/**
 * Settings > Sync — status, manual runs, per-step progress and failure retry.
 * Mirrors sync.md §10: everything the sync engine knows, in one place.
 */
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, CloudOff, Loader2, RefreshCw, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardContent } from '@/components/ui/display'
import { Progress } from '@/components/ui/display'
import { InfoTip } from '@/components/shared/PageHeader'
import SyncQueues from './SyncQueues'
import {
  isOnline, lastSyncAt, layer, localStats, resetSyncState, runSync, subscribeSync,
  syncSnapshot, type StepState, type SyncProgress,
} from '@/lib/sync'
import type { PlanStepId } from '@/lib/sync/schema'
import { fmtDateTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

const STEP_LABEL: Record<PlanStepId, string> = {
  preflight: 'Preflight (connection, session, backup)',
  'push-outbox': 'Push local changes',
  'pull-sessions': 'Pull sessions & classes',
  'pull-people': 'Pull staff, students, users',
  'pull-academics': 'Pull academics (exams, marks, templates)',
  'pull-ops': 'Pull operations (attendance, timetable, fees)',
  'pull-comms': 'Pull communication (notices, PTM, messages)',
  reconcile: 'Reconcile changes made during sync',
  conflicts: 'Detect conflicts',
  finalize: 'Finalize (prune, compact, snapshot)',
}

function statusBadge(s: StepState) {
  if (s.status === 'done') return <Badge variant="success">done</Badge>
  if (s.status === 'running') return <Badge variant="default">running</Badge>
  if (s.status === 'failed') return <Badge variant="danger">failed</Badge>
  if (s.status === 'skipped') return <Badge variant="neutral">skipped</Badge>
  return <Badge variant="neutral">pending</Badge>
}

export default function SyncTab() {
  const [progress, setProgress] = useState<SyncProgress>(() => syncSnapshot())
  const [l, setL] = useState(() => layer())
  const [stats, setStats] = useState(() => localStats())
  const last = lastSyncAt()

  useEffect(() => subscribeSync(setProgress), [])
  useEffect(() => {
    const t = setInterval(() => {
      setStats(localStats())
      setL(layer())
    }, 4000)
    return () => clearInterval(t)
  }, [])

  const done = progress.steps.filter((s) => s.status === 'done').length
  const failed = progress.steps.filter((s) => s.status === 'failed')
  const online = isOnline()

  /** Re-reads everything this tab shows (called after actions in the tables). */
  const refresh = () => {
    setProgress(syncSnapshot())
    setStats(localStats())
    setL(layer())
  }

  const start = async (mode: 'full' | 'push' | 'pull') => {
    if (!online) {
      toast.error('You are offline', { description: 'Changes keep saving locally and will sync when the connection returns.' })
      return
    }
    const p = await runSync({ mode })
    refresh()
    if (p.lastError) toast.error('Sync finished with errors', { description: p.lastError })
    else toast.success(`Sync ${mode === 'full' ? 'complete' : mode}`, { description: `${p.pushed} pushed · ${p.pulled} pulled` })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={online ? 'success' : 'danger'}>
          {online ? 'online' : <><CloudOff className="mr-1 inline size-3" />offline</>}
        </Badge>
        <Badge variant={l.ready ? 'success' : 'warning'}>{l.ready ? 'local database ready' : 'local database starting'}</Badge>
        <Badge variant="neutral">{l.persistence === 'idb' ? 'persisted in this browser' : l.persistence === 'memory' ? 'memory only (not persisted)' : 'unknown storage'}</Badge>
        <Badge variant="neutral">schema v{l.schemaVersion}</Badge>
        <Badge variant="neutral">device {l.deviceId.slice(0, 8)}</Badge>
        <InfoTip title="How offline mode works">
          Every read and write goes to a local SQLite database first, so the app works with no
          network. Writes are queued and pushed to Firestore in the plan below; pulls bring back
          everyone else's changes.
        </InfoTip>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Local documents</p><p className="text-lg font-bold tabular">{stats.docs}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Waiting to push</p><p className="text-lg font-bold tabular text-warning">{stats.pendingOps}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Conflicts</p><p className="text-lg font-bold tabular text-danger">{stats.conflicts}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Last sync</p><p className="text-sm font-semibold">{last ? fmtDateTime(last) : 'never'}</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => start('full')} disabled={progress.running}>
          {progress.running ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Sync now
        </Button>
        <Button variant="outline" onClick={() => start('push')} disabled={progress.running}>Push only</Button>
        <Button variant="outline" onClick={() => start('pull')} disabled={progress.running}>Pull only</Button>
        <Button variant="ghost" onClick={() => { resetSyncState(); toast.success('Sync plan reset', { description: 'Next sync runs every step again.' }) }}>
          Reset plan state
        </Button>
      </div>

      {progress.running && (
        <div className="space-y-1.5">
          <Progress value={(done / Math.max(progress.steps.length, 1)) * 100} />
          <p className="text-xs text-muted-foreground">Running {progress.step ? STEP_LABEL[progress.step] : '…'}</p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="divide-y divide-border">
          {progress.steps.map((s) => (
            <div key={s.step} className={cn('flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm', s.status === 'failed' && 'bg-danger-soft/30')}>
              <span className="flex size-5 items-center justify-center">
                {s.status === 'done' ? <CheckCircle2 className="size-4 text-success" />
                  : s.status === 'failed' ? <AlertTriangle className="size-4 text-danger" />
                  : s.status === 'running' ? <Loader2 className="size-4 animate-spin text-primary" />
                  : <span className="size-2 rounded-full bg-border" />}
              </span>
              <span className="min-w-0 flex-1">
                {STEP_LABEL[s.step]}
                {s.detail && <span className="block text-xs text-muted-foreground">{s.detail}</span>}
                {s.error && <span className="block text-xs text-danger">{s.error}</span>}
              </span>
              {statusBadge(s)}
              {s.status === 'failed' && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => runSync({ onlyStep: s.step }).then(() => setStats(localStats()))}>
                  <RotateCcw className="size-3.5" /> Retry
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {failed.length > 0 && (
        <p className="text-xs text-muted-foreground">
          A failed step is retried on the next sync on its own — the plan resumes from that step's
          saved cursor, never from the beginning.
        </p>
      )}
      </div>

      {/* right column: what is waiting to sync + what the last runs did */}
      <SyncQueues onChanged={refresh} />
    </div>
  )
}