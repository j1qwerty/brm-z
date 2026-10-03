import { useEffect, useState } from 'react'
import { qrDataUrl } from '@/lib/qr'
import type { StudentDoc, StaffDoc, TemplateDoc } from '@/lib/types'

export interface RenderData {
  school?: string
  student?: StudentDoc
  staff?: StaffDoc
  className?: string
  receipt?: { no: string; date: string; student: string; cls: string; fee: string; amount: string; mode: string; collector: string }
  certificate?: { title: string; body: string; serial: string; student: string }
  watermarkText?: string
  extraText?: string
}

const textValue = (type: TemplateDoc['layoutJson']['elements'][number]['type'], d: RenderData): string => {
  const s = d.student
  switch (type) {
    case 'school': return d.school ?? 'BRM International Public School'
    case 'name': return s?.name ?? d.certificate?.student ?? d.receipt?.student ?? d.staff?.name ?? 'Student Name'
    case 'class': return d.receipt ? d.receipt.cls : `${d.className ?? ''}${s ? `-${s.section}` : ''}` || 'Class - Section'
    case 'roll': return s?.rollNo ? `Roll No: ${s.rollNo}` : 'Roll No: 00'
    case 'dob': return s?.dob ? `DOB: ${s.dob}` : 'DOB: 01 Jan 2010'
    case 'blood': return s?.bloodGroup ? `Blood: ${s.bloodGroup}` : 'Blood: O+'
    case 'phone': return s?.guardianPhone ?? s?.phone ?? d.staff?.phone ?? '+91 98480 00000'
    case 'address': return s?.address ?? d.staff?.address ?? 'Address, City'
    case 'watermark': return d.watermarkText ?? 'BRM'
    default: return d.extraText ?? ''
  }
}

