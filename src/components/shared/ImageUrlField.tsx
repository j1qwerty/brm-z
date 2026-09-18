import { useState } from 'react'
import { CheckCircle2, Link2, Loader2, Shrink } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * External-URL image field (Hard Rule 11 - no Firebase Storage).
 * Validates that the URL actually loads as an image, previews it live,
 * and can shrink to a small data-URL for avatars (<=128px, canvas downscale).
 */
export function ImageUrlField({
  value,
  onChange,
  label = 'Image URL',
  hint,
  allowAvatarShrink,
  className,
}: {
  value?: string
  onChange: (v: string) => void
  label?: string
  hint?: string
  allowAvatarShrink?: boolean
  className?: string
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [shrinkNote, setShrinkNote] = useState<string | null>(null)

  const validate = (url: string) => {
    if (!url) {
      setState('idle')
      setDims(null)
      return
    }
    setState('loading')
    const img = new Image()
    img.onload = () => {
      setDims({ w: img.naturalWidth, h: img.naturalHeight })
      setState('ok')
    }
    img.onerror = () => setState('error')
    img.src = url
  }

  const shrinkToAvatar = () => {
    if (!value) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 128
      canvas.height = 128
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const side = Math.min(img.naturalWidth, img.naturalHeight)
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 128, 128)
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
        onChange(dataUrl)
        validate(dataUrl)
        setShrinkNote('Shrunk to a 128px avatar image (stored inline, keeps Firestore light).')
      } catch {
        setShrinkNote('This image server blocks canvas shrinking (CORS). Use the original URL.')
      }
    }
    img.src = value
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="text-sm font-medium">{label}</label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={value ?? ''}
            onChange={(e) => {
              onChange(e.target.value)
              validate(e.target.value)
            }}
            placeholder="https://example.com/photo.jpg"
            className="pl-8"
          />
        </div>
        {allowAvatarShrink && value && state === 'ok' && dims && (dims.w > 128 || dims.h > 128) && (
          <Button type="button" variant="outline" size="icon" title="Shrink to 128px avatar" onClick={shrinkToAvatar}>
            <Shrink className="size-4" />
          </Button>
        )}
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {state === 'loading' && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Checking image...</p>
      )}
      {state === 'error' && value ? (
        <p className="text-xs text-danger">This URL did not load as an image. Paste a direct link to a JPG/PNG/WebP file.</p>
      ) : null}
      {state === 'ok' && value ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-2">
          <img src={value} alt="Preview" className="size-14 rounded-md object-cover" />
          <div className="text-xs text-muted-foreground">
            <p className="flex items-center gap-1 text-success"><CheckCircle2 className="size-3.5" /> Image loads correctly</p>
            {dims ? (
              <p className="tabular mt-0.5">
                {dims.w} x {dims.h}px
                {dims.w > 1200 && ' - quite large, it will slow record loads'}
                {dims.w <= 128 && dims.h <= 128 && ' - good for avatars'}
              </p>
            ) : null}
            {shrinkNote ? <p className="mt-0.5 text-primary">{shrinkNote}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
