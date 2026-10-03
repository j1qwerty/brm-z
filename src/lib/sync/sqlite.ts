/**
 * SQLite engine + persistence for the offline-first data layer.
 *
 * Browser: sql.js (SQLite compiled to WASM) kept in memory, persisted to
 * IndexedDB as one opaque byte snapshot, debounced. Phase 2's .NET app opens the
 * exact same bytes with Microsoft.Data.Sqlite.
 * Node (tests): same sql.js, persistence stubbed out.
 *
 * Why whole-file saves: it works in every browser with no COOP/COEP headers
 * (see sync.md §2.1). A school database is single-digit MB, so a debounced
 * snapshot is cheap; switching to the OPFS VFS later only touches this file.
 */
import type { Database, SqlJsStatic } from 'sql.js'
import { DDL, SCHEMA_VERSION } from './schema'

let SQL: SqlJsStatic | null = null
let db: Database | null = null
let persistence: Persistence | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let savingPromise: Promise<void> | null = null
let dirtySinceSave = false

const STORAGE_KEY = 'bmrc-sqlite-db-v1'
const SAVE_DEBOUNCE_MS = 1500

export interface Persistence {
  kind: 'idb' | 'memory'
  load(): Promise<Uint8Array | null>
  save(bytes: Uint8Array): Promise<void>
  remove(): Promise<void>
  keys(): Promise<string[]>
  get(key: string): Promise<Uint8Array | null>
  put(key: string, bytes: Uint8Array): Promise<void>
  delete(key: string): Promise<void>
}

// ---------------------------------------------------------------- persistence

