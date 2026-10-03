# BMRC Design System

> Source of truth for UI patterns. All paths under `src/`.
> Hard rules: Tailwind v4 CSS-first OKLCH themes (no hex in components), one `DataTable`,
> tabs not pages, `InfoTip` + tour + empty-state everywhere, `html2canvas-pro` never `html2canvas`.

## 1. Themes — Tailwind v4 CSS-first, OKLCH

**Files:**
- `src/styles/themes.css` — token definitions + `@theme inline` mapping + base layer
- `src/lib/themes.ts` — registry + `applyTheme()`

Four themes via `<html data-theme="light|dark|paper|ocean">`:

```ts
// src/lib/themes.ts
export const THEMES: ThemeDef[] = [
  { key: 'light', label: 'Light', hint: 'Clean neutral', swatch: 'linear-gradient(135deg,#f8fafc 50%,#0f766e 50%)' },
  { key: 'dark', label: 'Dark', hint: 'Dark gray, never black', swatch: 'linear-gradient(135deg,#23272e 50%,#5eead4 50%)' },
  { key: 'paper', label: 'Paper', hint: 'Warm sepia / cream', swatch: '...' },
  { key: 'ocean', label: 'Ocean', hint: 'Cool blue-tinted', swatch: '...' },
]
export function applyTheme(key: string) {
  document.documentElement.setAttribute('data-theme', key)
  localStorage.setItem('bmrc-theme', key)
}
```

Token block example (`src/styles/themes.css`):

```css
:root, [data-theme='light'] {
  --bg: oklch(0.975 0.004 95);
  --surface: oklch(0.995 0.002 95);
  --card: oklch(1 0 0);
  --border: oklch(0.902 0.006 95);
  --primary: oklch(0.52 0.085 195);
  --primary-soft: oklch(0.94 0.025 195);
  --success: oklch(0.58 0.12 155);
  --warning: oklch(0.66 0.13 75);
  --danger: oklch(0.55 0.18 27);
  --sidebar: oklch(0.965 0.005 95);
}
[data-theme='dark'] {
  --bg: oklch(0.185 0.005 260); /* dark gray, never pure black */
  --card: oklch(0.235 0.006 260);
  /* ... */
}
```

Mapped to Tailwind utilities via `@theme inline`:

```css
@theme inline {
  --color-background: var(--bg);
  --color-card: var(--card);
  --color-primary: var(--primary);
  --color-primary-soft: var(--primary-soft);
  --color-success-soft: var(--success-soft);
  /* ... sidebar, chart-1..5, ring */
  --radius-xl: 1rem;
  --shadow-xs: 0 1px 2px hsl(var(--shadow-color) / 0.06);
}
```

Usage: semantic classes only — `bg-card text-card-foreground border-border
bg-muted text-muted-foreground bg-primary-soft text-primary
bg-success-soft text-success`. Fonts: `Plus Jakarta Sans Variable` +
`JetBrains Mono Variable`; `.tabular` helper for numbers.

## 2. DataTable — the one table

**File:** `src/components/shared/DataTable.tsx` (TanStack Table v8).
All tables in the app use this component — do not fork it.

Wrapper (rounded corners + themed header):

```tsx
<div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border bg-muted/50">
```

Header cell + sort arrows:

```tsx
<th className={cn('px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap',
  header.column.getCanSort() && 'cursor-pointer select-none hover:text-foreground')}
  onClick={header.column.getToggleSortingHandler()}>
  <span className="inline-flex items-center gap-1">
    {flexRender(header.column.columnDef.header, header.getContext())}
    {header.column.getIsSorted() === 'asc' ? <ArrowUp className="size-3 text-primary" /> :
     header.column.getIsSorted() === 'desc' ? <ArrowDown className="size-3 text-primary" /> :
     <ArrowUpDown className="size-3 opacity-30" />}
```

Features: global search (`hideSearch`, `searchPlaceholder`), `FilterDef[]`
in a Popover with active-count Badge, column-visibility reset, CSV export
(`exportName`), row selection + `bulkActions` bar (`bg-primary-soft`),
`actions` column, `onRowClick`, loading `Skeleton` rows, compact
`EmptyState` on zero rows.

Pagination (footer: record count + page X of Y + page-size selector + prev/next):

```tsx
<Select value={String(table.getState().pagination.pageSize)} onValueChange={(v) => table.setPageSize(Number(v))}>
  <SelectTrigger className="h-8 w-[70px]"><SelectValue /></SelectTrigger>
  <SelectContent>{[10, 20, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}</SelectContent>
</Select>
<Button variant="outline" size="iconSm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}><ChevronLeft className="size-4" /></Button>
<Button variant="outline" size="iconSm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}><ChevronRight className="size-4" /></Button>
```

