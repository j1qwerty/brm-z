import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Save, Trash2 } from 'lucide-react'
import { InfoTip } from '@/components/shared/PageHeader'
import { TabbedModule } from '@/components/shared/TabbedModule'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/display'
import { Input, Label } from '@/components/ui/input'
import { ImageUrlField } from '@/components/shared/ImageUrlField'
import { useGet, useUpdate, useList, useCreate } from '@/lib/data/hooks'
import { useTheme } from '@/app/theme-provider'
import { THEMES } from '@/lib/themes'
import type { GradeBand, GradingScaleDoc, SchoolSettingsDoc, SessionDoc } from '@/lib/types'

function SchoolProfileTab() {
  const { data: settings, isLoading } = useGet<SchoolSettingsDoc>('settings', 'school')
  const update = useUpdate('settings')
  const [form, setForm] = useState<Partial<SchoolSettingsDoc>>({})

  useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  const set = (k: keyof SchoolSettingsDoc, v: string | undefined) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    await update.mutateAsync({ id: 'school', data: { ...form, id: 'school', updatedAt: Date.now() } })
    toast.success('School profile saved', { description: 'Used across templates, report cards and certificates.' })
  }

  if (isLoading || !settings) return null

  const fields: [keyof SchoolSettingsDoc, string, string?][] = [
    ['name', 'School name'],
    ['affiliation', 'Affiliation', 'CBSE (Aff. 130456)'],
    ['principalName', "Principal's name"],
    ['phone', 'Phone (+91)'],
    ['email', 'Email'],
    ['website', 'Website'],
  ]

  return (
    <div className="max-w-2xl space-y-4">
      <ImageUrlField value={form.logoUrl ?? ''} onChange={(v) => set('logoUrl', v)} label="School logo (external URL)" hint="Shown on ID cards, receipts and report cards. A square PNG works best." />
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(([k, label, placeholder]) => (
          <div key={String(k)} className="space-y-1.5">
            <Label>{label}</Label>
            <Input value={String(form[k] ?? '')} placeholder={placeholder} onChange={(e) => set(k, e.target.value)} />
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        <Label>Address</Label>
        <Input value={String(form.address ?? '')} onChange={(e) => set('address', e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>City / State / PIN</Label>
        <Input value={String(form.city ?? '')} onChange={(e) => set('city', e.target.value)} placeholder="Hyderabad, Telangana 500007" />
      </div>
      <Button className="gap-1.5" onClick={save}><Save className="size-4" /> Save profile</Button>
    </div>
  )
}

function GradingScaleTab() {
  const { data: scales } = useList<GradingScaleDoc>('gradingScales')
  const update = useUpdate('gradingScales')
  const create = useCreate('gradingScales')
  const [bands, setBands] = useState<GradeBand[] | null>(null)
  const scale = scales?.[0]

  useEffect(() => {
    if (scale && bands === null) setBands(scale.bands)
  }, [scale, bands])

  const save = async () => {
    if (!scale) return
    const sorted = [...(bands ?? [])].sort((a, b) => b.min - a.min)
    await update.mutateAsync({ id: scale.id, data: { bands: sorted } })
    toast.success('Grading scale saved', { description: 'New marks entries will use these bands immediately.' })
  }

  if (!scales) return null

  if (!scale) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">No grading scale yet. Create the default CBSE 8-band scale.</p>
        <Button
          onClick={async () => {
            await create.mutateAsync({
              data: {
                name: 'CBSE 8-band (default)', isDefault: true,
                bands: [
                  { grade: 'A1', min: 91, max: 100, remark: 'Outstanding' },
                  { grade: 'A2', min: 81, max: 90, remark: 'Excellent' },
                  { grade: 'B1', min: 71, max: 80, remark: 'Very Good' },
                  { grade: 'B2', min: 61, max: 70, remark: 'Good' },
                  { grade: 'C1', min: 51, max: 60, remark: 'Fair' },
                  { grade: 'C2', min: 41, max: 50, remark: 'Needs Improvement' },
                  { grade: 'D', min: 33, max: 40, remark: 'Pass' },
                  { grade: 'E', min: 0, max: 32, remark: 'Needs Special Attention' },
                ],
              },
            })
            toast.success('Default scale created')
          }}
        >
          Create CBSE default scale
        </Button>
      </div>
    )
  }

  const setBand = (i: number, patch: Partial<GradeBand>) =>
    setBands((b) => (b ?? []).map((x, xi) => (xi === i ? { ...x, ...patch } : x)))

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Marks entered as percentages map to grades through these bands. Edits apply to future entries; already-entered marks keep their grade.
      </p>
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Grade</th>
              <th className="px-3 py-2 text-left font-medium">Min %</th>
              <th className="px-3 py-2 text-left font-medium">Max %</th>
              <th className="px-3 py-2 text-left font-medium">Remark</th>
            </tr>
          </thead>
          <tbody>
            {(bands ?? []).map((b, i) => (
              <tr key={i} className="border-b border-border/50 last:border-0">
                <td className="px-2 py-1.5"><Input className="h-8 w-16" value={b.grade} onChange={(e) => setBand(i, { grade: e.target.value.toUpperCase() })} /></td>
                <td className="px-2 py-1.5"><Input className="h-8 w-20" type="number" value={b.min} onChange={(e) => setBand(i, { min: Number(e.target.value) })} /></td>
                <td className="px-2 py-1.5"><Input className="h-8 w-20" type="number" value={b.max} onChange={(e) => setBand(i, { max: Number(e.target.value) })} /></td>
                <td className="px-2 py-1.5"><Input className="h-8" value={b.remark} onChange={(e) => setBand(i, { remark: e.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Button className="gap-1.5" onClick={save}><Save className="size-4" /> Save scale</Button>
        <Button variant="outline" className="gap-1.5" onClick={() => setBands((b) => [...(b ?? []), { grade: '', min: 0, max: 0, remark: '' }])}>
          <Plus className="size-4" /> Add band
        </Button>
        {(bands ?? []).length > 1 && (
          <Button variant="ghost" className="gap-1.5 text-danger" onClick={() => setBands((b) => (b ?? []).slice(0, -1))}>
            <Trash2 className="size-4" /> Remove last
          </Button>
        )}
      </div>
    </div>
  )
}

function ThemeDefaultsTab() {
  const { theme, setTheme } = useTheme()
  const { data: sessions } = useList<SessionDoc>('sessions')
  const active = sessions?.find((s) => s.isActive)
  return (
    <div className="max-w-xl space-y-5">
      <div>
        <Label className="mb-2">Default theme</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {THEMES.map((t) => (
            <button
              key={t.key}
              onClick={() => setTheme(t.key)}
              className={`rounded-xl border p-3 text-left transition-colors ${theme === t.key ? 'border-primary bg-primary-soft' : 'border-border hover:bg-muted'}`}
            >
              <span className="mb-2 block size-8 rounded-lg border border-border" style={{ background: t.swatch }} />
              <p className="text-sm font-semibold">{t.label}</p>
              <p className="text-xs text-muted-foreground">{t.hint}</p>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">The theme is stored per browser. Add your own theme in ~15 lines of CSS - see README.</p>
      </div>
      <Card>
        <CardContent className="p-4 text-sm">
          <div className="flex items-center gap-2">
            <p className="font-semibold">Active session: {active?.name ?? 'none'}</p>
            <InfoTip title="Active session">Change it under Sessions. Fees, attendance and exams attach to the active session.</InfoTip>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <TabbedModule
      title="School Settings"
      info="The school profile feeds every PDF and template. The grading scale drives automatic grade computation. Themes are instant, no redeploy needed."
      tabs={[
        { key: 'profile', label: 'School profile', content: <SchoolProfileTab /> },
        { key: 'grading', label: 'Grading scale', content: <GradingScaleTab /> },
        { key: 'appearance', label: 'Appearance', content: <ThemeDefaultsTab /> },
      ]}
    />
  )
}
