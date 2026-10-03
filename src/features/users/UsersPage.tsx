import { useMemo, useState } from 'react'
import { BadgeCheck, Ban, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { TabbedModule } from '@/components/shared/TabbedModule'
import { DataTable, type BulkAction } from '@/components/shared/DataTable'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Badge, Avatar } from '@/components/ui/display'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useList, useUpdate, useSoftDelete } from '@/lib/data/hooks'
import { useAuth } from '@/lib/auth'
import { ROLE_LABEL } from '@/lib/permissions'
import type { Role, UserDoc, UserStatus } from '@/lib/types'
import { fmtDate } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Dialog as DialogRoot, DialogContent, DialogHeader, DialogFooter } from '@/components/ui/dialog'

const ROLES: Role[] = ['admin', 'teacher', 'accountant', 'staff', 'student', 'parent']

function UserTable({ users, loading }: { users: UserDoc[] | undefined; loading: boolean }) {
  const { user: me } = useAuth()
  const update = useUpdate('users')
  const softDelete = useSoftDelete('users')
  const [confirmSuspend, setConfirmSuspend] = useState<UserDoc | null>(null)
  const [filters, setFilters] = useState<Record<string, string>>({})

  const filtered = useMemo(() => {
    let out = users ?? []
    if (filters.status && filters.status !== 'all') out = out.filter((u) => u.status === filters.status)
    if (filters.role && filters.role !== 'all') out = out.filter((u) => u.role === filters.role)
    return out
  }, [users, filters])

  const statusBadge = (s: UserStatus) =>
    s === 'active' ? <Badge variant="success">active</Badge> : s === 'pending' ? <Badge variant="warning">pending</Badge> : <Badge variant="danger">suspended</Badge>

  const [gmailFor, setGmailFor] = useState<UserDoc | null>(null)
  const [gmailValue, setGmailValue] = useState('')

  const columns = useMemo(
    () => [
      {
        id: 'name',
        header: 'User',
        accessorFn: (u: UserDoc) => u.name,
        cell: ({ row }: { row: { original: UserDoc } }) => (
          <div className="flex items-center gap-2.5">
            <Avatar src={row.original.photoUrl} name={row.original.name} size={30} />
            <div className="min-w-0">
              <p className="truncate font-medium">{row.original.name}{row.original.id === me?.id && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}</p>
              <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
            </div>
          </div>
        ),
      },
      {
        id: 'gmail',
        header: 'Linked Gmail',
        accessorFn: (u: UserDoc) => u.linkedGmail ?? '',
        cell: ({ row }: { row: { original: UserDoc } }) => {
          const u = row.original
          if (!u.linkedGmail) return <span className="text-xs text-muted-foreground">-</span>
          const v = u.gmailStatus === 'approved' ? 'success' : u.gmailStatus === 'rejected' ? 'danger' : 'warning'
          return (
            <span className="flex items-center gap-1.5">
              <span className="max-w-44 truncate font-mono text-xs">{u.linkedGmail}</span>
              <Badge variant={v}>{u.gmailStatus ?? 'pending'}</Badge>
            </span>
          )
        },
      },
      {
        id: 'role',
        header: 'Role',
        accessorFn: (u: UserDoc) => u.role,
        cell: ({ getValue }: { getValue: () => unknown }) => <Badge variant="outline">{ROLE_LABEL[getValue() as Role]}</Badge>,
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (u: UserDoc) => u.status,
        cell: ({ row }: { row: { original: UserDoc } }) => statusBadge(row.original.status),
      },
      {
        id: 'createdAt',
        header: 'Joined',
        accessorFn: (u: UserDoc) => u.createdAt,
        cell: ({ getValue }: { getValue: () => unknown }) => <span className="text-xs text-muted-foreground">{fmtDate(getValue() as number)}</span>,
      },
    ],
    [me?.id],
  )

  const bulkActions: BulkAction<UserDoc>[] = [
    {
      label: 'Approve', icon: <BadgeCheck className="size-3.5" />,
      onClick: (sel) => {
        Promise.all(sel.filter((u) => u.status !== 'active').map((u) => update.mutateAsync({ id: u.id, data: { status: 'active' } })))
          .then((r) => toast.success(`Approved ${r.length} account${r.length === 1 ? '' : 's'}`))
      },
    },
    {
      label: 'Approve Gmail', icon: <ShieldCheck className="size-3.5" />,
      onClick: (sel) => {
        Promise.all(sel.filter((u) => u.linkedGmail && u.gmailStatus === 'pending').map((u) => update.mutateAsync({ id: u.id, data: { gmailStatus: 'approved' } })))
          .then((r) => toast.success(`Approved Gmail for ${r.length} account${r.length === 1 ? '' : 's'}`))
      },
    },
  ]

  return (
    <>
      <DataTable
        data={filtered}
        loading={loading}
        columns={columns as never}
        searchPlaceholder="Search name or email..."
        exportName="users"
        bulkActions={bulkActions}
        filters={[
          { id: 'status', label: 'Status', options: [
            { label: 'Pending', value: 'pending' }, { label: 'Active', value: 'active' }, { label: 'Suspended', value: 'suspended' },
          ] },
          { id: 'role', label: 'Role', options: ROLES.map((r) => ({ label: ROLE_LABEL[r], value: r })) },
        ]}
        filterValues={filters}
        onFilterChange={(id, value) => setFilters((f) => ({ ...f, [id]: value }))}
        emptyTitle="No user accounts match"
        emptyHint="Approvals, role changes and suspended accounts all live here."
        actions={(u) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="iconSm" aria-label={`Manage ${u.name}`}>...</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Set role</DropdownMenuLabel>
              {ROLES.map((r) => (
                <DropdownMenuItem key={r} onClick={() => {
                  if (u.id === me?.id && r !== 'admin') {
                    toast.error('You cannot remove your own admin role.')
                    return
                  }
                  update.mutate({ id: u.id, data: { role: r } })
                  toast.success(`${u.name} is now ${ROLE_LABEL[r]}`)
                }}>
                  {ROLE_LABEL[r]}{u.role === r && ' ✓'}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Google sign-in Gmail</DropdownMenuLabel>
              {u.gmailStatus === 'pending' && u.linkedGmail && (
                <>
                  <DropdownMenuItem onClick={() => { update.mutate({ id: u.id, data: { gmailStatus: 'approved' } }); toast.success(`Gmail approved for ${u.name}`) }}>
                    <BadgeCheck className="size-4" /> Approve {u.linkedGmail}
                  </DropdownMenuItem>
                  <DropdownMenuItem destructive onClick={() => { update.mutate({ id: u.id, data: { gmailStatus: 'rejected' } }); toast.success(`Gmail rejected for ${u.name}`) }}>
                    <Ban className="size-4" /> Reject {u.linkedGmail}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem onClick={() => { setGmailFor(u); setGmailValue(u.linkedGmail ?? '') }}>
                <ShieldCheck className="size-4" /> Set linked Gmail...
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {u.status === 'pending' && (
                <DropdownMenuItem onClick={() => { update.mutate({ id: u.id, data: { status: 'active' } }); toast.success(`${u.name} approved`) }}>
                  <BadgeCheck className="size-4" /> Approve account
                </DropdownMenuItem>
              )}
              {u.status === 'active' && u.id !== me?.id && (
                <DropdownMenuItem destructive onClick={() => setConfirmSuspend(u)}>
                  <Ban className="size-4" /> Suspend
                </DropdownMenuItem>
              )}
              {u.status === 'suspended' && (
                <DropdownMenuItem onClick={() => { update.mutate({ id: u.id, data: { status: 'active' } }); toast.success(`${u.name} reactivated`) }}>
                  <ShieldCheck className="size-4" /> Reactivate
                </DropdownMenuItem>
              )}
              {u.id !== me?.id && (
                <DropdownMenuItem destructive onClick={() => softDelete.mutate({ id: u.id, by: me?.id })}>
                  Remove account
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />
      <DialogRoot open={Boolean(gmailFor)} onOpenChange={(o) => !o && setGmailFor(null)}>
        <DialogContent>
          <DialogHeader title={`Linked Gmail for ${gmailFor?.name}`} description="The Gmail this user signs in with via Google. Setting it here approves it immediately (admin-set). Users who set their own go to pending first." />
          <Input
            type="email"
            placeholder="name@gmail.com"
            value={gmailValue}
            onChange={(e) => setGmailValue(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setGmailFor(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!gmailFor) return
                const v = gmailValue.trim().toLowerCase()
                if (!v || !v.includes('@')) {
                  toast.error('Enter a valid Gmail address')
                  return
                }
                update.mutate({ id: gmailFor.id, data: { linkedGmail: v, gmailStatus: 'approved' } })
                toast.success(`Linked Gmail saved for ${gmailFor.name}`)
                setGmailFor(null)
              }}
            >
              Save & approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
      <ConfirmDialog
        open={Boolean(confirmSuspend)}
        onOpenChange={(o) => !o && setConfirmSuspend(null)}
        title={`Suspend ${confirmSuspend?.name}?`}
        description="They will be signed out and unable to sign in until reactivated. Their records are kept."
        confirmLabel="Suspend"
        destructive
        onConfirm={() => {
          if (confirmSuspend) update.mutate({ id: confirmSuspend.id, data: { status: 'suspended' } })
          toast.success('Account suspended')
          setConfirmSuspend(null)
        }}
      />
    </>
  )
}

export default function UsersPage() {
  const { data: users, isLoading } = useList<UserDoc>('users')
  const pendingCount = (users ?? []).filter((u) => u.status === 'pending').length

  return (
    <TabbedModule
      title="User Accounts"
      info="Every sign-up lands here as pending until you approve it. Roles control what each person can see across the whole app - the same rules are enforced server-side, not just hidden in the menu."
      tabs={[
        {
          key: 'all',
          label: 'All accounts',
          badge: users?.length,
          content: <UserTable users={users} loading={isLoading} />,
        },
        {
          key: 'pending',
          label: 'Pending approval',
          badge: pendingCount,
          content: <UserTable users={users?.filter((u) => u.status === 'pending')} loading={isLoading} />,
        },
      ]}
    />
  )
}
