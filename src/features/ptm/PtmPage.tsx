import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CalendarClock, CalendarPlus, Check } from 'lucide-react'
import { TabbedModule } from '@/components/shared/TabbedModule'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardContent, Avatar, Skeleton } from '@/components/ui/display'
import { Input, Label } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SheetContent, Sheet as SheetRoot } from '@/components/ui/dialog'
import { useList, useCreate, useUpdate } from '@/lib/data/hooks'
import { useAuth } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { notify, notifyMany } from '@/lib/notify'
import type { ClassDoc, PtmDoc, PtmSlot, StudentDoc, StaffDoc, UserDoc } from '@/lib/types'
import { fmtDate, todayStr } from '@/lib/utils'

function CreatePtmSheet({
  open,
  onOpenChange,
  classes,
  staff,
  teacherIdFixed,
  teacherName,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  classes: ClassDoc[]
  staff: StaffDoc[]
  teacherIdFixed?: string
  teacherName?: string
}) {
  const create = useCreate('ptms')
  const { data: users } = useList<UserDoc>('users')
  const [classId, setClassId] = useState('')
  const [teacherId, setTeacherId] = useState(teacherIdFixed ?? '')
  const [date, setDate] = useState('')
  const [title, setTitle] = useState('')
  const [times, setTimes] = useState('10:00, 10:20, 10:40, 11:00')

  const submit = async () => {
    if (!classId || !date) {
      toast.error('Pick a class and a date')
      return
    }
    const resolvedTeacher = teacherIdFixed ?? teacherId
    if (!resolvedTeacher) {
      toast.error('Pick the teacher hosting this PTM')
      return
    }
    const slots: PtmSlot[] = times
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => ({ time: t }))
    if (!slots.length) {
      toast.error('Add at least one slot time')
      return
    }
    await create.mutateAsync({ data: { teacherId: resolvedTeacher, classId, date, slots, status: 'scheduled', title: title || `PTM - ${fmtDate(date)}` } })
    // Notify parents whose children are in this class, so the meeting actually fills up.
    try {
      const parentIds = (users ?? [])
        .filter((u) => u.status === 'active' && u.role === 'parent' && (u.childIds ?? []).length > 0)
        .map((u) => u.id)
      await notifyMany(parentIds, 'New PTM scheduled', `${classes.find((c) => c.id === classId)?.name ?? 'Your class'} PTM on ${fmtDate(date)} - book a slot.`, '/ptm')
    } catch {
      // notification is best-effort
    }
    toast.success('PTM created', { description: 'Parents of this class can now book slots from their portal.' })
    onOpenChange(false)
  }

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetContent title="Create PTM" description="Slots are first-come bookable windows. Parents get a notification with a deep link.">
        <div className="space-y-4">
          {teacherName && <p className="text-sm text-muted-foreground">Teacher: <strong className="text-foreground">{teacherName}</strong></p>}
          {!teacherIdFixed && (
            <div className="space-y-1.5">
              <Label>Teacher</Label>
              <Select value={teacherId} onValueChange={setTeacherId}>
                <SelectTrigger><SelectValue placeholder="Pick teacher" /></SelectTrigger>
                <SelectContent>
                  {(staff ?? []).filter((s) => s.staffType === 'teaching').map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue placeholder="Pick class" /></SelectTrigger>
              <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" min={todayStr()} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Title (optional)</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Half-yearly progress discussion" />
          </div>
          <div className="space-y-1.5">
            <Label>Slot times (comma separated)</Label>
            <Input value={times} onChange={(e) => setTimes(e.target.value)} />
          </div>
          <Button className="w-full" onClick={submit}>Create PTM</Button>
        </div>
      </SheetContent>
    </SheetRoot>
  )
}

export default function PtmPage() {
  const { user } = useAuth()
  const { data: classes } = useList<ClassDoc>('classes')
  const { data: ptms, isLoading, refetch } = useList<PtmDoc>('ptms', { orderBy: ['date', 'asc'] })
  const { data: students } = useList<StudentDoc>('students')
  const { data: staff } = useList<StaffDoc>('staff')
  const { data: users } = useList<UserDoc>('users')
  const update = useUpdate('ptms')
  const [open, setOpen] = useState(false)
  const [bookingChild, setBookingChild] = useState('')

  const creator = can(user?.role, 'ptm.create')
  const parent = user?.role === 'parent'
  const teacherName = (id: string) => staff?.find((s) => s.id === id)?.name ?? 'Teacher'

  const myChildren = useMemo(
    () => (students ?? []).filter((s) => user?.childIds?.includes(s.id)),
    [students, user],
  )

  const visiblePtms = useMemo(() => {
    const all = ptms ?? []
    if (user?.role === 'admin') return all
    if (parent) return all.filter((p) => myChildren.some((c) => c.classId === p.classId))
    if (user?.role === 'teacher') return all.filter((p) => p.teacherId === user.staffId)
    return all
  }, [ptms, user, myChildren, parent])

  const book = async (ptm: PtmDoc, slotIndex: number) => {
    if (!parent || !bookingChild) {
      toast.error('Pick which child you are booking for (top right of the board).')
      return
    }
    const slots = [...ptm.slots]
    const existingBooking = slots.findIndex((s) => s.bookedByParentId === user?.id)
    if (existingBooking >= 0 && existingBooking !== slotIndex) {
      slots[existingBooking] = { time: slots[existingBooking]?.time ?? '' }
    }
    slots[slotIndex] = { time: slots[slotIndex]?.time ?? '', bookedByParentId: user?.id, studentId: bookingChild }
    await update.mutateAsync({ id: ptm.id, data: { slots } })
    const teacherUser = (users ?? []).find((u) => u.staffId === ptm.teacherId)
    if (teacherUser) {
      void notify(teacherUser.id, 'PTM slot booked', `${myChildren.find((c) => c.id === bookingChild)?.name ?? 'A parent'} booked ${slots[slotIndex]?.time} on ${fmtDate(ptm.date)}.`, '/ptm')
    }
    toast.success('Slot booked', { description: `${slots[slotIndex]?.time} on ${fmtDate(ptm.date)}` })
    await refetch()
  }

  return (
    <div>
    <TabbedModule
      title="PTM (Parent-Teacher Meeting)"
      info="Teachers open meetings with bookable time slots for their class; parents book a slot for one of their children and get reminders. Everyone sees the calendar entry."
      actions={
        creator ? <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}><CalendarPlus className="size-4" /> Create PTM</Button> : undefined
      }
      tabs={[
        {
          key: 'upcoming',
          label: 'Meetings',
          content: isLoading ? (
            <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
          ) : visiblePtms.length === 0 ? (
            <EmptyState icon={<CalendarClock className="size-5" />} title="No PTMs scheduled" hint={creator ? 'Create one with bookable slots.' : 'Your class teacher will schedule meetings here.'} />
          ) : (
            <div className="space-y-3">
              {parent && myChildren.length > 1 && (
                <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-3">
                  <Label className="shrink-0 text-xs">Booking for</Label>
                  <Select value={bookingChild} onValueChange={setBookingChild}>
                    <SelectTrigger className="h-8 w-52"><SelectValue placeholder="Pick child" /></SelectTrigger>
                    <SelectContent>
                      {myChildren.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {visiblePtms.map((p) => {
                const cls = classes?.find((c) => c.id === p.classId)
                return (
                  <Card key={p.id}>
                    <CardContent className="p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold">{p.title ?? 'Parent-Teacher Meeting'}</p>
                          <p className="text-xs text-muted-foreground">
                            {cls?.name} · {teacherName(p.teacherId)} · <span className="tabular">{fmtDate(p.date)}</span>
                          </p>
                        </div>
                        <Badge variant={p.status === 'completed' ? 'neutral' : 'success'}>{p.status}</Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {p.slots.map((s, i) => {
                          const mine = s.bookedByParentId === user?.id
                          const taken = Boolean(s.bookedByParentId) && !mine
                          return (
                            <button
                              key={i}
                              disabled={taken || !parent || p.status === 'completed'}
                              onClick={() => book(p, i)}
                              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                                mine ? 'border-primary bg-primary-soft text-primary' : taken ? 'cursor-not-allowed border-border bg-muted/40 text-muted-foreground line-through' : 'border-border hover:border-primary hover:text-primary'
                              }`}
                            >
                              {mine && <Check className="mr-1 inline size-3" />}
                              {s.time}
                              {taken && s.studentId ? ` · ${(students ?? []).find((x) => x.id === s.studentId)?.name ?? ''}` : ''}
                            </button>
                          )
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ),
        },
        {
          key: 'mine',
          label: 'My bookings',
          content: (
            <div className="space-y-2">
              {(ptms ?? []).filter((p) => p.slots.some((s) => s.bookedByParentId === user?.id)).map((p) => (
                <Card key={p.id}>
                  <CardContent className="flex items-center gap-3 p-4">
                    <Avatar name={teacherName(p.teacherId)} size={32} />
                    <div>
                      <p className="text-sm font-medium">{p.title ?? 'PTM'} · {fmtDate(p.date)}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.slots.filter((s) => s.bookedByParentId === user?.id).map((s) => s.time).join(', ')} with {teacherName(p.teacherId)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!(ptms ?? []).some((p) => p.slots.some((s) => s.bookedByParentId === user?.id)) && (
                <EmptyState compact title="No bookings yet" hint="Book a slot from the Meetings tab." />
              )}
            </div>
          ),
        },
      ]}
    />

      {creator && (
        <CreatePtmSheet
          open={open}
          onOpenChange={setOpen}
          classes={classes ?? []}
          staff={staff ?? []}
          teacherIdFixed={user?.role === 'teacher' ? user.staffId : undefined}
          teacherName={user?.role === 'teacher' ? user.name : undefined}
        />
      )}
    </div>
  )
}
