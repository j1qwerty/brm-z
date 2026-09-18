import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

// The app runs in two modes:
//  - "firebase": full app against a real Firebase project (env vars configured in .env.local)
//  - "demo": in-browser demo with seeded data in localStorage, so `pnpm dev` works
//    before Firebase is connected. See README "Firebase setup".
export const isFirebaseConfigured = Boolean(cfg.apiKey && cfg.projectId && cfg.appId)

let app: FirebaseApp | null = null
let authInstance: Auth | null = null
let dbInstance: Firestore | null = null

export function getFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore } | null {
  if (!isFirebaseConfigured) return null
  if (!app) {
    app = getApps()[0] ?? initializeApp(cfg as Record<string, string>)
    authInstance = getAuth(app)
    dbInstance = getFirestore(app)
  }
  return { app, auth: authInstance!, db: dbInstance! }
}

export const googleProvider = new GoogleAuthProvider()