## 3. Buttons

**File:** `src/components/ui/button.tsx` (cva variants on a plain `<button>`)

```tsx
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors ...',
  { variants: {
    variant: {
      default: 'bg-primary text-primary-foreground shadow-xs hover:opacity-90',
      destructive: 'bg-danger text-white shadow-xs hover:opacity-90',
      outline: 'border border-border bg-card shadow-xs hover:bg-muted',
      secondary: 'bg-muted text-foreground shadow-xs hover:bg-accent',
      ghost: 'hover:bg-muted',
      soft: 'bg-primary-soft text-primary hover:brightness-97',
      link: 'text-primary underline-offset-4 hover:underline',
    },
    size: {
      default: 'h-9 px-4 py-2',
      sm: 'h-8 rounded-md px-3 text-xs',
      lg: 'h-10 px-6',
      icon: 'size-9',
      iconSm: 'size-8',
    },
  }})
```

Example: `<Button variant="outline" size="sm" className="gap-1.5"><Download className="size-3.5" /> CSV</Button>`

## 4. Inputs, Selects, Checkbox, Switch

**Files:** `src/components/ui/input.tsx`, `select.tsx`, `toggle.tsx`

Input/Textarea:

```tsx
'flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-2 ...'
```

Select (Radix): `SelectTrigger h-9 … border-input bg-card`,
`SelectContent z-50 rounded-lg border bg-popover shadow-md`,
`SelectItem focus:bg-muted`. Used for filters, page-size, layer-add.

Checkbox + Switch (Radix): `size-4 rounded border-input
data-[state=checked]:bg-primary`; Switch `h-5 w-9 rounded-full
data-[state=checked]:bg-primary`.

## 5. Cards, Badges, Avatar, misc display

**File:** `src/components/ui/display.tsx`

```tsx
// Card
'rounded-xl border border-border bg-card text-card-foreground shadow-xs'
CardHeader 'flex flex-col gap-1 p-5 pb-3'; CardContent 'p-5 pt-0'
// Badge variants
default: 'border-transparent bg-primary-soft text-primary',
neutral: 'border-border bg-muted text-muted-foreground',
success: 'border-transparent bg-success-soft text-success',
warning: '... bg-warning-soft text-warning',
danger: '... bg-danger-soft text-danger',
```

Also: `Tooltip` (Radix, `bg-foreground text-background`), `Skeleton
animate-pulse bg-muted`, `Separator bg-border`, `Avatar` (initials on
`bg-primary-soft`, image fallback), `Progress` (`bg-muted` track,
`bg-primary` bar).

## 6. Dialogs, Sheets, Confirm

**File:** `src/components/ui/dialog.tsx` (Radix Dialog + AlertDialog)

- `DialogContent`: `fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)]
  rounded-xl border bg-card p-6 shadow-lg max-h-[92dvh]`,
  `wide ? sm:max-w-2xl : sm:max-w-lg`, overlay `z-50 bg-black/45 backdrop-blur-[2px]`.
- `SheetContent`: right-side panel `fixed right-0 top-0 h-dvh border-l bg-card
  p-6`, widths `sm:max-w-md | sm:max-w-2xl (wide) | 95vw/1400px (xwide) |
  full-viewport (fullscreen)` — the template designer uses `fullscreen`.
- `ConfirmDialog`: AlertDialog, `max-w-md rounded-xl`, Cancel + destructive/default action.

## 7. Tabs + TabbedModule

Underline style, no boxes:

```tsx
TabsList 'flex w-full gap-1 overflow-x-auto border-b border-border pb-px text-muted-foreground'
TabsTrigger 'border-b-2 border-transparent px-3 py-2 text-sm font-medium ... data-[state=active]:border-primary data-[state=active]:text-foreground'
```

`TabbedModule` (`src/components/shared/TabbedModule.tsx`) enforces
"tabs, not pages": state lives in the URL (`/fees?tab=payments`),
auto-seeds `?tab=` on mount, optional count `Badge variant="neutral"`
per trigger.

## 8. Popover, DropdownMenu

**Files:** `src/components/ui/popover.tsx`, `dropdown-menu.tsx` (Radix)

Both `z-50 rounded-lg border bg-popover shadow-md`; Popover default
`w-72 p-4`; DropdownMenu `min-w-[11rem] p-1`, items `focus:bg-muted`,
destructive items `text-danger focus:bg-danger-soft`.

