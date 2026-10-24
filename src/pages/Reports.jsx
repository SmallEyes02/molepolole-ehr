import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Download } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../hooks/useSettings'
import { isAdministrator } from '../lib/permissions'
import { downloadCsv } from '../lib/csv'
import PageHeader from '../components/PageHeader'

const RANGES = [7, 30, 90]

function tally(rows, keyFn) {
  const counts = {}
  for (const r of rows) {
    const k = keyFn(r)
    if (k) counts[k] = (counts[k] || 0) + 1
  }
  return Object.entries(counts).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
}

function Section({ title, rows, filename, children }) {
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {rows?.length > 0 && (
          <button className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline" onClick={() => downloadCsv(filename, rows)}>
            <Download size={12} />CSV
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

function MiniTable({ rows }) {
  if (!rows.length) return <p className="py-4 text-center text-sm text-ink/40">No data for this period.</p>
  const cols = Object.keys(rows[0])
  return (
    <table>
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-ink/40">
          {cols.map((c) => <th key={c} className="py-1 pr-4 font-medium">{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-border text-sm">
            {cols.map((c) => <td key={c} className="py-1.5 pr-4 text-ink/80">{r[c]}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function HBar({ data, color }) {
  if (!data.length) return <p className="py-8 text-center text-sm text-ink/40">No data for this period.</p>
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 32)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#D8DEE4" horizontal={false} />
        <XAxis type="number" allowDecimals={false} stroke="#10233B99" fontSize={12} />
        <YAxis type="category" dataKey="label" width={150} stroke="#10233B99" fontSize={11} />
        <Tooltip />
        <Bar dataKey="count" fill={color} radius={[0, 2, 2, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export default function Reports() {
  const { profile } = useAuth()
  const settings = useSettings()
  const admin = isAdministrator(profile?.role_id)
  const [days, setDays] = useState(30)
  const [d, setD] = useState(null)

  useEffect(() => { if (profile) load() }, [days, profile])

  async function load() {
    setD(null)
    const since = new Date()
    since.setDate(since.getDate() - days)
    const iso = since.toISOString()

    const [patients, staff, visits, dx, referrals, appts, bills] = await Promise.all([
      supabase.from('patients').select('sex, created_at').limit(10000),
      supabase.from('staff').select('is_active, roles(name)'),
      supabase.from('visits').select('visit_type').gte('visit_date', iso),
      supabase.from('visit_diagnoses').select('icd_codes(description), visits!inner(visit_date)').gte('visits.visit_date', iso),
      supabase.from('referrals').select('referring_facility_id').gte('created_at', iso),
      admin ? supabase.from('appointments').select('status').gte('scheduled_at', iso) : Promise.resolve({ data: [] }),
      admin ? supabase.from('bill_balances').select('total, paid, balance, is_void').gte('created_at', iso) : Promise.resolve({ data: [] })
    ])

    const p = patients.data || []
    const liveBills = (bills.data || []).filter((b) => !b.is_void)
    const sum = (k) => liveBills.reduce((t, b) => t + Number(b[k]), 0)
    const cur = settings.currency_code

    setD({
      patientTotals: [
        { Measure: 'Registered patients (all time)', Count: p.length },
        { Measure: `Registered in the last ${days} days`, Count: p.filter((x) => new Date(x.created_at) >= since).length },
        { Measure: 'Female', Count: p.filter((x) => x.sex === 'F').length },
        { Measure: 'Male', Count: p.filter((x) => x.sex === 'M').length }
      ],
      staffByRole: tally(staff.data || [], (s) => `${s.roles?.name}${s.is_active ? '' : ' (deactivated)'}`).map((r) => ({ Role: r.label, Staff: r.count })),
      visitTypes: tally(visits.data || [], (v) => v.visit_type.replace('_', ' ')),
      diagnoses: tally(dx.data || [], (x) => x.icd_codes?.description).slice(0, 8),
      referralSummary: [
        { Direction: 'Sent', Referrals: (referrals.data || []).filter((r) => r.referring_facility_id === profile.facility_id).length },
        { Direction: 'Received', Referrals: (referrals.data || []).filter((r) => r.referring_facility_id !== profile.facility_id).length }
      ],
      appointmentStatus: tally(appts.data || [], (a) => a.status.replace('_', ' ')).map((r) => ({ Status: r.label, Appointments: r.count })),
      finance: [
        { Measure: `Bills issued`, Value: liveBills.length },
        { Measure: `Billed (${cur})`, Value: sum('total').toFixed(2) },
        { Measure: `Collected (${cur})`, Value: sum('paid').toFixed(2) },
        { Measure: `Outstanding (${cur})`, Value: sum('balance').toFixed(2) }
      ],
      totalVisits: (visits.data || []).length
    })
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Patients, staff, activity and (for administrators) finances."
        action={
          <select className="input w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Reporting period">
            {RANGES.map((r) => <option key={r} value={r}>Last {r} days</option>)}
          </select>
        }
      />
      {!d ? (
        <div className="p-6 text-sm text-ink/50">Preparing report...</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-2">
          <Section title="Patients" rows={d.patientTotals} filename="patients-summary.csv"><MiniTable rows={d.patientTotals} /></Section>
          <Section title="Staff" rows={d.staffByRole} filename="staff-summary.csv"><MiniTable rows={d.staffByRole} /></Section>
          <Section title={`Encounters by type (${d.totalVisits} total)`} rows={d.visitTypes.map((r) => ({ Type: r.label, Encounters: r.count }))} filename="encounters-by-type.csv"><HBar data={d.visitTypes} color="#0E7C7B" /></Section>
          <Section title="Most recorded diagnoses" rows={d.diagnoses.map((r) => ({ Diagnosis: r.label, Cases: r.count }))} filename="top-diagnoses.csv"><HBar data={d.diagnoses} color="#10233B" /></Section>
          <Section title="Referrals" rows={d.referralSummary} filename="referrals-summary.csv"><MiniTable rows={d.referralSummary} /></Section>
          {admin && <Section title="Appointments" rows={d.appointmentStatus} filename="appointments-summary.csv"><MiniTable rows={d.appointmentStatus} /></Section>}
          {admin && <Section title="Finance" rows={d.finance} filename="finance-summary.csv"><MiniTable rows={d.finance} /></Section>}
        </div>
      )}
    </div>
  )
}
