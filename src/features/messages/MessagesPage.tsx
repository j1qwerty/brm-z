import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { MessageCircle, Send } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardContent, Avatar, Skeleton, Separator } from '@/components/ui/display'
import { Textarea } from '@/components/ui/input'
import { useList, useCreate } from '@/lib/data/hooks'
import { useAuth } from '@/lib/auth'
import type { ClassDoc, MessageDoc, StudentDoc, UserDoc } from '@/lib/types'
import { cn, fmtDateTime } from '@/lib/utils'

/**
 * Simple, safe threads: parent <-> class-teacher only, one thread per child.
 * threadId = [uids sorted] joined, plus the child id.
 */
export default function MessagesPage() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const { data: users } = useList<UserDoc>('users')
  const { data: students } = useList<StudentDoc>('students')
  const { data: classes } = useList<ClassDoc>('classes')
  const { data: messages } = useList<MessageDoc>('messages', { orderBy: ['sentAt', 'asc'] })
  const create = useCreate('messages')
  const [activeThreadId, setActiveThreadId] = useState(params.get('thread') ?? '')
  const [draft, setDraft] = useState('')

  const parent = user?.role === 'parent'
  const teacher = user?.role === 'teacher'

  const myChildren = useMemo(
    () => (students ?? []).filter((s) => user?.childIds?.includes(s.id)),
    [students, user],
  )

  const threads = useMemo(() => {
    const teacherOf = (staffId: string | undefined) => users?.find((u) => u.staffId === staffId)
    if (!user) return []
    const list: { id: string; counterpartName: string; counterpartPhoto?: string; childName: string; last?: MessageDoc }[] = []
    if (parent) {
      for (const child of myChildren) {
        const cls = classes?.find((c) => c.id === child.classId)
        const ct = cls?.classTeacherId
        const ctUser = teacherOf(ct)
        if (!ctUser) continue
        const tid2 = [user.id, ctUser.id, child.id].sort().join('_')
        const msgs = (messages ?? []).filter((m) => m.threadId === tid2)
        list.push({
          id: tid2,
          counterpartName: ctUser.name,
          counterpartPhoto: ctUser.photoUrl,
          childName: child.name,
          last: msgs[msgs.length - 1],
        })
      }
    }
    if (teacher) {
      // threads where counterpart parentIds... build from childIds of parents
      const myClasses = (classes ?? []).filter((c) => c.classTeacherId === user.staffId)
      for (const cls of myClasses) {
        const kids = (students ?? []).filter((s) => s.classId === cls.id && s.parentUserId)
        for (const kid of kids) {
          const pu = users?.find((u) => u.id === kid.parentUserId)
          if (!pu) continue
          const tid2 = [user.id, pu.id, kid.id].sort().join('_')
          const msgs = (messages ?? []).filter((m) => m.threadId === tid2)
          list.push({
            id: tid2,
            counterpartName: pu.name,
            counterpartPhoto: pu.photoUrl,
            childName: kid.name,
            last: msgs[msgs.length - 1],
          })
        }
      }
    }
    return list.sort((a, b) => (b.last?.sentAt ?? 0) - (a.last?.sentAt ?? 0))
  }, [user, parent, teacher, myChildren, classes, users, students, messages])

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? threads[0]
  const threadMessages = useMemo(
    () => (messages ?? []).filter((m) => m.threadId === activeThread?.id),
    [messages, activeThread],
  )

  const send = async () => {
    if (!draft.trim() || !activeThread || !user) return
    await create.mutateAsync({
      data: {
        threadId: activeThread.id, senderId: user.id, senderName: user.name,
        text: draft.trim(), sentAt: Date.now(),
      },
    })
    setDraft('')
    toast.success('Message sent')
  }

  return (
    <div>
      <PageHeader
        title="Messages"
        info="Direct threads between parents and the class teacher, one per child. Kept deliberately simple and safe: no group chats, no other roles."
      />
      {parent && myChildren.length === 0 ? (
        <EmptyState title="No children linked to your account" hint="Ask the school office to link your children in the People module first." icon={<MessageCircle className="size-5" />} />
      ) : threads.length === 0 ? (
        <EmptyState icon={<MessageCircle className="size-5" />} title="No conversations yet" hint={teacher ? 'Threads appear when a parent of your class messages you.' : 'Start a conversation with your class teacher.'} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          {/* thread list */}
          <Card>
            <CardContent className="p-0">
              <div className="border-b border-border px-4 py-3 text-sm font-semibold">Conversations</div>
              <div className="divide-y divide-border/60">
                {threads.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveThreadId(t.id)}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50',
                      activeThread?.id === t.id && 'bg-primary-soft/50',
                    )}
                  >
                    <Avatar src={t.counterpartPhoto} name={t.counterpartName} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.counterpartName}</p>
                      <p className="truncate text-xs text-muted-foreground">{t.childName} · {t.last?.text ?? 'No messages yet'}</p>
                    </div>
                    {t.last && <Badge variant="neutral" className="shrink-0 text-[10px]">{new Date(t.last.sentAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</Badge>}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* thread pane */}
          <Card className="flex min-h-[60vh] flex-col">
            <CardContent className="flex flex-1 flex-col p-0">
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <Avatar src={activeThread?.counterpartPhoto} name={activeThread?.counterpartName ?? ''} size={32} />
                <div>
                  <p className="text-sm font-semibold">{activeThread?.counterpartName}</p>
                  <p className="text-xs text-muted-foreground">About {activeThread?.childName}</p>
                </div>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {messages === undefined ? (
                  <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-10 w-2/3" />)}</div>
                ) : threadMessages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No messages yet. Say hello.</p>
                ) : (
                  threadMessages.map((m) => {
                    const mine = m.senderId === user?.id
                    return (
                      <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                        <div className={cn('max-w-[75%] rounded-2xl px-3.5 py-2 text-sm', mine ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
                          <p>{m.text}</p>
                          <p className={cn('mt-0.5 text-[10px]', mine ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                            {fmtDateTime(m.sentAt)}
                          </p>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
              <Separator />
              <div className="flex items-end gap-2 p-3">
                <Textarea
                  rows={1}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type a message..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void send()
                    }
                  }}
                  className="min-h-9 flex-1 resize-none"
                />
                <Button size="icon" onClick={send} disabled={!draft.trim()} aria-label="Send">
                  <Send className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
