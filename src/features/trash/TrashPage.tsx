import { useMemo, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardContent, Avatar, Skeleton } from '@/components/ui/display'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DataTable } from '@/components/shared/DataTable'
import { dataProvider, DEMO_MODE } from '@/lib/data'
import type { BaseDoc } from '@/lib/types'
import { fmtDateTime } from '@/lib/utils'

const LABELS: Record<string, string> = {
  users: 'User accounts', sessions: 'Sessions', classes: 'Classes', 'classes/{cid}/subjects': 'Subjects',
  assignments: 'Assignments', students: 'Students', staff: 'Staff', attendance: 'Attendance',
  feeTypes: 'Fee types', feeAssignments: 'Fee assignments', invoices: 'Invoices', payments: 'Payments',
  exams: 'Exams', marks: 'Marks', templates: 'Templates', certificates: 'Certificates',
  notices: 'Notices', calendarEvents: 'Calendar events', timetable: 'Timetable slots', leaves: 'Leaves',
}

interface TrashRow extends BaseDoc {
  _collection: string
  _label: string
}

export default function TrashPage() {
  const [collection, setCollection] = useState('students')
  const [rows, setRows] = useState<TrashRow[] | undefined>(undefined)
  const [loading, setLoading] = useState(false)

  const load = async (col: string) => {
    setLoading(true)
    try {
      const deleted = (await dataProvider.listDeleted(col)) as Record<string, unknown>[]
      setRows(
        deleted.map((d) => ({
          ...(d as object),
          id: String(d.id),
          _collection: col,
          _label: String(d.name ?? d.title ?? d.id),
        })) as TrashRow[],
      )
    } finally {
      setLoading(false)
    }
  }

  useState(() => {
    void load(collection)
  })

  const restore = async (row: TrashRow) => {
    await dataProvider.restore(row._collection, row.id)
    toast.success(`Restored "${row._label}"`)
    void load(collection)
  }

  const columns = useMemo(
    () => [
      {
        id: 'label',
        header: 'Record',
        accessorFn: (r: TrashRow) => r._label,
        cell: ({ row }: { row: { original: TrashRow } }) => (
          <div className="flex items-center gap-2.5">
            <Avatar name={row.original._label} size={28} />
            <div>
              <p className="font-medium">{row.original._label}</p>
              <p className="text-xs text-muted-foreground">{LABELS[row.original._collection] ?? row.original._collection}</p>
            </div>
          </div>
        ),
      },
      {
        id: 'deletedAt',
        header: 'Deleted',
        accessorFn: (r: TrashRow) => r.deletedAt ?? 0,
        cell: ({ getValue }: { getValue: () => unknown }) => <span className="text-xs tabular">{fmtDateTime(getValue() as number)}</span>,
      },
      {
        id: 'deletedBy',
        header: 'Deleted by',
        accessorFn: (r: TrashRow) => r.deletedBy ?? '-',
        cell: ({ getValue }: { getValue: () => unknown }) => <span className="text-xs">{(getValue() as string) || '-'}</span>,
      },
    ],
    [],
  )

  const collections = Object.keys(LABELS).filter((k) => !k.includes('{'))

  return (
    <div>
      <PageHeader
        title="Trash"
        info="Every deletion in BMRC is a soft delete: records keep their history, show who deleted them and when, and can be restored with one click. Nothing is ever permanently removed - by design."
        actions={
          <div className="flex items-center gap-2">
            <Select value={collection} onValueChange={setCollection}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {collections.map((c) => <SelectItem key={c} value={c}>{LABELS[c] ?? c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => load(collection)}>Refresh</Button>
          </div>
        }
      />
      {DEMO_MODE && (
        <Card className="mb-4 border-primary/30">
          <CardContent className="p-3 text-xs text-muted-foreground">
            Demo tip: delete a student from People, then restore it here - the whole cycle works offline in demo mode.
          </CardContent>
        </Card>
      )}
      {loading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : (
        <DataTable
          data={rows}
          columns={columns as never}
          searchPlaceholder="Search deleted records..."
          exportName="trash"
          emptyTitle={`Nothing in ${LABELS[collection]?.toLowerCase() ?? collection} trash`}
          emptyHint="Deleted records appear here with their full deletion trail."
          emptyAction={<Badge variant="neutral">soft-delete only, no permanent delete</Badge>}
          actions={(r) => (
            <div className="flex justify-end">
              <Button size="sm" variant="soft" className="gap-1.5" onClick={() => restore(r)}>
                <RotateCcw className="size-3.5" /> Restore
              </Button>
            </div>
          )}
        />
      )}
    </div>
  )
}
