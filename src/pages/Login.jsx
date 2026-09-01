import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Lock, Mail } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { Alert, BrandLogo, Button } from '../components/ui'

export default function Login() {
  const { session, loading, configured, signIn } = useAuth()
  const location = useLocation()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(
    location.state?.passwordReset ? 'Password updated. Sign in with your new password.' : '',
  )
  const [submitting, setSubmitting] = useState(false)

  if (!loading && session) return <Navigate to="/" replace />

  async function handleSignIn(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setSubmitting(true)
    try {
      await signIn(email.trim(), password)
    } catch (err) {
      setError(err.message || 'Unable to sign in.')
    } finally {
      setSubmitting(false)
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode)
    setError('')
    setNotice('')
    setPassword('')
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
            Office Performance Commitment and Review (OPCR)
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
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
              {mode === 'login' ? 'Welcome back' : 'Forgot password?'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {mode === 'login'
                ? 'Sign in with the login email and password your admin gave you.'
                : 'Office accounts use custom login emails, not real inboxes.'}
            </p>
          </div>

          {!configured && (
            <div className="mb-5">
              <Alert tone="warning">
                Add your Supabase URL and anon key to <code>.env</code>.
              </Alert>
            </div>
          )}

          {mode === 'forgot' && (
            <button
              type="button"
              className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:text-teal-800"
              onClick={() => switchMode('login')}
            >
              <ArrowLeft size={14} />
              Back to sign in
            </button>
          )}

          {mode === 'forgot' && (
            <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
              <p className="font-semibold text-slate-800">What to do</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>Go to your office admin or head.</li>
                <li>Tell them your name — they will reset your password.</li>
                <li>Sign in with your login email and the new password they give you.</li>
                <li>After signing in, open Profile to choose your own password.</li>
              </ol>
            </div>
          )}

          {mode === 'login' && (
            <form className="space-y-4" onSubmit={handleSignIn}>
              <label className="block">
                <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Mail size={14} /> Login email
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="field"
                  placeholder="e.g. bal@opcr.local"
                  autoComplete="username"
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
              {notice && <Alert tone="success">Password updated. Sign in with your new password.</Alert>}
              {error && <Alert tone="danger">{error}</Alert>}
              <Button variant="primary" className="w-full" disabled={submitting || !configured} type="submit">
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          )}

          {mode === 'login' && (
            <p className="mt-4 text-center">
              <button
                type="button"
                className="text-sm font-semibold text-teal-700 hover:text-teal-800"
                onClick={() => switchMode('forgot')}
              >
                Forgot password?
              </button>
            </p>
          )}

          <p className="mt-6 text-center text-xs leading-5 text-slate-500">
            Accounts are created by your admin. Ask your head or admin if you need access or forgot
            your password.
          </p>
        </div>
      </section>
    </div>
  )
}
