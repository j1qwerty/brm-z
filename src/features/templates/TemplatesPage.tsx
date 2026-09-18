import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Moveable from 'react-moveable'
import { toast } from 'sonner'
import { ArrowDownToLine, GripVertical, Layers, Pencil, Plus, Save, Trash2, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardContent, Separator } from '@/components/ui/display'
import { Input, Label } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SheetContent, Sheet as SheetRoot } from '@/components/ui/dialog'
import { ImageUrlField } from '@/components/shared/ImageUrlField'
import { useList, useCreate, useUpdate } from '@/lib/data/hooks'
import { useAuth } from '@/lib/auth'
import { dataProvider } from '@/lib/data'
import type { ClassDoc, StudentDoc, TemplateDoc, TemplateElement } from '@/lib/types'
import { inr, fmtDate } from '@/lib/utils'
import { cardsGridToPdf } from '@/lib/pdf'
import { TemplateCanvas, type RenderData } from './templateRenderer'

const KIND_TABS: { kind: TemplateDoc['kind']; label: string; page: { w: number; h: number } }[] = [
  { kind: 'idcard-student', label: 'ID Cards (Student)', page: { w: 640, h: 400 } },
  { kind: 'idcard-teacher', label: 'ID Cards (Teacher)', page: { w: 640, h: 400 } },
  { kind: 'idcard-staff', label: 'ID Cards (Staff)', page: { w: 640, h: 400 } },
  { kind: 'receipt', label: 'Receipts', page: { w: 420, h: 600 } },
  { kind: 'reportcard', label: 'Report Cards', page: { w: 800, h: 1130 } },
  { kind: 'certificate', label: 'Certificates', page: { w: 1000, h: 700 } },
]

const ELEMENT_TYPES: { type: TemplateElement['type']; label: string }[] = [
  { type: 'school', label: 'School header' },
  { type: 'photo', label: 'Photo' },
  { type: 'name', label: 'Name' },
  { type: 'class', label: 'Class / Section' },
  { type: 'roll', label: 'Roll no' },
  { type: 'dob', label: 'Date of birth' },
  { type: 'blood', label: 'Blood group' },
  { type: 'phone', label: 'Phone' },
  { type: 'address', label: 'Address' },
  { type: 'qr', label: 'QR code' },
  { type: 'watermark', label: 'Watermark' },
  { type: 'text', label: 'Free text' },
]

