import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { PageHeader, InfoTip } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardContent, Skeleton } from '@/components/ui/display'
import { Input, Label, Textarea } from '@/components/ui/input'
import { SheetContent, Sheet as SheetRoot } from '@/components/ui/dialog'
import { useList, useCreate, useUpdate, useSoftDelete } from '@/lib/data/hooks'
import { useAuth } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { notifyMany } from '@/lib/notify'
import type { CalendarEventDoc, ClassDoc, ExamDoc, PtmDoc, UserDoc } from '@/lib/types'
import { cn, fmtDate } from '@/lib/utils'

const typeVariant = (t: CalendarEventDoc['type']) =>
  t === 'holiday' ? 'success' : t === 'exam' ? 'danger' : t === 'ptm' ? 'default' : 'outline'

function EventSheet({
  open,
  onOpenChange,
  defaultDate,
  edit,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  defaultDate: string
  edit?: CalendarEventDoc
}) {
  const create = useCreate('calendarEvents')
  const update = useUpdate('calendarEvents')
  const { data: users } = useList<UserDoc>('users')
  const [date, setDate] = useState(edit?.date ?? defaultDate)
  const [type, setType] = useState<CalendarEventDoc['type']>(edit?.type ?? 'event')
  const [title, setTitle] = useState(edit?.title ?? '')
  const [description, setDescription] = useState(edit?.description ?? '')

  const submit = async () => {
    if (!title.trim() || !date) {
      toast.error('Date and title are required')
      return
    }
    if (edit) {
      await update.mutateAsync({ id: edit.id, data: { date, type, title: title.trim(), description } })
    } else {
      await create.mutateAsync({ data: { date, type, title: title.trim(), description } })
      // Everyone sees the calendar, so every active user gets a notification.
      const ids = (users ?? []).filter((u) => u.status === 'active').map((u) => u.id)
      await notifyMany(ids, title.trim(), `${type === 'holiday' ? 'Holiday' : 'New event'} on ${date}${description ? ` - ${description.slice(0, 80)}` : ''}`, '/calendar')
    }
    toast.success(edit ? 'Event updated' : 'Event added', { description: edit ? undefined : 'All active users were notified.' })
    onOpenChange(false)
  }

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetContent title={edit ? 'Edit event' : 'Add calendar event'} description="Holidays, events, exams and PTMs all render on the month grid for everyone.">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm" value={type} onChange={(e) => setType(e.target.value as CalendarEventDoc['type'])}>
                <option value="holiday">Holiday</option>
                <option value="event">Event</option>
                <option value="exam">Exam</option>
                <option value="ptm">PTM</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Annual Sports Day" />
          </div>
          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <Button className="w-full" onClick={submit}>{edit ? 'Save changes' : 'Add to calendar'}</Button>
        </div>
      </SheetContent>
    </SheetRoot>
  )
}

