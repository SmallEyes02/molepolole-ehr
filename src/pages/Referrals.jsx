import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'

export default function Referrals() {
  const { profile } = useAuth()
  const [incoming, setIncoming] = useState([])
  const [outgoing, setOutgoing] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile) load()
  }, [profile])

  async function load() {
    setLoading(true)
    const [{ data: inc }, { data: out }] = await Promise.all([
      supabase
        .from('referrals')
        .select('id, reason, status, created_at, patients(id, first_name, last_name), facilities!referrals_referring_facility_id_fkey(name)')
        .eq('receiving_facility_id', profile.facility_id)
        .order('created_at', { ascending: false }),
      supabase
        .from('referrals')
        .select('id, reason, status, created_at, patients(id, first_name, last_name), facilities!referrals_receiving_facility_id_fkey(name)')
        .eq('referring_facility_id', profile.facility_id)
        .order('created_at', { ascending: false })
    ])
    setIncoming(inc || [])
    setOutgoing(out || [])
    setLoading(false)
  }

  async function updateStatus(id, status) {
    await supabase.from('referrals').update({ status, resolved_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  return (
    <div>
      <PageHeader title="Referrals" subtitle="Patients referred to or from your facility." />

      <div className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-2">
        <div className="card overflow-x-auto">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Incoming</h2>
          </div>
          <table>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink/40">
                <th className="px-4 py-2 font-medium">Patient</th>
                <th className="px-4 py-2 font-medium">From</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {!loading && incoming.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-ink/40">No incoming referrals.</td></tr>
              )}
              {incoming.map((r) => (
                <tr key={r.id} className="border-t border-border text-sm">
                  <td className="px-4 py-2">
                    <Link to={`/patients/${r.patients.id}`} className="font-medium text-accent hover:underline">
                      {r.patients.first_name} {r.patients.last_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-ink/70">{r.facilities?.name}</td>
                  <td className="px-4 py-2"><StatusChip status={r.status} /></td>
                  <td className="px-4 py-2">
                    {r.status === 'pending' && (
                      <div className="flex gap-2">
                        <button onClick={() => updateStatus(r.id, 'accepted')} className="text-xs font-medium text-success hover:underline">Accept</button>
                        <button onClick={() => updateStatus(r.id, 'declined')} className="text-xs font-medium text-danger hover:underline">Decline</button>
                      </div>
                    )}
                    {r.status === 'accepted' && (
                      <button onClick={() => updateStatus(r.id, 'completed')} className="text-xs font-medium text-accent hover:underline">Mark completed</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card overflow-x-auto">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Outgoing</h2>
          </div>
          <table>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink/40">
                <th className="px-4 py-2 font-medium">Patient</th>
                <th className="px-4 py-2 font-medium">To</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {!loading && outgoing.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-sm text-ink/40">No outgoing referrals.</td></tr>
              )}
              {outgoing.map((r) => (
                <tr key={r.id} className="border-t border-border text-sm">
                  <td className="px-4 py-2">
                    <Link to={`/patients/${r.patients.id}`} className="font-medium text-accent hover:underline">
                      {r.patients.first_name} {r.patients.last_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-ink/70">{r.facilities?.name}</td>
                  <td className="px-4 py-2"><StatusChip status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatusChip({ status }) {
  const styles = {
    pending: 'border-l-4 border-warning text-warning',
    accepted: 'border-l-4 border-accent text-accent',
    completed: 'border-l-4 border-success text-success',
    declined: 'border-l-4 border-danger text-danger'
  }
  return <span className={`pl-2 text-xs font-medium capitalize ${styles[status] || ''}`}>{status}</span>
}
