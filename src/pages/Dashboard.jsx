import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Activity, UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'
import { can } from '../lib/permissions'

export default function Dashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState({ patients: null, openVisits: null, todayVisits: null })
  const [recentVisits, setRecentVisits] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    loadStats()
  }, [profile])

  async function loadStats() {
    setLoading(true)
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    const [{ count: patientCount }, { count: openCount }, { count: todayCount }, { data: visits }] =
      await Promise.all([
        supabase.from('patients').select('id', { count: 'exact', head: true }),
        supabase.from('visits').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('visits').select('id', { count: 'exact', head: true }).gte('visit_date', startOfDay.toISOString()),
        supabase
          .from('visits')
          .select('id, visit_date, visit_type, status, chief_complaint, patients(first_name, last_name)')
          .order('visit_date', { ascending: false })
          .limit(8)
      ])

    setStats({ patients: patientCount ?? 0, openVisits: openCount ?? 0, todayVisits: todayCount ?? 0 })
    setRecentVisits(visits || [])
    setLoading(false)
  }

  return (
    <div>
      <PageHeader
        title={`Welcome, ${profile?.first_name || ''}`}
        subtitle={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        action={can(profile, 'patients.register') ? (
          <Link to="/patients/new" className="btn-primary">
            <UserPlus size={16} />
            Register patient
          </Link>
        ) : null}
      />

      <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-3">
        <StatCard icon={Users} label="Registered patients" value={stats.patients} />
        <StatCard icon={Activity} label="Open encounters" value={stats.openVisits} />
        <StatCard icon={Activity} label="Visits today" value={stats.todayVisits} />
      </div>

      <div className="px-6 pb-6">
        <div className="card overflow-x-auto">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Recent encounters</h2>
          </div>
          <table>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink/40">
                <th className="px-4 py-2 font-medium">Patient</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Chief complaint</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {!loading && recentVisits.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-ink/40">
                    No encounters recorded yet.
                  </td>
                </tr>
              )}
              {recentVisits.map((v) => (
                <tr key={v.id} className="border-t border-border text-sm">
                  <td className="px-4 py-2 text-ink">{v.patients?.first_name} {v.patients?.last_name}</td>
                  <td className="px-4 py-2 capitalize text-ink/70">{v.visit_type.replace('_', ' ')}</td>
                  <td className="px-4 py-2 text-ink/70">{v.chief_complaint || '—'}</td>
                  <td className="px-4 py-2">
                    <StatusChip status={v.status} />
                  </td>
                  <td className="px-4 py-2 text-ink/50">{new Date(v.visit_date).toLocaleDateString('en-GB')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="card flex items-center gap-4 p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-accent/10">
        <Icon size={20} className="text-accent" />
      </div>
      <div>
        <p className="text-xl font-semibold text-ink">{value ?? '—'}</p>
        <p className="text-xs text-ink/50">{label}</p>
      </div>
    </div>
  )
}

function StatusChip({ status }) {
  const styles = {
    open: 'border-l-4 border-warning text-warning',
    closed: 'border-l-4 border-success text-success',
    referred: 'border-l-4 border-accent text-accent'
  }
  return <span className={`pl-2 text-xs font-medium capitalize ${styles[status] || ''}`}>{status}</span>
}
