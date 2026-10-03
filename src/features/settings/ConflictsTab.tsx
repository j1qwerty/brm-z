/**
 * Settings > Conflicts — the manual review queue produced during a pull.
 * Disjoint edits merge automatically; only genuinely ambiguous or structural
 * fields land here (sync.md §6.5).
 */
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Check } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/display'
import { EmptyState } from '@/components/shared/EmptyState'
import { InfoTip } from '@/components/shared/PageHeader'
import { listConflicts, resolveAllForDoc, resolveConflict, type ConflictRow } from '@/lib/sync/conflictsStore'
import { fmtDateTime } from '@/lib/utils'

function preview(value: unknown): string {
  if (value === null || value === undefined) return '—'
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > 80 ? `${text.slice(0, 80)}…` : text
}

function ConflictCard({ conflict, onResolved }: { conflict: ConflictRow; onResolved: () => void }) {
  const decide = (choice: 'local' | 'remote') => {
    const res = resolveConflict(conflict.id, choice)
    if (res.ok) {
      toast.success(`Kept ${choice === 'local' ? 'your version' : 'the server version'}`, {
        description: 'The decision is queued like any other change and syncs to other devices.',
      })
      onResolved()
    } else {
      toast.error(res.reason ?? 'Could not resolve')
    }
  }
  return (
    <div className="border-t border-border/60 px-4 py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{conflict.field}</code>
        <span className="text-xs text-muted-foreground">detected {fmtDateTime(conflict.detectedAt)}</span>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-muted/30 p-2.5">
          <p className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">On this device</p>
          <p className="break-words font-mono text-xs">{preview(conflict.localValue)}</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-2.5">
          <p className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">On the server</p>
          <p className="break-words font-mono text-xs">{preview(conflict.remoteValue)}</p>
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="outline" onClick={() => decide('local')}>Keep mine</Button>
        <Button size="sm" variant="outline" onClick={() => decide('remote')}>Keep server</Button>
      </div>
    </div>
  )
}

export default function ConflictsTab() {
  const [version, setVersion] = useState(0)
  // `version` is a deliberate refresh key: bumping it re-reads SQLite after a
  // resolution writes through the choke point.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const conflicts = useMemo(() => listConflicts(true), [version])
  const grouped = useMemo(() => {
    const map = new Map<string, { collection: string; docId: string; items: ConflictRow[] }>()
    for (const c of conflicts) {
      const key = `${c.collection}/${c.docId}`
      const entry = map.get(key) ?? { collection: c.collection, docId: c.docId, items: [] }
      entry.items.push(c)
      map.set(key, entry)
    }
    return [...map.values()]
  }, [conflicts])
  const refresh = () => setVersion((v) => v + 1)

  if (grouped.length === 0) {
    return (
      <EmptyState
        icon={<Check className="size-5" />}
        title="No conflicts to review"
        hint="Edits to different fields merge automatically. Only ambiguous or structural fields (sections, slots, bands, child links) land here."
      />
    )
  }

  return (
    <div className="max-w-3xl space-y-3">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <InfoTip title="Why am I seeing this?">Two devices changed the same field while offline. The app could not decide automatically, so it parked both versions here instead of guessing.</InfoTip>
        {conflicts.length} field(s) on {grouped.length} record(s) need a decision.
      </p>
      {grouped.map((group) => (
        <Card key={`${group.collection}/${group.docId}`}>
          <CardContent className="p-0">
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{group.collection} · {group.docId}</p>
                <p className="text-xs text-muted-foreground">{group.items.length} conflicting field(s)</p>
              </div>
              <Link to={`/people/${group.docId}?tab=profile`}>
                <Button size="sm" variant="ghost" className="gap-1.5"><AlertTriangle className="size-3.5" /> Open record</Button>
              </Link>
              <Button size="sm" variant="outline" onClick={() => { resolveAllForDoc(group.collection, group.docId, 'local'); refresh() }}>Keep all mine</Button>
              <Button size="sm" variant="outline" onClick={() => { resolveAllForDoc(group.collection, group.docId, 'remote'); refresh() }}>Keep all server</Button>
            </div>
            {group.items.map((c) => <ConflictCard key={c.id} conflict={c} onResolved={refresh} />)}
          </CardContent>
        </Card>
      ))}
      <p className="text-xs text-muted-foreground">
        Your decision is written as a normal local change: it is queued, pushed to the server and
        recorded in History, so it can be reverted like anything else.
      </p>
    </div>
  )
}