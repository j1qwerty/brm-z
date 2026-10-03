/**
 * Settings > History — every local change, push and pull with a field-level
 * diff, and a Revert button on each row (sync.md §9).
 */
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { History, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/display'
import { EmptyState } from '@/components/shared/EmptyState'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/dialog'
import { historyCollections, listChanges, revertChange, type ChangeRow } from '@/lib/sync/changelog'
import { fmtDateTime } from '@/lib/utils'

function DiffChips({ before, after }: { before: Record<string, unknown>; after: Record<string, unknown> }) {
  const keys = useMemo(() => [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])], [before, after])
  if (keys.length === 0) return null
  const short = (v: unknown) => {
    const text = v === null || v === undefined ? '∅' : typeof v === 'string' ? v : JSON.stringify(v)
    return text.length > 40 ? `${text.slice(0, 40)}…` : text
  }
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {keys.slice(0, 8).map((k) => (
        <span key={k} className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">
          {k}: <span className="text-muted-foreground line-through">{short(before?.[k])}</span>{' '}
          <span className="font-semibold">{short(after?.[k])}</span>
        </span>
      ))}
      {keys.length > 8 && <span className="text-[11px] text-muted-foreground">+{keys.length - 8} more</span>}
    </div>
  )
}

export default function HistoryTab() {
  const [collection, setCollection] = useState('all')
  const [origin, setOrigin] = useState('all')
  const [version, setVersion] = useState(0)
  const [revertTarget, setRevertTarget] = useState<ChangeRow | null>(null)

  const collections = useMemo(
    () => historyCollections(),
    // `version` is a deliberate refresh key (see ConflictsTab).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  )
  const changes = useMemo(
    () =>
      listChanges({
        collection: collection === 'all' ? undefined : collection,
        origin: origin === 'all' ? undefined : (origin as 'local' | 'remote' | 'system'),
        limit: 150,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [collection, origin, version],
  )

  useEffect(() => {
    const t = setInterval(() => setVersion((v) => v + 1), 10000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={collection} onValueChange={setCollection}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All collections" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All collections</SelectItem>
            {collections.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={origin} onValueChange={setOrigin}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All sources" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="local">Local changes</SelectItem>
            <SelectItem value="remote">From server</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">Newest first · up to 150 rows</span>
      </div>

      {changes.length === 0 ? (
        <EmptyState icon={<History className="size-5" />} title="No changes recorded yet" hint="Every edit, sync and revert is logged here with a before/after snapshot." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="max-h-[540px] divide-y divide-border overflow-y-auto">
            {changes.map((c) => (
              <div key={c.seq} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="neutral">{c.collection}</Badge>
                    <span className="truncate font-medium">{c.docId}</span>
                    <Badge variant={c.origin === 'remote' ? 'outline' : c.origin === 'system' ? 'neutral' : 'default'}>{c.origin}</Badge>
                    <Badge variant="outline">{c.op}</Badge>
                    {c.revertedBy && <Badge variant="warning">reverted</Badge>}
                  </p>
                  <DiffChips before={c.before} after={c.after} />
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{fmtDateTime(c.at)} · device {c.deviceId.slice(0, 8)}</p>
                </div>
                {!c.revertedBy && (
                  <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setRevertTarget(c)}>
                    <RotateCcw className="size-3.5" /> Revert
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(revertTarget)}
        onOpenChange={(o) => !o && setRevertTarget(null)}
        title="Revert this change?"
        description="The previous values are written back as a NEW change, so this revert is itself revertible and syncs like any other edit."
        confirmLabel="Revert"
        onConfirm={() => {
          if (!revertTarget) return
          const res = revertChange(revertTarget.seq)
          if (res.ok) {
            toast.success('Change reverted')
            setVersion((v) => v + 1)
          } else {
            toast.error('Could not revert', { description: res.reason })
          }
          setRevertTarget(null)
        }}
      />
    </div>
  )
}