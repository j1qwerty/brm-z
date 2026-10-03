import { useEffect } from 'react'
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router'
import { AlertOctagon, Home, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/display'

/**
 * Catches render-time crashes so the user gets a real page instead of React's
 * dev "Unexpected Application Error" overlay. Always offers a way out.
 */
export default function ErrorPage() {
  const error = useRouteError()
  const navigate = useNavigate()

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Something went wrong.'

  useEffect(() => {
    console.error('[app] route error:', error)
  }, [error])

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardContent className="p-6 text-center">
          <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-danger-soft text-danger">
            <AlertOctagon className="size-5" />
          </span>
          <h1 className="text-lg font-bold">This page could not load</h1>
          <p className="mt-1.5 break-words text-sm text-muted-foreground">{message}</p>
          <p className="mt-3 text-xs text-muted-foreground">
            Your data is saved locally — nothing was lost. Try again, or go back to the dashboard.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="outline" className="gap-1.5" onClick={() => window.location.reload()}>
              <RotateCcw className="size-4" /> Try again
            </Button>
            <Button className="gap-1.5" onClick={() => navigate('/dashboard')}>
              <Home className="size-4" /> Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}