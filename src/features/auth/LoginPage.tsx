import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { GraduationCap, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { ROLE_HOME, ROLE_LABEL } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Card, CardContent, Separator } from '@/components/ui/display'

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(6, 'At least 6 characters'),
})
type FormValues = z.infer<typeof schema>

export default function LoginPage() {
  const { status, user, signInEmail, signInGoogle, demoAccounts, demoLogin, mode } = useAuth()
  const navigate = useNavigate()
  const loc = useLocation()
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  const from = (loc.state as { from?: string } | null)?.from

  useEffect(() => {
    if (status === 'active' && user) navigate(from ?? ROLE_HOME[user.role], { replace: true })
  }, [status, user, navigate, from])

  if (status === 'active' && user) return <Navigate to={ROLE_HOME[user.role]} replace />

  const onSubmit = async (v: FormValues) => {
    setBusy(true)
    try {
      await signInEmail(v.email, v.password)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sign in failed')
    } finally {
      setBusy(false)
    }
  }

  const google = async () => {
    setGoogleBusy(true)
    try {
      await signInGoogle()
      // Routing is state-driven: active users go to their role home
      // (effect above), pending users are sent to /pending by the guard.
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Google sign-in failed')
    } finally {
      setGoogleBusy(false)
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand side */}
      <div className="relative hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-white/15">
            <GraduationCap className="size-6" />
          </span>
          <p className="text-lg font-bold">BMRC School Management</p>
        </div>
        <div>
          <h1 className="max-w-md text-3xl font-bold leading-tight">
            One place for admissions, attendance, fees, exams and everything between.
          </h1>
          <p className="mt-3 max-w-md text-white/75">
            Built for Indian schools: April to March sessions, sections, CBSE grading, TCs, fee receipts and parent portals.
          </p>
        </div>
        <p className="text-sm text-white/60">Nursery to Class 12 · CBSE pattern</p>
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="p-6">
            <div className="mb-6 flex items-center gap-2 lg:hidden">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <GraduationCap className="size-4" />
              </span>
              <p className="font-bold">BMRC School Management</p>
            </div>
            <h2 className="text-xl font-bold">Sign in</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === 'demo'
                ? 'This is demo mode. Pick a demo account below, or sign in with any seeded email.'
                : 'Use your school account. New here? Ask the admin to approve your signup.'}
            </p>

            <form onSubmit={form.handleSubmit(onSubmit)} className="mt-5 space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" placeholder="you@school.in" {...form.register('email')} />
                {form.formState.errors.email && (
                  <p className="text-xs text-danger">{form.formState.errors.email.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete="current-password" placeholder="••••••••" {...form.register('password')} />
                {form.formState.errors.password && (
                  <p className="text-xs text-danger">{form.formState.errors.password.message}</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={busy || googleBusy}>
                {busy && <Loader2 className="size-4 animate-spin" />} Sign in
              </Button>
            </form>

            {mode === 'firebase' && (
              <>
                <div className="my-5 flex items-center gap-3">
                  <Separator className="flex-1" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <Separator className="flex-1" />
                </div>
                <Button variant="outline" className="w-full" onClick={google} disabled={busy || googleBusy}>
                  {googleBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z"/></svg>
                  )}
                  Continue with Google
                </Button>
              </>
            )}

            {mode === 'demo' && (
              <>
                <div className="my-5 flex items-center gap-3">
                  <Separator className="flex-1" />
                  <span className="text-xs text-muted-foreground">or one-tap demo accounts</span>
                  <Separator className="flex-1" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {demoAccounts.map((a) => (
                    <Button key={a.id} variant="outline" size="sm" className="justify-start" onClick={() => demoLogin(a.id)}>
                      <span className="flex size-4 items-center justify-center rounded-full bg-primary-soft text-[9px] font-bold text-primary">
                        {ROLE_LABEL[a.role][0]}
                      </span>
                      {ROLE_LABEL[a.role]}
                    </Button>
                  ))}
                </div>
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  Seeded data: 18 students, fees, exams, attendance and more.
                </p>
              </>
            )}

            <p className="mt-5 text-center text-sm text-muted-foreground">
              No account?{' '}
              <Link to="/signup" className="font-medium text-primary hover:underline">Create one</Link>
              {' '}(needs admin approval)
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
