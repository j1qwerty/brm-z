import { Suspense, useEffect, useMemo } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { ChevronDown, ChevronLeft, GraduationCap, LogOut, Menu, Moon, Search, Sun, Bell, CheckCheck, Monitor, Loader2 } from 'lucide-react'
import { navForRole } from './nav'
import { useAuth } from '@/lib/auth'
import { DEMO_MODE } from '@/lib/data'
import { useAppStore } from '@/lib/store'
import { useTheme } from './theme-provider'
import { THEMES } from '@/lib/themes'
import { ROLE_LABEL } from '@/lib/permissions'
import { useList, useUpdate } from '@/lib/data/hooks'
import { runGenerateOnOpen } from '@/lib/generate-on-open'
import { useGet } from '@/lib/data/hooks'
import type { NotificationDoc, SessionDoc, SchoolSettingsDoc } from '@/lib/types'
import { cn, fmtDateTime, initials } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge, Avatar, Separator } from '@/components/ui/display'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CommandPalette } from './CommandPalette'
import { DemoBanner } from './DemoBanner'

function useActiveSession(): SessionDoc | null | undefined {
  const { activeSessionId } = useAppStore()
  const { data: sessions } = useList<SessionDoc>('sessions', { where: [['deletedAt', '==', null]] })
  const found = useMemo(() => sessions?.find((s) => s.id === activeSessionId) ?? sessions?.find((s) => s.isActive) ?? null, [sessions, activeSessionId])
  return found
}

