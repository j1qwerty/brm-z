/**
 * Desktop integration for the sync layer.
 *
 * Wires the native shell to the app:
 *   - handles commands coming from the menu / tray (sync, backup, navigate...)
 *   - puts the window title in sync with the active session
 *   - keeps the native menu honest about the signed-in role
 *
 * The SQLite snapshot is mirrored to disk by the persistence adapter itself
 * (see src/lib/sync/sqlite.ts) — this module only reacts to menu commands.
 *
 * Called from AppShell. Every function is a no-op in the browser build.
 */
import { toast } from 'sonner'
import { desktop } from './desktop'
import type { DesktopCommand } from './desktop'
import { runSync, setPullContext, isOnline, syncSnapshot } from './sync'
import { createBackup } from './sync/backups'
import { exportDbBytes } from './sync/sqlite'

const APP_TITLE = 'BRM School Management'

/**
 * "BRM School Management" on its own, with the active session appended once
 * there is one — e.g. "BRM School Management — 2026-2027". No date: that
 * belongs in the UI, not the title bar.
 */
function desktopTitle(sessionName?: string): string {
  return sessionName ? `${APP_TITLE} — ${sessionName}` : APP_TITLE
}

let unsubscribe: (() => void) | null = null

export function startDesktopBridge(opts: { userId: string; sessionName?: string }): () => void {
  if (!desktop.isDesktop()) return () => {}

  desktop.setTitle(desktopTitle(opts.sessionName))

  unsubscribe = desktop.onCommand((command, payload) => handle(command, payload))
  return stopDesktopBridge
}

export function stopDesktopBridge() {
  unsubscribe?.()
  unsubscribe = null
}

async function handle(command: DesktopCommand, payload?: unknown) {
  switch (command) {
    case 'sync': {
      const mode = (payload as 'full' | 'push' | 'pull') ?? 'full'
      if (!isOnline()) {
        toast.warning('You are offline', {
          description: 'Changes keep saving locally and will sync when the connection returns.',
        })
        return
      }
      const result = await runSync({ mode })
      if (result.lastError) {
        toast.error('Sync finished with errors', { description: result.lastError })
      } else {
        toast.success(mode === 'full' ? 'Sync complete' : `Sync ${mode}`, {
          description: `${result.pushed} pushed · ${result.pulled} pulled`,
        })
      }
      break
    }

    case 'sync-retry-failed': {
      const failed = syncSnapshot().steps.filter((s) => s.status === 'failed')
      if (failed.length === 0) {
        toast.info('No failed steps', { description: 'The last sync finished cleanly.' })
        return
      }
      for (const step of failed) await runSync({ onlyStep: step.step })
      toast.success(`Retried ${failed.length} step(s)`)
      break
    }

    case 'backup': {
      const meta = await createBackup('manual')
      toast.success('Backup created', {
        description: `${meta.id} · ${meta.docCount} documents`,
        action: {
          label: 'Open backups',
          onClick: () => void desktop.openBackupsFolder(),
        },
      })
      break
    }

    case 'backup-export': {
      const bytes = exportDbBytes()
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      const res = await desktop.saveFile(`brm-backup-${stamp}.sqlite`, bytes)
      if (res.ok && 'path' in res && res.path) toast.success('Backup exported', { description: res.path })
      break
    }

    case 'navigate': {
      // The router owns navigation; the AppShell listener performs it.
      window.dispatchEvent(new CustomEvent('brm:navigate', { detail: String(payload) }))
      break
    }

    case 'palette': {
      window.dispatchEvent(new CustomEvent('brm:palette'))
      break
    }

    case 'toggle-sidebar': {
      window.dispatchEvent(new CustomEvent('brm:toggle-sidebar'))
      break
    }
  }
}

/** Called when the signed-in user changes so the sync context stays right. */
export function updateDesktopUser(user: {
  id: string
  role: Parameters<typeof setPullContext>[0]['role']
  studentId?: string
  staffId?: string
  childIds?: string[]
}) {
  if (!desktop.isDesktop()) return
  setPullContext({
    role: user.role,
    uid: user.id,
    studentId: user.studentId,
    staffId: user.staffId,
    childIds: user.childIds ?? [],
  })
  desktop.setMenu(null) // rebuild the default menu
}

/** Window title follows the active session, like a real desktop app. */
export function updateDesktopTitle(sessionName?: string) {
  if (!desktop.isDesktop()) return
  desktop.setTitle(desktopTitle(sessionName))
}