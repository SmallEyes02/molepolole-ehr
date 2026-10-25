import { useEffect, useMemo, useState } from 'react'
import { Bell, CalendarDays, FileText, Clock } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { describeNotification, fmtDate, fmtDateTime, isCurrentReminder, medicineStatus } from '../../lib/portal'
import Banner from '../../components/Banner'
import { useAuth } from '../../context/AuthContext'
import HealthCard from './HealthCard'

const STATUS_STYLE = {
  scheduled: 'border-accent text-accent',
  completed: 'border-success text-success',
  cancelled: 'border-danger text-danger',
  no_show: 'border-warning text-warning'
}
const STATUS_LABEL = { scheduled: 'Booked', completed: 'Attended', cancelled: 'Cancelled', no_show: 'Missed' }

function Vitals({ v }) {
  if (!v) return null
  const items = [
    ['Weight', v.weight_kg && `${v.weight_kg} kg`],
    ['Height', v.height_cm && `${v.height_cm} cm`],
    ['Temperature', v.temperature_c && `${v.temperature_c} °C`],
    ['Blood pressure', v.bp_systolic && v.bp_diastolic && `${v.bp_systolic}/${v.bp_diastolic}`],
    ['Pulse', v.pulse_bpm && `${v.pulse_bpm} bpm`],
    ['Breathing', v.respiratory_rate && `${v.respiratory_rate} /min`],
    ['Oxygen', v.spo2 && `${v.spo2}%`]
  ].filter(([, val]) => val)
  if (!items.length) return null
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
      {items.map(([k, val]) => (
        <div key={k}><dt className="text-xs text-ink/50">{k}</dt><dd className="font-medium text-ink">{val}</dd></div>
      ))}
    </dl>
  )
}

