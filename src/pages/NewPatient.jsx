import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'
import VillagePicker from '../components/VillagePicker'

const emptyForm = {
  first_name: '', last_name: '', omang_number: '', date_of_birth: '',
  sex: 'F', phone: '', next_of_kin_name: '', next_of_kin_phone: ''
}

export default function NewPatient() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(emptyForm)
  const [village, setVillage] = useState(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    const { data, error } = await supabase
      .from('patients')
      .insert({
        ...form,
        omang_number: form.omang_number || null,
        village_id: village?.id || null,
        registered_facility_id: profile.facility_id
      })
      .select('id')
      .single()

    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate(`/patients/${data.id}`)
  }

  return (
    <div>
      <PageHeader title="Register patient" subtitle="Enter the patient's demographic details." />

      <form onSubmit={handleSubmit} className="max-w-2xl p-6">
        {error && (
          <div className="mb-4 rounded-sm border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="card space-y-4 p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">First name</label>
              <input required className="input" value={form.first_name} onChange={(e) => update('first_name', e.target.value)} />
            </div>
            <div>
              <label className="label">Last name</label>
              <input required className="input" value={form.last_name} onChange={(e) => update('last_name', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Omang number</label>
              <input className="input" value={form.omang_number} onChange={(e) => update('omang_number', e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <label className="label">Sex</label>
              <select className="input" value={form.sex} onChange={(e) => update('sex', e.target.value)}>
                <option value="F">Female</option>
                <option value="M">Male</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Date of birth</label>
              <input required type="date" className="input" value={form.date_of_birth} onChange={(e) => update('date_of_birth', e.target.value)} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Village / ward</label>
            <VillagePicker value={village} onChange={setVillage} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Next of kin name</label>
              <input className="input" value={form.next_of_kin_name} onChange={(e) => update('next_of_kin_name', e.target.value)} />
            </div>
            <div>
              <label className="label">Next of kin phone</label>
              <input className="input" value={form.next_of_kin_phone} onChange={(e) => update('next_of_kin_phone', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Saving...' : 'Save patient'}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  )
}
