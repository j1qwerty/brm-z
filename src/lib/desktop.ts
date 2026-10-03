/**
 * Desktop bridge — safe to import from the browser build.
 *
 * `window.bmrcDesktop` only exists inside Electron. Everything here degrades
 * gracefully so the same code runs in `pnpm dev`, on Netlify, and in the app.
 */
import type { DesktopApi, DesktopCommand, DesktopInfo, DesktopPaths } from '../../electron/preload'

declare global {
  interface Window {
    bmrcDesktop?: DesktopApi
  }
}

export const desktop = {
  isDesktop(): boolean {
    return typeof window !== 'undefined' && Boolean(window.bmrcDesktop)
  },
  api(): DesktopApi | null {
    return typeof window === 'undefined' ? null : window.bmrcDesktop ?? null
  },
  info(): Promise<DesktopInfo | null> {
    return window.bmrcDesktop?.info() ?? Promise.resolve(null)
  },
  paths(): Promise<DesktopPaths | null> {
    return window.bmrcDesktop?.info().then((i) => i?.paths ?? null) ?? Promise.resolve(null)
  },
  onCommand(handler: (command: DesktopCommand, payload?: unknown) => void): () => void {
    const api = window.bmrcDesktop
    if (!api) return () => {}
    return api.onCommand(handler)
  },
  setTitle(title: string) {
    void window.bmrcDesktop?.setTitle(title)
  },
  /** Keeps the native window chrome in step with the in-app theme. */
  setTheme(theme: 'light' | 'dark') {
    void window.bmrcDesktop?.setTheme(theme)
  },
  confirm(opts: { title: string; message: string; detail?: string; confirmLabel?: string; destructive?: boolean }) {
    return window.bmrcDesktop?.confirm(opts) ?? Promise.resolve({ ok: false })
  },
  saveFile(defaultName: string, bytes: Uint8Array) {
    return window.bmrcDesktop?.saveFile({ defaultName, bytes }) ?? Promise.resolve({ ok: false as const, canceled: true })
  },
  openPath(target: string) {
    return window.bmrcDesktop?.openPath(target) ?? Promise.resolve({ ok: false })
  },
  showItemInFolder(file: string) {
    return window.bmrcDesktop?.showItemInFolder(file) ?? Promise.resolve({ ok: false })
  },
  openBackupsFolder() {
    return window.bmrcDesktop?.openBackupsFolder() ?? Promise.resolve({ ok: false })
  },
  openDataFolder() {
    return window.bmrcDesktop?.openDataFolder() ?? Promise.resolve({ ok: false })
  },
  /** Persist / read the SQLite snapshot on disk (desktop only). */
  dbWrite(bytes: Uint8Array) {
    return window.bmrcDesktop?.dbWrite(bytes) ?? Promise.resolve({ ok: false })
  },
  dbRead() {
    return window.bmrcDesktop?.dbRead() ?? Promise.resolve({ ok: false, bytes: null })
  },
  setMenu(items: { label: string; command?: string; payload?: unknown; type?: string }[] | null) {
    window.bmrcDesktop?.setMenu(items)
  },
}

export type { DesktopCommand, DesktopInfo, DesktopPaths }