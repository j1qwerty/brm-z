import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Megaphone, Pin, Plus, Trash2 } from 'lucide-react'
import { TabbedModule } from '@/components/shared/TabbedModule'
import { DataTable } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardContent, Skeleton } from '@/components/ui/display'
import { Input, Label, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/toggle'
import { SheetContent, Sheet as SheetRoot } from '@/components/ui/dialog'
import { useList, useCreate, useUpdate, useSoftDelete } from '@/lib/data/hooks'
import { useAuth } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { audienceUserIds, notifyMany } from '@/lib/notify'
import type { ClassDoc, NoticeDoc, Role, UserDoc } from '@/lib/types'
import { fmtDateTime } from '@/lib/utils'

const noticeSchema = z.object({
  title: z.string().min(3, 'Title is required'),
  body: z.string().min(10, 'Body is too short - give readers the details'),
})
type NoticeForm = z.infer<typeof noticeSchema>

const ROLES: Role[] = ['teacher', 'accountant', 'staff', 'student', 'parent']

function NoticeComposer({
  open,
  onOpenChange,
  classes,
  user,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  classes: ClassDoc[]
  user: { id: string; role: Role } | undefined
}) {
  const create = useCreate('notices')
  const form = useForm<NoticeForm>({
    resolver: zodResolver(noticeSchema),
    values: { title: '', body: '' },
  })
  const [audienceType, setAudienceType] = useState<'all' | 'roles' | 'classes'>('all')
  const [roles, setRoles] = useState<Role[]>([])
  const [classIds, setClassIds] = useState<string[]>([])
  const [publishAt, setPublishAt] = useState('')
  const [pinned, setPinned] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (v: NoticeForm) => {
    if (audienceType === 'roles' && roles.length === 0) {
      toast.error('Pick at least one role')
      return
    }
    if (audienceType === 'classes' && classIds.length === 0) {
      toast.error('Pick at least one class')
      return
    }
    setBusy(true)
    try {
      const publishAtMs = publishAt ? new Date(publishAt).getTime() : Date.now()
      const status: NoticeDoc['status'] = publishAtMs > Date.now() ? 'scheduled' : 'live'
      const id = await create.mutateAsync({
        data: {
          ...v, audience: { type: audienceType, value: audienceType === 'roles' ? roles : audienceType === 'classes' ? classIds : [] },
          publishAt: publishAtMs, status, isPinned: pinned, createdBy: user?.id ?? '', attachmentsUrl: [],
        },
      })
      if (status === 'live') {
        const ids = await audienceUserIds({ type: audienceType, value: audienceType === 'roles' ? roles : audienceType === 'classes' ? classIds : [] }, {})
        await notifyMany(ids, v.title, v.body.slice(0, 90), '/notices')
      }
      toast.success(status === 'live' ? 'Notice published' : 'Notice scheduled', {
        description: status === 'live' ? 'Targeted users were notified.' : `Goes live ${fmtDateTime(publishAtMs)} (flipped by the generate-on-open routine).`,
      })
      void id
      onOpenChange(false)
      form.reset({ title: '', body: '' })
      setRoles([])
      setClassIds([])
      setPublishAt('')
      setPinned(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetContent wide title="Compose notice" description="Pick the audience precisely - notifications go only to the targeted users.">
        <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input placeholder="Annual Sports Day - 14 November" {...form.register('title')} />
            {form.formState.errors.title && <p className="text-xs text-danger">{form.formState.errors.title.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Body</Label>
            <Textarea rows={5} placeholder="Full details, timings, instructions..." {...form.register('body')} />
            {form.formState.errors.body && <p className="text-xs text-danger">{form.formState.errors.body.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Audience</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm" value={audienceType} onChange={(e) => setAudienceType(e.target.value as 'all' | 'roles' | 'classes')}>
                <option value="all">Everyone</option>
                <option value="roles">Specific roles</option>
                <option value="classes">Specific classes</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Publish at</Label>
              <Input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Leave empty to publish immediately</p>
            </div>
          </div>
          {audienceType === 'roles' && (
            <div className="flex flex-wrap gap-1.5">
              {ROLES.map((r) => (
                <label key={r} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium capitalize has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:text-primary">
                  <Checkbox className="size-3" checked={roles.includes(r)} onCheckedChange={(c) => setRoles((rs) => (c ? [...rs, r] : rs.filter((x) => x !== r)))} />
                  {r}
                </label>
              ))}
            </div>
          )}
          {audienceType === 'classes' && (
            <div className="flex flex-wrap gap-1.5">
              {classes.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:text-primary">
                  <Checkbox className="size-3" checked={classIds.includes(c.id)} onCheckedChange={(ch) => setClassIds((cs) => (ch ? [...cs, c.id] : cs.filter((x) => x !== c.id)))} />
                  {c.name}
                </label>
              ))}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={pinned} onCheckedChange={(c) => setPinned(!!c)} /> Pin to top of the board
          </label>
          <Button type="submit" className="w-full" disabled={busy}>
            {publishAt && new Date(publishAt).getTime() > Date.now() ? 'Schedule notice' : 'Publish now'}
          </Button>
        </form>
      </SheetContent>
    </SheetRoot>
  )
}

function NoticeBoard({ role, classIdForUser }: { role: Role | undefined; classIdForUser?: string }) {
  const { data: notices, isLoading } = useList<NoticeDoc>('notices', { orderBy: ['publishAt', 'desc'] })
  const { data: users } = useList<UserDoc>('users')

  const visible = useMemo(() => {
    const now = Date.now()
    return (notices ?? []).filter((n) => {
      if (n.status !== 'live' || n.publishAt > now) return false
      if (n.audience.type === 'all') return true
      if (n.audience.type === 'roles') return role ? n.audience.value.includes(role) : false
      return Boolean(classIdForUser && n.audience.value.includes(classIdForUser))
    })
  }, [notices, role, classIdForUser])

  const pinned = visible.filter((n) => n.isPinned)
  const rest = visible.filter((n) => !n.isPinned)
  const authorName = (id: string) => users?.find((u) => u.id === id)?.name ?? 'School office'

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
      ) : visible.length === 0 ? (
        <EmptyState icon={<Megaphone className="size-5" />} title="No notices for you right now" hint="Notices from the school office appear here, filtered to your role and classes." />
      ) : (
        <>
          {pinned.map((n) => <NoticeCard key={n.id} n={n} pinned authorName={authorName(n.createdBy)} />)}
          {rest.map((n) => <NoticeCard key={n.id} n={n} authorName={authorName(n.createdBy)} />)}
        </>
      )}
    </div>
  )
}

function NoticeCard({ n, pinned, authorName }: { n: NoticeDoc; pinned?: boolean; authorName: string }) {
  return (
    <Card className={pinned ? 'border-primary/40' : undefined}>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          {pinned && <Pin className="size-3.5 text-primary" />}
          <p className="font-semibold">{n.title}</p>
          <Badge variant={n.audience.type === 'all' ? 'default' : 'outline'}>
            {n.audience.type === 'all' ? 'everyone' : n.audience.type === 'roles' ? `roles: ${n.audience.value.join(', ')}` : 'selected classes'}
          </Badge>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{n.body}</p>
        <p className="mt-2 text-xs text-muted-foreground/80">{authorName} · {fmtDateTime(n.publishAt)}</p>
      </CardContent>
    </Card>
  )
}

function ManageNotices({ classes }: { classes: ClassDoc[] }) {
  const { user } = useAuth()
  const { data: notices, isLoading } = useList<NoticeDoc>('notices', { orderBy: ['publishAt', 'desc'] })
  const update = useUpdate('notices')
  const softDelete = useSoftDelete('notices')
  const [open, setOpen] = useState(false)

  const columns = useMemo(
    () => [
      {
        id: 'title', header: 'Notice', accessorFn: (n: NoticeDoc) => n.title,
        cell: ({ row }: { row: { original: NoticeDoc } }) => (
          <div className="flex items-center gap-2">
            {row.original.isPinned && <Pin className="size-3 shrink-0 text-primary" />}
            <div className="min-w-0">
              <p className="truncate font-medium">{row.original.title}</p>
              <p className="truncate text-xs text-muted-foreground">{row.original.body}</p>
            </div>
          </div>
        ),
      },
      {
        id: 'audience', header: 'Audience', accessorFn: (n: NoticeDoc) => n.audience.type,
        cell: ({ row }: { row: { original: NoticeDoc } }) => (
          <Badge variant="outline">
            {row.original.audience.type === 'all' ? 'everyone' : row.original.audience.type === 'roles' ? row.original.audience.value.map((r) => String(r)).join(',') : `${row.original.audience.value.length} classes`}
          </Badge>
        ),
      },
      {
        id: 'status', header: 'Status', accessorFn: (n: NoticeDoc) => n.status,
        cell: ({ getValue }: { getValue: () => unknown }) => {
          const v = getValue() as NoticeDoc['status']
          return <Badge variant={v === 'live' ? 'success' : 'warning'}>{v}</Badge>
        },
      },
      {
        id: 'publishAt', header: 'Publishes', accessorFn: (n: NoticeDoc) => n.publishAt,
        cell: ({ getValue }: { getValue: () => unknown }) => <span className="text-xs tabular">{fmtDateTime(getValue() as number)}</span>,
      },
    ],
    [],
  )

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}><Plus className="size-3.5" /> Compose notice</Button>
      </div>
      <DataTable
        data={notices}
        loading={isLoading}
        columns={columns as never}
        searchPlaceholder="Search notices..."
        exportName="notices"
        emptyTitle="Nothing published yet"
        emptyHint="Compose your first notice - target everyone, specific roles, or specific classes."
        emptyAction={<Button onClick={() => setOpen(true)} className="gap-1.5"><Plus className="size-4" /> Compose notice</Button>}
        actions={(n) => (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: n.id, data: { isPinned: !n.isPinned } })}>
              {n.isPinned ? 'Unpin' : 'Pin'}
            </Button>
            {n.status === 'scheduled' && (
              <Button size="sm" variant="soft" onClick={() => update.mutate({ id: n.id, data: { status: 'live', publishAt: Date.now() } })}>
                Publish now
              </Button>
            )}
            <Button size="iconSm" variant="ghost" className="text-danger" aria-label="Delete notice" onClick={() => softDelete.mutate({ id: n.id, by: user?.id })}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      />
      <NoticeComposer open={open} onOpenChange={setOpen} classes={classes} user={user ?? undefined} />
    </div>
  )
}

export default function NoticesPage() {
  const { user } = useAuth()
  const { data: classes } = useList<ClassDoc>('classes')
  const creator = can(user?.role, 'notices.create')
  // class scope for notices: teachers see their class-teacher class
  const classIdForUser = user?.role === 'teacher' ? classes?.find((c) => c.classTeacherId === user.staffId)?.id : undefined

  return (
    <TabbedModule
      title="Notices"
      info="Announcements targeted to everyone, specific roles, or specific classes. Scheduled notices flip to live automatically. The board below only shows what is meant for you."
      tabs={[
        { key: 'board', label: 'Notice board', content: <NoticeBoard role={user?.role} classIdForUser={classIdForUser} /> },
        ...(creator ? [{ key: 'manage', label: 'Manage & compose', content: <ManageNotices classes={classes ?? []} /> }] : []),
      ]}
    />
  )
}
