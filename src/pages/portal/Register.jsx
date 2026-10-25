import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Cross } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { claimMessage } from '../../lib/portal'
import Banner from '../../components/Banner'

export default function Register() {
  const navigate = useNavigate()
  const { reloadProfile } = useAuth()
  const [form, setForm] = useState({ email: '', password: '', confirm: '', code: '' })
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (form.password.length < 8) return setError('Choose a password of at least 8 characters.')
    if (form.password !== form.confirm) return setError('The two passwords do not match.')
    setBusy(true)

    const { data, error: signUpError } = await supabase.auth.signUp({ email: form.email.trim(), password: form.password })
    if (signUpError) {
      setBusy(false)
      return setError(signUpError.message)
    }
    // some projects answer "already registered" with an empty identities list
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setBusy(false)
      return setError('An account with this email already exists. Sign in instead, and enter your code when asked.')
    }

    if (data.session) {
      const { data: status, error: claimError } = await supabase.rpc('claim_portal_invite', { p_code: form.code })
      if (claimError) {
        setBusy(false)
        return setError(claimError.message)
      }
      const message = claimMessage(status)
      if (message) {
        setBusy(false)
        return setError(`Your account was created, but your record could not be linked. ${message} You can sign in and try again.`)
      }
      await reloadProfile(data.user.id)
      setBusy(false)
      return navigate('/portal', { replace: true })
    }

    // email confirmation is switched on: they confirm, sign in, then enter the code
    setBusy(false)
    setDone('We sent a confirmation link to your email. Open it, then sign in. You will be asked for your activation code.')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-sm bg-ink"><Cross size={22} className="text-accent" /></div>
          <h1 className="text-lg font-semibold text-ink">Create your patient account</h1>
          <p className="text-sm text-ink/60">See your visits, medicines and appointments online.</p>
        </div>

        {done ? (
          <div className="card space-y-3 p-6">
            <Banner kind="success">{done}</Banner>
            <Link to="/login" className="btn-primary w-full">Go to sign in</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="card space-y-4 p-6">
            <p className="rounded-sm border border-border bg-bg px-3 py-2 text-sm text-ink/70">
              You need an <strong>activation code</strong> from the clinic. Ask at the front desk and bring your Omang.
            </p>
            <Banner>{error}</Banner>
            <div><label className="label" htmlFor="email">Email</label><input id="email" type="email" required className="input" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" /></div>
            <div><label className="label" htmlFor="pw">Password (at least 8 characters)</label><input id="pw" type="password" required className="input" value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" /></div>
            <div><label className="label" htmlFor="pw2">Repeat password</label><input id="pw2" type="password" required className="input" value={form.confirm} onChange={(e) => set('confirm', e.target.value)} autoComplete="new-password" /></div>
            <div><label className="label" htmlFor="code">Activation code</label><input id="code" required className="input font-mono uppercase tracking-widest" placeholder="ABCD-EFGH" value={form.code} onChange={(e) => set('code', e.target.value)} autoComplete="off" maxLength={12} /></div>
            <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Creating account...' : 'Create account'}</button>
          </form>
        )}

        <p className="mt-4 text-center text-sm text-ink/60">
          Already registered? <Link to="/login" className="font-medium text-accent hover:underline">Sign in</Link>
        </p>
        <p className="mt-3 text-center text-xs text-ink/40">
          By creating an account you agree to the <Link to="/terms" className="underline">Terms of Use</Link> and <Link to="/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  )
}