function idbPersistence(): Persistence | null {
  if (typeof indexedDB === 'undefined') return null
  const open = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open('bmrc-sqlite', 1)
      req.onupgradeneeded = () => {
        const d = req.result
        if (!d.objectStoreNames.contains('files')) d.createObjectStore('files')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

  const tx = async <T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const d = await open()
    try {
      return await new Promise<T>((resolve, reject) => {
        const t = d.transaction('files', mode)
        const req = fn(t.objectStore('files'))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
    } finally {
      d.close()
    }
  }

  return {
    kind: 'idb',
    load: () => tx<unknown>('readonly', (s) => s.get(STORAGE_KEY) as IDBRequest<unknown>).then((v) => (v instanceof Uint8Array ? v : null)),
    save: async (bytes) => {
      await tx('readwrite', (s) => s.put(bytes, STORAGE_KEY))
    },
    remove: async () => {
      await tx('readwrite', (s) => s.delete(STORAGE_KEY))
    },
    keys: async () => {
      const d = await open()
      try {
        return await new Promise<string[]>((resolve, reject) => {
          const req = d.transaction('files', 'readonly').objectStore('files').getAllKeys()
          req.onsuccess = () => resolve(req.result.map(String))
          req.onerror = () => reject(req.error)
        })
      } finally {
        d.close()
      }
    },
    get: (key) => tx<unknown>('readonly', (s) => s.get(key) as IDBRequest<unknown>).then((v) => (v instanceof Uint8Array ? v : null)),
    put: async (key, bytes) => {
      await tx('readwrite', (s) => s.put(bytes, key))
    },
    delete: async (key) => {
      await tx('readwrite', (s) => s.delete(key))
    },
  }
}

function memoryPersistence(): Persistence {
  const map = new Map<string, Uint8Array>()
  return {
    kind: 'memory',
    load: async () => map.get(STORAGE_KEY) ?? null,
    save: async (b) => void map.set(STORAGE_KEY, b),
    remove: async () => void map.delete(STORAGE_KEY),
    keys: async () => [...map.keys()],
    get: async (k) => map.get(k) ?? null,
    put: async (k, b) => void map.set(k, b),
    delete: async (k) => void map.delete(k),
  }
}

// ---------------------------------------------------------------- lifecycle

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (SQL) return SQL
  // Dynamic import on purpose: under tsx/Node ESM the static default import of
  // this CJS package hands Emscripten a broken module shape and it then tries
  // to `import()` the .wasm as a module. Verified working in Node + Vite.
  const initSqlJs = (await import('sql.js')).default
  if (typeof window === 'undefined') {
    // Node (tests / scripts). Emscripten must be handed a file:// URL here —
    // a bare Windows path makes it treat the wasm as a module specifier.
    const nodeModule = 'node:module'
    const urlModule = 'node:url'
    const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as typeof import('node:module')
    const { pathToFileURL } = (await import(/* @vite-ignore */ urlModule)) as typeof import('node:url')
    const req = createRequire(import.meta.url)
    const file = req.resolve('sql.js/dist/sql-wasm.wasm')
    SQL = await initSqlJs({ locateFile: () => pathToFileURL(file).href })
  } else {
    const { default: wasmUrl } = await import('sql.js/dist/sql-wasm.wasm?url')
    SQL = await initSqlJs({ locateFile: () => wasmUrl })
  }
  return SQL
}

function hasColumn(d: Database, table: string, column: string): boolean {
  const res = d.exec(`PRAGMA table_info(${table})`)
  return res.length > 0 && res[0]!.values.some((row) => String(row[1]) === column)
}

function migrate(d: Database) {
  d.run(DDL)
  // v2: sync_state.detail (step notes must survive a reload / be visible after restart)
  if (!hasColumn(d, 'sync_state', 'detail')) {
    d.run('ALTER TABLE sync_state ADD COLUMN detail TEXT')
  }
  const current = Number(getMetaRaw(d, 'schema_version') ?? '0')
  if (current < SCHEMA_VERSION) {
    setMetaRaw(d, 'schema_version', String(SCHEMA_VERSION))
  }
}

/** Opens (or creates) the local database. Idempotent. */
export async function openDb(options?: { fresh?: boolean }): Promise<Database> {
  if (db && !options?.fresh) return db
  const sql = await loadSqlJs()
  persistence = idbPersistence() ?? memoryPersistence()
  let bytes: Uint8Array | null = null
  if (!options?.fresh) {
    try {
      bytes = await persistence.load()
    } catch (e) {
      console.warn('[sync] could not load local snapshot, starting empty:', e)
    }
  }
  db = bytes ? new sql.Database(bytes) : new sql.Database()
  migrate(db)
  if (options?.fresh) await persistence.remove()
  attachFlushHooks()
  return db
}

export function getDb(): Database {
  if (!db) throw new Error('SQLite not initialised - call openDb() first')
  return db
}

export function isOpen(): boolean {
  return db !== null
}

export function persistenceKind(): 'idb' | 'memory' | null {
  return persistence?.kind ?? null
}

export function closeDb() {
  db?.close()
  db = null
}

// ---------------------------------------------------------------- meta helpers

function getMetaRaw(d: Database, key: string): string | null {
  const res = d.exec(`SELECT value FROM meta WHERE key = '${key.replace(/'/g, "''")}'`)
  const row = res[0]?.values[0]
  return row ? String(row[0]) : null
}
function setMetaRaw(d: Database, key: string, value: string) {
  d.run(`INSERT INTO meta (key, value) VALUES ('${key.replace(/'/g, "''")}', '${value.replace(/'/g, "''")}') ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
}

export function getMeta(key: string): string | null {
  return getMetaRaw(getDb(), key)
}
export function setMeta(key: string, value: string) {
  setMetaRaw(getDb(), key, value)
  void scheduleSave()
}
export function getJsonMeta<T>(key: string, fallback: T): T {
  const raw = getMeta(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}
export function setJsonMeta(key: string, value: unknown) {
  setMeta(key, JSON.stringify(value))
}

/** Stable per-browser device id; also the LWW tie-breaker between devices. */
export function deviceId(): string {
  const existing = getMeta('device_id')
  if (existing) return existing
  const id = (globalThis.crypto?.randomUUID?.() ?? `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`)
  setMetaRaw(getDb(), 'device_id', id)
  return id
}

export function lamportNow(): number {
  const current = Number(getMeta('lamport') ?? '0')
  const next = current + 1
  setMetaRaw(getDb(), 'lamport', String(next))
  return next
}

export function observeLamport(remote: number) {
  const current = Number(getMeta('lamport') ?? '0')
  if (remote > current) setMetaRaw(getDb(), 'lamport', String(remote))
}

// ---------------------------------------------------------------- saving

export function markDirty() {
  dirtySinceSave = true
  void scheduleSave()
}

/** Debounced snapshot save. Safe to call after every mutation. */
export function scheduleSave(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer)
  return new Promise<void>((resolve) => {
    saveTimer = setTimeout(() => {
      void flush().then(resolve)
    }, SAVE_DEBOUNCE_MS)
  })
}

/** Writes the snapshot immediately; concurrent calls share one write. */
export function flush(): Promise<void> {
  if (savingPromise) return savingPromise
  if (!db || !persistence) return Promise.resolve()
  const bytes = db.export()
  savingPromise = persistence
    .save(bytes)
    .then(() => {
      dirtySinceSave = false
    })
    .catch((e) => console.warn('[sync] snapshot save failed:', e))
    .then(() => {
      savingPromise = null
    })
  return savingPromise
}

/** Force a snapshot now (used at the end of a sync run). */
export async function flushNow(): Promise<void> {
  await scheduleSavePromiseNow()
  await flush()
}

function scheduleSavePromiseNow(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  dirtySinceSave = true
  return Promise.resolve()
}

export function hasUnsavedChanges(): boolean {
  return dirtySinceSave
}

let hooksAttached = false
function attachFlushHooks() {
  if (hooksAttached || typeof document === 'undefined') return
  hooksAttached = true
  const flushNowSafe = () => {
    if (dirtySinceSave) void flush()
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNowSafe()
  })
  window.addEventListener('pagehide', flushNowSafe)
}

export function persistenceRef(): Persistence | null {
  return persistence
}

/** Replaces the whole database contents (used by Restore). */
export async function replaceDbBytes(bytes: Uint8Array): Promise<void> {
  const sql = await loadSqlJs()
  db?.close()
  db = new sql.Database(bytes)
  migrate(db)
  await flush()
}

export function exportDbBytes(): Uint8Array {
  return getDb().export()
}