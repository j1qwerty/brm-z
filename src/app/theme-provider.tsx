import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { THEMES, applyTheme } from '@/lib/themes'

interface ThemeCtx {
  theme: string
  setTheme: (t: string) => void
}

const Ctx = createContext<ThemeCtx>({ theme: 'light', setTheme: () => {} })

function initial(): string {
  const saved = localStorage.getItem('bmrc-theme')
  if (saved && THEMES.some((t) => t.key === saved)) return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<string>(initial)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  return <Ctx.Provider value={{ theme, setTheme: setThemeState }}>{children}</Ctx.Provider>
}

export function useTheme() {
  return useContext(Ctx)
}
