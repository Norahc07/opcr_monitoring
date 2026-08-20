import { useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { writeAudit } from '../lib/audit'
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