/** Renders one template element (absolutely positioned). Used by designer canvas, previews and PDF capture. */
export function TemplateElementBox({
  el,
  data,
  images,
  interactive,
  selected,
  onClick,
  registerRef,
}: {
  el: TemplateDoc['layoutJson']['elements'][number]
  data: RenderData
  images: TemplateDoc['images']
  interactive?: boolean
  selected?: boolean
  onClick?: () => void
  registerRef?: (id: string, node: HTMLDivElement | null) => void
}) {
  const [qr, setQr] = useState<string | null>(null)
  const [logoOk, setLogoOk] = useState(true)
  const [photoOk, setPhotoOk] = useState(false)

  useEffect(() => {
    if (el.type === 'qr') {
      const payload = data.student ? `BRM:${data.student.admissionNo}` : data.receipt ? `RCP:${data.receipt.no}` : data.certificate ? `CERT:${data.certificate.serial}` : 'BRM-ID'
      void qrDataUrl(payload, 160).then(setQr)
    }
  }, [el.type, data.student, data.receipt, data.certificate])

  const base: React.CSSProperties = {
    position: 'absolute',
    left: el.x,
    top: el.y,
    width: el.w,
    height: el.h,
    fontSize: el.fontSize,
    fontWeight: el.fontWeight,
    color: el.color,
    textAlign: el.align,
    background: el.bgColor,
    borderRadius: el.borderRadius,
    cursor: interactive ? 'move' : 'default',
    outline: selected ? '2px solid var(--color-primary)' : undefined,
    outlineOffset: 2,
    display: 'flex',
    flexDirection: 'column',
    alignItems: el.align === 'center' ? 'center' : el.align === 'right' ? 'flex-end' : 'flex-start',
    justifyContent: 'center',
    overflow: 'hidden',
    lineHeight: 1.25,
  }

  if (el.type === 'photo') {
    const src = data.student?.photoUrl ?? data.staff?.photoUrl
    return (
      <div
        ref={(node) => registerRef?.(el.id, node)}
        style={base}
        onClick={onClick}
        className={interactive ? 'select-none' : undefined}
      >
        {src && (photoOk || !photoOk) ? (
          <img src={src} alt="photo" onError={() => setPhotoOk(false)} onLoad={() => setPhotoOk(true)} className="size-full object-cover" style={{ borderRadius: el.borderRadius }} />
        ) : (
          <span className="flex size-full items-center justify-center text-xs text-slate-400" style={{ background: el.bgColor ?? '#f1f5f9' }}>Photo</span>
        )}
      </div>
    )
  }

  if (el.type === 'qr') {
    return (
      <div ref={(node) => registerRef?.(el.id, node)} style={base} onClick={onClick}>
        {qr ? <img src={qr} alt="QR" className="size-full object-contain" /> : <span className="text-[10px]">QR</span>}
      </div>
    )
  }

  if (el.type === 'watermark') {
    return (
      <div
        ref={(node) => registerRef?.(el.id, node)}
        style={{ ...base, pointerEvents: 'none', alignItems: 'center', justifyContent: 'center' }}
        onClick={onClick}
      >
        <span style={{ fontSize: el.fontSize, fontWeight: 800, color: el.color, opacity: 0.5 }}>{textValue('watermark', data)}</span>
      </div>
    )
  }

  const label: string =
    el.type === 'text' ? (el.label === 'Receipt No' ? data.receipt?.no ?? el.label
      : el.label === 'Date' ? data.receipt?.date ?? el.label
      : el.label === 'Fee details' ? data.receipt?.fee ?? el.label
      : el.label === 'Amount' ? data.receipt?.amount ?? el.label
      : el.label === 'Mode' ? data.receipt?.mode ?? el.label
      : el.label === 'Collector' ? data.receipt?.collector ?? el.label
      : el.label === 'Report card title' ? 'Report Card'
      : el.label === 'Marks table' ? ''
      : el.label === 'Remarks' ? ''
      : el.label === 'Result' ? ''
      : el.label === 'Certificate title' ? data.certificate?.title ?? el.label
      : el.label === 'Body' ? data.certificate?.body ?? el.label
      : el.label === 'Serial' ? data.certificate?.serial ?? el.label
      : el.label === 'Designation' ? (data.staff?.designation ?? el.label)
      : el.label)
    : textValue(el.type, data)

  if (el.type === 'school' && images?.logo && logoOk) {
    return (
      <div ref={(node) => registerRef?.(el.id, node)} style={{ ...base, flexDirection: 'row', gap: 10 }} onClick={onClick}>
        <img src={images.logo} alt="logo" onError={() => setLogoOk(false)} className="shrink-0 object-contain" style={{ height: Math.min(el.h, 44) }} />
        <span className="min-w-0 truncate">{textValue('school', data)}</span>
      </div>
    )
  }

  return (
    <div ref={(node) => registerRef?.(el.id, node)} style={base} onClick={onClick} className={interactive ? 'select-none' : undefined}>
      {el.type === 'text' && el.label === 'Marks table' ? null : label}
    </div>
  )
}

/** Full template canvas (page background + all elements). */
export function TemplateCanvas({
  template,
  data,
  interactive,
  selectedId,
  onSelectElement,
  registerRef,
  backgroundOpacity = 1,
}: {
  template: TemplateDoc
  data: RenderData
  interactive?: boolean
  selectedId?: string | null
  onSelectElement?: (id: string) => void
  registerRef?: (id: string, node: HTMLDivElement | null) => void
  backgroundOpacity?: number
}) {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: template.layoutJson.page.w,
        height: template.layoutJson.page.h,
        background: template.images.background ? `center/cover url(${template.images.background})` : undefined,
        opacity: backgroundOpacity,
        backgroundColor: template.images.background ? undefined : '#ffffff',
      }}
    >
      {template.images.background && backgroundOpacity < 1 && (
        <div className="absolute inset-0" style={{ background: '#fff', opacity: 1 - backgroundOpacity }} />
      )}
      {template.layoutJson.elements.map((el) => (
        <TemplateElementBox
          key={el.id}
          el={el}
          data={data}
          images={template.images}
          interactive={interactive}
          selected={selectedId === el.id}
          onClick={onSelectElement ? () => onSelectElement(el.id) : undefined}
          registerRef={registerRef}
        />
      ))}
    </div>
  )
}
