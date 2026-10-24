import { useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { Cross } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { session, signIn, notice } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const { error } = await signIn(email, password)
    setSubmitting(false)
    if (error) setError(error.message)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-sm bg-ink">
            <Cross size={22} className="text-accent" />
          </div>
          <h1 className="text-lg font-semibold text-ink">Molepolole EHR</h1>
          <p className="text-sm text-ink/50">Sign in with your clinic staff account.</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          {notice && !error && (
            <div className="rounded-sm border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">
              {notice}
            </div>
          )}
          {error && (
            <div className="rounded-sm border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">Work email</label>
            <input
              id="email"
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-ink/40">
          By signing in you agree to the{' '}
          <Link to="/terms" className="underline hover:text-ink/70">Terms of Use</Link>{' '}
          and{' '}
          <Link to="/privacy" className="underline hover:text-ink/70">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  )
}
