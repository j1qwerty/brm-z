/**
 * Electron main process — BRM School Management desktop shell.
 *
 * Wraps the existing Vite build (no rewrite of the app) and adds the things a
 * desktop app is expected to have:
 *   - native application menu (File / Edit / View / Window / Help) wired to the
 *     app's own capabilities: sync now, push/pull only, backups, conflicts,
 *     open data folder, clear cache
 *   - a system tray with the same sync shortcuts + show/quit
 *   - real window state (remembered size/position/maximised)
 *   - background sync that keeps running when the window is hidden
 *   - the SQLite snapshot stored in the OS app-data folder (not IndexedDB), so
 *     backups live on disk where the user can find them
 *
 * Communication with the renderer is a tiny typed IPC bridge (preload.ts).
 * The renderer NEVER gets Node access.
 */
import { app, BrowserWindow, Menu, Tray, dialog, shell, ipcMain, nativeImage, nativeTheme, globalShortcut, clipboard } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, renameSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

// Bundled to CommonJS: __dirname is already `dist-electron`, so the preload and
// the built renderer sit next to it.
const __dirname_ = __dirname
/**
 * DEV loads the Vite server (hot reload). `BMRC_DESKTOP_DIST=1` forces the
 * built app instead, which is how the `file://` / hash-router path gets tested
 * without packaging a full installer.
 */
const FORCE_DIST = process.env.BMRC_DESKTOP_DIST === '1'
const DEV = !app.isPackaged && !FORCE_DIST
const VITE_URL = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5121'
// In a packaged app main.cjs sits at the app root, so the renderer is ./dist.
const RENDERER_DIST = app.isPackaged
  ? join(__dirname_, 'dist/index.html')
  : join(__dirname_, '../dist/index.html')
// Generated from public/favicon.svg by `pnpm icons`. Shipped as extraResources
// so the tray and window icons survive packaging.
const TRAY_ICON = join(__dirname_, 'tray.png')

// ---------------------------------------------------------------- single instance
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

// ---------------------------------------------------------------- paths

const userData = join(app.getPath('userData'), 'data')
const dbFile = join(userData, 'bmrc-local.sqlite')
const backupsDir = join(app.getPath('userData'), 'backups')

function ensureDirs() {
  for (const dir of [userData, backupsDir]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }
}

// ---------------------------------------------------------------- window state

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized: boolean
}
const stateFile = () => join(app.getPath('userData'), 'window-state.json')
function loadWindowState(): WindowState {
  const fallback: WindowState = { width: 1440, height: 900, maximized: true }
  try {
    const raw = readFileSync(stateFile(), 'utf8')
    return { ...fallback, ...(JSON.parse(raw) as Partial<WindowState>) }
  } catch {
    return fallback
  }
}
function saveWindowState(win: BrowserWindow) {
  if (!win || win.isDestroyed()) return
  const bounds = win.getNormalBounds()
  try {
    writeFileSync(stateFile(), JSON.stringify({ ...bounds, maximized: win.isMaximized() }))
  } catch {
    /* non-fatal */
  }
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

// ---------------------------------------------------------------- CSP

/**
 * The Content-Security-Policy for the packaged app.
 *
 * index.html carries a small inline script that applies the saved theme before
 * first paint. Rather than weakening script-src with 'unsafe-inline', we hash
 * whatever inline scripts the built index.html actually contains — so the CSP
 * keeps working (and stays strict) even when that script is edited.
 */
let cachedCsp: string | null = null
function csp(): string {
  if (cachedCsp) return cachedCsp
  const hashes: string[] = []
  try {
    const html = readFileSync(RENDERER_DIST, 'utf8')
    for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
      const code = match[1]
      if (!code.trim()) continue
      hashes.push(`'sha256-${createHash('sha256').update(code, 'utf8').digest('base64')}'`)
    }
  } catch (err) {
    console.error('[csp] could not read index.html for inline hashes:', err)
  }

  // 'wasm-unsafe-eval' (not 'unsafe-eval') because sql.js compiles its SQLite
// engine from WebAssembly at runtime. It permits WASM compilation only, so
// eval() and Function() stay blocked.
const scriptSrc = ["'self'", "'wasm-unsafe-eval'", ...hashes].join(' ')
  cachedCsp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // Vite injects styles at runtime; Tailwind's OKLCH custom properties are
    // set through a style attribute, which 'unsafe-inline' is required for.
    "style-src 'self' 'unsafe-inline'",
    // Images are external URLs by design (avatars, documents).
    "img-src 'self' data: blob: https: http:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.google-analytics.com https://securetoken.googleapis.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
  return cachedCsp
}

// ---------------------------------------------------------------- window

