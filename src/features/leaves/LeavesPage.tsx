import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { CalendarOff, Check, X } from 'lucide-react'
import { TabbedModule } from '@/components/shared/TabbedModule'
import { DataTable } from '@/components/shared/DataTable'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardContent, Skeleton } from '@/components/ui/display'
import { Input, Label, Textarea } from '@/components/ui/input'
import { SheetContent, Sheet as SheetRoot } from '@/components/ui/dialog'
import { useList, useCreate, useUpdate } from '@/lib/data/hooks'
import { useAuth } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { notify } from '@/lib/notify'
import type { LeaveDoc, StaffDoc, StudentDoc } from '@/lib/types'
import { fmtDate, todayStr } from '@/lib/utils'

const leaveSchema = z.object({
  type: z.enum(['sick', 'casual', 'emergency', 'other']),
  from: z.string().min(1, 'From date required'),
  to: z.string().min(1, 'To date required'),
  reason: z.string().min(5, 'Give a short reason (min 5 characters)'),
})
type LeaveForm = z.infer<typeof leaveSchema>

function ApplySheet({
  open,
  onOpenChange,
  personType,
  personId,
  personName,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  personType: 'student' | 'staff'
  personId: string
  personName: string
}) {
  const create = useCreate('leaves')
  const form = useForm<LeaveForm>({
    resolver: zodResolver(leaveSchema),
    values: { type: 'sick', from: todayStr(), to: todayStr(), reason: '' },
  })

  const submit = async (v: LeaveForm) => {
    if (v.to < v.from) {
      form.setError('to', { message: 'End date cannot be before start date' })
      return
    }
    await create.mutateAsync({ data: { ...v, personType, personId, personName, status: 'pending' } })
    toast.success('Leave applied', { description: 'You will be notified once it is approved or rejected.' })
    onOpenChange(false)
  }

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetContent title="Apply for leave" description={`Leave for ${personName}. Class teachers and admins approve leaves.`}>
        <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm" {...form.register('type')}>
              <option value="sick">Sick</option>
              <option value="casual">Casual</option>
              <option value="emergency">Emergency</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>From</Label>
              <Input type="date" {...form.register('from')} />
              {form.formState.errors.from && <p className="text-xs text-danger">{form.formState.errors.from.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input type="date" {...form.register('to')} />
              {form.formState.errors.to && <p className="text-xs text-danger">{form.formState.errors.to.message}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea placeholder="Short reason for the leave" {...form.register('reason')} />
            {form.formState.errors.reason && <p className="text-xs text-danger">{form.formState.errors.reason.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={create.isPending}>Submit application</Button>
        </form>
      </SheetContent>
    </SheetRoot>
  )
}

export default function LeavesPage() {
  const { user } = useAuth()
  const { data: leaves, isLoading } = useList<LeaveDoc>('leaves', undefined, { enabled: Boolean(user) })
  const update = useUpdate('leaves')
  const { data: students } = useList<StudentDoc>('students')
  const { data: staff } = useList<StaffDoc>('staff')
  const [applyOpen, setApplyOpen] = useState(false)

  const myPersonId = user?.staffId ?? user?.studentId ?? (user?.role === 'parent' ? user.childIds?.[0] : undefined)
  const myPersonType: 'student' | 'staff' | null = user?.staffId ? 'staff' : myPersonId ? 'student' : null
  const myPersonName =
    (user?.staffId ? staff?.find((s) => s.id === user.staffId)?.name : undefined) ??
    (user?.studentId ? students?.find((s) => s.id === user.studentId)?.name : undefined) ??
    (user?.role === 'parent' ? students?.find((s) => s.id === user.childIds?.[0])?.name : undefined) ??
    user?.name ?? 'You'
  const approver = can(user?.role, 'leaves.approve')
  const canApply = can(user?.role, 'leaves.apply') || user?.role === 'admin'

  const personName = (l: LeaveDoc) =>
    l.personName ??
    (l.personType === 'student' ? students?.find((s) => s.id === l.personId)?.name : staff?.find((s) => s.id === l.personId)?.name) ??
    l.personId

  const myLeaves = useMemo(
    () => (leaves ?? []).filter((l) => l.personId === user?.studentId || l.personId === user?.staffId),
    [leaves, user],
  )

  const decide = async (l: LeaveDoc, status: 'approved' | 'rejected') => {
    await update.mutateAsync({ id: l.id, data: { status, decidedBy: user?.id } })
    const uid = l.personType === 'student' ? (students ?? []).find((s) => s.id === l.personId)?.parentUserId : undefined
    if (uid) {
      void notify(uid, `Leave ${status}`, `${personName(l)}'s leave (${fmtDate(l.from)} to ${fmtDate(l.to)}) was ${status}.`, '/leaves')
    }
    toast.success(`Leave ${status}`)
  }

  const allColumns = useMemo(
    () => [
      {
        id: 'person',
        header: 'Person',
        accessorFn: (l: LeaveDoc) => personName(l),
        cell: ({ row }: { row: { original: LeaveDoc } }) => (
          <div>
            <p className="font-medium">{personName(row.original)}</p>
            <p className="text-xs text-muted-foreground">{row.original.personType}</p>
          </div>
        ),
      },
      {
        id: 'type',
        header: 'Type',
        accessorFn: (l: LeaveDoc) => l.type,
        cell: ({ getValue }: { getValue: () => unknown }) => <Badge variant="outline">{getValue() as string}</Badge>,
      },
      {
        id: 'dates',
        header: 'Dates',
        accessorFn: (l: LeaveDoc) => l.from,
        cell: ({ row }: { row: { original: LeaveDoc } }) => (
          <span className="tabular text-xs">{fmtDate(row.original.from)} to {fmtDate(row.original.to)}</span>
        ),
      },
      {
        id: 'reason',
        header: 'Reason',
        accessorFn: (l: LeaveDoc) => l.reason,
        cell: ({ getValue }: { getValue: () => unknown }) => <span className="line-clamp-1 max-w-64 text-xs text-muted-foreground">{getValue() as string}</span>,
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (l: LeaveDoc) => l.status,
        cell: ({ getValue }: { getValue: () => unknown }) => {
          const v = getValue() as LeaveDoc['status']
          return <Badge variant={v === 'approved' ? 'success' : v === 'rejected' ? 'danger' : 'warning'}>{v}</Badge>
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [students, staff],
  )

  const decisionActions = (l: LeaveDoc) =>
    approver && l.status === 'pending' ? (
      <div className="flex justify-end gap-1">
        <Button size="iconSm" variant="ghost" className="text-success" aria-label="Approve" onClick={() => decide(l, 'approved')}>
          <Check className="size-4" />
        </Button>
        <Button size="iconSm" variant="ghost" className="text-danger" aria-label="Reject" onClick={() => decide(l, 'rejected')}>
          <X className="size-4" />
        </Button>
      </div>
    ) : null

  return (
    <div>
    <TabbedModule
      title="Leaves"
      info="Staff and students (or their parents) apply for leaves here. Approvers see pending requests with one-tap approve/reject. Approved student leaves can be marked as 'leave' in the register."
      actions={
        canApply ? <Button size="sm" className="gap-1.5" onClick={() => setApplyOpen(true)}><CalendarOff className="size-4" /> Apply for leave</Button> : undefined
      }
      tabs={[
        ...(approver
          ? [
              {
                key: 'pending',
                label: 'Pending approvals',
                badge: (leaves ?? []).filter((l) => l.status === 'pending').length,
                content: isLoading ? <Skeleton className="h-64 rounded-xl" /> : (
                  <DataTable
                    data={(leaves ?? []).filter((l) => l.status === 'pending')}
                    columns={allColumns as never}
                    searchPlaceholder="Search leaves..."
                    exportName="pending-leaves"
                    emptyTitle="No pending leaves"
                    emptyHint="New applications land here for a decision."
                    actions={decisionActions}
                  />
                ),
              },
              {
                key: 'all',
                label: 'All leaves',
                content: isLoading ? <Skeleton className="h-64 rounded-xl" /> : (
                  <DataTable
                    data={leaves}
                    columns={allColumns as never}
                    searchPlaceholder="Search leaves..."
                    exportName="leaves"
                    emptyTitle="No leaves on record"
                    actions={decisionActions}
                  />
                ),
              },
            ]
          : []),
        {
          key: 'mine',
          label: 'My applications',
          badge: myLeaves.length || undefined,
          content: isLoading ? <Skeleton className="h-64 rounded-xl" /> : myLeaves.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                {canApply ? 'You have not applied for any leave yet. Use the Apply button.' : 'No leave history for your account.'}
              </CardContent>
            </Card>
          ) : (
            <DataTable
              data={myLeaves}
              columns={allColumns as never}
              searchPlaceholder="Search my leaves..."
              emptyTitle="Nothing here"
              actions={decisionActions}
            />
          ),
        },
      ]}
    />

      {applyOpen && myPersonType && myPersonId && (
        <ApplySheet
          open={applyOpen}
          onOpenChange={setApplyOpen}
          personType={myPersonType}
          personId={myPersonId}
          personName={myPersonName}
        />
      )}
    </div>
  )
}
