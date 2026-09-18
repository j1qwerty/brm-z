import { isFirebaseConfigured } from '../firebase'
import type { DataProvider } from './provider'
import { firestoreProvider } from './firestore'
import { localProvider } from './local'

export const dataProvider: DataProvider = isFirebaseConfigured ? firestoreProvider : localProvider

export const DEMO_MODE = !isFirebaseConfigured

export type { DataProvider, QueryOpts } from './provider'
