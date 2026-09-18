import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Pencil, Trash2 } from 'lucide-react'
import { DataTable } from '@/components/shared/DataTable'
import { Button } from '@/components/ui/button'
import { Badge, Avatar } from '@/components/ui/display'
import { Input, Label, Textarea } from '@/components/ui/input'
import { SheetContent, Sheet as SheetRoot } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/dialog'
import { ImageUrlField } from '@/components/shared/ImageUrlField'
import { useList, useCreate, useUpdate, useSoftDelete } from '@/lib/data/hooks'
import { useAuth } from '@/lib/auth'
import type { StaffDoc } from '@/lib/types'
import { todayStr } from '@/lib/utils'

const staffSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  designation: z.string().optional(),
  qualification: z.string().optional(),
  employeeNo: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Enter a valid email').or(z.literal('')),
  joinDate: z.string().optional(),
  bloodGroup: z.string().optional(),
  address: z.string().optional(),
})
type StaffForm = z.infer<typeof staffSchema>

export function StaffTable({ staffType }: { staffType: 'teaching' | 'nonteaching' }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: staff, isLoading } = useList<StaffDoc>('staff', { where: [['staffType', '==', staffType]] })
  const softDelete = useSoftDelete('staff')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<StaffDoc | undefined>()
  const [confirmDelete, setConfirmDelete] = useState<StaffDoc | null>(null)

  const columns = useMemo(
    () => [
      {
        id: 'name',
        header: staffType === 'teaching' ? 'Teacher' : 'Staff member',
        accessorFn: (s: StaffDoc) => s.name,
        cell: ({ row }: { row: { original: StaffDoc } }) => (
          <div className="flex items-center gap-2.5">
            <Avatar src={row.original.photoUrl} name={row.original.name} size={30} />
            <div className="min-w-0">
              <p className="truncate font-medium">{row.original.name}</p>
              <p className="truncate text-xs text-muted-foreground">{row.original.employeeNo ?? row.original.id}</p>
            </div>
          </div>
        ),
      },
      {
        id: 'designation',
        header: 'Designation',
        accessorFn: (s: StaffDoc) => s.designation ?? '',
      },
      {
        id: 'qualification',
        header: 'Qualification',
        accessorFn: (s: StaffDoc) => s.qualification ?? '',
        cell: ({ getValue }: { getValue: () => unknown }) => <span className="text-xs text-muted-foreground">{(getValue() as string) || '-'}</span>,
      },
      {
        id: 'phone',
        header: 'Phone',
        accessorFn: (s: StaffDoc) => s.phone ?? '',
        cell: ({ getValue }: { getValue: () => unknown }) => <span className="tabular text-xs">{(getValue() as string) || '-'}</span>,
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (s: StaffDoc) => s.status,
        cell: ({ getValue }: { getValue: () => unknown }) => {
          const v = getValue() as StaffDoc['status']
          return v === 'active' ? <Badge variant="success">active</Badge> : <Badge variant="neutral">{v}</Badge>
        },
      },
    ],
    [staffType],
  )

  return (
    <>
      <DataTable
        data={staff}
        loading={isLoading}
        columns={columns as never}
        searchPlaceholder="Search name, designation..."
        exportName={staffType === 'teaching' ? 'teachers' : 'staff'}
        onRowClick={(s) => navigate(`/people/${s.id}?kind=staff`)}
        emptyTitle={staffType === 'teaching' ? 'No teachers yet' : 'No staff members yet'}
        emptyHint={staffType === 'teaching' ? 'Add teachers to assign them classes and subjects.' : 'Librarians, office staff and support teams live here.'}
        emptyAction={<Button onClick={() => { setEditing(undefined); setSheetOpen(true) }}>Add {staffType === 'teaching' ? 'teacher' : 'staff member'}</Button>}
        actions={(s) => (
          <div className="flex justify-end gap-1">
            <Button size="iconSm" variant="ghost" aria-label={`Edit ${s.name}`} onClick={(e) => { e.stopPropagation(); setEditing(s); setSheetOpen(true) }}>
              <Pencil className="size-3.5" />
            </Button>
            <Button size="iconSm" variant="ghost" className="text-danger" aria-label={`Delete ${s.name}`} onClick={(e) => { e.stopPropagation(); setConfirmDelete(s) }}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      />

      <StaffSheet open={sheetOpen} onOpenChange={setSheetOpen} existing={editing} staffType={staffType} />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={`Move ${confirmDelete?.name} to Trash?`}
        description="Their attendance history and assignments are preserved and restorable from Trash."
        confirmLabel="Move to Trash"
        destructive
        onConfirm={() => {
          if (confirmDelete) softDelete.mutate({ id: confirmDelete.id, by: user?.id })
          setConfirmDelete(null)
        }}
      />
    </>
  )
}

function StaffSheet({
  open,
  onOpenChange,
  existing,
  staffType,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  existing?: StaffDoc
  staffType: 'teaching' | 'nonteaching'
}) {
  const create = useCreate('staff')
  const update = useUpdate('staff')
  const [photoUrl, setPhotoUrl] = useState(existing?.photoUrl ?? '')

  const form = useForm<StaffForm>({
    resolver: zodResolver(staffSchema),
    values: existing
      ? {
          name: existing.name, designation: existing.designation ?? '', qualification: existing.qualification ?? '',
          employeeNo: existing.employeeNo ?? '', phone: existing.phone ?? '', email: existing.email ?? '',
          joinDate: existing.joinDate ?? '', bloodGroup: existing.bloodGroup ?? '', address: existing.address ?? '',
        }
      : { name: '', designation: '', qualification: '', employeeNo: '', phone: '', email: '', joinDate: todayStr(), bloodGroup: '', address: '' },
  })

  const submit = async (v: StaffForm) => {
    const payload = { ...v, staffType, photoUrl, joinDate: v.joinDate || todayStr() }
    try {
      if (existing) {
        await update.mutateAsync({ id: existing.id, data: payload })
        toast.success('Record updated')
      } else {
        await create.mutateAsync({ data: { ...payload, status: 'active' } })
        toast.success(staffType === 'teaching' ? 'Teacher added' : 'Staff member added')
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save record')
    }
  }

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetContent wide title={existing ? `Edit ${existing.name}` : staffType === 'teaching' ? 'New teacher' : 'New staff member'}>
        <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
          <ImageUrlField value={photoUrl} onChange={setPhotoUrl} label="Photo (external URL)" allowAvatarShrink />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input {...form.register('name')} />
              {form.formState.errors.name && <p className="text-xs text-danger">{form.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Designation</Label>
              <Input placeholder={staffType === 'teaching' ? 'TGT Mathematics' : 'Librarian'} {...form.register('designation')} />
            </div>
            <div className="space-y-1.5">
              <Label>Qualification</Label>
              <Input placeholder="B.Sc, B.Ed" {...form.register('qualification')} />
            </div>
            <div className="space-y-1.5">
              <Label>Employee no</Label>
              <Input {...form.register('employeeNo')} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone (+91)</Label>
              <Input placeholder="+91 98480 12345" {...form.register('phone')} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" {...form.register('email')} />
              {form.formState.errors.email && <p className="text-xs text-danger">{form.formState.errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Join date</Label>
              <Input type="date" {...form.register('joinDate')} />
            </div>
            <div className="space-y-1.5">
              <Label>Blood group</Label>
              <Input placeholder="B+" {...form.register('bloodGroup')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Textarea rows={2} {...form.register('address')} />
          </div>
          <Button type="submit" className="w-full" disabled={create.isPending || update.isPending}>
            {existing ? 'Save changes' : 'Add record'}
          </Button>
        </form>
      </SheetContent>
    </SheetRoot>
  )
}
