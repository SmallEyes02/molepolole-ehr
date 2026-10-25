import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Cross } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import Banner from '../components/Banner'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`
    })
    setBusy(false)
    if (error) return setError(error.message)
    // the same answer whether or not the address has an account
    setSent(true)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-sm bg-ink"><Cross size={22} className="text-accent" /></div>
          <h1 className="text-lg font-semibold text-ink">Reset your password</h1>
          <p className="text-sm text-ink/60">Enter the email you signed up with and we will send you a link.</p>
        </div>

        {sent ? (
          <div className="card space-y-3 p-6">
            <Banner kind="success">If there is an account for that email, a reset link is on its way. Check your inbox and spam folder.</Banner>
            <Link to="/login" className="btn-primary w-full">Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="card space-y-4 p-6">
            <Banner>{error}</Banner>
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Sending...' : 'Send reset link'}</button>
          </form>
        )}
        {!sent && <p className="mt-4 text-center text-sm"><Link to="/login" className="text-accent hover:underline">Back to sign in</Link></p>}
      </div>
    </div>
  )
}
