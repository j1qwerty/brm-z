/**
 * Preload — the only bridge between the Electron main process and the app.
 *
 * The renderer gets a small, explicit API. No `require`, no `ipcRenderer`, no
 * Node globals: the app runs in the same sandboxed context it uses in the
 * browser, so nothing that works in `pnpm dev` breaks in the desktop build.
 */
import { contextBridge, ipcRenderer } from 'electron'

export interface DesktopPaths {
  userData: string
  dbFile: string
  backupsDir: string
  logsDir: string
}

export interface DesktopInfo {
  version: string
  platform: string
  electron: string
  chrome: string
  node: string
  packaged: boolean
  paths: DesktopPaths
}

/** Commands the main process can ask the renderer to perform. */
export type DesktopCommand =
  | 'sync'
  | 'sync-retry-failed'
  | 'backup'
  | 'backup-export'
  | 'navigate'
  | 'palette'
  | 'toggle-sidebar'

const api = {
  isDesktop: true as const,

  info: (): Promise<DesktopInfo> => ipcRenderer.invoke('bmrc:info'),

  /** Persist the SQLite snapshot to the OS app-data folder. */
  dbWrite: (bytes: Uint8Array): Promise<{ ok: boolean; bytes?: number; error?: string }> =>
    ipcRenderer.invoke('bmrc:db:write', bytes),

  /** Read the on-disk snapshot (first launch / recovery). */
  dbRead: (): Promise<{ ok: boolean; bytes: Uint8Array | null; error?: string }> =>
    ipcRenderer.invoke('bmrc:db:read'),

  /** Named blobs (backups) as real files in the OS backups folder. */
  blobPut: (key: string, bytes: Uint8Array): Promise<{ ok: boolean; bytes?: number; error?: string }> =>
    ipcRenderer.invoke('bmrc:blob:put', key, bytes),

  blobGet: (key: string): Promise<{ ok: boolean; bytes: Uint8Array | null; error?: string }> =>
    ipcRenderer.invoke('bmrc:blob:get', key),

  blobDelete: (key: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('bmrc:blob:delete', key),

  blobKeys: (): Promise<{ ok: boolean; keys?: string[]; error?: string }> =>
    ipcRenderer.invoke('bmrc:blob:keys'),

  backupsList: (): Promise<{ ok: boolean; files?: { name: string; bytes: number; modifiedAt: number }[]; error?: string }> =>
    ipcRenderer.invoke('bmrc:backups:list'),

  openPath: (target: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('bmrc:shell:openPath', target),

  showItemInFolder: (file: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('bmrc:shell:showItemInFolder', file),

  /** Reveal the backups folder (desktop only; no-op in the browser). */
  openBackupsFolder: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('bmrc:shell:openBackups'),

  /** Reveal the folder holding the SQLite database. */
  openDataFolder: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('bmrc:shell:openData'),

  setTitle: (title: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('bmrc:window:setTitle', title),

  /** Mirror the in-app theme onto the native window chrome. */
  setTheme: (theme: 'light' | 'dark'): Promise<{ ok: boolean }> => ipcRenderer.invoke('bmrc:theme:set', theme),

  /** Native confirm dialog (used for destructive desktop-only actions). */
  confirm: (opts: { title: string; message: string; detail?: string; confirmLabel?: string; destructive?: boolean }) =>
    ipcRenderer.invoke('bmrc:dialog:confirm', opts),

  /** Native Save As, for exporting a backup outside the app. */
  saveFile: (opts: { defaultName: string; bytes: Uint8Array }) =>
    ipcRenderer.invoke('bmrc:dialog:saveFile', opts),

  /** Main -> renderer commands (sync, backup, navigate...). */
  onCommand: (handler: (command: DesktopCommand, payload?: unknown) => void) => {
    const listener = (_e: unknown, msg: { command: DesktopCommand; payload?: unknown }) => handler(msg.command, msg.payload)
    ipcRenderer.on('bmrc:command', listener)
    return () => ipcRenderer.removeListener('bmrc:command', listener)
  },

  /** Lets the renderer replace the native menu (role-aware menus). */
  setMenu: (items: { label: string; command?: string; payload?: unknown; type?: string }[] | null) =>
    ipcRenderer.send('bmrc:menu:set', items),
}

export type DesktopApi = typeof api

contextBridge.exposeInMainWorld('bmrcDesktop', api)