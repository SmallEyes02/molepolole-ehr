import { Cross } from 'lucide-react'
import { fmtDate } from '../../lib/portal'

function ageOf(dob) {
  const d = new Date(dob)
  const t = new Date()
  let a = t.getFullYear() - d.getFullYear()
  if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a -= 1
  return a
}

// The patient's digital replacement for the paper clinic card.
export default function HealthCard({ patient }) {
  if (!patient) return null
  const facility = patient.facilities?.name
  return (
    <section aria-label="Health card">
      <div className="rounded-sm bg-ink p-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Cross size={18} className="text-accent" strokeWidth={2.5} />
            <span className="text-xs uppercase tracking-wide text-white/60">Patient health card</span>
          </div>
          <span className="font-mono text-base font-medium tracking-wider" aria-label="Card number">{patient.card_number}</span>
        </div>
        <p className="mt-4 text-xl font-semibold">{patient.first_name} {patient.last_name}</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-white/50">Date of birth</dt><dd>{fmtDate(patient.date_of_birth)} ({ageOf(patient.date_of_birth)})</dd></div>
          <div><dt className="text-xs text-white/50">Sex</dt><dd>{patient.sex === 'M' ? 'Male' : 'Female'}</dd></div>
          <div><dt className="text-xs text-white/50">Omang</dt><dd>{patient.omang_number || 'Not recorded'}</dd></div>
          <div><dt className="text-xs text-white/50">Registered at</dt><dd>{facility || '—'}</dd></div>
        </dl>
      </div>
      <p className="mt-2 text-xs text-ink/50">Give your card number at any clinic so staff can find your record. Always keep your password private.</p>
    </section>
  )
}