export default function Portal() {
  const { profile } = useAuth()
  const [card, setCard] = useState(null)
  const [tab, setTab] = useState('appointments')
  const [appointments, setAppointments] = useState([])
  const [notifications, setNotifications] = useState([])
  const [visits, setVisits] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [freshIds, setFreshIds] = useState(new Set())

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError('')
    // create any reminders that are now due, then read everything
    await supabase.rpc('refresh_my_reminders')
    supabase.from('patients')
      .select('first_name, last_name, card_number, date_of_birth, sex, omang_number, facilities!patients_registered_facility_id_fkey(name)')
      .eq('id', profile.patient_id).maybeSingle()
      .then(({ data }) => setCard(data))
    const [a, n, v] = await Promise.all([
      supabase.from('my_appointments').select('*').order('scheduled_at', { ascending: true }),
      supabase.from('notifications').select('id, kind, for_time, created_at, read_at, appointment_id').order('created_at', { ascending: false }).limit(60),
      supabase.from('visits')
        .select('id, visit_date, visit_type, chief_complaint, status, facilities(name), vitals(*), visit_diagnoses(is_primary, icd_codes(code, description)), prescriptions(id, dosage, frequency, duration_days, instructions, medications(name, form, strength), dispensings(quantity, dispensed_at, is_partial, reversed_at))')
        .order('visit_date', { ascending: false })
    ])
    if (a.error || n.error || v.error) setError((a.error || n.error || v.error).message)
    setAppointments(a.data || [])
    setNotifications(n.data || [])
    setVisits(v.data || [])
    setLoading(false)
  }

  const now = new Date()
  const byId = useMemo(() => Object.fromEntries(appointments.map((a) => [a.appointment_id, a])), [appointments])

  const upcoming = appointments.filter((a) => a.status === 'scheduled' && new Date(a.scheduled_at) > now)
  const earlier = appointments.filter((a) => !upcoming.includes(a)).sort((x, y) => new Date(y.scheduled_at) - new Date(x.scheduled_at))
  const shown = notifications.filter((n) => isCurrentReminder(n, byId[n.appointment_id], now))
  const unread = shown.filter((n) => !n.read_at)
  const reminders = shown.filter((n) => n.kind === 'reminder')

  // opening the notifications tab marks them read, but "New" tags stay until you leave
  useEffect(() => {
    if (tab !== 'notifications' || unread.length === 0) return
    setFreshIds(new Set(unread.map((n) => n.id)))
    supabase.rpc('mark_notifications_read').then(() => {
      setNotifications((list) => list.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })))
    })
  }, [tab, loading])

  const tabs = [
    ['appointments', 'Appointments', CalendarDays, 0],
    ['history', 'Medical history', FileText, 0],
    ['notifications', 'Notifications', Bell, tab === 'notifications' ? 0 : unread.length]
  ]

  return (
    <div className="space-y-4">
      {error && <Banner>{error}</Banner>}

      <HealthCard patient={card} />

      {reminders.length > 0 && (
        <div className="space-y-2">
          {reminders.slice(0, 3).map((n) => {
            const d = describeNotification(n, byId[n.appointment_id])
            return (
              <div key={n.id} className="flex gap-3 rounded-sm border border-accent/40 bg-accent/5 px-4 py-3">
                <Clock size={20} className="mt-0.5 shrink-0 text-accent" />
                <div>
                  <p className="text-sm font-semibold text-ink">{d.title}</p>
                  <p className="text-sm text-ink/70">{d.body}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map(([key, label, Icon, badge]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex shrink-0 items-center gap-2 px-4 py-3 text-sm font-medium ${tab === key ? 'border-b-2 border-ink text-ink' : 'text-ink/50 hover:text-ink'}`}>
            <Icon size={16} />{label}
            {badge > 0 && <span className="rounded-sm bg-danger px-1.5 py-0.5 text-xs font-semibold text-white">{badge}</span>}
          </button>
        ))}
      </div>

      {loading && <p className="py-6 text-center text-sm text-ink/50">Loading your records...</p>}

      {!loading && tab === 'appointments' && (
        <div className="space-y-5">
          <section>
            <h2 className="mb-2 text-sm font-semibold text-ink">Upcoming</h2>
            {upcoming.length === 0 && <p className="card p-4 text-sm text-ink/50">You have no upcoming appointments.</p>}
            <div className="space-y-2">
              {upcoming.map((a) => (
                <div key={a.appointment_id} className="card p-4">
                  <p className="text-base font-semibold text-ink">{fmtDateTime(a.scheduled_at)}</p>
                  <p className="text-sm text-ink/70">{a.facility_name}{a.department_name ? `, ${a.department_name}` : ''}</p>
                  {a.clinician_name && <p className="text-sm text-ink/70">With {a.clinician_name}</p>}
                  {a.reason && <p className="mt-1 text-sm text-ink/60">Reason: {a.reason}</p>}
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink/50">To change or cancel an appointment, please contact the clinic.</p>
          </section>

          {earlier.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-ink">Earlier</h2>
              <div className="card divide-y divide-border">
                {earlier.map((a) => (
                  <div key={a.appointment_id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-sm text-ink">{fmtDateTime(a.scheduled_at)}</p>
                      <p className="text-xs text-ink/50">{a.facility_name}{a.reason ? `, ${a.reason}` : ''}</p>
                    </div>
                    <span className={`shrink-0 border-l-4 pl-2 text-xs font-medium ${STATUS_STYLE[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {!loading && tab === 'history' && (
        <div className="space-y-3">
          <p className="text-sm text-ink/60">A summary of your visits to the clinic. If anything looks wrong, tell the clinic staff.</p>
          {visits.length === 0 && <p className="card p-4 text-sm text-ink/50">No visits are recorded yet.</p>}
          {visits.map((v, i) => {
            const vitals = Array.isArray(v.vitals) ? v.vitals[0] : v.vitals
            const primary = v.visit_diagnoses?.find((d) => d.is_primary) || v.visit_diagnoses?.[0]
            return (
              <details key={v.id} open={i === 0} className="card group">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-semibold text-ink">{fmtDate(v.visit_date)}, <span className="capitalize">{v.visit_type.replace('_', ' ')}</span></p>
                    <p className="text-sm text-ink/60">{v.facilities?.name}{primary ? `, ${primary.icd_codes.description}` : ''}</p>
                  </div>
                  <span className="shrink-0 text-xs text-accent group-open:hidden">Show</span>
                  <span className="hidden shrink-0 text-xs text-accent group-open:inline">Hide</span>
                </summary>
                <div className="space-y-4 border-t border-border p-4">
                  {v.chief_complaint && <div><p className="text-xs text-ink/50">Reason for visit</p><p className="text-sm text-ink">{v.chief_complaint}</p></div>}
                  {vitals && <div><p className="mb-1 text-xs text-ink/50">Measurements</p><Vitals v={vitals} /></div>}
                  {v.visit_diagnoses?.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs text-ink/50">Diagnosis</p>
                      <ul className="space-y-0.5 text-sm text-ink">{v.visit_diagnoses.map((d) => <li key={d.icd_codes.code}>{d.icd_codes.description}{d.is_primary && v.visit_diagnoses.length > 1 ? ' (main)' : ''}</li>)}</ul>
                    </div>
                  )}
                  {v.prescriptions?.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs text-ink/50">Medicines prescribed</p>
                      <ul className="space-y-2">
                        {v.prescriptions.map((p) => (
                          <li key={p.id} className="text-sm">
                            <p className="font-medium text-ink">{p.medications?.name} <span className="text-xs font-normal text-ink/50">({p.medications?.form}, {p.medications?.strength})</span></p>
                            <p className="text-ink/70">{p.dosage}, {p.frequency.toLowerCase()}{p.duration_days ? ` for ${p.duration_days} days` : ''}</p>
                            {p.instructions && <p className="text-ink/60">{p.instructions}</p>}
                            {(() => { const st = medicineStatus(p.dispensings); return (
                              <p className={`mt-0.5 inline-block border-l-4 pl-2 text-xs font-medium ${st.tone === 'done' ? 'border-success text-success' : st.tone === 'partial' ? 'border-accent text-accent' : 'border-warning text-warning'}`}>{st.label}</p>
                            ) })()}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </details>
            )
          })}
        </div>
      )}

      {!loading && tab === 'notifications' && (
        <div className="space-y-2">
          {shown.length === 0 && <p className="card p-4 text-sm text-ink/50">You have no notifications.</p>}
          {shown.map((n) => {
            const d = describeNotification(n, byId[n.appointment_id])
            return (
              <div key={n.id} className="card flex items-start justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-semibold text-ink">{d.title}</p>
                  <p className="text-sm text-ink/70">{d.body}</p>
                  <p className="mt-1 text-xs text-ink/40">{fmtDateTime(n.created_at)}</p>
                </div>
                {freshIds.has(n.id) && <span className="shrink-0 rounded-sm bg-accent px-1.5 py-0.5 text-xs font-semibold text-white">New</span>}
              </div>
            )
          })}
          <p className="pt-2 text-xs text-ink/50">Notifications appear here when you sign in. Texts and emails are not switched on yet.</p>
        </div>
      )}
    </div>
  )
}
