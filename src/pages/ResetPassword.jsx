import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Cross } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import Banner from '../components/Banner'

// Opened from the link in the reset email. Supabase signs the person in
// with a short-lived recovery session, which is what lets them set a new password.
export default function ResetPassword() {
  const navigate = useNavigate()
  const [state, setState] = useState('checking')   // checking | ready | invalid | done
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setState((s) => (s === 'checking' ? (data.session ? 'ready' : 'invalid') : s))
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (alive && (event === 'PASSWORD_RECOVERY' || session)) setState((s) => (s === 'done' ? s : 'ready'))
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) return setError('Choose a password of at least 8 characters.')
    if (password !== confirm) return setError('The two passwords do not match.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setError(error.message)
    setState('done')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-sm bg-ink"><Cross size={22} className="text-accent" /></div>
          <h1 className="text-lg font-semibold text-ink">Choose a new password</h1>
        </div>

        {state === 'checking' && <p className="text-center text-sm text-ink/50">Checking your link...</p>}

        {state === 'invalid' && (
          <div className="card space-y-3 p-6">
            <Banner>This reset link is not valid or has expired. Request a new one.</Banner>
            <Link to="/forgot-password" className="btn-primary w-full">Request a new link</Link>
          </div>
        )}

        {state === 'ready' && (
          <form onSubmit={submit} className="card space-y-4 p-6">
            <Banner>{error}</Banner>
            <div><label className="label" htmlFor="pw">New password (at least 8 characters)</label><input id="pw" type="password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></div>
            <div><label className="label" htmlFor="pw2">Repeat new password</label><input id="pw2" type="password" required className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></div>
            <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Saving...' : 'Save new password'}</button>
          </form>
        )}

        {state === 'done' && (
          <div className="card space-y-3 p-6">
            <Banner kind="success">Your password has been changed.</Banner>
            <button className="btn-primary w-full" onClick={() => navigate('/', { replace: true })}>Continue</button>
          </div>
        )}
      </div>
    </div>
  )
}
