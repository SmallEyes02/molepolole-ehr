// Helpers for the pharmacy screens.

const PER_DAY = {
  'once daily': 1,
  'twice daily': 2,
  'three times daily': 3,
  'four times daily': 4
}

function perDose(dosage) {
  const text = dosage || ''
  const fraction = /^\s*(\d+)\s*\/\s*(\d+)/.exec(text)
  if (fraction && Number(fraction[2]) > 0) return Number(fraction[1]) / Number(fraction[2])
  const whole = /^\s*(\d+(?:\.\d+)?)/.exec(text)
  return whole ? Number(whole[1]) : null
}

// A starting suggestion only: the pharmacist always confirms the number.
// Only offered for tablets and capsules, where the count is unambiguous
// (for liquids, creams and inhalers the unit is a bottle or tube, not a dose).
export function suggestQuantity({ dosage, frequency, duration_days, form }) {
  if (!['tablet', 'capsule'].includes((form || '').toLowerCase())) return null
  const dose = perDose(dosage)
  if (!dose) return null

  const f = (frequency || '').toLowerCase()
  if (f === 'once only') {
    const quantity = Math.ceil(dose)
    return { quantity, explanation: `${dose} once` }
  }
  const perDay = PER_DAY[f]
  if (!perDay || !duration_days) return null
  const quantity = Math.ceil(dose * perDay * duration_days)
  return { quantity, explanation: `${dose} x ${perDay} a day x ${duration_days} days` }
}

export const STATUS_LABEL = { pending: 'Waiting', partial: 'Part given', dispensed: 'Dispensed' }
export const STATUS_STYLE = {
  pending: 'border-warning text-warning',
  partial: 'border-accent text-accent',
  dispensed: 'border-success text-success'
}