function SortableLayer({
  el,
  index,
  selected,
  onSelect,
  onDelete,
}: {
  el: TemplateElement
  index: number
  selected: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: el.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onSelect}
      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
        selected ? 'border-primary bg-primary-soft text-primary' : 'border-border hover:bg-muted'
      }`}
    >
      <button className="cursor-grab touch-none text-muted-foreground" {...attributes} {...listeners} aria-label="Drag to reorder layer">
        <GripVertical className="size-3.5" />
      </button>
      <span className="flex-1 truncate font-medium">{el.label}</span>
      <span className="tabular text-[10px] text-muted-foreground">#{index + 1}</span>
      <button onClick={(e) => { e.stopPropagation(); onDelete() }} className="text-muted-foreground hover:text-danger" aria-label={`Delete ${el.label}`}>
        <Trash2 className="size-3" />
      </button>
    </div>
  )
}

function Designer({
  template,
  onClose,
  students,
  classes,
}: {
  template: TemplateDoc
  onClose: () => void
  students: StudentDoc[]
  classes: ClassDoc[]
}) {
  const update = useUpdate('templates')
  const [name, setName] = useState(template.name)
  const [elements, setElements] = useState<TemplateElement[]>(template.layoutJson.elements)
  const [images, setImages] = useState(template.images)
  const [isDefault, setIsDefault] = useState(template.isDefault)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<HTMLElement | null>(null)
  const [previewMode, setPreviewMode] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const moveableRef = useRef<Moveable | null>(null)
  const nodeRefs = useRef<Map<string, HTMLElement>>(new Map())
  const dragState = useRef<[number, number]>([0, 0])
  const resizeState = useRef<{ w: number; h: number; x: number; y: number }>({ w: 0, h: 0, x: 0, y: 0 })

  const selected = elements.find((e) => e.id === selectedId) ?? null

  useEffect(() => {
    moveableRef.current?.updateRect()
  }, [elements, selectedId, previewMode])

  const demoData: RenderData = useMemo(() => {
    const demoStudent = students[0]
    const cls = classes.find((c) => c.id === demoStudent?.classId)
    return {
      student: demoStudent,
      className: cls?.name ?? 'Class 10',
      school: 'BMRC Public School',
      receipt: {
        no: 'RCP-2026-0042', date: fmtDate(Date.now()),
        student: demoStudent?.name ?? 'Aarav Sharma', cls: `${cls?.name ?? 'Class 10'}-A`,
        fee: 'Tuition Fee - July 2026', amount: inr(2800), mode: 'UPI', collector: 'Prakash Rao',
      },
      certificate: {
        title: 'BONAFIDE CERTIFICATE',
        body: 'This is to certify that the student shown is a bonafide member of this school.',
        serial: 'BF-2026-018', student: demoStudent?.name ?? 'Aarav Sharma',
      },
    }
  }, [students, classes])

  const registerRef = (id: string, node: HTMLDivElement | null) => {
    if (node) {
      nodeRefs.current.set(id, node)
      if (id === selectedId) setSelectedNode(node)
    } else {
      nodeRefs.current.delete(id)
      if (id === selectedId) setSelectedNode(null)
    }
  }

  const patchSelected = (patch: Partial<TemplateElement>) => {
    if (!selectedId) return
    setElements((els) => els.map((e) => (e.id === selectedId ? { ...e, ...patch } : e)))
  }

  const addElement = (type: TemplateElement['type']) => {
    const label = ELEMENT_TYPES.find((t) => t.type === type)?.label ?? type
    const el: TemplateElement = {
      id: `e-${Date.now().toString(36)}`,
      type, label,
      x: 60, y: 80 + (elements.length % 8) * 24,
      w: type === 'photo' ? 110 : type === 'qr' ? 56 : 200,
      h: type === 'photo' ? 130 : type === 'qr' ? 56 : 30,
      fontSize: 14, color: '#0f172a', align: 'left',
      bgColor: type === 'photo' ? '#f1f5f9' : undefined,
      borderRadius: type === 'photo' ? 8 : undefined,
    }
    setElements((els) => [...els, el])
    setSelectedId(el.id)
  }

  const onLayerDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = elements.findIndex((e) => e.id === active.id)
    const newIndex = elements.findIndex((e) => e.id === over.id)
    setElements((els) => arrayMove(els, oldIndex, newIndex))
  }

  const save = async () => {
    await update.mutateAsync({
      id: template.id,
      data: { name, images, isDefault, layoutJson: { page: template.layoutJson.page, elements } },
    })
    toast.success('Template saved')
  }

  const makeDefault = async () => {
    const all = await dataProvider.list<TemplateDoc>('templates', { where: [['kind', '==', template.kind]] })
    for (const t of all) {
      if (t.isDefault && t.id !== template.id) await dataProvider.update('templates', t.id, { isDefault: false })
    }
    await dataProvider.update('templates', template.id, { isDefault: true })
    setIsDefault(true)
    toast.success('Set as default for this kind')
  }

  const bulkPdf = async (classId: string) => {
    const list = students.filter((s) => s.classId === classId && s.status === 'active')
    if (!list.length) {
      toast.error('No students in that class')
      return
    }
    setBulkOpen(false)
    toast.info(`Rendering ${list.length} cards...`)
    const holder = document.createElement('div')
    holder.style.cssText = 'position:fixed;left:-9999px;top:0'
    document.body.appendChild(holder)
    const nodes: HTMLElement[] = []
    const roots: Root[] = []
    const t: TemplateDoc = { ...template, name, images, layoutJson: { page: template.layoutJson.page, elements } }
    for (const s of list) {
      const wrap = document.createElement('div')
      holder.appendChild(wrap)
      const root = createRoot(wrap)
      roots.push(root)
      root.render(
        <TemplateCanvas
          template={t}
          data={{ ...demoData, student: s, className: classes.find((c) => c.id === s.classId)?.name }}
        />,
      )
      // let images/QR paint
      await new Promise((r) => setTimeout(r, 80))
      const first = wrap.firstElementChild
      if (first) nodes.push(first as HTMLElement)
    }
    await cardsGridToPdf(nodes, `idcards-${classId}.pdf`, { cardW: 86, cardH: 54 })
    for (const r of roots) r.unmount()
    holder.remove()
    toast.success(`${nodes.length} ID cards exported`)
  }

  const currentTemplate: TemplateDoc = { ...template, name, images, layoutJson: { page: template.layoutJson.page, elements } }

  return (
    <SheetRoot open onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        wide
        title={`Designer · ${template.name}`}
        description="Drag elements on the canvas, resize with the handles, reorder layers on the left, save when done. The default template per kind drives PDFs."
      >
        <div className="grid gap-4 lg:grid-cols-[190px_1fr_230px]">
          {/* layers */}
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Layers className="size-3.5" /> Layers (bottom to top)</p>
            <DndContext collisionDetection={closestCenter} onDragEnd={onLayerDragEnd}>
              <SortableContext items={elements.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {elements.map((el, i) => (
                    <SortableLayer
                      key={el.id}
                      el={el}
                      index={i}
                      selected={selectedId === el.id}
                      onSelect={() => setSelectedId(el.id)}
                      onDelete={() => setElements((els) => els.filter((x) => x.id !== el.id))}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <Select value="" onValueChange={(v) => addElement(v as TemplateElement['type'])}>
              <SelectTrigger className="h-8 text-xs"><Plus className="size-3.5" /> Add element</SelectTrigger>
              <SelectContent>
                {ELEMENT_TYPES.map((t) => <SelectItem key={t.type} value={t.type}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* canvas */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex rounded-lg border border-border p-0.5">
                {(['edit', 'preview'] as const).map((m) => {
                  const active = (m === 'preview') === previewMode
                  return (
                    <button
                      key={m}
                      onClick={() => setPreviewMode(m === 'preview')}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${active ? 'bg-primary-soft text-primary' : 'text-muted-foreground'}`}
                    >
                      {m}
                    </button>
                  )
                })}
              </div>
              <p className="tabular text-[11px] text-muted-foreground">{template.layoutJson.page.w} x {template.layoutJson.page.h}px</p>
            </div>
            <div className="overflow-auto rounded-xl border border-border bg-muted/40 p-4">
              <div className="relative mx-auto" style={{ width: template.layoutJson.page.w }}>
                <TemplateCanvas
                  template={currentTemplate}
                  data={demoData}
                  interactive={!previewMode}
                  selectedId={selectedId}
                  onSelectElement={setSelectedId}
                  registerRef={registerRef}
                />
                {!previewMode && selectedNode && (
                  <Moveable
                    ref={moveableRef}
                    target={selectedNode}
                    draggable
                    resizable
                    keepRatio={false}
                    renderDirections={['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w']}
                    onDragStart={({ set }) => {
                      dragState.current = [selected?.x ?? 0, selected?.y ?? 0]
                      set(dragState.current)
                    }}
                    onDrag={({ beforeTranslate }) => {
                      dragState.current = [beforeTranslate[0] ?? 0, beforeTranslate[1] ?? 0]
                      const node = nodeRefs.current.get(selected?.id ?? '')
                      if (node) {
                        node.style.left = `${beforeTranslate[0]}px`
                        node.style.top = `${beforeTranslate[1]}px`
                      }
                    }}
                    onDragEnd={() => {
                      const [x, y] = dragState.current
                      if (selected) {
                        patchSelected({ x: Math.round(x), y: Math.round(y) })
                      }
                    }}
                    onResizeStart={({ setOrigin, dragStart }) => {
                      setOrigin(['%', '%'])
                      if (dragStart) dragStart.set([selected?.x ?? 0, selected?.y ?? 0])
                    }}
                    onResize={({ width, height, drag }) => {
                      resizeState.current = {
                        w: width, h: height,
                        x: drag?.beforeTranslate[0] ?? selected?.x ?? 0,
                        y: drag?.beforeTranslate[1] ?? selected?.y ?? 0,
                      }
                      const node = nodeRefs.current.get(selected?.id ?? '')
                      if (node) {
                        node.style.width = `${width}px`
                        node.style.height = `${height}px`
                        if (drag?.beforeTranslate) {
                          node.style.left = `${drag.beforeTranslate[0]}px`
                          node.style.top = `${drag.beforeTranslate[1]}px`
                        }
                      }
                    }}
                    onResizeEnd={() => {
                      if (selected) {
                        const { w, h, x, y } = resizeState.current
                        patchSelected({ w: Math.round(w), h: Math.round(h), x: Math.round(x), y: Math.round(y) })
                      }
                    }}
                  />
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="gap-1.5" onClick={save}><Save className="size-3.5" /> Save template</Button>
              {!isDefault && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={makeDefault}><Wand2 className="size-3.5" /> Make default</Button>
              )}
              {template.kind.startsWith('idcard') && (
                <Button size="sm" variant="soft" className="gap-1.5" onClick={() => setBulkOpen(true)}>
                  <ArrowDownToLine className="size-3.5" /> Bulk PDF for a class
                </Button>
              )}
            </div>
          </div>

          {/* properties */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Template name</Label>
              <Input className="h-8" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {selected ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Selected: {selected.label}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['x', 'y', 'w', 'h'] as const).map((k) => (
                    <div key={k} className="space-y-0.5">
                      <label className="text-[10px] uppercase text-muted-foreground">{k}</label>
                      <Input
                        className="h-7 text-xs" type="number"
                        value={selected[k]}
                        onChange={(e) => patchSelected({ [k]: Number(e.target.value) } as Partial<TemplateElement>)}
                      />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="space-y-0.5">
                    <label className="text-[10px] uppercase text-muted-foreground">Font size</label>
                    <Input className="h-7 text-xs" type="number" value={selected.fontSize ?? 14} onChange={(e) => patchSelected({ fontSize: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-0.5">
                    <label className="text-[10px] uppercase text-muted-foreground">Color</label>
                    <Input className="h-7 w-full text-xs" type="color" value={selected.color ?? '#0f172a'} onChange={(e) => patchSelected({ color: e.target.value })} />
                  </div>
                  <div className="space-y-0.5">
                    <label className="text-[10px] uppercase text-muted-foreground">Align</label>
                    <select
                      className="h-7 w-full rounded-md border border-input bg-card px-1.5 text-xs"
                      value={selected.align ?? 'left'}
                      onChange={(e) => patchSelected({ align: e.target.value as TemplateElement['align'] })}
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                  <div className="space-y-0.5">
                    <label className="text-[10px] uppercase text-muted-foreground">Label</label>
                    <Input className="h-7 text-xs" value={selected.label} onChange={(e) => patchSelected({ label: e.target.value })} />
                  </div>
                </div>
                <Button
                  size="sm" variant="ghost" className="w-full gap-1 text-danger"
                  onClick={() => { setElements((els) => els.filter((x) => x.id !== selected.id)); setSelectedId(null) }}
                >
                  <Trash2 className="size-3" /> Delete element
                </Button>
              </div>
            ) : (
              <p className="rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
                Select an element on the canvas to edit position, size and style.
              </p>
            )}
            <Separator />
            <ImageUrlField value={images.logo ?? ''} onChange={(v) => setImages((im) => ({ ...im, logo: v }))} label="Logo URL" />
            <ImageUrlField value={images.background ?? ''} onChange={(v) => setImages((im) => ({ ...im, background: v }))} label="Background image URL" />
            <ImageUrlField value={images.extra1 ?? ''} onChange={(v) => setImages((im) => ({ ...im, extra1: v }))} label="Extra image slot" hint="Reserved for future kinds" />
            {isDefault && <Badge variant="success">default for this kind</Badge>}
          </div>
        </div>
      </SheetContent>

      {bulkOpen && (
        <BulkPicker
          classes={classes}
          onClose={() => setBulkOpen(false)}
          onPick={(cid) => void bulkPdf(cid)}
        />
      )}
    </SheetRoot>
  )
}

function BulkPicker({ classes, onClose, onPick }: { classes: ClassDoc[]; onClose: () => void; onPick: (classId: string) => void }) {
  const [cid, setCid] = useState('')
  return (
    <SheetRoot open onOpenChange={(o) => !o && onClose()}>
      <SheetContent title="Bulk ID cards" description="Renders every active student of the class onto A4 sheets (2 per row) using this template.">
        <div className="space-y-3">
          <Select value={cid} onValueChange={setCid}>
            <SelectTrigger><SelectValue placeholder="Pick class" /></SelectTrigger>
            <SelectContent>
              {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button className="w-full" disabled={!cid} onClick={() => onPick(cid)}>Generate PDF</Button>
        </div>
      </SheetContent>
    </SheetRoot>
  )
}

export default function TemplatesPage() {
  const { user } = useAuth()
  const { data: templates, isLoading } = useList<TemplateDoc>('templates')
  const { data: students } = useList<StudentDoc>('students')
  const { data: classes } = useList<ClassDoc>('classes')
  const create = useCreate('templates')
  const [designing, setDesigning] = useState<TemplateDoc | null>(null)

  const del = async (t: TemplateDoc) => {
    await dataProvider.softDelete('templates', t.id, user?.id)
    toast.success('Template moved to Trash')
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold tracking-tight">Templates</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Visual designers for every printed artefact: ID cards, receipts, report cards and certificates. One default per kind drives PDFs everywhere.
        </p>
      </div>
      {isLoading ? (
        <Card><CardContent className="p-8"><div className="mx-auto h-24 w-40 animate-pulse rounded-lg bg-muted" /></CardContent></Card>
      ) : (
        <div className="space-y-6">
          {KIND_TABS.map(({ kind, label }) => {
            const list = (templates ?? []).filter((t) => t.kind === kind)
            const page = KIND_TABS.find((k) => k.kind === kind)?.page ?? { w: 640, h: 400 }
            return (
              <div key={kind}>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">{label}</p>
                  <Button
                    size="sm" variant="ghost" className="gap-1 text-xs"
                    onClick={async () => {
                      await create.mutateAsync({
                        data: {
                          kind, name: `New ${label.toLowerCase()}`, images: { logo: '', background: '', extra1: '' }, isDefault: false,
                          layoutJson: { page, elements: [] },
                        },
                      })
                      toast.success('Blank template created')
                    }}
                  >
                    <Plus className="size-3" /> New blank
                  </Button>
                </div>
                {list.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                    No templates of this kind yet.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {list.map((t) => (
                      <Card key={t.id} className="w-64 transition-shadow hover:shadow-md">
                        <CardContent className="p-4">
                          <div className="flex aspect-[16/10] items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
                            <div style={{ transform: `scale(${Math.min(1, 224 / t.layoutJson.page.w)})`, transformOrigin: 'center' }}>
                              <TemplateCanvas template={t} data={{ school: 'BMRC Public School', className: 'Class 10-A' }} />
                            </div>
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{t.name}</p>
                              {t.isDefault ? <Badge variant="success">default</Badge> : <Badge variant="neutral">custom</Badge>}
                            </div>
                            <div className="flex gap-1">
                              <Button size="sm" variant="soft" className="gap-1" onClick={() => setDesigning(t)}>
                                <Pencil className="size-3" /> Design
                              </Button>
                              {!t.isDefault && (
                                <Button size="iconSm" variant="ghost" className="text-danger" aria-label={`Delete ${t.name}`} onClick={() => del(t)}>
                                  <Trash2 className="size-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {designing && students && classes && (
        <Designer template={designing} onClose={() => setDesigning(null)} students={students} classes={classes} />
      )}
    </div>
  )
}