function Sidebar() {
  const { user } = useAuth()
  const { sidebarOpen, setSidebarOpen } = useAppStore()
  const sections = navForRole(user?.role)

  return (
    <>
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-20 flex w-60 flex-col border-r border-border bg-sidebar transition-transform duration-200 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-2.5 px-4 py-4">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight">BMRC</p>
            <p className="truncate text-xs text-muted-foreground">School Management</p>
          </div>
          <Button variant="ghost" size="iconSm" className="ml-auto lg:hidden" onClick={() => setSidebarOpen(false)}>
            <ChevronLeft className="size-4" />
          </Button>
        </div>
        <Separator />
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {sections.map((section) => (
            <div key={section.title} className="mb-3">
              <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {section.title}
              </p>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-sidebar-foreground transition-colors',
                      isActive
                        ? 'bg-sidebar-accent text-accent-foreground'
                        : 'hover:bg-muted',
                    )
                  }
                >
                  <item.icon className="size-4 shrink-0 opacity-80" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-border px-4 py-3">
          <p className="truncate text-xs text-muted-foreground">
            {DEMO_MODE ? 'Demo mode - local data only' : 'Connected to Firebase'}
          </p>
        </div>
      </aside>
    </>
  )
}

function NotificationBell() {
  const { user } = useAuth()
  const { data: notifications } = useList<NotificationDoc>(
    'notifications',
    user ? { where: [['userId', '==', user.id]], orderBy: ['createdAt', 'desc'], limit: 25 } : undefined,
    { enabled: Boolean(user) },
  )
  const update = useUpdate('notifications')
  const unread = (notifications ?? []).filter((n) => !n.readAt)
  const navigate = useNavigate()

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-4.5" />
          {unread.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4.5 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white tabular">
              {unread.length > 9 ? '9+' : unread.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {unread.length > 0 && (
            <Button
              variant="ghost" size="sm"
              onClick={() => unread.forEach((n) => update.mutate({ id: n.id, data: { readAt: Date.now() } }))}
              className="gap-1"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications === undefined ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> <span className="text-sm">Loading...</span>
            </div>
          ) : notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No notifications yet. Fee reminders, exam results and PTM bookings will appear here.
            </p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                className={cn(
                  'block w-full border-b border-border/60 px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted/50',
                  !n.readAt && 'bg-primary-soft/40',
                )}
                onClick={() => {
                  if (!n.readAt) update.mutate({ id: n.id, data: { readAt: Date.now() } })
                  if (n.link) navigate(n.link)
                }}
              >
                <p className="flex items-center gap-2 text-sm font-medium">
                  {!n.readAt && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />}
                  {n.title}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                <p className="mt-1 text-[11px] text-muted-foreground/70">{fmtDateTime(n.createdAt)}</p>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function SessionSwitcher() {
  const { user } = useAuth()
  const { activeSessionId, setActiveSession } = useAppStore()
  const { data: sessions } = useList<SessionDoc>('sessions', undefined, { enabled: user?.role === 'admin' || user?.role === 'accountant' })
  const visible = user?.role === 'admin' || user?.role === 'accountant'
  if (!visible || !sessions?.length) return null
  const current = sessions.find((s) => s.id === activeSessionId) ?? sessions.find((s) => s.isActive)
  return (
    <Select value={current?.id} onValueChange={setActiveSession}>
      <SelectTrigger className="h-8 w-36 text-xs" aria-label="Academic session">
        <SelectValue placeholder="Session" />
      </SelectTrigger>
      <SelectContent>
        {sessions.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name} {s.isActive ? '' : s.isCompleted ? '(completed)' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change theme">
          {theme === 'dark' ? <Moon className="size-4.5" /> : <Sun className="size-4.5" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        {THEMES.map((t) => (
          <DropdownMenuItem key={t.key} onClick={() => setTheme(t.key)} className="gap-2">
            <span className="size-4 rounded-full border border-border" style={{ background: t.swatch }} />
            {t.label}
            <span className="ml-auto text-xs text-muted-foreground">{t.hint}</span>
            {theme === t.key && <Badge variant="default" className="ml-1">on</Badge>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')}
          className="gap-2"
        >
          <Monitor className="size-4" /> Match system
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ProfileMenu() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  if (!user) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-muted" aria-label="Profile menu">
          <Avatar src={user.photoUrl} name={user.name} size={28} />
          <span className="hidden text-sm font-medium sm:inline">{user.name.split(' ')[0]}</span>
          <ChevronDown className="hidden size-3.5 opacity-60 sm:inline" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5">
          <p className="text-sm font-semibold">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <Badge variant="default" className="mt-1.5">{ROLE_LABEL[user.role]}</Badge>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/settings')} disabled={user.role !== 'admin'}>
          School settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onClick={() => signOut()}>
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Topbar() {
  const { setSidebarOpen, setPaletteOpen } = useAppStore()
  const loc = useLocation()
  const crumbs = loc.pathname.split('/').filter(Boolean)
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
        <Menu className="size-5" />
      </Button>
      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-sm text-muted-foreground md:flex">
        {crumbs.length === 0 ? (
          <span>Home</span>
        ) : (
          crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-border">/</span>}
              <span className={cn('capitalize', i === crumbs.length - 1 && 'font-medium text-foreground')}>
                {c === 'tools' ? '' : c.length > 18 ? `${c.slice(0, 18)}...` : c.replace(/-/g, ' ')}
              </span>
            </span>
          ))
        )}
      </nav>
      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant="outline" size="sm"
          className="gap-2 text-muted-foreground max-sm:size-8 max-sm:p-0"
          onClick={() => setPaletteOpen(true)}
        >
          <Search className="size-3.5" />
          <span className="hidden sm:inline">Search everything</span>
          <kbd className="hidden rounded border border-border bg-muted px-1.5 font-mono text-[10px] sm:inline">Ctrl K</kbd>
        </Button>
        <SessionSwitcher />
        <NotificationBell />
        <ThemeSwitcher />
        <ProfileMenu />
      </div>
    </header>
  )
}

export function AppShell() {
  const { user } = useAuth()
  const loc = useLocation()
  const session = useActiveSession()
  const { paletteOpen, setPaletteOpen } = useAppStore()
  const { data: settings } = useGet<SchoolSettingsDoc>('settings', 'school')

  // Ctrl/Cmd+K opens the command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setPaletteOpen])

  // Generate-on-open: idempotent scheduler (invoices, notice flips, exam transitions)
  useEffect(() => {
    if (!user || !session) return
    const key = `bmrc-run-${session.id}-${new Date().toISOString().slice(0, 13)}`
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')
    void runGenerateOnOpen(session)
  }, [user, session, loc.pathname])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [loc.pathname])

  if (!user) return null

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar />
      <div className="flex min-h-dvh flex-col lg:pl-60">
        <Topbar />
        {DEMO_MODE && <DemoBanner />}
        <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 sm:p-6">
          <Suspense
            fallback={
              <div className="flex items-center gap-2 py-20 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" /> Loading module...
              </div>
            }
          >
            <Outlet context={{ session, settings }} />
          </Suspense>
        </main>
        <footer className="border-t border-border px-6 py-3 text-center text-xs text-muted-foreground">
          {settings?.name ?? 'BMRC School'} · Signed in as {ROLE_LABEL[user.role]}
        </footer>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}

export { useActiveSession }

// Re-export commonly used bits so feature files can import from shell in a pinch
export { initials }
