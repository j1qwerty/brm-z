import { create } from 'zustand'

// Global UI state (server state lives in TanStack Query)
interface AppState {
  activeSessionId: string | null
  setActiveSession: (id: string) => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  activeSessionId: localStorage.getItem('bmrc-active-session'),
  setActiveSession: (id) => {
    localStorage.setItem('bmrc-active-session', id)
    set({ activeSessionId: id })
  },
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  paletteOpen: false,
  setPaletteOpen: (open) => set({ paletteOpen: open }),
}))
