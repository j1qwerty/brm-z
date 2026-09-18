import { type ReactNode } from 'react'
import { CircleHelp } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/**
 * Plain-language explainer beside every module title (Hard Rule 8).
 * Keep the copy friendly and specific: what this does, what you can do here.
 */
export function InfoTip({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`What is ${title}?`}
          className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <CircleHelp className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-80">
        <p className="mb-1 text-sm font-semibold">{title}</p>
        <div className="text-sm text-muted-foreground leading-relaxed">{children}</div>
      </PopoverContent>
    </Popover>
  )
}

export function PageHeader({
  title,
  info,
  actions,
  description,
  tourId,
  className,
}: {
  title: string
  info?: ReactNode
  actions?: ReactNode
  description?: string
  tourId?: string
  className?: string
}) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          {info ? <InfoTip title={title}>{info}</InfoTip> : null}
        </div>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
        {tourId ? null : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
