/**
 * Settings > Backups — keep the last 5, restore any of them, export to disk.
 * A backup is the whole local database file, so restore is byte-exact and works
 * the same way in the .NET app (phase 2).
 */
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Download, HardDriveDownload, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/display'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmDialog } from '@/components/ui/dialog'
import { InfoTip } from '@/components/shared/PageHeader'
import { useQueryClient } from '@tanstack/react-query'
import {
  KEEP_BACKUPS, backupBytes, createBackup, deleteBackup, listBackups, restoreBackup, verifyBackup,
  type BackupMeta,
} from '@/lib/sync/backups'
import { bytes } from '@/lib/sync/format'
import { fmtDateTime } from '@/lib/utils'

export default function BackupsTab() {
  const [backups, setBackups] = useState<BackupMeta[]>(() => listBackups())
  const [busy, setBusy] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<BackupMeta | null>(null)
  const qc = useQueryClient()

  const refresh = () => setBackups(listBackups())

  useEffect(() => {
    const t = setInterval(refresh, 10000)
    return () => clearInterval(t)
  }, [])

  const backUpNow = async () => {
    setBusy(true)
    try {
      const b = await createBackup('manual')
      toast.success('Backup created', { description: `${b.id} · ${bytes(b.bytes)} · ${b.docCount} documents` })
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Backup failed')
    } finally {
      setBusy(false)
    }
  }

  const exportToDisk = async (b: BackupMeta) => {
    const data = await backupBytes(b.id)
    if (!data) return toast.error('Backup blob missing')
    const blob = new Blob([data as BlobPart], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bmrc-backup-${b.id}.sqlite`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={backUpNow} disabled={busy} className="gap-1.5">
          <HardDriveDownload className="size-4" /> {busy ? 'Backing up...' : 'Back up now'}
        </Button>
        <span className="text-xs text-muted-foreground">
          The newest {KEEP_BACKUPS} are kept; older ones are removed automatically.
        </span>
        <InfoTip title="When are backups taken?">
          Before every sync that has local changes, once a day when the data changed, and before
          any restore or reset. Restoring a backup first snapshots the current state, so a restore
          is itself undoable.
        </InfoTip>
      </div>

      {backups.length === 0 ? (
        <EmptyState icon={<ShieldCheck className="size-5" />} title="No backups yet" hint="Take one now, or wait for the next sync that has local changes." action={<Button onClick={backUpNow}>Back up now</Button>} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="divide-y divide-border">
            {backups.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium tabular">{b.id}</p>
                  <p className="text-xs text-muted-foreground">
                    {bytes(b.bytes)} · {b.docCount} docs · checksum {b.sha256} · {fmtDateTime(b.createdAt)}
                  </p>
                </div>
                <Badge variant="neutral">{b.reason}</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5"
                  onClick={async () => {
                    const v = await verifyBackup(b.id)
                    if (v.ok) toast.success('Backup verified', { description: 'Size and checksum match.' })
                    else toast.error('Backup looks damaged', { description: v.reason })
                  }}
                >
                  <ShieldCheck className="size-3.5" /> Verify
                </Button>
                <Button size="sm" variant="ghost" onClick={() => exportToDisk(b)} className="gap-1.5">
                  <Download className="size-3.5" /> Export
                </Button>
                <Button size="sm" variant="soft" className="gap-1.5" onClick={() => setRestoreTarget(b)}>
                  <RotateCcw className="size-3.5" /> Restore
                </Button>
                <Button
                  size="iconSm"
                  variant="ghost"
                  className="text-danger"
                  aria-label={`Delete backup ${b.id}`}
                  onClick={async () => { await deleteBackup(b.id); refresh() }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(restoreTarget)}
        onOpenChange={(o) => !o && setRestoreTarget(null)}
        title={`Restore backup ${restoreTarget?.id}?`}
        description="The current local data is snapshotted first (so this is undoable), then the whole local database is replaced. Everything restored is marked as a local change and will be pushed to the server on the next sync."
        confirmLabel="Restore backup"
        onConfirm={async () => {
          if (!restoreTarget) return
          setBusy(true)
          const res = await restoreBackup(restoreTarget.id)
          setBusy(false)
          setRestoreTarget(null)
          if (res.ok) {
            toast.success('Backup restored', { description: 'Syncing views refreshed.' })
            void qc.invalidateQueries()
          } else {
            toast.error('Restore failed', { description: res.reason })
          }
        }}
      />
    </div>
  )
}