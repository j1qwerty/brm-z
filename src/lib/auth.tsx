import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup,
  signOut as fbSignOut, onAuthStateChanged, updateProfile,
} from 'firebase/auth'
import { getFirebase, googleProvider } from './firebase'
import { dataProvider, DEMO_MODE } from './data/index'
import { ensureOwnUserDoc } from './sync/userBootstrap'
import type { UserDoc, Role } from './types'

type AuthState = 'booting' | 'signedOut' | 'pending' | 'active'

interface AuthContextValue {
  status: AuthState
  user: UserDoc | null
  mode: 'firebase' | 'demo'
  signInEmail: (email: string, password: string) => Promise<void>
  signUpEmail: (name: string, email: string, password: string, role: Role) => Promise<void>
  signInGoogle: (role?: Role) => Promise<void>
  signOut: () => Promise<void>
  // demo-mode helpers
  demoAccounts: { id: string; name: string; email: string; role: Role }[]
  demoLogin: (userId: string) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const DEMO_SESSION_KEY = 'bmrc-demo-session'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState>('booting')
  const [user, setUser] = useState<UserDoc | null>(null)
  const [demoAccounts, setDemoAccounts] = useState<AuthContextValue['demoAccounts']>([])

  // ---------- demo mode ----------
  const loadDemoUser = useCallback(async (uid: string | null) => {
    if (!uid) {
      setUser(null)
      setStatus('signedOut')
      return
    }
    const doc = await dataProvider.get<UserDoc>('users', uid)
    if (!doc) {
      setUser(null)
      setStatus('signedOut')
      return
    }
    setUser(doc)
    setStatus(doc.status === 'active' ? 'active' : doc.status === 'pending' ? 'pending' : 'signedOut')
  }, [])

  useEffect(() => {
    if (DEMO_MODE) {
      const accounts = [
        { id: 'u-admin', name: 'Ramesh Gupta', email: 'admin@bmrc.demo', role: 'admin' as Role },
        { id: 'u-teacher', name: 'Sunita Sharma', email: 'teacher@bmrc.demo', role: 'teacher' as Role },
        { id: 'u-accountant', name: 'Prakash Rao', email: 'accountant@bmrc.demo', role: 'accountant' as Role },
        { id: 'u-staff', name: 'Venkatesh Yadav', email: 'staff@bmrc.demo', role: 'staff' as Role },
        { id: 'u-student', name: 'Aarav Sharma', email: 'student@bmrc.demo', role: 'student' as Role },
        { id: 'u-parent', name: 'Meera Sharma', email: 'parent@bmrc.demo', role: 'parent' as Role },
      ]
      setDemoAccounts(accounts)
      const saved = localStorage.getItem(DEMO_SESSION_KEY)
      void loadDemoUser(saved).finally(() => {
        if (!saved) setStatus('signedOut')
      })
      return
    }

    const { auth } = getFirebase()!
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null)
        setStatus('signedOut')
        return
      }
      try {
        // Local-first, except for our own profile: a fresh device has no local
        // users/{uid} yet, and a stale copy can still read "pending" after an
        // admin approved it elsewhere. ensureOwnUserDoc() falls back to the
        // server and adopts the authoritative doc locally.
        let doc = await ensureOwnUserDoc(fbUser.uid)
        if (!doc) {
          // Genuinely new sign-in: create a pending users doc (role set via complete-profile screen)
          doc = {
            id: fbUser.uid,
            name: fbUser.displayName ?? (fbUser.email?.split('@')[0] ?? 'New user'),
            email: fbUser.email ?? '',
            photoUrl: fbUser.photoURL ?? undefined,
            role: 'student',
            status: 'pending',
          }
          await dataProvider.create('users', { ...doc }, fbUser.uid)
          doc = await dataProvider.get<UserDoc>('users', fbUser.uid)
        }
        setUser(doc)
        setStatus(doc?.status === 'active' ? 'active' : doc?.status === 'pending' ? 'pending' : 'signedOut')
      } catch (e) {
        console.error('Failed loading users doc', e)
        setUser(null)
        setStatus('signedOut')
      }
    })
    return unsub
  }, [loadDemoUser])

  const signInEmail = useCallback(async (email: string, password: string) => {
    if (DEMO_MODE) {
      const found = (await dataProvider.list<UserDoc>('users', { where: [['email', '==', email]] }))[0]
      if (!found) throw new Error('No demo account with that email. Try the one-tap buttons below.')
      localStorage.setItem(DEMO_SESSION_KEY, found.id)
      await loadDemoUser(found.id)
      return
    }
    const { auth } = getFirebase()!
    await signInWithEmailAndPassword(auth, email, password)
  }, [loadDemoUser])

  const signUpEmail = useCallback(async (name: string, email: string, password: string, role: Role) => {
    if (DEMO_MODE) {
      const existing = await dataProvider.list<UserDoc>('users', { where: [['email', '==', email]] })
      if (existing.length) throw new Error('An account with this email already exists in the demo data.')
      const id = await dataProvider.create('users', { name, email, role, status: 'pending' })
      localStorage.setItem(DEMO_SESSION_KEY, id)
      await loadDemoUser(id)
      return
    }
    const { auth } = getFirebase()!
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(cred.user, { displayName: name })
    await dataProvider.create('users', { name, email, role, status: 'pending' }, cred.user.uid)
  }, [loadDemoUser])

  const signInGoogle = useCallback(async (role?: Role) => {
    if (DEMO_MODE) throw new Error('Google sign-in needs Firebase. Use the demo accounts below.')
    const { auth } = getFirebase()!
    const cred = await signInWithPopup(auth, googleProvider)
    const existing = await dataProvider.get<UserDoc>('users', cred.user.uid)
    if (!existing) {
      await dataProvider.create('users', {
        name: cred.user.displayName ?? cred.user.email?.split('@')[0] ?? 'New user',
        email: cred.user.email ?? '',
        photoUrl: cred.user.photoURL ?? undefined,
        role: role ?? 'student',
        status: 'pending',
      }, cred.user.uid)
    }
  }, [])

  const signOut = useCallback(async () => {
    if (DEMO_MODE) {
      localStorage.removeItem(DEMO_SESSION_KEY)
      setUser(null)
      setStatus('signedOut')
      return
    }
    const { auth } = getFirebase()!
    await fbSignOut(auth)
  }, [])

  const demoLogin = useCallback((userId: string) => {
    localStorage.setItem(DEMO_SESSION_KEY, userId)
    void loadDemoUser(userId)
  }, [loadDemoUser])

  return (
    <AuthContext.Provider
      value={{ status, user, mode: DEMO_MODE ? 'demo' : 'firebase', signInEmail, signUpEmail, signInGoogle, signOut, demoAccounts, demoLogin }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
