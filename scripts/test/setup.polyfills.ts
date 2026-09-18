/**
 * Polyfills for running brm-z source modules in pure Node (no Vite, no browser).
 *
 * Loaded once at the very top of the test runner. Defines `import.meta.env`
 * so that `src/lib/firebase.ts` doesn't crash, and a `localStorage` shim
 * so `src/lib/data/local.ts` doesn't throw if it ever gets pulled in.
 */

// --- import.meta.env polyfill ---
// Vite normally injects `import.meta.env` at build time. In Node, it doesn't
// exist. We provide a minimal shape so `src/lib/firebase.ts` is happy:
//
//   const cfg = { apiKey: import.meta.env.VITE_FIREBASE_API_KEY, ... }
//   const isFirebaseConfigured = Boolean(cfg.apiKey && cfg.projectId && cfg.appId)
//
// We deliberately leave all VITE_FIREBASE_* fields undefined, so
// `isFirebaseConfigured === false`, which means the app picks the
// localProvider / demo mode - exactly what the tests want.

interface ImportMetaEnv {
  VITE_FIREBASE_API_KEY?: string
  VITE_FIREBASE_AUTH_DOMAIN?: string
  VITE_FIREBASE_PROJECT_ID?: string
  VITE_FIREBASE_STORAGE_BUCKET?: string
  VITE_FIREBASE_MESSAGING_SENDER_ID?: string
  VITE_FIREBASE_APP_ID?: string
  DEV?: boolean
  PROD?: boolean
  MODE?: string
  BASE_URL?: string
}

interface ImportMetaWithEnv {
  env: ImportMetaEnv
}

const meta = import.meta as unknown as ImportMetaWithEnv
if (!meta.env) {
  Object.defineProperty(meta, 'env', {
    value: {
      DEV: true,
      PROD: false,
      MODE: 'test',
      BASE_URL: '/',
    } satisfies ImportMetaEnv,
    writable: true,
    enumerable: true,
    configurable: true,
  })
}

// --- localStorage polyfill ---
// `src/lib/data/local.ts` does `localStorage.getItem(...)`. It's only loaded
// when `isFirebaseConfigured === false` (which is true in tests). Even though
// the in-memory provider doesn't use localStorage, the localProvider module
// evaluates at import time when the index module loads. Provide a safe shim
// so the import chain doesn't crash.

class LocalStorageShim {
  private store = new Map<string, string>()
  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  clear(): void {
    this.store.clear()
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }
  get length(): number {
    return this.store.size
  }
}

const ls = new LocalStorageShim()
const g = globalThis as unknown as { localStorage?: LocalStorageShim; window?: unknown }
if (!g.localStorage) {
  g.localStorage = ls
  if (!g.window) {
    g.window = { localStorage: ls }
  } else if (typeof g.window === 'object') {
    (g.window as Record<string, unknown>).localStorage = ls
  }
}

export {}