function createWindow() {
  const state = loadWindowState()
  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    // Matches the light theme so the window never flashes dark on launch.
    backgroundColor: '#ffffff',
    title: 'BRM School Management',
    icon: existsSync(join(__dirname_, 'icon.png')) ? join(__dirname_, 'icon.png') : undefined,
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname_, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  })

  if (state.maximized) mainWindow.maximize()

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // Save size/position as the user moves the window.
  mainWindow.on('resize', () => saveWindowState(mainWindow!))
  mainWindow.on('move', () => saveWindowState(mainWindow!))
  mainWindow.on('close', (e) => {
    saveWindowState(mainWindow!)
    // Closing to tray instead of quitting, unless the user really exits.
    if (!quitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // External links open in the real browser, never inside the app shell.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isDevServer = url.startsWith(VITE_URL)
    if (!isDevServer && !url.startsWith('file://')) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  // Surface renderer console/errors in the terminal: the desktop shell is the
  // only place a user can debug a packaged build. Only warnings and errors —
  // info/debug logging would drown the sync output.
  mainWindow.webContents.on('console-message', (event) => {
    const { level, message, lineNumber, sourceId } = event
    const quiet = level === 'warning' || level === 'error'
    if (quiet || process.env.BMRC_DEBUG) console.log(`[renderer] ${message} (${sourceId}:${lineNumber})`)
  })
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[renderer] process gone:', details.reason)
  })
  mainWindow.webContents.on('preload-error', (_e, preloadPath, error) => {
    console.error('[preload] failed to load:', preloadPath, error)
  })
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[renderer] failed to load:', code, desc, url)
  })

  if (DEV) {
    void mainWindow.loadURL(VITE_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    // Lock the packaged renderer down. Vite injects inline styles and the app
    // talks to Firebase over wss:, so those are the only extras needed.
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [csp()],
        },
      })
    })
    void mainWindow.loadFile(RENDERER_DIST)
  }
}

function showWindow() {
  if (!mainWindow) createWindow()
  if (mainWindow?.isMinimized()) mainWindow.restore()
  mainWindow?.show()
  mainWindow?.focus()
}

// ---------------------------------------------------------------- IPC: renderer -> main

/** Sends a command to the renderer (it owns the sync engine). */
function toRenderer(command: string, payload?: unknown) {
  mainWindow?.webContents.send('bmrc:command', { command, payload })
}

function pushPaths() {
  return {
    userData,
    dbFile,
    backupsDir,
    logsDir: join(app.getPath('userData'), 'logs'),
  }
}

ipcMain.handle('bmrc:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  packaged: app.isPackaged,
  paths: pushPaths(),
}))

