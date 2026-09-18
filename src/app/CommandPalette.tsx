import { useEffect, useMemo } from 'react'
import { Command } from 'cmdk'
import { useNavigate } from 'react-router'
import { Search } from 'lucide-react'
import { ALL_NAV_ITEMS } from './nav'
import { useAuth } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { useList } from '@/lib/data/hooks'
import type { StudentDoc, StaffDoc } from '@/lib/types'

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useAuth()
  const navigate = useNavigate()

  const { data: students } = useList<StudentDoc>('students', undefined, { enabled: open && can(user?.role, 'people.read') })
  const { data: staff } = useList<StaffDoc>('staff', undefined, { enabled: open && can(user?.role, 'people.read') })

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onOpenChange(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  const navItems = useMemo(() => ALL_NAV_ITEMS.filter((i) => can(user?.role, i.capability)), [user?.role])

  const go = (to: string) => {
    onOpenChange(false)
    navigate(to)
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Global command palette"
      className="fixed left-1/2 top-[15vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
      overlayClassName="fixed inset-0 z-40 bg-black/45"
      shouldFilter
    >
      <div className="flex items-center gap-2 border-b border-border px-4">
        <Search className="size-4 text-muted-foreground" />
        <Command.Input
          autoFocus
          placeholder="Search pages, students, staff..."
          className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <kbd className="rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">ESC</kbd>
      </div>
      <Command.List className="max-h-80 overflow-y-auto p-2">
        <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
          Nothing found. Try a page name or a student's name.
        </Command.Empty>

        <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground">
          {navItems.map((item) => (
            <Command.Item
              key={item.to}
              value={`page ${item.label} ${item.keywords ?? ''}`}
              onSelect={() => go(item.to)}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm data-[selected=true]:bg-muted"
            >
              <item.icon className="size-4 opacity-70" />
              {item.label}
            </Command.Item>
          ))}
        </Command.Group>

        {can(user?.role, 'people.read') && students && students.length > 0 && (
          <Command.Group heading="Students" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground">
            {students.slice(0, 30).map((s) => (
              <Command.Item
                key={s.id}
                value={`student ${s.name} ${s.admissionNo}`}
                onSelect={() => go(`/people/${s.id}?tab=profile`)}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm data-[selected=true]:bg-muted"
              >
                {s.name}
                <span className="ml-auto text-xs text-muted-foreground">
                  {s.admissionNo} · Class {s.classId.replace('c-', '')}-{s.section}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {can(user?.role, 'people.read') && staff && staff.length > 0 && (
          <Command.Group heading="Staff" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground">
            {staff.slice(0, 20).map((s) => (
              <Command.Item
                key={s.id}
                value={`staff ${s.name} ${s.designation ?? ''}`}
                onSelect={() => go(`/people/${s.id}?kind=staff`)}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm data-[selected=true]:bg-muted"
              >
                {s.name}
                <span className="ml-auto text-xs text-muted-foreground">{s.designation}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  )
}
