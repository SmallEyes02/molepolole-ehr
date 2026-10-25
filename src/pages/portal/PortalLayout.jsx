import { Link, Navigate } from 'react-router-dom'
import { Cross, LogOut } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import Portal from './Portal'
import Activate from './Activate'

export default function PortalLayout() {
  const { profile, profileError, signOut } = useAuth()

  if (!profile) {
    return <div className="flex h-screen items-center justify-center bg-bg text-sm text-ink/60">{profileError || 'Loading...'}</div>
  }
  if (profile.kind === 'staff') return <Navigate to="/" replace />

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Cross size={18} className="text-accent" strokeWidth={2.25} />
            <div>
              <p className="text-sm font-semibold leading-tight text-ink">My health</p>
              {profile.kind === 'patient' && <p className="text-xs leading-tight text-ink/50">{profile.first_name} {profile.last_name}</p>}
            </div>
          </div>
          <button onClick={signOut} className="flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm text-ink/60 hover:bg-bg">
            <LogOut size={16} />Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5">
        {profile.kind === 'patient' ? <Portal /> : <Activate />}
      </main>

      <footer className="mx-auto max-w-3xl px-4 pb-8 text-center text-xs text-ink/40">
        <Link to="/terms" className="underline">Terms of Use</Link> · <Link to="/privacy" className="underline">Privacy Policy</Link>
      </footer>
    </div>
  )
}
