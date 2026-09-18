import { useEffect, useRef } from 'react'
import { driver, type Driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'
import { CircleHelp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/display'

function flagKey(tourId: string) {
  return `bmrc-tour-${tourId}`
}

function buildDriver(steps: DriveStep[], tourId: string): Driver {
  const d = driver({
    showProgress: true,
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Got it',
    progressText: '{{current}} of {{total}}',
    steps,
    onDestroyed: () => {
      try {
        localStorage.setItem(flagKey(tourId), '1')
      } catch {
        // private mode: tour just replays next visit
      }
    },
  })
  return d
}

/** Runs a module tour once per browser (localStorage-flagged). Replay button provided in PageHeader via TourHelp. */
export function useModuleTour(tourId: string, steps: DriveStep[], autoStart = true) {
  const driverRef = useRef<Driver | null>(null)
  const key = flagKey(tourId)

  useEffect(() => {
    let seen = true
    try {
      seen = Boolean(localStorage.getItem(key))
    } catch {
      seen = false
    }
    if (!seen && autoStart && steps.length) {
      const t = setTimeout(() => {
        driverRef.current = buildDriver(steps, tourId)
        driverRef.current.drive()
      }, 800)
      return () => clearTimeout(t)
    }
  }, [tourId, autoStart]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    replay: () => {
      driverRef.current = buildDriver(steps, tourId)
      driverRef.current.drive()
    },
  }
}

/** "Help" button to replay a module tour on demand. */
export function TourHelp({ tourId, steps }: { tourId: string; steps: DriveStep[] }) {
  const { replay } = useModuleTour(`${tourId}-manual`, steps, false)
  return (
    <Tooltip content="Take the tour of this page">
      <Button variant="ghost" size="icon" aria-label="Replay tour" onClick={replay}>
        <CircleHelp className="size-4" />
      </Button>
    </Tooltip>
  )
}

/** Welcome tour (per role) shown once. Call from role dashboards. */
export function useWelcomeTour(role: string, steps: DriveStep[]) {
  return useModuleTour(`welcome-${role}`, steps, true)
}
