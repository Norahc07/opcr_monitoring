import { useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { writeAudit } from '../lib/audit'
import { pingLastSeen, PRESENCE_PING_MS } from '../lib/presence'
import { AuthContext } from './auth-context'

async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

async function waitForProfile(userId, attempts = 6) {
  for (let i = 0; i < attempts; i += 1) {
    const profile = await fetchProfile(userId)
    if (profile) return profile
    await new Promise((resolve) => setTimeout(resolve, 400))
  }

  const { data, error } = await supabase
    .from('profiles')
    .insert({ id: userId, full_name: '', role: 'staff' })
    .select()
    .maybeSingle()

  if (!error && data) return data
  return fetchProfile(userId)
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return undefined
    }

    let active = true

    async function loadSession(nextSession) {
      setSession(nextSession)
      if (!nextSession?.user) {
        setProfile(null)
        setLoading(false)
        return
      }

      try {
        const nextProfile = await waitForProfile(nextSession.user.id)
        if (active) {
          setProfile(nextProfile)
          setError('')
        }
      } catch (err) {
        if (active) setError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'TOKEN_REFRESHED') {
        setSession(nextSession)
        return
      }
      setLoading(true)
      loadSession(nextSession)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const userId = session?.user?.id
    if (!supabase || !userId) return undefined

    let active = true

    async function ping() {
      if (!active) return
      try {
        await pingLastSeen(supabase, userId)
      } catch {
        // Presence is optional until supabase/user_presence.sql is run.
      }
    }

    void ping()
    const timer = window.setInterval(ping, PRESENCE_PING_MS)
    function onVisible() {
      if (document.visibilityState === 'visible') void ping()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [session?.user?.id])

  const value = useMemo(
    () => ({
      session,
      user: session?.user || null,
      profile,
      loading,
      error,
      isAdmin: profile?.role === 'admin',
      configured: isSupabaseConfigured,
      async signIn(email, password) {
        if (!supabase) throw new Error('Supabase is not configured.')
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (signInError) throw signInError
        await writeAudit(supabase, 'Signed in', 'Login', email)
      },
      async resetPassword(email) {
        if (!supabase) throw new Error('Supabase is not configured.')
        const appUrl = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '')
        const redirectTo = `${appUrl}/reset-password`
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo,
        })
        if (resetError) throw resetError
      },
      async updatePassword(password) {
        if (!supabase) throw new Error('Supabase is not configured.')
        const { error: updateError } = await supabase.auth.updateUser({ password })
        if (updateError) throw updateError
      },
      async updateProfile(updates) {
        if (!supabase || !session?.user) throw new Error('You must be signed in.')
        const payload = {
          full_name: updates.fullName?.trim() ?? '',
          short_name: updates.shortName?.trim() ?? '',
          position: updates.position?.trim() ?? '',
        }
        const { error: saveError } = await supabase
          .from('profiles')
          .update(payload)
          .eq('id', session.user.id)
        if (saveError) throw saveError
        const nextProfile = await fetchProfile(session.user.id)
        setProfile(nextProfile)
        return nextProfile
      },
      async signOut() {
        if (!supabase) return
        await writeAudit(supabase, 'Signed out', 'Login')
        await supabase.auth.signOut()
      },
      async refreshProfile() {
        if (!session?.user) return
        const nextProfile = await fetchProfile(session.user.id)
        setProfile(nextProfile)
      },
    }),
    [session, profile, loading, error],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
