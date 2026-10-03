// After the first Google sign-in the users doc exists but the role was defaulted.
// This screen lets a Google user pick the role they are requesting before admin approval.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { dataProvider } from '@/lib/data'
import { ROLE_LABEL } from '@/lib/permissions'
import type { Role } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/display'
import { cn } from '@/lib/utils'

const ROLES: Role[] = ['teacher', 'accountant', 'staff', 'student', 'parent']

export default function CompleteProfilePage() {
  const { user, status, signOut } = useAuth()
  const navigate = useNavigate()
  const [role, setRole] = useState<Role | null>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [linkGmail, setLinkGmail] = useState(true)

  useEffect(() => {
    if (user?.name) setName(user.name)
  }, [user])

  useEffect(() => {
    if (status === 'active') navigate('/dashboard', { replace: true })
    if (status === 'signedOut') navigate('/login', { replace: true })
  }, [status, navigate])

  if (status !== 'active' && status !== 'pending') return null

  const submit = async () => {
    if (!user || !role) return
    setBusy(true)
    try {
      await dataProvider.update('users', user.id, {
        role,
        status: 'pending',
        name: name || user.name,
        // Bind this Google account for future Google sign-ins; an admin
        // approves it in User Accounts (Linked Gmail column).
        ...(linkGmail && user.email ? { linkedGmail: user.email.toLowerCase(), gmailStatus: 'pending' as const } : {}),
      })
      toast.success('Request sent', { description: 'An admin will review your role request.' })
      navigate('/pending', { replace: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardContent className="p-6">
          <h1 className="text-xl font-bold">Almost there</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tell us who you are in the school. An admin will approve your account with this role.
          </p>
          <div className="mt-4 space-y-1.5">
            <label className="text-sm font-medium">Your name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-xs"
              placeholder="Your full name"
            />
          </div>
          <div className="mt-4 space-y-1.5">
            <label className="text-sm font-medium">I am a</label>
            <div className="grid grid-cols-3 gap-1.5">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={cn(
                    'rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                    role === r ? 'border-primary bg-primary-soft text-primary' : 'border-border hover:bg-muted',
                  )}
                >
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          </div>
          <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--primary)]"
              checked={linkGmail}
              onChange={(e) => setLinkGmail(e.target.checked)}
            />
            <span>
              Link <span className="font-mono text-xs">{user?.email}</span> for Google sign-in
              <span className="block text-xs text-muted-foreground">An admin approves it in User Accounts before it counts.</span>
            </span>
          </label>
          <div className="mt-5 flex gap-2">
            <Button className="flex-1" onClick={submit} disabled={!role || busy}>
              {busy && <Loader2 className="size-4 animate-spin" />} Continue
            </Button>
            <Button variant="outline" onClick={() => signOut()}>Cancel</Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Signed in as {user?.email}. Wrong account? <button className="text-primary hover:underline" onClick={() => signOut()}>Switch</button>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