/** The renderer hands over its SQLite snapshot; we write it to disk. */
ipcMain.handle('bmrc:db:write', (_e, bytes: Uint8Array) => {
  ensureDirs()
  try {
    // write to a temp file then rename: never leave a half-written DB on disk
    const tmp = `${dbFile}.tmp`
    writeFileSync(tmp, Buffer.from(bytes))
    if (existsSync(dbFile)) unlinkSync(dbFile)
    writeFileSync(dbFile, Buffer.from(bytes))
    if (existsSync(tmp)) unlinkSync(tmp)
    return { ok: true, bytes: bytes.length }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

/** On first launch we hand the renderer whatever snapshot exists on disk. */
ipcMain.handle('bmrc:db:read', () => {
  try {
    if (!existsSync(dbFile)) return { ok: true, bytes: null }
    return { ok: true, bytes: new Uint8Array(readFileSync(dbFile)) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('bmrc:backups:list', () => {
  ensureDirs()
  try {
    return {
      ok: true,
      files: readdirSync(backupsDir)
        .filter((f) => f.endsWith('.sqlite'))
        .map((f) => {
          const full = join(backupsDir, f)
          return { name: f, bytes: readFileSync(full).length, modifiedAt: Date.now() }
        }),
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// ---------------------------------------------------------------- IPC: blob store
//
// The persistence adapter needs a small key/value store besides the main
// database — that is where backups live. On desktop those become real files in
// the backups folder, so a backup is something the user can copy to a pen drive.

const blobsDir = join(app.getPath('userData'), 'backups')

/** Keys are renderer-controlled, so they are sanitised before touching disk. */
function safeBlobName(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9._-]/g, '_')
  if (!safe || safe === '.' || safe === '..') throw new Error('invalid key')
  return safe.endsWith('.sqlite') ? safe : `${safe}.sqlite`
}

ipcMain.handle('bmrc:blob:put', (_e, key: string, bytes: Uint8Array) => {
  ensureDirs()
  try {
    const file = join(blobsDir, safeBlobName(key))
    writeFileSync(`${file}.tmp`, Buffer.from(bytes))
    if (existsSync(file)) unlinkSync(file)
    renameSync(`${file}.tmp`, file)
    return { ok: true, bytes: bytes.length }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('bmrc:blob:get', (_e, key: string) => {
  try {
    const file = join(blobsDir, safeBlobName(key))
    if (!existsSync(file)) return { ok: true, bytes: null }
    return { ok: true, bytes: new Uint8Array(readFileSync(file)) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('bmrc:blob:delete', (_e, key: string) => {
  try {
    const file = join(blobsDir, safeBlobName(key))
    if (existsSync(file)) unlinkSync(file)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('bmrc:blob:keys', () => {
  ensureDirs()
  try {
    return { ok: true, keys: readdirSync(blobsDir).map((f) => f.replace(/\.sqlite$/, '')) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('bmrc:shell:openPath', (_e, target: string) => {
  const allowed = [userData, backupsDir]
  if (!allowed.some((p) => String(target).startsWith(p))) return { ok: false, error: 'path not allowed' }
  void shell.openPath(String(target))
  return { ok: true }
})

ipcMain.handle('bmrc:shell:showItemInFolder', (_e, file: string) => {
  if (!existsSync(file)) return { ok: false, error: 'not found' }
  shell.showItemInFolder(file)
  return { ok: true }
})

ipcMain.handle('bmrc:shell:openBackups', () => {
  ensureDirs()
  void shell.openPath(backupsDir)
  return { ok: true }
})

ipcMain.handle('bmrc:shell:openData', () => {
  ensureDirs()
  void shell.openPath(userData)
  return { ok: true }
})

ipcMain.handle('bmrc:window:setTitle', (_e, title: string) => {
  mainWindow?.setTitle(String(title || 'BRM School Management'))
  return { ok: true }
})

/** The renderer owns the theme; the native window chrome follows it. */
ipcMain.handle('bmrc:theme:set', (_e, theme: 'light' | 'dark') => {
  nativeTheme.themeSource = theme === 'dark' ? 'dark' : 'light'
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setBackgroundColor(theme === 'dark' ? '#14161a' : '#ffffff')
  }
  return { ok: true }
})

ipcMain.handle('bmrc:dialog:confirm', async (_e, opts: { title: string; message: string; detail?: string; confirmLabel?: string; destructive?: boolean }) => {
  const res = await dialog.showMessageBox(mainWindow!, {
    type: opts.destructive ? 'warning' : 'question',
    buttons: [opts.confirmLabel ?? 'Confirm', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: opts.title,
    message: opts.message,
    detail: opts.detail,
    noLink: true,
  })
  return { ok: res.response === 0 }
})

/** Native "Save as" for exporting a backup to disk. */
ipcMain.handle('bmrc:dialog:saveFile', async (_e, opts: { defaultName: string; bytes: Uint8Array }) => {
  const res = await dialog.showSaveDialog(mainWindow!, {
    title: 'Save backup',
    defaultPath: join(app.getPath('documents'), opts.defaultName),
    filters: [{ name: 'SQLite database', extensions: ['sqlite'] }],
  })
  if (res.canceled || !res.filePath) return { ok: false, canceled: true }
  writeFileSync(res.filePath, Buffer.from(opts.bytes))
  return { ok: true, path: res.filePath }
})

// ---------------------------------------------------------------- menus

function buildMenu(): Menu {
  const click = (command: string, payload?: unknown) => () => toRenderer(command, payload)

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '&BRM',
      submenu: [
        { label: 'About BRM', click: () => dialog.showMessageBox(mainWindow!, { type: 'info', message: 'BRM School Management', detail: `Version ${app.getVersion()}\nElectron ${process.versions.electron}\nChromium ${process.versions.chrome}`, buttons: ['OK'] }) },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: click('navigate', '/settings?tab=sync') },
        { label: 'Data Folder', click: () => void shell.openPath(userData) },
        { label: 'Backups Folder', click: () => void shell.openPath(backupsDir) },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { label: 'Hide BRM', accelerator: 'CmdOrCtrl+H', role: 'hide' },
        { label: 'Quit BRM', accelerator: 'CmdOrCtrl+Q', click: () => { quitting = true; app.quit() } },
      ],
    },
    {
      label: '&File',
      submenu: [
        { label: 'New Admission', accelerator: 'CmdOrCtrl+N', click: click('navigate', '/people?tab=students&new=1') },
        { label: 'Mark Attendance', accelerator: 'CmdOrCtrl+Shift+A', click: click('navigate', '/attendance') },
        { label: 'Collect Fee', accelerator: 'CmdOrCtrl+Shift+F', click: click('navigate', '/fees?tab=payments') },
        { type: 'separator' },
        { label: 'Back Up Now', accelerator: 'CmdOrCtrl+B', click: click('backup') },
        { label: 'Back Up and Export…', click: click('backup-export') },
        { label: 'Open Backups Folder', click: () => void shell.openPath(backupsDir) },
        { type: 'separator' },
        { label: 'Print / Save as PDF', accelerator: 'CmdOrCtrl+P', click: () => mainWindow?.webContents.print({ silent: false, printBackground: true }) },
        { type: 'separator' },
        { label: 'Reset Data…', click: click('navigate', '/settings?tab=storage') },
        { role: 'close' },
      ],
    },
    {
      label: '&Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find Anything', accelerator: 'CmdOrCtrl+K', click: click('palette') },
      ],
    },
    {
      label: '&View',
      submenu: [
        { label: 'Reload', accelerator: 'F5', click: () => mainWindow?.webContents.reload() },
        { label: 'Force Reload', accelerator: 'CmdOrCtrl+Shift+R', click: () => mainWindow?.webContents.reloadIgnoringCache() },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', click: click('toggle-sidebar') },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: '&Sync',
      submenu: [
        { label: 'Sync Now', accelerator: 'CmdOrCtrl+Shift+S', click: click('sync', 'full') },
        { label: 'Push Local Changes Only', click: click('sync', 'push') },
        { label: 'Pull from Server Only', click: click('sync', 'pull') },
        { type: 'separator' },
        { label: 'Retry Failed Step', click: click('sync-retry-failed') },
        { label: 'Sync Status…', click: click('navigate', '/settings?tab=sync') },
        { type: 'separator' },
        { label: 'Review Conflicts…', click: click('navigate', '/settings?tab=conflicts') },
        { label: 'Change History…', click: click('navigate', '/settings?tab=history') },
      ],
    },
    {
      label: '&Window',
      submenu: [
        { role: 'minimize' }, { role: 'zoom' }, { type: 'separator' },
        { role: 'close' },
        ...(process.platform === 'darwin'
          ? ([{ type: 'separator' }, { role: 'front' }] as Electron.MenuItemConstructorOptions[])
          : []),
      ],
    },
    {
      label: '&Help',
      submenu: [
        { label: 'Command Palette Shortcuts', click: click('palette') },
        { label: 'School Settings', click: click('navigate', '/settings') },
        { type: 'separator' },
        { label: 'Open Data Folder', click: () => void shell.openPath(userData) },
        {
          label: 'Copy Version Info',
          click: () => {
            const info = `BRM School Management ${app.getVersion()} · Electron ${process.versions.electron} · Chromium ${process.versions.chrome}`
            void clipboard.writeText(info)
            if (mainWindow) mainWindow.webContents.send('bmrc:command', { command: 'noop', payload: info })
          },
        },
      ],
    },
  ]

  return Menu.buildFromTemplate(template)
}

function buildTray(): Tray {
  const icon = nativeImage.createFromPath(TRAY_ICON)
  if (icon.isEmpty()) console.warn('[tray] tray.png missing — run `pnpm icons`')
  const t = new Tray(icon)
  t.setToolTip('BRM School Management')
  t.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open BRM', click: showWindow },
      { type: 'separator' },
      { label: 'Sync Now', click: () => toRenderer('sync', 'full') },
      { label: 'Sync Status', click: () => { showWindow(); toRenderer('navigate', '/settings?tab=sync') } },
      { label: 'Back Up Now', click: () => toRenderer('backup') },
      { type: 'separator' },
      { label: 'Quit', click: () => { quitting = true; app.quit() } },
    ]),
  )
  t.on('click', showWindow)
  return t
}

// ---------------------------------------------------------------- lifecycle

app.on('second-instance', showWindow)

app.whenReady().then(() => {
  ensureDirs()
  // The app owns its own theme (first launch is light), so keep the native
  // window chrome in step instead of following the OS preference.
  nativeTheme.themeSource = 'light'
  Menu.setApplicationMenu(buildMenu())
  createWindow()
  if (process.platform !== 'darwin') tray = buildTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else showWindow()
  })

  // Renderer asks for a menu rebuild when the user's role changes the surface.
  ipcMain.on('bmrc:menu:set', (_e, items: { label: string; command?: string; payload?: unknown; type?: string }[] | null) => {
    if (!items) {
      Menu.setApplicationMenu(buildMenu())
      return
    }
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(
        items.map((i) =>
          i.type === 'separator'
            ? { type: 'separator' }
            : { label: i.label, click: () => toRenderer(String(i.command ?? 'noop'), i.payload) },
        ),
      ),
    )
  })
})

app.on('before-quit', () => {
  quitting = true
  if (mainWindow) saveWindowState(mainWindow)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && quitting) app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  tray?.destroy()
})