## 9. EmptyState, PageHeader + InfoTip, ImageUrlField

`EmptyState` (`src/components/shared/EmptyState.tsx`): centered `Inbox` icon
in `rounded-full bg-muted`, `compact ? py-6 : py-14`, `title / hint / action`
props. Used standalone and inside the DataTable zero-row.

`InfoTip` (`src/components/shared/PageHeader.tsx`): `CircleHelp size-4`
button → `PopoverContent w-80` with title + friendly copy. `PageHeader`:
`h1 text-xl font-bold tracking-tight` + optional `description text-sm
text-muted-foreground` + `actions` slot.

`ImageUrlField` (`src/components/shared/ImageUrlField.tsx`): external-URL only
(no Storage bucket by design), live `new Image()` validation, preview with
dimensions, optional 128px canvas shrink for avatars.

## 10. Tours

**File:** `src/components/shared/tour.tsx` (`driver.js`)

```ts
export function useModuleTour(tourId, steps, autoStart = true) // once per browser via localStorage `bmrc-tour-${id}`, 800ms delay
export function TourHelp({ tourId, steps }) // ghost icon button replays the tour
export function useWelcomeTour(role, steps)
```

Themed in `themes.css` (`.driver-popover` uses `bg-card`,
`border-border`, theme radius, muted description).

## 11. Template designer — dnd-kit + react-moveable

**Files:**
- `src/features/templates/TemplatesPage.tsx` (gallery + `Designer`)
- `src/features/templates/templateRenderer.tsx` (`TemplateCanvas` + `TemplateElementBox`)
- `src/lib/types.ts` (`TemplateElement`, `TemplateDoc`)
- `src/lib/pdf.ts` (`html2canvas-pro` + `jspdf` capture)

**Setup:** 6 kinds with fixed page px: `idcard-{student,teacher,staff}`
640×400, `receipt` 420×600, `reportcard` 800×1130, `certificate` 1000×700.
The gallery groups by kind; each card shows a scaled `TemplateCanvas`
preview + `default`/`custom` Badge + Design/delete actions. One `isDefault`
per kind drives all PDF output (`makeDefault()` clears the others).

**Model:**

```ts
// src/lib/types.ts
interface TemplateElement {
  id; type: 'photo' | 'name' | 'text' | 'class' | 'roll' | 'dob' | 'blood'
    | 'phone' | 'address' | 'qr' | 'watermark' | 'school' | 'extra';
  label; x; y; w; h;
  fontSize?; fontWeight?; color?; align?; bgColor?; borderRadius?
}
interface TemplateDoc extends BaseDoc {
  kind: 'idcard-student' | 'idcard-teacher' | 'idcard-staff'
    | 'receipt' | 'reportcard' | 'certificate';
  name; layoutJson: { page: { w; h }; elements }; images: { logo?; background?; extra1? }; isDefault
}
```

**How it works:**

1. `Designer` opens in a full-viewport `Sheet fullscreen`
   (`grid lg:grid-cols-[190px_1fr_230px]`): layers | canvas | properties.
2. Layers: `DndContext collisionDetection={closestCenter}` +
   `SortableContext` (vertical strategy) + `arrayMove` on `onDragEnd`;
   `SortableLayer` uses `useSortable({ id })` + `CSS.Transform`.
3. Canvas: `TemplateCanvas` renders `position:absolute` divs at `x/y/w/h`;
   interactive mode enables click-select + a ref map for Moveable targeting.
   Edit/preview toggle hides Moveable in preview.
4. Moveable: `<Moveable target={selectedNode} draggable resizable
   renderDirections={8 dirs} />`; `onDrag` live-moves the DOM node,
   `onDragEnd` / `onResizeEnd` commit rounded `x/y/w/h` via `patchSelected`.
5. Properties: numeric `x/y/w/h`, `fontSize`, `color type=color`, `align`
   select, `label`; `ImageUrlField` for `logo/background/extra1`.
6. Rendering (`templateRenderer.tsx`): element type → student/staff/receipt/
   certificate data with fallbacks; `photo` shows `photoUrl` or placeholder;
   `qr` embeds an async QR data URL; `school` prepends the logo image;
   `watermark` is centered 800-weight at 50% opacity.
7. Export: single via `elementToPdf`; bulk ID cards render off-screen and
  tile onto an A4 grid via `cardsGridToPdf`. Must stay on `html2canvas-pro` —
   the original `html2canvas` cannot parse OKLCH colors (`src/lib/pdf.ts`).
