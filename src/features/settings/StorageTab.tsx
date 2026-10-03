/**
 * Settings > Storage — local database stats plus the two destructive resets,
 * both gated by a random OTP shown on screen (sync.md §7).
 *
 * The reset dialog deliberately makes the blast radius obvious: it lists what
 * will be destroyed, shows a locally generated code, and requires typing both the
 * code and the word RESET.
 */
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Database, HardDrive, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardContent } from '@/components/ui/display'
import { Checkbox } from '@/components/ui/toggle'
import { Input, Label } from '@/components/ui/input'
import { Dialog as DialogRoot, DialogContent, DialogHeader, DialogFooter } from '@/components/ui/dialog'
import { InfoTip } from '@/components/shared/PageHeader'
import { useAuth } from '@/lib/auth'
import { flushNow, layer, localStats, remoteProvider, type LocalStats } from '@/lib/sync'
import { createOtpChallenge, resetLocal, resetServer, type OtpChallenge, type ResetScope } from '@/lib/sync/reset'
import { RESETTABLE_COLLECTIONS } from '@/lib/sync/schema'
import { bytes } from '@/lib/sync/format'

export default function StorageTab() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [stats, setStats] = useState<LocalStats>(() => localStats())
  const [l, setL] = useState(() => layer())
  const [scope, setScope] = useState<ResetScope | null>(null)
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null)
  const [typed, setTyped] = useState('')
  const [confirmWord, setConfirmWord] = useState('')
  const [reseed, setReseed] = useState(true)
  const [busy, setBusy] = useState(false)

  const refresh = () => {
    setStats(localStats())
    setL(layer())
  }
  useEffect(() => {
    const t = setInterval(refresh, 5000)
    return () => clearInterval(t)
  }, [])

  const openReset = async (s: ResetScope) => {
    setScope(s)
    setTyped('')
    setConfirmWord('')
    try {
      setChallenge(await createOtpChallenge(s, s === 'local+server' ? remoteProvider() : null))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start the reset check')
      setScope(null)
    }
  }

  const runReset = async () => {
    if (!scope || !challenge) return
    if (typed.trim().toUpperCase().replace(/\s+/g, '') !== challenge.code) {
      toast.error('The code does not match', { description: 'Type it exactly as shown, including the dash.' })
      return
    }
    if (confirmWord.trim().toUpperCase() !== 'RESET') {
      toast.error('Type RESET to confirm')
      return
    }
    setBusy(true)
    try {
      const result = scope === 'local'
        ? await resetLocal(typed, { reseedFromBackup: reseed })
        : await resetServer(typed, remoteProvider()!, user?.id ?? '')
      if (result.ok) {
        toast.success(scope === 'local' ? 'Local data reset' : 'Local and server data reset', {
          description: scope === 'local'
            ? result.seededFromBackup
              ? `Reseeded from backup ${result.seededFromBackup}. Run a sync to pull fresh server data.`
              : 'The local database is empty. Run a sync to pull from the server.'
            : `${result.serverDeleted} server document(s) hard-deleted. Run a sync to rebuild local data.`,
        })
        setScope(null)
        setChallenge(null)
        void qc.invalidateQueries()
        refresh()
      } else {
        toast.error('Reset refused', { description: result.reason })
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reset failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Database className="size-3.5" /> Local database</p>
            <p className="text-lg font-bold tabular">{bytes(stats.bytes)}</p>
            <p className="text-[11px] text-muted-foreground">{l.persistence === 'idb' ? 'saved in this browser' : 'memory only'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Documents</p>
            <p className="text-lg font-bold tabular">{stats.docs}</p>
            <p className="text-[11px] text-muted-foreground">{stats.collections} collections · {stats.dirty} awaiting push</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><HardDrive className="size-3.5" /> Change history</p>
            <p className="text-lg font-bold tabular">{stats.logRows}</p>
            <p className="text-[11px] text-muted-foreground">kept 30 days / 50k rows</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={async () => { await flushNow(); refresh(); toast.success('Local database saved') }}>
          <RefreshCw className="size-3.5" /> Save now
        </Button>
        <Badge variant="neutral">schema v{l.schemaVersion}</Badge>
        <Badge variant="neutral">device {l.deviceId.slice(0, 8)}</Badge>
      </div>

      <Card className="border-danger/40">
        <CardContent className="space-y-3 p-5">
          <p className="flex items-center gap-2 font-semibold text-danger">
            <ShieldAlert className="size-4" /> Destructive actions
            <InfoTip title="Why the code?">A plain confirmation dialog is easy to click through by accident. The code is generated on this device, expires in 5 minutes, and cannot be reused.</InfoTip>
          </p>
          <p className="text-sm text-muted-foreground">
            Both actions ask you to type a one-time code first. Backups are kept, so a local reset can
            be undone from the Backups tab.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-1.5 text-danger" onClick={() => openReset('local')}>
              <Trash2 className="size-4" /> Reset local data
            </Button>
            {user?.role === 'admin' && (
              <Button variant="destructive" className="gap-1.5" onClick={() => openReset('local+server')}>
                <Trash2 className="size-4" /> Reset local + server data
              </Button>
            )}
          </div>
          {user?.role !== 'admin' && <p className="text-xs text-muted-foreground">Only an admin can reset server data.</p>}
        </CardContent>
      </Card>

      <DialogRoot open={Boolean(scope && challenge)} onOpenChange={(o) => { if (!o) { setScope(null); setChallenge(null) } }}>
        <DialogContent wide>
          <DialogHeader
            title={scope === 'local+server' ? 'Reset local AND server data' : 'Reset local data'}
            description={
              scope === 'local+server'
                ? 'Every document in the app collections is permanently deleted from this device and from the server. Accounts and school settings are kept so you can still sign in.'
                : 'The local database is wiped. Nothing on the server changes.'
            }
          />

          {challenge && (
            <div className="space-y-4">
              <div className="rounded-xl border border-danger/40 bg-danger-soft/30 p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-danger">This will destroy</p>
                <div className="grid max-h-40 gap-1 overflow-y-auto sm:grid-cols-2">
                  {challenge.targets.map((t) => (
                    <p key={t.label} className="flex justify-between gap-2 text-xs">
                      <span className="truncate text-muted-foreground">{t.label}</span>
                      <span className="font-bold tabular">{t.count}</span>
                    </p>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-muted/40 p-4 text-center">
                <p className="text-xs text-muted-foreground">Type this code exactly</p>
                <p className="select-all font-mono text-2xl font-bold tracking-[0.3em]">{challenge.code}</p>
              </div>

              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={challenge.code} className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label>Then type RESET</Label>
                <Input value={confirmWord} onChange={(e) => setConfirmWord(e.target.value)} placeholder="RESET" className="font-mono" />
              </div>

              {scope === 'local' && (
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={reseed} onCheckedChange={(c) => setReseed(Boolean(c))} className="mt-0.5" />
                  <span>Reseed from the newest backup after wiping
                    <span className="block text-xs text-muted-foreground">Otherwise the app starts empty until the next sync pulls data back.</span>
                  </span>
                </label>
              )}

              {scope === 'local+server' && (
                <p className="text-xs text-muted-foreground">
                  This uses a short-lived admin grant ({RESETTABLE_COLLECTIONS.length} collections). It cannot be
                  undone from the app — only from a backup you exported earlier.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setScope(null); setChallenge(null) }}>Cancel</Button>
            <Button variant="destructive" onClick={runReset} disabled={busy}>
              {busy ? 'Working...' : 'Delete permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </div>
  )
}