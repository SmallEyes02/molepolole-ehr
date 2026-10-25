import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import PageHeader from '../../components/PageHeader'
import Banner from '../../components/Banner'

export default function Settings() {
  const { profile } = useAuth()
  const [facility, setFacility] = useState(null)
  const [defs, setDefs] = useState([])
  const [values, setValues] = useState({})
  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: f }, { data: d }, { data: v }] = await Promise.all([
      supabase.from('facilities').select('id, name, facility_type, district, phone').eq('id', profile.facility_id).single(),
      supabase.from('setting_definitions').select('key, label, default_value, description').order('key'),
      supabase.from('facility_settings').select('key, value')
    ])
    setFacility(f)
    setDefs(d || [])
    const merged = {}
    for (const x of d || []) merged[x.key] = x.default_value
    for (const x of v || []) merged[x.key] = x.value
    setValues(merged)
  }

  async function save(e) {
    e.preventDefault()
    setMessage(null)
    if (!facility.name.trim()) return setMessage({ kind: 'error', text: 'The facility name is required.' })
    if (!/^[A-Za-z]{3}$/.test(values.currency_code || '')) return setMessage({ kind: 'error', text: 'Currency must be a 3-letter code such as BWP.' })
    const hrs = Number(values.reminder_hours_before)
    if (!Number.isInteger(hrs) || hrs < 1 || hrs > 168) return setMessage({ kind: 'error', text: 'Reminder time must be a whole number of hours between 1 and 168.' })
    if (!(Number(values.appointment_slot_minutes) >= 5)) return setMessage({ kind: 'error', text: 'Appointment length must be at least 5 minutes.' })
    setSaving(true)

    const { error: fError } = await supabase.from('facilities')
      .update({ name: facility.name.trim(), facility_type: facility.facility_type, phone: facility.phone || null })
      .eq('id', facility.id)
    if (fError) {
      setSaving(false)
      return setMessage({ kind: 'error', text: fError.code === '23505' ? 'Another facility already uses that name.' : fError.message })
    }

    const rows = defs.map((d) => ({
      facility_id: facility.id,
      key: d.key,
      value: d.key === 'currency_code' ? values[d.key].toUpperCase() : String(values[d.key]),
      updated_by: profile.id,
      updated_at: new Date().toISOString()
    }))
    const { error: sError } = await supabase.from('facility_settings').upsert(rows, { onConflict: 'facility_id,key' })
    setSaving(false)
    if (sError) return setMessage({ kind: 'error', text: sError.message })
    setMessage({ kind: 'success', text: 'Settings saved.' })
    load()
  }

  if (!facility) return <div className="p-6 text-sm text-ink/50">Loading settings...</div>

  return (
    <div>
      <PageHeader title="System settings" subtitle="Facility details and options that apply across the system." />
      <form onSubmit={save} className="max-w-2xl space-y-4 p-6">
        {message && <Banner kind={message.kind}>{message.text}</Banner>}

        <div className="card space-y-4 p-4">
          <h2 className="text-sm font-semibold text-ink">Facility</h2>
          <div><label className="label">Name</label><input required className="input" value={facility.name} onChange={(e) => setFacility({ ...facility, name: e.target.value })} /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Type</label>
              <select className="input" value={facility.facility_type} onChange={(e) => setFacility({ ...facility, facility_type: e.target.value })}>
                <option value="clinic">Clinic</option>
                <option value="health_post">Health post</option>
                <option value="hospital">Hospital</option>
              </select>
            </div>
            <div><label className="label">Phone</label><input className="input" value={facility.phone || ''} onChange={(e) => setFacility({ ...facility, phone: e.target.value })} /></div>
          </div>
        </div>

        <div className="card space-y-4 p-4">
          <h2 className="text-sm font-semibold text-ink">System options</h2>
          {defs.map((d) => (
            <div key={d.key}>
              <label className="label">{d.label}</label>
              <input className="input max-w-xs" value={values[d.key] ?? ''}
                type={d.key.endsWith('_time') ? 'time' : (d.key === 'appointment_slot_minutes' || d.key === 'reminder_hours_before') ? 'number' : 'text'}
                onChange={(e) => setValues({ ...values, [d.key]: e.target.value })} />
              {d.description && <p className="mt-1 text-xs text-ink/50">{d.description}</p>}
            </div>
          ))}
        </div>

        <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save settings'}</button>
      </form>
    </div>
  )
}
