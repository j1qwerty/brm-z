import { Navigate, Outlet, useLocation } from 'react-router'
import { Loader2, ShieldAlert, Hourglass } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { can, type Capability } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/display'

export function RequireAuth() {
  const { status } = useAuth()
  const loc = useLocation()

  if (status === 'booting') {
    return (
      <div className="flex h-dvh items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <span className="text-sm">Loading BRM School Management...</span>
      </div>
    )
  }
  if (status === 'signedOut') return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (status === 'pending') return <Navigate to="/pending" replace />
  return <Outlet />
}

export function RequireCapability({ capability, children }: { capability: Capability; children: React.ReactNode }) {
  const { user } = useAuth()
  if (!can(user?.role, capability)) {
    return (
      <Card className="mx-auto mt-10 max-w-md">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <ShieldAlert className="size-10 text-warning" />
          <h2 className="text-lg font-semibold">Not available for your role</h2>
          <p className="max-w-xs text-sm text-muted-foreground">
            Your role ({user?.role}) does not include this area. If you think this is a mistake, ask the school admin to review your role.
          </p>
          <Button variant="outline" onClick={() => history.back()}>Go back</Button>
        </CardContent>
      </Card>
    )
  }
  return <>{children}</>
}

export function PendingScreen() {
  const { user, signOut } = useAuth()
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="max-w-md">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <Hourglass className="size-10 text-primary" />
          <h1 className="text-lg font-semibold">Waiting for admin approval</h1>
          <p className="text-sm text-muted-foreground">
            Your account <strong>{user?.email}</strong> is registered with role <strong>{user?.role}</strong> and is pending
            approval. The school admin has been notified. You will get access as soon as they approve you.
          </p>
          <Button variant="outline" onClick={() => signOut()}>Sign out</Button>
        </CardContent>
      </Card>
    </div>
  )
}

export function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-5xl font-bold text-primary">404</p>
      <p className="text-muted-foreground">That page does not exist in this school.</p>
      <Button onClick={() => (location.href = '/dashboard')}>Back to dashboard</Button>
    </div>
  )
}
