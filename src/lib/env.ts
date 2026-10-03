// App environment: development allows looser invariants for testing
// (e.g. multiple active sessions), production enforces them strictly.
// Set via `.env.local`: VITE_APP_ENV=development | production (default: development)

export const APP_ENV = (import.meta.env.VITE_APP_ENV as string | undefined) ?? 'development'

export const IS_PROD = APP_ENV === 'production'
