import { Info } from 'lucide-react'
import { DEMO_MODE } from '@/lib/data'

/** Slim banner shown while the app runs without Firebase env vars (demo mode). */
export function DemoBanner() {
  if (!DEMO_MODE) return null
  return (
    <div className="flex items-center justify-center gap-2 border-b border-border bg-warning-soft px-4 py-1.5 text-center text-xs text-warning">
      <Info className="size-3.5 shrink-0" />
      <span>
        <strong>Demo mode:</strong> data lives in this browser only. Add your Firebase keys to <code className="font-mono">.env.local</code> and restart to go live - see README.
      </span>
    </div>
  )
}
