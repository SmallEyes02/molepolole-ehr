import { useEffect, useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { useSettings } from '../../hooks/useSettings'
import PageHeader from '../../components/PageHeader'
import Banner from '../../components/Banner'
import PatientPicker from '../../components/PatientPicker'

const toLocalInput = (iso) => {
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

const STATUS_STYLE = {
  scheduled: 'border-accent text-accent',
  completed: 'border-success text-success',
  cancelled: 'border-danger text-danger',
  no_show: 'border-warning text-warning'
}

export default function Appointments() {
  const { profile } = useAuth()
  const settings = useSettings()
  const [rows, setRows] = useState([])
  const [clinicians, setClinicians] = useState([])
  const [departments, setDepartments] = useState([])
  const [showAll, setShowAll] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [message, setMessage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [patient, setPatient] = useState(null)
  const [form, setForm] = useState({ staff_id: '', department_id: '', when: '', duration: '', reason: '' })
  const [action, setAction] = useState(null) // { id, kind: 'reschedule' | 'cancel', value }

  useEffect(() => { load() }, [showAll])

  async function load() {
    setLoading(true)
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    let q = supabase
      .from('appointments')
      .select('id, scheduled_at, duration_minutes, reason, status, cancellation_reason, reschedule_count, patients(first_name, last_name), staff!appointments_staff_id_fkey(first_name, last_name), departments(name)')
      .order('scheduled_at', { ascending: true })
      .limit(200)
    if (!showAll) q = q.eq('status', 'scheduled').gte('scheduled_at', startOfToday.toISOString())

    const [{ data: a }, { data: s }, { data: d }] = await Promise.all([
      q,
      supabase.from('staff').select('id, first_name, last_name, role_id, roles(name)').eq('is_active', true).in('role_id', [2, 3, 4]).order('last_name'),
      supabase.from('departments').select('id, name').order('name')
    ])
    setRows(a || [])
    setClinicians(s || [])
    setDepartments(d || [])
    setLoading(false)
  }

  const fail = (text) => setMessage({ kind: 'error', text })
  const ok = (text) => setMessage({ kind: 'success', text })
  const friendly = (error) =>
    error.code === '23505' ? 'That clinician or patient already has an appointment at this time.' : error.message

  async function schedule(e) {
    e.preventDefault()
    setMessage(null)
    if (!patient) return fail('Choose a patient.')
    const { error } = await supabase.from('appointments').insert({
      patient_id: patient.id,
      facility_id: profile.facility_id,
      staff_id: form.staff_id || null,
      department_id: form.department_id || null,
      scheduled_at: new Date(form.when).toISOString(),
      duration_minutes: Number(form.duration || settings.appointment_slot_minutes),
      reason: form.reason || null,
      created_by: profile.id
    })
    if (error) return fail(friendly(error))
    ok('Appointment scheduled.')
    setPatient(null)
    setForm({ staff_id: '', department_id: '', when: '', duration: '', reason: '' })
    setShowForm(false)
    load()
  }

  async function confirmAction() {
    setMessage(null)
    let patch
    if (action.kind === 'reschedule') {
      if (!action.value) return fail('Choose the new date and time.')
      patch = { scheduled_at: new Date(action.value).toISOString() }
    } else {
      if (!action.value.trim()) return fail('Give a reason for cancelling.')
      patch = { status: 'cancelled', cancellation_reason: action.value.trim() }
    }
    const { error } = await supabase.from('appointments').update(patch).eq('id', action.id)
    if (error) return fail(friendly(error))
    ok(action.kind === 'reschedule' ? 'Appointment rescheduled.' : 'Appointment cancelled.')
    setAction(null)
    load()
  }

  async function setStatus(id, status) {
    const { error } = await supabase.from('appointments').update({ status }).eq('id', id)
    if (error) return fail(friendly(error))
    load()
  }

  return (
    <div>
      <PageHeader
        title="Appointments"
        subtitle={`Working hours ${settings.clinic_opening_time} to ${settings.clinic_closing_time}.`}
        action={<button className="btn-primary" onClick={() => setShowForm((v) => !v)}><CalendarPlus size={16} />Schedule appointment</button>}
      />

      <div className="space-y-4 p-6">
        {message && <Banner kind={message.kind}>{message.text}</Banner>}

        {showForm && (
          <form onSubmit={schedule} className="card space-y-4 p-4">
            <h2 className="text-sm font-semibold text-ink">New appointment</h2>
            <div><label className="label">Patient</label><PatientPicker value={patient} onChange={setPatient} /></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Clinician</label>
                <select className="input" value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })}>
                  <option value="">Any available</option>
                  {clinicians.map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} ({c.roles?.name})</option>)}
                </select>
              </div>
              <div>
                <label className="label">Department</label>
                <select className="input" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                  <option value="">None</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div><label className="label">Date and time</label><input required type="datetime-local" className="input" value={form.when} onChange={(e) => setForm({ ...form, when: e.target.value })} /></div>
              <div><label className="label">Length (minutes)</label><input type="number" min="5" max="240" className="input" placeholder={settings.appointment_slot_minutes} value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} /></div>
            </div>
            <div><label className="label">Reason</label><input className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary">Schedule</button>
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        )}

        <label className="flex items-center gap-2 text-sm text-ink/70">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Include past, completed and cancelled appointments
        </label>

        <div className="card overflow-x-auto">
          <table>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink/40">
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Patient</th>
                <th className="px-4 py-2 font-medium">Clinician</th>
                <th className="px-4 py-2 font-medium">Reason</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-ink/40">No appointments to show.</td></tr>
              )}
              {rows.map((a) => (
                <tr key={a.id} className="border-t border-border align-top text-sm">
                  <td className="px-4 py-2 text-ink">
                    {new Date(a.scheduled_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                    <div className="text-xs text-ink/40">{a.duration_minutes} min{a.reschedule_count > 0 ? `, moved ${a.reschedule_count}x` : ''}</div>
                  </td>
                  <td className="px-4 py-2 text-ink">{a.patients?.first_name} {a.patients?.last_name}</td>
                  <td className="px-4 py-2 text-ink/70">{a.staff ? `${a.staff.first_name} ${a.staff.last_name}` : '—'}{a.departments?.name && <div className="text-xs text-ink/40">{a.departments.name}</div>}</td>
                  <td className="px-4 py-2 text-ink/70">{a.reason || '—'}{a.cancellation_reason && <div className="text-xs text-danger">Cancelled: {a.cancellation_reason}</div>}</td>
                  <td className="px-4 py-2"><span className={`border-l-4 pl-2 text-xs font-medium capitalize ${STATUS_STYLE[a.status]}`}>{a.status.replace('_', ' ')}</span></td>
                  <td className="px-4 py-2">
                    {action?.id === a.id ? (
                      <div className="flex items-center gap-2">
                        {action.kind === 'reschedule'
                          ? <input type="datetime-local" className="input" value={action.value} onChange={(e) => setAction({ ...action, value: e.target.value })} />
                          : <input className="input" placeholder="Reason for cancelling" value={action.value} onChange={(e) => setAction({ ...action, value: e.target.value })} />}
                        <button className="text-xs font-medium text-accent hover:underline" onClick={confirmAction}>Confirm</button>
                        <button className="text-xs text-ink/50 hover:underline" onClick={() => setAction(null)}>Back</button>
                      </div>
                    ) : a.status === 'scheduled' ? (
                      <div className="flex flex-wrap gap-3">
                        <button className="text-xs font-medium text-accent hover:underline" onClick={() => setAction({ id: a.id, kind: 'reschedule', value: toLocalInput(a.scheduled_at) })}>Reschedule</button>
                        <button className="text-xs font-medium text-danger hover:underline" onClick={() => setAction({ id: a.id, kind: 'cancel', value: '' })}>Cancel</button>
                        <button className="text-xs font-medium text-success hover:underline" onClick={() => setStatus(a.id, 'completed')}>Completed</button>
                        <button className="text-xs font-medium text-warning hover:underline" onClick={() => setStatus(a.id, 'no_show')}>No show</button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
