import { useMemo, useRef, useState, type ReactNode } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Search, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/toggle'
import { Badge, Skeleton } from '@/components/ui/display'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn, downloadCsv } from '@/lib/utils'
import { EmptyState } from './EmptyState'

export interface FilterDef {
  id: string
  label: string
  options: { label: string; value: string }[]
}

export interface BulkAction<T> {
  label: string
  icon?: ReactNode
  variant?: 'default' | 'outline' | 'destructive' | 'soft'
  onClick: (selected: T[]) => void
}

export interface DataTableProps<T> {
  data: T[] | undefined
  loading?: boolean
  columns: ColumnDef<T, unknown>[]
  searchPlaceholder?: string
  filters?: FilterDef[]
  filterValues?: Record<string, string>
  onFilterChange?: (id: string, value: string) => void
  actions?: (row: T) => ReactNode
  bulkActions?: BulkAction<T>[]
  exportName?: string
  toolbarExtra?: ReactNode
  emptyTitle?: string
  emptyHint?: string
  emptyAction?: ReactNode
  onRowClick?: (row: T) => void
  pageSize?: number
  hideSearch?: boolean
}

export function DataTable<T extends { id: string }>({
  data,
  loading,
  columns,
  searchPlaceholder = 'Search...',
  filters = [],
  filterValues = {},
  onFilterChange,
  actions,
  bulkActions = [],
  exportName,
  toolbarExtra,
  emptyTitle = 'Nothing here yet',
  emptyHint,
  emptyAction,
  onRowClick,
  pageSize = 10,
  hideSearch,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState({})
  const tableRef = useRef<HTMLDivElement>(null)

  const tableColumns = useMemo<ColumnDef<T, unknown>[]>(() => {
    const cols: ColumnDef<T, unknown>[] = []
    if (bulkActions.length) {
      cols.push({
        id: '__select',
        size: 36,
        enableSorting: false,
        enableHiding: false,
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
            aria-label="Select all rows on this page"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            aria-label="Select row"
            onClick={(e) => e.stopPropagation()}
          />
        ),
      })
    }
    cols.push(...columns)
    if (actions) {
      cols.push({
        id: '__actions',
        size: 60,
        enableSorting: false,
        enableHiding: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
            {actions(row.original)}
          </div>
        ),
      })
    }
    return cols
  }, [columns, actions, bulkActions.length])

  const table = useReactTable({
    data: data ?? [],
    columns: tableColumns,
    state: { sorting, globalFilter, columnFilters, columnVisibility, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
    globalFilterFn: 'includesString',
  })

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original)

  const exportCsv = () => {
    const cols = table.getVisibleLeafColumns().filter((c) => c.id !== '__select' && c.id !== '__actions')
    const rows: (string | number | null | undefined)[][] = [
      cols.map((c) => (typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id)),
      ...(table.getFilteredRowModel().rows.map((row) =>
        cols.map((c) => {
          const cell = row.getAllCells().find((cell0) => cell0.column.id === c.id)
          const v = cell?.getValue()
          if (v === null || v === undefined || typeof v === 'object') return ''
          return String(v)
        }),
      ) ?? []),
    ]
    downloadCsv(`${exportName ?? 'export'}-${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }

  const hasFilters = filters.length > 0
  const activeFilterCount = Object.values(filterValues).filter((v) => v && v !== 'all').length

  return (
    <div className="flex flex-col gap-3" ref={tableRef}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {!hideSearch && (
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-8"
            />
          </div>
        )}

        {hasFilters && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <SlidersHorizontal className="size-3.5" />
                More filters
                {activeFilterCount > 0 && (
                  <Badge variant="default" className="ml-0.5 h-4 px-1.5 text-[10px]">{activeFilterCount}</Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filters</p>
              {filters.map((f) => (
                <div key={f.id} className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                  <Select
                    value={filterValues[f.id] ?? 'all'}
                    onValueChange={(v) => onFilterChange?.(f.id, v)}
                  >
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {f.options.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              {activeFilterCount > 0 && (
                <Button
                  variant="ghost" size="sm" className="w-full"
                  onClick={() => filters.forEach((f) => onFilterChange?.(f.id, 'all'))}
                >
                  <X className="size-3.5" /> Clear all
                </Button>
              )}
            </PopoverContent>
          </Popover>
        )}

        {toolbarExtra}

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => table.setColumnVisibility({})} title="Reset column visibility">
            Columns
          </Button>
          {exportName && (
            <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5">
              <Download className="size-3.5" /> CSV
            </Button>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {bulkActions.length > 0 && selectedRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary-soft px-3 py-2 animate-in">
          <span className="text-sm font-medium text-primary">{selectedRows.length} selected</span>
          {bulkActions.map((a, i) => (
            <Button
              key={i}
              size="sm"
              variant={a.variant ?? 'outline'}
              onClick={() => a.onClick(selectedRows)}
              className="gap-1.5"
            >
              {a.icon}
              {a.label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setRowSelection({})}>
            <X className="size-3.5" /> Clear
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-border bg-muted/50">
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className={cn(
                        'px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap',
                        header.column.getCanSort() && 'cursor-pointer select-none hover:text-foreground',
                      )}
                      style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <span className="inline-flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          header.column.getIsSorted() === 'asc' ? <ArrowUp className="size-3 text-primary" /> :
                          header.column.getIsSorted() === 'desc' ? <ArrowDown className="size-3 text-primary" /> :
                          <ArrowUpDown className="size-3 opacity-30" />
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/60">
                    {table.getVisibleLeafColumns().map((c) => (
                      <td key={c.id} className="px-3 py-3">
                        <Skeleton className="h-4 w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={table.getVisibleLeafColumns().length} className="px-3 py-10">
                    <EmptyState title={emptyTitle} hint={emptyHint} action={emptyAction} compact />
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    data-state={row.getIsSelected() ? 'selected' : undefined}
                    className={cn(
                      'border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40',
                      row.getIsSelected() && 'bg-primary-soft/50',
                      onRowClick && 'cursor-pointer',
                    )}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2.5 align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && table.getFilteredRowModel().rows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2.5">
            <p className="text-xs text-muted-foreground tabular">
              {table.getFilteredRowModel().rows.length} record{table.getFilteredRowModel().rows.length === 1 ? '' : 's'}
              {' · '}page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}
            </p>
            <div className="flex items-center gap-1.5">
              <Select
                value={String(table.getState().pagination.pageSize)}
                onValueChange={(v) => table.setPageSize(Number(v))}
              >
                <SelectTrigger className="h-8 w-[70px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[10, 20, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="iconSm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="outline" size="iconSm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
