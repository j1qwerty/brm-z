# Command Palette / Global Search

Global fuzzy search + navigation dialog. Built on `cmdk@^1.1.1` (`package.json`).

## Entry points

### 1. Search button (`src/app/AppShell.tsx` — `Topbar()`)

```tsx
<Button
  variant="outline" size="sm"
  className="gap-2 text-muted-foreground max-sm:size-8 max-sm:p-0"
  onClick={() => setPaletteOpen(true)}
>
  <Search className="size-3.5" />
  <span className="hidden sm:inline">Search everything</span>
  <kbd className="hidden rounded border border-border bg-muted px-1.5 font-mono text-[10px] sm:inline">Ctrl K</kbd>
</Button>
```

Icon-only on mobile (`max-sm:size-8`), label + `Ctrl K` hint on `sm+`.
State comes from zustand: `const { setSidebarOpen, setPaletteOpen } = useAppStore()`.

### 2. Global state (`src/lib/store.ts`)

```ts
paletteOpen: boolean
setPaletteOpen: (open: boolean) => void
// ...
paletteOpen: false,
setPaletteOpen: (open) => set({ paletteOpen: open }),
```

### 3. Mount (`src/app/AppShell.tsx`)

```tsx
<CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
```

Rendered once at the `AppShell` root, outside `<main>`.

## Keyboard shortcuts

| Shortcut | Where | Effect |
|---|---|---|
| `Ctrl+K` / `Cmd+K` | `AppShell.tsx` window `keydown` listener, `e.preventDefault()` + `setPaletteOpen(true)` | Opens palette from anywhere |
| `ESC` | explicit `Escape` listener + cmdk `onOpenChange`; `<kbd>ESC</kbd>` hint in dialog header | Closes palette |
| Type / ↑↓ / Enter | cmdk `Command` built-in (`shouldFilter`) | Fuzzy-filter, move selection, run `onSelect` |

```tsx
// AppShell.tsx
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
```

## How the palette is built (`src/app/CommandPalette.tsx`)

Stack: `react` + `cmdk` (`Command.Dialog/Input/List/Empty/Group/Item`) +
`react-router` `useNavigate` + `lucide-react` `Search` + `ALL_NAV_ITEMS` (`./nav`)
+ `useAuth`/`can` (capability gating) + `useList` (entity data).

Shell:

```tsx
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
    <Command.Input autoFocus placeholder="Search pages, students, staff..." className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
    <kbd className="rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">ESC</kbd>
  </div>
  <Command.List className="max-h-80 overflow-y-auto p-2">
    <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
      Nothing found. Try a page name or a student's name.
    </Command.Empty>
    {/* groups below */}
  </Command.List>
</Command.Dialog>
```

Navigation helper closes then routes:

```tsx
const go = (to: string) => {
  onOpenChange(false)
  navigate(to)
}
```

Nav items are pre-filtered by capability:

```tsx
const navItems = useMemo(() => ALL_NAV_ITEMS.filter((i) => can(user?.role, i.capability)), [user?.role])
```

## Full command list (`src/app/nav.ts` — `NAV` / `ALL_NAV_ITEMS`)

What you see is `ALL_NAV_ITEMS` (`NAV.flatMap(s => s.items)`) filtered by
`can(role, capability)`. The value searched by cmdk is `` `page ${label} ${keywords}` ``.

| Label | `to` | keywords |
|---|---|---|
| Dashboard | `/dashboard` | home stats charts |
| My Portal | `/portal` | parent student child |
| Sessions | `/sessions` | year promotion academic |
| Classes & Subjects | `/classes` | sections subjects teacher assignment |
| Timetable | `/timetable` | periods weekly schedule |
| Attendance | `/attendance` | register present absent |
| Calendar | `/calendar` | holidays events |
| Students | `/people?tab=students` | admission roll no csv bulk import |
| People | `/people` | students teachers staff parents |
| User Accounts | `/users` | approve roles suspend |
| Leaves | `/leaves` | apply approve sick casual |
| Fees | `/fees` | invoices payments receipts defaulters |
| Notices | `/notices` | announcements pinned |
| PTM | `/ptm` | parent teacher meeting slots |
| Messages | `/messages` | chat threads |
| Exams & Results | `/exams` | marks report cards publish |
| Certificates | `/certificates` | tc bonafide character |
| Templates | `/templates` | id card receipt designer |
| Bulk Contacts | `/tools/contacts` | sms whatsapp email list |
| Trash | `/trash` | restore deleted |
| School Settings | `/settings` | profile grading theme |

The sidebar shows the same matrix; the palette is the keyboard shortcut
to the same destinations.

## How entity search works

Gated on the `people.read` capability (roles: `admin`, `teacher`,
`accountant`, `staff` — `src/lib/permissions.ts`).

```tsx
const { data: students } = useList<StudentDoc>('students', undefined, { enabled: open && can(user?.role, 'people.read') })
const { data: staff } = useList<StaffDoc>('staff', undefined, { enabled: open && can(user?.role, 'people.read') })
```

- Lazy: `enabled: open && ...` means no Firestore/TanStack fetch until the
  dialog opens (`useList` is a thin `useQuery` over `dataProvider.list` —
  `src/lib/data/hooks.ts`).
- Students group (first 30): value is `` `student ${name} ${admissionNo}` ``,
  label shows `name` + right-aligned `admissionNo · Class …`;
  `onSelect` → `/people/${id}?tab=profile`.
- Staff group (first 20): value is `` `staff ${name} ${designation ?? ''}` ``,
  right-aligned `designation`; `onSelect` → `/people/${id}?kind=staff`.
- Groups render only when `can(...)` and the list is non-empty. Only the
  `students` + `staff` collections are searchable today — teachers appear
  via the Staff group (teachers are staff docs).
