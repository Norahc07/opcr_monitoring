import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Lock, Mail } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { Alert, BrandLogo, Button } from '../components/ui'

export default function Login() {
  const { session, loading, configured, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!loading && session) return <Navigate to="/" replace />

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signIn(email.trim(), password)
    } catch (err) {
      setError(err.message || 'Unable to sign in.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative hidden overflow-hidden bg-teal-950 text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgb(52_211_153/0.25),transparent_40%),radial-gradient(circle_at_80%_80%,rgb(13_148_136/0.35),transparent_45%)]" />
        <div className="relative">
          <BrandLogo className="h-16 w-auto max-w-xs object-contain" />
          <p className="mt-8 text-sm font-semibold tracking-[0.2em] text-emerald-300 uppercase">
            LGU Mauban, Quezon
          </p>
          <h1 className="mt-3 max-w-md text-5xl leading-tight font-semibold tracking-tight">
            Office Performance, clearly tracked.
          </h1>
          <p className="mt-4 max-w-md text-base leading-7 text-teal-100/80">
            Enter your tally, follow your targets, and keep OPCR records in one clean workspace for
            E-Learning Ville.
          </p>
        </div>
        <p className="relative text-sm text-teal-200/70">Staff · Head · Manager</p>
      </section>

      <section className="flex items-center justify-center px-4 py-10">
        <div className="card w-full max-w-md p-8">
          <div className="mb-8">
            <BrandLogo className="mb-4 h-12 w-auto object-contain lg:hidden" />
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Welcome back</h2>
            <p className="mt-1 text-sm text-slate-500">Sign in to your OPCR workspace.</p>
          </div>

          {!configured && (
            <div className="mb-5">
              <Alert tone="warning">
                Add your Supabase URL and anon key to <code>.env</code>.
              </Alert>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700">
                <Mail size={14} /> Email
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="field"
                placeholder="Enter your email address"
                autoComplete="email"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700">
                <Lock size={14} /> Password
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="field"
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </label>
            {error && <Alert tone="danger">{error}</Alert>}
            <Button variant="primary" className="w-full" disabled={submitting || !configured} type="submit">
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          <p className="mt-6 text-center text-xs leading-5 text-slate-500">
            Accounts are created in the Supabase dashboard. Ask your head or admin if you need access.
          </p>
        </div>
      </section>
    </div>
  )
}
