import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { DataTable } from '@/components/shared/DataTable'
import { Button } from '@/components/ui/button'
import { Badge, Avatar, Skeleton } from '@/components/ui/display'
import { SheetContent, Sheet as SheetRoot } from '@/components/ui/dialog'
import { useList, useUpdate } from '@/lib/data/hooks'
import type { StudentDoc, UserDoc, ClassDoc } from '@/lib/types'

/**
 * Parents = users with role "parent". Linking children (childIds) powers the
 * parent portal, fee visibility, marks visibility and messaging threads.
 * Links are stored bidirectionally: users.childIds[] and students.parentUserId.
 */
export function ParentsTable({ classes }: { classes: ClassDoc[] }) {
  const { data: parents, isLoading } = useList<UserDoc>('users', { where: [['role', '==', 'parent']] })
  const { data: students, isLoading: studentsLoading } = useList<StudentDoc>('students')
  const updateParent = useUpdate('users')
  const updateStudent = useUpdate('students')
  const [linking, setLinking] = useState<UserDoc | null>(null)

  const columns = useMemo(
    () => [
      {
        id: 'name',
        header: 'Parent',
        accessorFn: (p: UserDoc) => p.name,
        cell: ({ row }: { row: { original: UserDoc } }) => (
          <div className="flex items-center gap-2.5">
            <Avatar src={row.original.photoUrl} name={row.original.name} size={30} />
            <div className="min-w-0">
              <p className="truncate font-medium">{row.original.name}</p>
              <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
            </div>
          </div>
        ),
      },
      {
        id: 'phone',
        header: 'Phone',
        accessorFn: (p: UserDoc) => p.phone ?? '',
        cell: ({ getValue }: { getValue: () => unknown }) => <span className="tabular text-xs">{(getValue() as string) || '-'}</span>,
      },
      {
        id: 'children',
        header: 'Linked children',
        accessorFn: (p: UserDoc) => (p.childIds ?? []).length,
        cell: ({ row }: { row: { original: UserDoc } }) => {
          const kids = (row.original.childIds ?? [])
            .map((id) => (students ?? []).find((s) => s.id === id))
            .filter(Boolean) as StudentDoc[]
          if (!kids.length) return <Badge variant="warning">none linked</Badge>
          return (
            <div className="flex flex-wrap gap-1">
              {kids.map((k) => {
                const c = classes.find((cl) => cl.id === k.classId)
                return (
                  <Badge key={k.id} variant="outline">
                    {k.name} · {c?.name.replace('Class ', '') ?? '?'}-{k.section}
                  </Badge>
                )
              })}
            </div>
          )
        },
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (p: UserDoc) => p.status,
        cell: ({ getValue }: { getValue: () => unknown }) => {
          const v = getValue() as UserDoc['status']
          return v === 'active' ? <Badge variant="success">active</Badge> : <Badge variant="warning">{v}</Badge>
        },
      },
    ],
    [students, classes],
  )

  const saveLinks = async (parent: UserDoc, childIds: string[]) => {
    const previous = parent.childIds ?? []
    const removed = previous.filter((id) => !childIds.includes(id))
    const added = childIds.filter((id) => !previous.includes(id))
    await updateParent.mutateAsync({ id: parent.id, data: { childIds } })
    for (const sid of added) await updateStudent.mutateAsync({ id: sid, data: { parentUserId: parent.id } })
    for (const sid of removed) await updateStudent.mutateAsync({ id: sid, data: { parentUserId: null } })
    toast.success('Children linked', { description: 'The parent portal now shows their fees, marks and attendance.' })
  }

  if (isLoading || studentsLoading) return <Skeleton className="h-72 rounded-xl" />

  return (
    <>
      <DataTable
        data={parents}
        columns={columns as never}
        searchPlaceholder="Search parent name, email..."
        exportName="parents"
        emptyTitle="No parent accounts yet"
        emptyHint="Parents sign up from the login page. Approve them under User Accounts, then link their children here."
        actions={(p) => (
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setLinking(p)}>Link children</Button>
          </div>
        )}
      />

      {linking && (
        <LinkSheet
          parent={linking}
          students={students ?? []}
          onClose={() => setLinking(null)}
          onSave={async (ids) => { await saveLinks(linking, ids); setLinking(null) }}
        />
      )}
    </>
  )
}

function LinkSheet({
  parent,
  students,
  onClose,
  onSave,
}: {
  parent: UserDoc
  students: StudentDoc[]
  onClose: () => void
  onSave: (childIds: string[]) => Promise<void>
}) {
  const [selected, setSelected] = useState<string[]>(parent.childIds ?? [])
  const [busy, setBusy] = useState(false)

  const toggle = (id: string, on: boolean) => setSelected((sel) => (on ? [...sel, id] : sel.filter((x) => x !== id)))

  return (
    <SheetRoot open onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        title={`Link children for ${parent.name}`}
        description="A parent can have multiple children. They get a child switcher in their portal."
      >
        <div className="space-y-2">
          {students.map((s) => (
            <label key={s.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-2.5 text-sm hover:bg-muted/40">
              <input
                type="checkbox"
                checked={selected.includes(s.id)}
                onChange={(e) => toggle(s.id, e.target.checked)}
                className="size-4"
              />
              <span className="flex-1 font-medium">{s.name}</span>
              <span className="text-xs text-muted-foreground">{s.admissionNo}</span>
            </label>
          ))}
          <p className="pt-1 text-xs text-muted-foreground">
            {selected.length} child{selected.length === 1 ? '' : 'ren'} selected
          </p>
          <Button
            className="w-full" disabled={busy}
            onClick={async () => { setBusy(true); await onSave(selected); setBusy(false) }}
          >
            Save links
          </Button>
        </div>
      </SheetContent>
    </SheetRoot>
  )
}
