import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Stethoscope, Phone, User, ArrowLeftRight, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { can } from '../lib/permissions'
import PageHeader from '../components/PageHeader'

export default function PatientDetail() {
  const { patientId } = useParams()
  const { profile } = useAuth()
  const [patient, setPatient] = useState(null)
  const [visits, setVisits] = useState([])
  const [prescriptions, setPrescriptions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPatient()
  }, [patientId])

  async function loadPatient() {
    setLoading(true)
    const [{ data: p }, { data: v }, { data: rx }] = await Promise.all([
      supabase.from('patients').select('*, villages(name, district)').eq('id', patientId).single(),
      supabase
        .from('visits')
        .select('id, visit_date, visit_type, chief_complaint, status, visit_diagnoses(is_primary, icd_codes(code, description))')
        .eq('patient_id', patientId)
        .order('visit_date', { ascending: false }),
      supabase
        .from('prescriptions')
        .select('id, dosage, frequency, duration_days, instructions, created_at, medications(name, form, strength), visits!inner(patient_id)')
        .eq('visits.patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(20)
    ])
    setPatient(p)
    setVisits(v || [])
    setPrescriptions(rx || [])
    setLoading(false)
  }

  if (loading) return <div className="p-6 text-sm text-ink/50">Loading patient record...</div>
  if (!patient) return <div className="p-6 text-sm text-danger">Patient not found, or you do not have access to this record.</div>

  const age = calculateAge(patient.date_of_birth)

  return (
    <div>
      <PageHeader
        title={`${patient.first_name} ${patient.last_name}`}
        subtitle={`${age} years old · ${patient.sex === 'M' ? 'Male' : 'Female'}${patient.omang_number ? ' · Omang ' + patient.omang_number : ''}`}
        action={
          <div className="flex gap-2">
            {can(profile, 'patients.update') && (
              <Link to={`/patients/${patientId}/edit`} className="btn-secondary">
                <Pencil size={16} />
                Edit details
              </Link>
            )}
            {can(profile, 'referrals.send') && (
              <Link to={`/patients/${patientId}/refer`} className="btn-secondary">
                <ArrowLeftRight size={16} />
                Refer
              </Link>
            )}
            {can(profile, 'clinical.record') && (
              <Link to={`/patients/${patientId}/visits/new`} className="btn-primary">
                <Stethoscope size={16} />
                New encounter
              </Link>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold text-ink">Patient details</h2>
          <dl className="space-y-2 text-sm">
            <Row icon={Phone} label="Phone" value={patient.phone} />
            <Row icon={User} label="Next of kin" value={patient.next_of_kin_name} />
            <Row icon={Phone} label="Next of kin phone" value={patient.next_of_kin_phone} />
            <Row label="Village" value={patient.villages?.name} />
            <Row label="Date of birth" value={new Date(patient.date_of_birth).toLocaleDateString('en-GB')} />
          </dl>
        </div>

        <div className="card lg:col-span-2">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Encounter history</h2>
          </div>
          <table>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink/40">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Chief complaint</th>
                <th className="px-4 py-2 font-medium">Diagnosis</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {visits.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-ink/40">
                    No encounters recorded for this patient yet.
                  </td>
                </tr>
              )}
              {visits.map((v) => {
                const primary = v.visit_diagnoses?.find((d) => d.is_primary) || v.visit_diagnoses?.[0]
                return (
                  <tr key={v.id} className="border-t border-border text-sm">
                    <td className="px-4 py-2 text-ink/70">{new Date(v.visit_date).toLocaleDateString('en-GB')}</td>
                    <td className="px-4 py-2 capitalize text-ink">{v.visit_type.replace('_', ' ')}</td>
                    <td className="px-4 py-2 text-ink/70">{v.chief_complaint || '—'}</td>
                    <td className="px-4 py-2 text-ink/70">
                      {primary ? primary.icd_codes.description : '—'}
                      {v.visit_diagnoses?.length > 1 && (
                        <span className="ml-1 text-xs text-ink/40">+{v.visit_diagnoses.length - 1} more</span>
                      )}
                    </td>
                    <td className="px-4 py-2 capitalize text-ink/70">{v.status}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="px-6 pb-6">
        <div className="card overflow-x-auto">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Prescriptions</h2>
          </div>
          <table>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink/40">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Medication</th>
                <th className="px-4 py-2 font-medium">Dosage</th>
                <th className="px-4 py-2 font-medium">Frequency</th>
                <th className="px-4 py-2 font-medium">Duration</th>
                <th className="px-4 py-2 font-medium">Instructions</th>
              </tr>
            </thead>
            <tbody>
              {prescriptions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-ink/40">
                    No prescriptions recorded for this patient yet.
                  </td>
                </tr>
              )}
              {prescriptions.map((rx) => (
                <tr key={rx.id} className="border-t border-border text-sm">
                  <td className="px-4 py-2 text-ink/50">{new Date(rx.created_at).toLocaleDateString('en-GB')}</td>
                  <td className="px-4 py-2 text-ink">
                    {rx.medications?.name}
                    <span className="ml-1 text-xs text-ink/40">({rx.medications?.form}, {rx.medications?.strength})</span>
                  </td>
                  <td className="px-4 py-2 text-ink/70">{rx.dosage}</td>
                  <td className="px-4 py-2 text-ink/70">{rx.frequency}</td>
                  <td className="px-4 py-2 text-ink/70">{rx.duration_days ? `${rx.duration_days} days` : '—'}</td>
                  <td className="px-4 py-2 text-ink/70">{rx.instructions || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 pb-2">
      <span className="flex items-center gap-1.5 text-ink/50">
        {Icon && <Icon size={14} />}
        {label}
      </span>
      <span className="font-medium text-ink">{value || '—'}</span>
    </div>
  )
}

function calculateAge(dob) {
  const diff = Date.now() - new Date(dob).getTime()
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000))
}
