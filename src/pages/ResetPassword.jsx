import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabase'
import { writeAudit } from '../lib/audit'
import { Alert, BrandLogo, Button } from '../components/ui'

export default function ResetPassword() {
  const { session, loading, configured } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [recoveryReady, setRecoveryReady] = useState(false)

  useEffect(() => {
    if (!supabase) return undefined

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryReady(true)
    })

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setRecoveryReady(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (!loading && session && !recoveryReady) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      await supabase.auth.signOut()
      await writeAudit(supabase, 'Reset password', 'Login')
      navigate('/login', { replace: true, state: { passwordReset: true } })
    } catch (err) {
      setError(err.message || 'Could not update password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="card w-full max-w-md p-8">
        <div className="mb-8 text-center">
          <BrandLogo className="mx-auto mb-4 h-12 w-auto object-contain" />
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Create new password</h2>
          <p className="mt-1 text-sm text-slate-500">
            After you save, you will return to the sign-in page.
          </p>
        </div>

        {!configured && (
          <div className="mb-5">
            <Alert tone="warning">
              Add your Supabase URL and anon key to <code>.env</code>.
            </Alert>
          </div>
        )}

        {!recoveryReady && !loading ? (
          <div className="space-y-3 text-sm leading-6 text-slate-600">
            <Alert tone="warning">
              Please open the password reset link from your email first.
            </Alert>
            <ol className="list-decimal space-y-1 rounded-2xl bg-slate-50 px-4 py-3 pl-8">
              <li>Go to your email inbox.</li>
              <li>Open the message about resetting your OPCR password.</li>
              <li>Click the button or link in that email.</li>
              <li>This page will open so you can type a new password.</li>
            </ol>
            <p>
              Link expired or missing? Go back to{' '}
              <Link to="/login" className="font-semibold text-teal-700 underline">
                Sign in
              </Link>{' '}
              and tap <strong>Forgot password?</strong> again.
            </p>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700">
                <Lock size={14} /> New password
              </span>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="field"
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700">
                <Lock size={14} /> Confirm password
              </span>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="field"
                placeholder="Re-enter your new password"
                autoComplete="new-password"
              />
            </label>
            {error && <Alert tone="danger">{error}</Alert>}
            <Button variant="primary" className="w-full" disabled={submitting || !configured} type="submit">
              {submitting ? 'Saving…' : 'Update password'}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link to="/login" className="font-semibold text-teal-700 hover:text-teal-800">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
