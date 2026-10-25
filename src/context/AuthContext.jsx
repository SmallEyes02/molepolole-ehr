import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

// profile.kind is one of:
//   'staff'    - has a row in the staff table (clinic, administrator, etc.)
//   'patient'  - signed in with a login that is linked to a patient record
//   'unlinked' - a valid login that is neither (a patient who has not yet
//                entered their activation code)
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState('')
  const [notice, setNotice] = useState('')

  async function loadProfile(userId) {
    const { data: staffRow, error } = await supabase
      .from('staff')
      .select('id, first_name, last_name, is_active, facility_id, role_id, facilities(name), roles(name)')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('Could not load staff profile:', error)
      setProfileError(error.message)
      return
    }

    if (staffRow) {
      // deactivated accounts are signed straight back out
      if (!staffRow.is_active) {
        setNotice('This account has been deactivated. Contact your administrator.')
        setProfile(null)
        await supabase.auth.signOut()
        return
      }
      const { data: perms } = await supabase
        .from('role_permissions')
        .select('permission_code')
        .eq('role_id', staffRow.role_id)
      setProfileError('')
      setProfile({ ...staffRow, kind: 'staff', permissions: (perms || []).map((p) => p.permission_code) })
      return
    }

    const { data: account, error: accountError } = await supabase
      .from('patient_accounts')
      .select('patient_id, patients(first_name, last_name)')
      .eq('user_id', userId)
      .maybeSingle()

    if (accountError) {
      console.error('Could not load patient profile:', accountError)
      setProfileError(accountError.message)
      return
    }

    setProfileError('')
    if (account) {
      setProfile({
        kind: 'patient',
        patient_id: account.patient_id,
        first_name: account.patients?.first_name,
        last_name: account.patients?.last_name,
        permissions: []
      })
    } else {
      setProfile({ kind: 'unlinked', permissions: [] })
    }
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

  // pass a user id right after sign-up, before React has stored the new session
  async function reloadProfile(userId) {
    const id = userId || session?.user?.id
    if (id) await loadProfile(id)
  }

  return (
    <AuthContext.Provider value={{ session, profile, profileError, notice, loading, signIn, signOut, reloadProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
