import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import PageHeader from '../components/PageHeader'
import Banner from '../components/Banner'
import VillagePicker from '../components/VillagePicker'

export default function EditPatient() {
  const { patientId } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState(null)
  const [village, setVillage] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('patients').select('*, villages(id, name, district)').eq('id', patientId).single()
      .then(({ data, error }) => {
        if (error || !data) return setError('Patient not found, or you do not have access to this record.')
        setVillage(data.villages)
        setForm({
          first_name: data.first_name, last_name: data.last_name, omang_number: data.omang_number || '',
          date_of_birth: data.date_of_birth, sex: data.sex, phone: data.phone || '',
          next_of_kin_name: data.next_of_kin_name || '', next_of_kin_phone: data.next_of_kin_phone || ''
        })
      })
  }, [patientId])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  async function save(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const { data, error } = await supabase.from('patients').update({
      ...form,
      omang_number: form.omang_number.trim() || null,
      phone: form.phone || null,
      next_of_kin_name: form.next_of_kin_name || null,
      next_of_kin_phone: form.next_of_kin_phone || null,
      village_id: village?.id || null
    }).eq('id', patientId).select('id')
    setSaving(false)
    if (error) return setError(error.code === '23505' ? 'Another patient already has that Omang number.' : error.message)
    if (!data || data.length === 0) return setError('You do not have permission to update this patient.')
    navigate(`/patients/${patientId}`)
  }

  if (!form) return <div className="p-6">{error ? <Banner>{error}</Banner> : <span className="text-sm text-ink/50">Loading...</span>}</div>

  return (
    <div>
      <PageHeader title="Edit patient details" subtitle="Update this patient's demographic information." />
      <form onSubmit={save} className="max-w-2xl p-6">
        <Banner>{error}</Banner>
        <div className="card space-y-4 p-6">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">First name</label><input required className="input" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} /></div>
            <div><label className="label">Last name</label><input required className="input" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Omang number</label><input className="input" value={form.omang_number} onChange={(e) => set('omang_number', e.target.value)} /></div>
            <div>
              <label className="label">Sex</label>
              <select className="input" value={form.sex} onChange={(e) => set('sex', e.target.value)}>
                <option value="F">Female</option>
                <option value="M">Male</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Date of birth</label><input required type="date" className="input" value={form.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} /></div>
            <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
          </div>
          <div><label className="label">Village / ward</label><VillagePicker value={village} onChange={setVillage} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Next of kin name</label><input className="input" value={form.next_of_kin_name} onChange={(e) => set('next_of_kin_name', e.target.value)} /></div>
            <div><label className="label">Next of kin phone</label><input className="input" value={form.next_of_kin_phone} onChange={(e) => set('next_of_kin_phone', e.target.value)} /></div>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save changes'}</button>
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  )
}
