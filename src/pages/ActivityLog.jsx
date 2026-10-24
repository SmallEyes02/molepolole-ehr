import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import PageHeader from '../components/PageHeader'

export default function ActivityLog() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('audit_log')
      .select('id, table_name, record_id, action, occurred_at, staff(first_name, last_name)')
      .order('occurred_at', { ascending: false })
      .limit(100)
    if (!error) setEntries(data)
    setLoading(false)
  }

  return (
    <div>
      <PageHeader title="Activity log" subtitle="Who changed what, and when, at your facility." />

      <div className="p-6">
        <div className="card overflow-x-auto">
          <table>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink/40">
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Staff member</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Table</th>
                <th className="px-4 py-2 font-medium">Record</th>
              </tr>
            </thead>
            <tbody>
              {!loading && entries.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-ink/40">No activity recorded yet.</td></tr>
              )}
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-border text-sm">
                  <td className="px-4 py-2 text-ink/50">{new Date(e.occurred_at).toLocaleString('en-GB')}</td>
                  <td className="px-4 py-2 text-ink">{e.staff ? `${e.staff.first_name} ${e.staff.last_name}` : 'Unknown'}</td>
                  <td className="px-4 py-2 capitalize text-ink/70">{e.action}</td>
                  <td className="px-4 py-2 font-mono text-xs text-ink/70">{e.table_name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-ink/50">{e.record_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
