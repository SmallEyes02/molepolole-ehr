import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'
import DiagnosisPicker from '../components/DiagnosisPicker'
import PrescriptionPicker from '../components/PrescriptionPicker'

export default function NewVisit() {
  const { patientId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [visitType, setVisitType] = useState('outpatient')
  const [complaint, setComplaint] = useState('')
  const [vitals, setVitals] = useState({ weight_kg: '', height_cm: '', bp_systolic: '', bp_diastolic: '', temperature_c: '', pulse_bpm: '' })
  const [diagnoses, setDiagnoses] = useState([])
  const [prescriptions, setPrescriptions] = useState([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function updateVital(field, value) {
    setVitals((v) => ({ ...v, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .insert({
        patient_id: patientId,
        facility_id: profile.facility_id,
        attending_staff_id: profile.id,
        visit_type: visitType,
        chief_complaint: complaint || null
      })
      .select('id')
      .single()

    if (visitError) {
      setError(visitError.message)
      setSubmitting(false)
      return
    }

    const hasVitals = Object.values(vitals).some((v) => v !== '')
    if (hasVitals) {
      const { error: vitalsError } = await supabase.from('vitals').insert({
        visit_id: visit.id,
        recorded_by: profile.id,
        weight_kg: vitals.weight_kg || null,
        height_cm: vitals.height_cm || null,
        bp_systolic: vitals.bp_systolic || null,
        bp_diastolic: vitals.bp_diastolic || null,
        temperature_c: vitals.temperature_c || null,
        pulse_bpm: vitals.pulse_bpm || null
      })
      if (vitalsError) {
        setError(vitalsError.message)
        setSubmitting(false)
        return
      }
    }

    if (diagnoses.length > 0) {
      const { error: diagnosisError } = await supabase.from('visit_diagnoses').insert(
        diagnoses.map((d) => ({ visit_id: visit.id, icd_code_id: d.id, is_primary: d.is_primary }))
      )
      if (diagnosisError) {
        setError(diagnosisError.message)
        setSubmitting(false)
        return
      }
    }

    if (prescriptions.length > 0) {
      const { error: prescriptionError } = await supabase.from('prescriptions').insert(
        prescriptions.map((p) => ({
          visit_id: visit.id,
          medication_id: p.id,
          dosage: p.dosage || 'As directed',
          frequency: p.frequency,
          duration_days: p.duration_days || null,
          instructions: p.instructions || null,
          prescribed_by: profile.id
        }))
      )
      if (prescriptionError) {
        setError(prescriptionError.message)
        setSubmitting(false)
        return
      }
    }

    setSubmitting(false)
    navigate(`/patients/${patientId}`)
  }

  return (
    <div>
      <PageHeader title="New encounter" subtitle="Record a clinical visit for this patient." />

      <form onSubmit={handleSubmit} className="max-w-2xl p-6">
        {error && (
          <div className="mb-4 rounded-sm border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="card space-y-4 p-6">
          <div>
            <label className="label">Visit type</label>
            <select className="input" value={visitType} onChange={(e) => setVisitType(e.target.value)}>
              <option value="outpatient">Outpatient</option>
              <option value="antenatal">Antenatal</option>
              <option value="under_five">Under-five</option>
              <option value="chronic_care">Chronic care</option>
              <option value="emergency">Emergency</option>
            </select>
          </div>

          <div>
            <label className="label">Chief complaint</label>
            <textarea className="input" rows={3} value={complaint} onChange={(e) => setComplaint(e.target.value)} />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">Vitals</h3>
            <div className="grid grid-cols-3 gap-3">
              <VitalInput label="Weight (kg)" value={vitals.weight_kg} onChange={(v) => updateVital('weight_kg', v)} />
              <VitalInput label="Height (cm)" value={vitals.height_cm} onChange={(v) => updateVital('height_cm', v)} />
              <VitalInput label="Temp (°C)" value={vitals.temperature_c} onChange={(v) => updateVital('temperature_c', v)} />
              <VitalInput label="BP systolic" value={vitals.bp_systolic} onChange={(v) => updateVital('bp_systolic', v)} />
              <VitalInput label="BP diastolic" value={vitals.bp_diastolic} onChange={(v) => updateVital('bp_diastolic', v)} />
              <VitalInput label="Pulse (bpm)" value={vitals.pulse_bpm} onChange={(v) => updateVital('pulse_bpm', v)} />
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">Diagnosis</h3>
            <DiagnosisPicker selected={diagnoses} onChange={setDiagnoses} />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">Prescriptions</h3>
            <PrescriptionPicker selected={prescriptions} onChange={setPrescriptions} />
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Saving...' : 'Save encounter'}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  )
}

function VitalInput({ label, value, onChange }) {
  return (
    <div>
      <label className="label text-xs">{label}</label>
      <input type="number" step="0.1" className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
