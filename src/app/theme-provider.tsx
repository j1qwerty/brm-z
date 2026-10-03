import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { THEMES, applyTheme } from '@/lib/themes'
import { desktop } from '@/lib/desktop'

interface ThemeCtx {
  theme: string
  setTheme: (t: string) => void
}

const Ctx = createContext<ThemeCtx>({ theme: 'light', setTheme: () => {} })

/**
 * First launch defaults to light — never to the machine's OS preference. Office
 * PCs and projectors are shared machines, and inheriting a dark OS theme made
 * the first run look broken. Once the user picks a theme it is remembered.
 */
function initial(): string {
  const saved = localStorage.getItem('bmrc-theme')
  if (saved && THEMES.some((t) => t.key === saved)) return saved
  return 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<string>(initial)

  useEffect(() => {
    applyTheme(theme)
    // Desktop only: keep the window chrome (title bar, shadows) in step. No-op
    // in the browser build.
    desktop.setTheme(theme === 'dark' ? 'dark' : 'light')
  }, [theme])

  return <Ctx.Provider value={{ theme, setTheme: setThemeState }}>{children}</Ctx.Provider>
}

export function useTheme() {
  return useContext(Ctx)
}
