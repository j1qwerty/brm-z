import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

export function EmptyState({
  title,
  hint,
  action,
  icon,
  compact,
  className,
}: {
  title: string
  hint?: ReactNode
  action?: ReactNode
  icon?: ReactNode
  compact?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 text-center',
        compact ? 'py-6' : 'py-14',
        className,
      )}
    >
      <div className={cn('flex items-center justify-center rounded-full bg-muted text-muted-foreground', compact ? 'size-9' : 'size-12')}>
        {icon ?? <Inbox className="size-5" />}
      </div>
      <p className={cn('font-semibold', compact ? 'text-sm' : 'text-base')}>{title}</p>
      {hint ? <p className="max-w-sm text-sm text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
