import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import PageHeader from '../components/PageHeader'
import { can } from '../lib/permissions'
import { useAuth } from '../context/AuthContext'

export default function Patients() {
  const { profile } = useAuth()
  const [query, setQuery] = useState('')
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timeout = setTimeout(loadPatients, 250)
    return () => clearTimeout(timeout)
  }, [query])

  async function loadPatients() {
    setLoading(true)
    let request = supabase
      .from('patients')
      .select('id, card_number, first_name, last_name, date_of_birth, sex, omang_number, phone, villages(name)')
      .order('created_at', { ascending: false })
      .limit(50)

    const q = query.trim().replace(/[,()]/g, ' ')
    if (q) {
      request = request.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,omang_number.ilike.%${q}%,card_number.ilike.%${q}%`)
    }

    const { data, error } = await request
    if (!error) setPatients(data)
    setLoading(false)
  }

  return (
    <div>
      <PageHeader
        title="Patients"
        subtitle="Search the patient register or add a new patient."
        action={can(profile, 'patients.register') ? (
          <Link to="/patients/new" className="btn-primary">
            <UserPlus size={16} />
            Register patient
          </Link>
        ) : null}
      />

      <div className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <div className="relative w-full max-w-sm">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
            <input
              className="input pl-9"
              placeholder="Search by name, Omang or card number"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="card overflow-x-auto">
          <table>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink/40">
                <th className="px-4 py-2 font-medium">Card no.</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Omang number</th>
                <th className="px-4 py-2 font-medium">Sex</th>
                <th className="px-4 py-2 font-medium">Date of birth</th>
                <th className="px-4 py-2 font-medium">Village</th>
                <th className="px-4 py-2 font-medium">Phone</th>
              </tr>
            </thead>
            <tbody>
              {!loading && patients.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-ink/40">
                    No patients found.
                  </td>
                </tr>
              )}
              {patients.map((p) => (
                <tr key={p.id} className="border-t border-border text-sm hover:bg-bg">
                  <td className="px-4 py-2 font-mono text-xs text-ink/70">{p.card_number}</td>
                  <td className="px-4 py-2">
                    <Link to={`/patients/${p.id}`} className="font-medium text-accent hover:underline">
                      {p.first_name} {p.last_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-ink/70">{p.omang_number || '—'}</td>
                  <td className="px-4 py-2 text-ink/70">{p.sex}</td>
                  <td className="px-4 py-2 text-ink/70">{new Date(p.date_of_birth).toLocaleDateString('en-GB')}</td>
                  <td className="px-4 py-2 text-ink/70">{p.villages?.name || '—'}</td>
                  <td className="px-4 py-2 text-ink/70">{p.phone || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
