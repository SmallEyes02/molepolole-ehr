// Wording and rules for the patient portal.

export const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export function untilText(iso, now = new Date()) {
  const hours = (new Date(iso) - now) / 3600000
  if (hours < 1) return 'in less than an hour'
  if (hours < 24) return `in about ${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'}`
  const days = Math.round(hours / 24)
  return `in ${days} day${days === 1 ? '' : 's'}`
}

// A reminder only means something while the appointment it was for is still
// booked at that same time and has not yet happened.
export function isCurrentReminder(notification, appointment, now = new Date()) {
  if (notification.kind !== 'reminder') return true
  return Boolean(
    appointment &&
    appointment.status === 'scheduled' &&
    new Date(appointment.scheduled_at).getTime() === new Date(notification.for_time).getTime() &&
    new Date(appointment.scheduled_at) > now
  )
}

export function describeNotification(notification, appointment, now = new Date()) {
  const when = fmtDateTime(notification.for_time)
  const where = appointment?.facility_name ? ` at ${appointment.facility_name}` : ''
  const who = appointment?.clinician_name ? ` with ${appointment.clinician_name}` : ''
  switch (notification.kind) {
    case 'reminder':
      return { title: `Appointment ${untilText(notification.for_time, now)}`, body: `${when}${where}${who}.` }
    case 'scheduled':
      return { title: 'Appointment booked', body: `${when}${where}${who}.` }
    case 'rescheduled':
      return { title: 'Appointment moved', body: `Your appointment is now ${when}${where}${who}.` }
    case 'cancelled':
      return { title: 'Appointment cancelled', body: `Your appointment on ${when}${where} was cancelled.` }
    default:
      return { title: 'Notification', body: when }
  }
}

export function claimMessage(status) {
  switch (status) {
    case 'ok': return null
    case 'invalid': return 'That code is not valid, has already been used, or has expired. Ask the clinic for a new one.'
    case 'locked': return 'Too many wrong attempts. Please wait 15 minutes and try again.'
    case 'already_linked': return 'This login is already linked to a patient record.'
    case 'not_allowed': return 'This login belongs to clinic staff and cannot be used as a patient account.'
    case 'not_signed_in': return 'Please sign in first.'
    default: return 'Something went wrong. Please try again.'
  }
}

// Where a prescribed medicine stands, from the patient's point of view.
// Reversed dispensings (mistakes that were corrected) are ignored.
export function medicineStatus(dispensings) {
  const live = (dispensings || []).filter((d) => !d.reversed_at)
  const complete = live.filter((d) => !d.is_partial)
  if (complete.length) {
    const latest = complete.map((d) => d.dispensed_at).sort().pop()
    return { label: `Collected ${fmtDate(latest)}`, tone: 'done' }
  }
  if (live.length) return { label: 'Part collected, the rest is owed', tone: 'partial' }
  return { label: 'Waiting at the pharmacy', tone: 'waiting' }
}
