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

    const firstName = form.first_name.trim()
    const lastName = form.last_name.trim()
    const identityNumber = form.omang_number.trim()

    if (!firstName || !lastName) {
      setError('Enter the patient’s first name and last name.')
      return
    }

    if (!/^[0-9]{9}$/.test(identityNumber)) {
      setError('Omang ID or birth certificate number must contain exactly 9 digits.')
      return
    }

    if (!form.date_of_birth) {
      setError('Enter the patient’s date of birth.')
      return
    }

    if (!profile?.facility_id) {
      setError('Your facility could not be verified. Sign in again or contact the system administrator.')
      return
    }

    setSubmitting(true)
    try {
      const { data, error: insertError } = await supabase
        .from('patients')
        .insert({
          ...form,
          first_name: firstName,
          last_name: lastName,
          omang_number: identityNumber,
          village_id: village?.id || null,
          registered_facility_id: profile.facility_id
        })
        .select('id')
        .single()

      if (insertError) {
        console.error('Patient registration failed:', insertError)
        if (insertError.code === '23505') {
          setError('A patient with this Omang ID or birth certificate number may already be registered. Check the number and search existing patient records before trying again.')
        } else if (insertError.code === '23502') {
          setError('A required patient detail is missing. Check the form and try again.')
        } else if (insertError.code === '23503') {
          setError('The selected village or facility is no longer valid. Refresh the page, select the village again, and retry.')
        } else if (insertError.code === '42501') {
          setError('You do not have permission to register patients at this facility. Contact the system administrator if you believe this is a mistake.')
        } else if (insertError.code === '22P02') {
          setError('One of the entered details has an invalid format. Check the form and try again.')
        } else {
          setError('The patient could not be registered due to a system error. Please try again. If the problem continues, contact the system administrator.')
        }
        return
      }

      if (!data?.id) {
        setError('The patient record may not have been confirmed. Search for the patient before attempting to register them again.')
        return
      }

      navigate(`/patients/${data.id}`)
    } catch (err) {
      console.error('Unexpected patient registration error:', err)
      setError('Unable to connect to the registration service. Check your internet connection and try again.')
    } finally {
      setSubmitting(false)
    }
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
              <label className="label">Omang ID</label>
              <input
                required
                aria-invalid={Boolean(error && !/^[0-9]{9}$/.test(form.omang_number.trim()))}
                className="input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{9}"
                minLength={9}
                maxLength={9}
                title="Enter exactly 9 digits. Use the Omang ID or birth certificate number."
                value={form.omang_number}
                onChange={(e) => update('omang_number', e.target.value.replace(/\D/g, '').slice(0, 9))}
                placeholder="Exactly 9 digits"
              />
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
              <label className="label">Next of kin full name</label>
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
