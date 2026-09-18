import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { ROLE_LABEL } from '@/lib/permissions'
import type { Role } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/display'
import { cn } from '@/lib/utils'

const ROLES: Role[] = ['teacher', 'accountant', 'staff', 'student', 'parent']

const schema = z.object({
  name: z.string().min(2, 'Your full name is required'),
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(6, 'At least 6 characters'),
})
type FormValues = z.infer<typeof schema>

export default function SignupPage() {
  const { signUpEmail, signInGoogle, mode } = useAuth()
  const navigate = useNavigate()
  const [role, setRole] = useState<Role>('parent')
  const [busy, setBusy] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', password: '' },
  })

  const onSubmit = async (v: FormValues) => {
    setBusy(true)
    try {
      await signUpEmail(v.name, v.email, v.password, role)
      toast.success('Account created', { description: 'Waiting for admin approval.' })
      navigate('/pending', { replace: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Signup failed')
    } finally {
      setBusy(false)
    }
  }

  const google = async () => {
    try {
      await signInGoogle(role)
      navigate('/pending', { replace: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Google sign-in failed')
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardContent className="p-6">
          <h1 className="text-xl font-bold">Create your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your account starts as <strong>pending</strong>. A school admin must approve it before you can sign in.
          </p>

          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-5 space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" placeholder="e.g. Kavya Iyer" {...form.register('name')} />
              {form.formState.errors.name && <p className="text-xs text-danger">{form.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@school.in" {...form.register('email')} />
              {form.formState.errors.email && <p className="text-xs text-danger">{form.formState.errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="Minimum 6 characters" {...form.register('password')} />
              {form.formState.errors.password && <p className="text-xs text-danger">{form.formState.errors.password.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>I am a</Label>
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
              <p className="text-xs text-muted-foreground">
                Admin accounts cannot be self-registered; an existing admin promotes users from User Accounts.
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />} Create account
            </Button>
          </form>

          {mode === 'firebase' && (
            <>
              <div className="my-4 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <Button variant="outline" className="w-full" onClick={google}>
                <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z"/></svg>
                Sign up with Google
              </Button>
            </>
          )}

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Already registered? <Link to="/login" className="font-medium text-primary hover:underline">Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