export default function CalendarPage() {
  const { user } = useAuth()
  const manager = can(user?.role, 'calendar.manage')
  const [cursor, setCursor] = useState(() => new Date())
  const [sheet, setSheet] = useState<{ open: boolean; date: string; edit?: CalendarEventDoc }>({ open: false, date: '' })
  const { data: events, isLoading } = useList<CalendarEventDoc>('calendarEvents')
  const { data: exams } = useList<ExamDoc>('exams', { where: [['status', '!=', 'draft']] })
  const { data: ptms } = useList<PtmDoc>('ptms')
  const { data: classes } = useList<ClassDoc>('classes')
  const softDelete = useSoftDelete('calendarEvents')

  // merge manual events + auto exam/PTM entries
  const allItems = useMemo(() => {
    const manual = events ?? []
    const fromExams: CalendarEventDoc[] = (exams ?? [])
      .filter((e) => e.startDate)
      .map((e) => ({
        id: `exam-${e.id}`, date: e.startDate!, type: 'exam' as const,
        title: `${e.name} begins`, description: 'Auto from Exams module',
      }))
    const fromPtms: CalendarEventDoc[] = (ptms ?? []).map((p) => ({
      id: `ptm-${p.id}`, date: p.date, type: 'ptm' as const,
      title: `PTM · ${classes?.find((c) => c.id === p.classId)?.name ?? ''}`, description: 'Auto from PTM module',
    }))
    return [...manual, ...fromExams, ...fromPtms]
  }, [events, exams, ptms, classes])

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7 // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const itemsOn = (day: number) => {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return allItems.filter((e) => e.date === iso)
  }
  const todayIso = new Date().toISOString().slice(0, 10)
  const isToday = (day: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` === todayIso

  const upcoming = [...allItems].filter((e) => e.date >= todayIso).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6)

  return (
    <div>
      <PageHeader
        title="Academic Calendar"
        info="Month view of holidays, events, exams and PTMs. Exam and PTM entries come automatically from their modules; admins add holidays and events."
        actions={
          manager ? (
            <Button size="sm" className="gap-1.5" onClick={() => setSheet({ open: true, date: todayIso })}>
              <Plus className="size-4" /> Add event
            </Button>
          ) : undefined
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <Button variant="ghost" size="iconSm" onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="Previous month">
                <ChevronLeft className="size-4" />
              </Button>
              <p className="font-semibold">{cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>
              <Button variant="ghost" size="iconSm" onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label="Next month">
                <ChevronRight className="size-4" />
              </Button>
            </div>
            {isLoading ? (
              <Skeleton className="h-80 rounded-lg" />
            ) : (
              <div className="grid grid-cols-7 gap-1 text-sm">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                  <div key={d} className="py-1 text-center text-[11px] font-semibold text-muted-foreground">{d}</div>
                ))}
                {cells.map((day, i) => (
                  <div
                    key={i}
                    onClick={() => day && manager && setSheet({ open: true, date: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` })}
                    className={cn(
                      'min-h-20 rounded-lg border border-transparent p-1.5',
                      day && 'border-border',
                      day && manager && 'cursor-pointer hover:bg-muted/50',
                      day && isToday(day) && 'border-primary/50 bg-primary-soft/30',
                    )}
                  >
                    {day && <p className={cn('text-xs tabular', isToday(day) && 'font-bold text-primary')}>{day}</p>}
                    <div className="mt-0.5 space-y-0.5">
                      {day && itemsOn(day).slice(0, 2).map((e) => (
                        <p
                          key={e.id}
                          className={cn(
                            'truncate rounded px-1 py-0.5 text-[10px] font-medium',
                            e.type === 'holiday' && 'bg-success-soft text-success',
                            e.type === 'exam' && 'bg-danger-soft text-danger',
                            e.type === 'ptm' && 'bg-primary-soft text-primary',
                            e.type === 'event' && 'bg-muted text-foreground',
                          )}
                        >
                          {e.title}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">Upcoming</p>
              <InfoTip title="Upcoming">The next six entries across all event types.</InfoTip>
            </div>
            <div className="divide-y divide-border/60">
              {upcoming.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing upcoming.</p>
              ) : (
                upcoming.map((e) => (
                  <div key={e.id} className="group flex items-start gap-2 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.title}</p>
                      <p className="text-xs tabular text-muted-foreground">{fmtDate(e.date)}</p>
                    </div>
                    <Badge variant={typeVariant(e.type)}>{e.type}</Badge>
                    {manager && !e.id.startsWith('exam-') && !e.id.startsWith('ptm-') && (
                      <button className="opacity-0 transition-opacity group-hover:opacity-100" aria-label="Delete event" onClick={() => softDelete.mutate({ id: e.id, by: user?.id })}>
                        <Trash2 className="size-3.5 text-danger" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {sheet.open && manager && (
        <EventSheet
          open={sheet.open}
          onOpenChange={(o) => setSheet({ open: o, date: '' })}
          defaultDate={sheet.date}
          edit={sheet.edit}
        />
      )}
    </div>
  )
}
