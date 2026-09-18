import { useMemo, useState } from 'react'
import { Mail, MessageSquare, Phone } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardContent } from '@/components/ui/display'
import { Label } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useList } from '@/lib/data/hooks'
import type { ClassDoc, StudentDoc, UserDoc } from '@/lib/types'
import { downloadCsv } from '@/lib/utils'

/**
 * Manual-mode bulk communication (spec: no paid SMS/email providers).
 * Produces a filtered contact list with wa.me click-to-chat links and a mailto
 * blast - the office copies it or clicks through one by one.
 */
export default function ContactsToolPage() {
  const { data: students } = useList<StudentDoc>('students')
  const { data: users } = useList<UserDoc>('users')
  const { data: classes } = useList<ClassDoc>('classes')
  const [audience, setAudience] = useState<'guardians' | 'parents-portal' | 'all-guardians'>('guardians')
  const [classId, setClassId] = useState('')

  const rows = useMemo(() => {
    const out: { name: string; contact: string; child: string; classLabel: string; wa: string | null; mailto: string | null }[] = []
    const classLabel = (cid: string) => `${classes?.find((c) => c.id === cid)?.name ?? ''}`
    if (audience === 'guardians') {
      for (const s of students ?? []) {
        if (classId && s.classId !== classId) continue
        const phone = s.guardianPhone ?? s.phone
        if (!phone) continue
        const digits = phone.replace(/[^0-9]/g, '').slice(-10)
        out.push({
          name: s.guardianName ?? 'Guardian', contact: phone, child: s.name,
          classLabel: `${classLabel(s.classId)}-${s.section}`,
          wa: digits.length === 10 ? `https://wa.me/91${digits}?text=${encodeURIComponent(`Dear Parent, greetings from BMRC Public School. `)}` : null,
          mailto: null,
        })
      }
    } else if (audience === 'parents-portal') {
      for (const u of users ?? []) {
        if (u.role !== 'parent' || u.status !== 'active') continue
        const kids = (u.childIds ?? []).map((id) => (students ?? []).find((s) => s.id === id)).filter(Boolean) as StudentDoc[]
        if (classId && !kids.some((k) => k.classId === classId)) continue
        if (!u.email) continue
        out.push({
          name: u.name, contact: u.email, child: kids.map((k) => k.name).join(', '),
          classLabel: kids.map((k) => `${classLabel(k.classId)}-${k.section}`).join(', '),
          wa: null, mailto: u.email,
        })
      }
    } else {
      for (const s of students ?? []) {
        if (classId && s.classId !== classId) continue
        const phone = s.guardianPhone ?? s.phone
        const digits = (phone ?? '').replace(/[^0-9]/g, '').slice(-10)
        out.push({
          name: s.guardianName ?? 'Guardian', contact: phone ?? '-', child: s.name,
          classLabel: `${classLabel(s.classId)}-${s.section}`,
          wa: digits.length === 10 ? `https://wa.me/91${digits}` : null,
          mailto: null,
        })
      }
    }
    return out
  }, [students, users, audience, classId, classes])

  const mailtoAll = rows.filter((r) => r.mailto).map((r) => r.mailto).join(',')

  return (
    <div>
      <PageHeader
        title="Bulk Contacts"
        info="Manual-mode communication: filter the audience, then export the list or use WhatsApp click-to-chat links. No paid SMS/email provider is wired in - by design."
        actions={
          <Button
            variant="outline" size="sm"
            onClick={() => downloadCsv('contact-list.csv', [
              ['Recipient', 'Contact', 'Child', 'Class', 'WhatsApp link', 'Email'],
              ...rows.map((r) => [r.name, r.contact, r.child, r.classLabel, r.wa ?? '', r.mailto ?? '']),
            ])}
          >
            Export CSV
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-56 space-y-1">
          <Label>Audience</Label>
          <Select value={audience} onValueChange={(v) => setAudience(v as typeof audience)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="guardians">Guardians (by phone, per class)</SelectItem>
              <SelectItem value="parents-portal">Parent portal accounts (by email)</SelectItem>
              <SelectItem value="all-guardians">All guardians (no class filter)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-44 space-y-1">
          <Label>Class filter</Label>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger><SelectValue placeholder="All classes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {mailtoAll && (
          <Button size="sm" variant="soft" className="gap-1.5" onClick={() => { location.href = `mailto:${mailtoAll}?subject=School%20notice` }}>
            <Mail className="size-4" /> Email selected ({rows.filter((r) => r.mailto).length})
          </Button>
        )}
        <Badge variant="neutral">{rows.length} contacts</Badge>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No contacts match this filter" hint="Guardian phones come from student records; portal emails from approved parent accounts." icon={<Phone className="size-5" />} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="border-b border-border px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <MessageSquare className="size-4 text-primary" /> Contact list
              </p>
            </div>
            <div className="max-h-[60vh] divide-y divide-border/60 overflow-y-auto">
              {rows.map((r, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{r.name} <span className="text-xs text-muted-foreground">({r.child} · {r.classLabel})</span></p>
                    <p className="text-xs tabular text-muted-foreground">{r.contact}</p>
                  </div>
                  {r.wa && (
                    <a href={r.wa} target="_blank" rel="noreferrer" className="text-xs font-medium text-success hover:underline">
                      WhatsApp chat
                    </a>
                  )}
                  {r.mailto && (
                    <a href={`mailto:${r.mailto}`} className="text-xs font-medium text-primary hover:underline">
                      Email
                    </a>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
