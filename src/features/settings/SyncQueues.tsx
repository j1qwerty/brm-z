/**
 * Settings > Sync, right column:
 *   1. "Changed on this device, not synced yet"  — the live outbox
 *   2. "Synced last time"                        — what the last runs actually did
 *
 * Both are the shared DataTable with search, sorting, CSV export and row/bulk
 * actions, so they behave like every other table in the app.
 */
import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CloudUpload, History, RotateCcw, Trash2, Eye } from 'lucide-react'
import { DataTable, type BulkAction } from '@/components/shared/DataTable'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/display'
import { ConfirmDialog } from '@/components/ui/dialog'
import {
  clearRuns, discardPending, lastRun, pendingChanges, recentRuns,
  type PendingChange, type SyncRun,
} from '@/lib/sync/queue'
import { remoteProvider, runSync } from '@/lib/sync'
import { fmtDateTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

const age = (ms: number) => {
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.floor(h / 24)} d ago`
}

export default function SyncQueues({ onChanged }: { onChanged: () => void }) {
  const qc = useQueryClient()
  const [version, setVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const [discardTarget, setDiscardTarget] = useState<PendingChange | null>(null)
  const [expandRun, setExpandRun] = useState<string | null>(null)

  // `version` is a deliberate refresh key: bumping it re-reads SQLite after a
  // push/discard writes through the provider.
  const pending = useMemo(
    () => pendingChanges(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  )
  const runs = useMemo(
    () => recentRuns(20),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  )
  const last = lastRun()

  useEffect(() => {
    const t = setInterval(() => setVersion((v) => v + 1), 4000)
    return () => clearInterval(t)
  }, [])

  const refresh = () => {
    setVersion((v) => v + 1)
    onChanged()
  }

  const pushNow = async (label: string) => {
    if (!remoteProvider()) {
      toast.error('Not connected yet', { description: 'Sign in and let the first sync finish, then push.' })
      return
    }
    setBusy(true)
    const p = await runSync({ mode: 'push' })
    setBusy(false)
    refresh()
    void qc.invalidateQueries()
    if (p.lastError) toast.error(`${label} failed`, { description: p.lastError })
    else toast.success(`${label}: pushed ${p.pushed} change(s)`)
  }

  // ------------------------------------------------ table 1: not synced yet
  const pendingColumns = useMemo(
    () => [
      {
        id: 'label',
        header: 'Record',
        accessorFn: (r: PendingChange) => r.label,
        cell: ({ row }: { row: { original: PendingChange } }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.label}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.collection} · {row.original.docId}</p>
          </div>
        ),
      },
      {
        id: 'op',
        header: 'Change',
        accessorFn: (r: PendingChange) => r.op,
        cell: ({ row }: { row: { original: PendingChange } }) => (
          <Badge variant={row.original.op === 'create' ? 'default' : row.original.op === 'delete' ? 'danger' : 'outline'}>
            {row.original.op}
          </Badge>
        ),
      },
      {
        id: 'fields',
        header: 'Fields',
        accessorFn: (r: PendingChange) => r.fields.join(','),
        cell: ({ row }: { row: { original: PendingChange } }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.fields.slice(0, 4).join(', ')}
            {row.original.fields.length > 4 ? ` +${row.original.fields.length - 4}` : ''}
          </span>
        ),
      },
      {
        id: 'age',
        header: 'Waiting',
        accessorFn: (r: PendingChange) => r.ageMs,
        cell: ({ getValue }: { getValue: () => unknown }) => {
          const ms = Number(getValue())
          return <span className={cn('text-xs tabular', ms > 3_600_000 && 'font-semibold text-warning')}>{age(ms)}</span>
        },
      },
      {
        id: 'lastError',
        header: 'Hint',
        accessorFn: (r: PendingChange) => r.lastError ?? '',
        cell: ({ getValue }: { getValue: () => unknown }) => {
          const v = getValue() as string
          return v ? <span className="line-clamp-2 text-[11px] text-danger">{v}</span> : null
        },
      },
    ],
    [],
  )

  const pendingBulk: BulkAction<PendingChange>[] = [
    {
      label: 'Push to server',
      icon: <CloudUpload className="size-3.5" />,
      onClick: () => {
        void pushNow(`Pushed ${pending.length} queued change(s)`)
      },
    },
  ]

  // ------------------------------------------------ table 2: last runs
  const runColumns = useMemo(
    () => [
      {
        id: 'startedAt',
        header: 'When',
        accessorFn: (r: SyncRun) => r.startedAt,
        cell: ({ row }: { row: { original: SyncRun } }) => (
          <div>
            <p className="text-sm">{fmtDateTime(row.original.startedAt)}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.mode} · {row.original.durationMs != null ? `${(row.original.durationMs / 1000).toFixed(1)}s` : 'running'}
            </p>
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Result',
        accessorFn: (r: SyncRun) => r.status,
        cell: ({ row }: { row: { original: SyncRun } }) => (
          <Badge variant={row.original.status === 'done' ? 'success' : row.original.status === 'failed' ? 'danger' : 'default'}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: 'pushed',
        header: 'Pushed',
        accessorFn: (r: SyncRun) => r.pushed,
        cell: ({ getValue }: { getValue: () => unknown }) => <span className="tabular">{String(getValue())}</span>,
      },
      {
        id: 'pulled',
        header: 'Pulled',
        accessorFn: (r: SyncRun) => r.pulled,
        cell: ({ getValue }: { getValue: () => unknown }) => <span className="tabular">{String(getValue())}</span>,
      },
      {
        id: 'conflicts',
        header: 'Conflicts',
        accessorFn: (r: SyncRun) => r.conflicts,
        cell: ({ getValue }: { getValue: () => unknown }) => {
          const n = Number(getValue())
          return n > 0 ? <Badge variant="warning">{n}</Badge> : <span className="tabular text-muted-foreground">0</span>
        },
      },
      {
        id: 'error',
        header: 'Notes',
        accessorFn: (r: SyncRun) => r.error ?? '',
        cell: ({ row }: { row: { original: SyncRun } }) => (
          <span className="line-clamp-2 text-[11px] text-muted-foreground">
            {row.original.error ?? (row.original.steps.filter((s) => s.detail).slice(-1)[0]?.detail ?? '')}
          </span>
        ),
      },
    ],
    [],
  )

  const runBulk: BulkAction<SyncRun>[] = [
    {
      label: 'Re-run selected',
      icon: <RotateCcw className="size-3.5" />,
      onClick: (sel) => {
        void (async () => {
          for (const r of sel) {
            const failed = r.failedStep ?? (r.mode === 'push' ? 'push-outbox' : 'pull-sessions')
            await runSync({ onlyStep: failed as never })
          }
          refresh()
          toast.success(`Re-ran ${sel.length} run(s)`)
        })()
      },
    },
  ]

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------ table 1 */}
      <section className="space-y-2">
        <header className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">Changed here, not on the server yet</h3>
          <Badge variant={pending.length ? 'warning' : 'success'}>{pending.length}</Badge>
          {last && last.pushed > 0 && (
            <span className="text-xs text-muted-foreground">
              last push sent {last.pushed} change(s) {age(Date.now() - last.finishedAt!)}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="ml-auto gap-1.5"
            disabled={busy || pending.length === 0}
            onClick={() => pushNow('Pushed queued changes')}
          >
            <CloudUpload className="size-3.5" /> Push now
          </Button>
        </header>
        <DataTable
          data={pending}
          columns={pendingColumns as never}
          searchPlaceholder="Search record or collection..."
          exportName="pending-changes"
          hideSearch={pending.length === 0}
          bulkActions={pendingBulk}
          emptyTitle="Everything is synced"
          emptyHint="Changes you make offline (or while signed out of the sync) queue up here until they reach the server."
          actions={(r) => (
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setDiscardTarget(r as PendingChange)}>
                <Trash2 className="size-3.5" /> Discard
              </Button>
            </div>
          )}
        />
      </section>

      {/* ------------------------------------------------ table 2 */}
      <section className="space-y-2">
        <header className="flex flex-wrap items-center gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <History className="size-4" /> Synced last time
          </h3>
          <Badge variant="neutral">{runs.length} run(s)</Badge>
          <Button size="sm" variant="ghost" className="ml-auto gap-1.5" onClick={clearRuns}>
            <Trash2 className="size-3.5" /> Clear history
          </Button>
        </header>
        <DataTable
          data={runs}
          columns={runColumns as never}
          searchPlaceholder="Search runs..."
          exportName="sync-runs"
          hideSearch={runs.length === 0}
          bulkActions={runBulk}
          emptyTitle="No sync has run yet"
          emptyHint="Sync runs automatically on app start, when the connection returns and every 5 minutes while this tab is open."
          actions={(r) => (
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setExpandRun(expandRun === r.id ? null : r.id)}>
                <Eye className="size-3.5" /> {expandRun === r.id ? 'Hide steps' : 'Steps'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    setBusy(true)
                    const failed = r.failedStep ?? (r.mode === 'push' ? 'push-outbox' : 'pull-sessions')
                    await runSync({ onlyStep: failed as never })
                    setBusy(false)
                    refresh()
                    void qc.invalidateQueries()
                  })()
                }}
              >
                <RotateCcw className="size-3.5" /> Re-run
              </Button>
            </div>
          )}
        />
        {expandRun && (
          <div className="overflow-hidden rounded-xl border border-border">
            {runs
              .find((r) => r.id === expandRun)
              ?.steps.map((s) => (
                <div key={s.step} className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5 text-xs last:border-0">
                  <Badge
                    variant={s.status === 'done' ? 'success' : s.status === 'failed' ? 'danger' : s.status === 'running' ? 'default' : 'neutral'}
                  >
                    {s.status}
                  </Badge>
                  <span className="font-medium">{s.step}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.detail ?? s.error ?? ''}</span>
                  {s.durationMs != null && <span className="tabular text-muted-foreground">{(s.durationMs / 1000).toFixed(1)}s</span>}
                </div>
              ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(discardTarget)}
        onOpenChange={(o) => !o && setDiscardTarget(null)}
        title={`Discard the queued change for ${discardTarget?.label}?`}
        description="The local edit is thrown away and the record goes back to its last-synced state. The next pull re-fetches it from the server. Nothing is lost on the server."
        confirmLabel="Discard change"
        destructive
        onConfirm={() => {
          if (discardTarget) {
            const res = discardPending(discardTarget.opId)
            if (res.ok) toast.success('Queued change discarded')
            else toast.error(res.reason ?? 'Could not discard')
          }
          setDiscardTarget(null)
          refresh()
          void qc.invalidateQueries()
        }}
      />
    </div>
  )
}