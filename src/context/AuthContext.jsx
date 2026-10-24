import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState('')
  const [notice, setNotice] = useState('')

  async function loadProfile(userId) {
    const { data, error } = await supabase
      .from('staff')
      .select('id, first_name, last_name, is_active, facility_id, role_id, facilities(name), roles(name)')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Could not load staff profile:', error)
      setProfileError(error.message)
      return
    }

    // deactivated accounts are signed straight back out
    if (!data.is_active) {
      setNotice('This account has been deactivated. Contact your administrator.')
      setProfile(null)
      await supabase.auth.signOut()
      return
    }

    const { data: perms } = await supabase
      .from('role_permissions')
      .select('permission_code')
      .eq('role_id', data.role_id)

    setProfileError('')
    setProfile({ ...data, permissions: (perms || []).map((p) => p.permission_code) })
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) loadProfile(session.user.id)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function signIn(email, password) {
    setNotice('')
    return supabase.auth.signInWithPassword({ email, password })
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, profile, profileError, notice, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
