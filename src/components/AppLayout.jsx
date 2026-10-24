import { Suspense, useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, LogOut, Cross, ArrowLeftRight, BarChart3, ShieldCheck, Menu, X, UserCog, CalendarDays, Receipt, Package, KeyRound, Settings as SettingsIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { isAdministrator, can } from '../lib/permissions'

const mainNav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/patients', label: 'Patients', icon: Users, end: false },
  { to: '/referrals', label: 'Referrals', icon: ArrowLeftRight, end: false }
]

const adminNav = [
  { to: '/admin/staff', label: 'Staff', icon: UserCog },
  { to: '/admin/appointments', label: 'Appointments', icon: CalendarDays },
  { to: '/admin/finance', label: 'Finance', icon: Receipt },
  { to: '/admin/inventory', label: 'Inventory', icon: Package },
  { to: '/admin/access', label: 'Access control', icon: KeyRound },
  { to: '/admin/settings', label: 'Settings', icon: SettingsIcon },
  { to: '/activity', label: 'Activity log', icon: ShieldCheck }
]

export default function AppLayout() {
  const { profile, profileError, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  const admin = isAdministrator(profile?.role_id)
  const navItems = can(profile, 'reports.view')
    ? [...mainNav, { to: '/reports', label: 'Reports', icon: BarChart3, end: false }]
    : mainNav

  return (
    <div className="flex min-h-screen flex-col bg-bg md:flex-row">
      {/* Top bar: visible on small screens, holds the menu toggle */}
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <Cross size={18} className="text-accent" strokeWidth={2.25} />
          <span className="text-sm font-semibold text-ink">Molepolole EHR</span>
        </div>
        <button onClick={() => setMenuOpen((v) => !v)} className="text-ink/70" aria-label="Toggle menu">
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      <aside className={`w-full shrink-0 flex-col border-r border-border bg-surface md:flex md:w-56 ${menuOpen ? 'flex' : 'hidden'}`}>
        <div className="hidden items-center gap-2 border-b border-border px-4 py-4 md:flex">
          <Cross size={20} className="text-accent" strokeWidth={2.25} />
          <div>
            <p className="text-sm font-semibold leading-tight text-ink">Molepolole EHR</p>
            <p className="text-xs leading-tight text-ink/50">{profile?.facilities?.name || 'Clinic system'}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {navItems.map((item) => <NavItem key={item.to} item={item} onNavigate={() => setMenuOpen(false)} />)}
          {admin && (
            <>
              <p className="px-3 pb-1 pt-4 text-xs font-medium uppercase tracking-wide text-ink/40">Administration</p>
              {adminNav.map((item) => <NavItem key={item.to} item={item} onNavigate={() => setMenuOpen(false)} />)}
            </>
          )}
        </nav>

        <div className="border-t border-border p-3">
          <p className="truncate text-sm font-medium text-ink">
            {profile ? `${profile.first_name} ${profile.last_name}` : profileError ? 'Profile not loaded' : 'Loading...'}
          </p>
          <p className="mb-2 truncate text-xs text-ink/50">{profile?.roles?.name}</p>
          <button onClick={signOut} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-ink/60 hover:bg-bg">
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {profileError && (
          <div className="border-b border-danger/30 bg-danger/5 px-6 py-3 text-sm text-danger">
            Your staff profile could not be loaded: {profileError}. Check that the database schema is fully
            applied (including migration 0009) and that this account has a row in the staff table.
          </div>
        )}
        <Suspense fallback={<div className="p-6 text-sm text-ink/50">Loading...</div>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}

function NavItem({ item, onNavigate }) {
  const { to, label, icon: Icon, end } = item
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors ${
          isActive ? 'bg-ink text-white' : 'text-ink/70 hover:bg-bg'
        }`
      }
    >
      <Icon size={18} />
      {label}
    </NavLink>
  )
}
