import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'

export default function ReferPatient() {
  const { patientId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [facilities, setFacilities] = useState([])
  const [receivingFacilityId, setReceivingFacilityId] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadFacilities()
  }, [])

  async function loadFacilities() {
    const { data, error } = await supabase.from('facilities').select('id, name').order('name')
    if (!error) setFacilities(data.filter((f) => f.id !== profile?.facility_id))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    const { error } = await supabase.from('referrals').insert({
      patient_id: patientId,
      referring_facility_id: profile.facility_id,
      receiving_facility_id: receivingFacilityId,
      referred_by: profile.id,
      reason
    })

    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate(`/patients/${patientId}`)
  }

  return (
    <div>
      <PageHeader title="Refer patient" subtitle="Send this patient's record to another facility for continued care." />

      <form onSubmit={handleSubmit} className="max-w-xl p-6">
        {error && (
          <div className="mb-4 rounded-sm border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="card space-y-4 p-6">
          <div>
            <label className="label">Receiving facility</label>
            <select required className="input" value={receivingFacilityId} onChange={(e) => setReceivingFacilityId(e.target.value)}>
              <option value="" disabled>Select a facility</option>
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Reason for referral</label>
            <textarea required className="input" rows={4} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Continued TB treatment follow-up, patient relocating to receiving facility's catchment area" />
          </div>

          <p className="text-xs text-ink/50">
            Once submitted, the receiving facility's staff will be able to view this patient's record and encounter history until the referral is resolved.
          </p>
        </div>

        <div className="mt-4 flex gap-2">
          <button type="submit" disabled={submitting || !receivingFacilityId} className="btn-primary">
            {submitting ? 'Sending...' : 'Send referral'}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  )
}
