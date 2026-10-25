import { useEffect, useState } from 'react'
import { KeyRound, ShieldOff } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { fmtDate } from '../lib/portal'
import Banner from './Banner'

// Staff: give a patient online access in person, or take it away.
export default function PortalAccessCard({ patientId }) {
  const [account, setAccount] = useState(null)
  const [invite, setInvite] = useState(null)   // latest code that is still unused
  const [issued, setIssued] = useState(null)   // the code just generated (shown once)
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [patientId])

  async function load() {
    const now = new Date().toISOString()
    const [{ data: acct }, { data: inv }] = await Promise.all([
      supabase.from('patient_accounts').select('created_at').eq('patient_id', patientId).maybeSingle(),
      // codes no longer expire; an older code may still carry the expiry it was issued with
      supabase.from('portal_invites').select('created_at').eq('patient_id', patientId)
        .is('used_at', null).is('cancelled_at', null)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order('created_at', { ascending: false }).limit(1)
    ])
    setAccount(acct)
    setInvite(inv?.[0] || null)
    setLoading(false)
  }

  async function generate() {
    setMessage(null)
    setBusy(true)
    const { data, error } = await supabase.rpc('create_portal_invite', { p_patient_id: patientId })
    setBusy(false)
    if (error) return setMessage({ kind: 'error', text: error.message })
    setIssued(data)
    load()
  }

  async function cancelCode() {
    setMessage(null)
    setBusy(true)
    const { error } = await supabase.rpc('cancel_portal_invite', { p_patient_id: patientId })
    setBusy(false)
    if (error) return setMessage({ kind: 'error', text: error.message })
    setIssued(null)
    setMessage({ kind: 'success', text: 'The code has been cancelled and can no longer be used.' })
    load()
  }

  async function revoke() {
    setMessage(null)
    setBusy(true)
    const { error } = await supabase.from('patient_accounts').delete().eq('patient_id', patientId)
    setBusy(false)
    setConfirmRevoke(false)
    if (error) return setMessage({ kind: 'error', text: error.message })
    setMessage({ kind: 'success', text: 'Portal access removed. The patient can no longer see their records online.' })
    setIssued(null)
    load()
  }

  if (loading) return null

  return (
    <div className="card p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink"><KeyRound size={16} />Patient portal</h2>
      {message && <Banner kind={message.kind}>{message.text}</Banner>}

      {account ? (
        <>
          <p className="text-sm text-ink/70">Has online access since {fmtDate(account.created_at)}. It does not expire. They can see their health card, visits, medicines and appointments at any time.</p>
          {confirmRevoke ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink/70">Remove their access (for example, a lost phone)?</span>
              <button disabled={busy} onClick={revoke} className="font-medium text-danger hover:underline">Yes, remove</button>
              <button onClick={() => setConfirmRevoke(false)} className="text-ink/50 hover:underline">Keep</button>
            </div>
          ) : (
            <button onClick={() => setConfirmRevoke(true)} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-danger hover:underline"><ShieldOff size={12} />Remove access</button>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-ink/70">No online access. Check the patient's identity (Omang) in person, then generate a code and give it to them.</p>

          {issued && (
            <div className="my-3 rounded-sm border border-accent/40 bg-accent/5 p-3">
              <p className="text-xs text-ink/60">Activation code (shown once)</p>
              <p className="font-mono text-2xl font-semibold tracking-widest text-ink">{issued.code}</p>
              <p className="mt-1 text-xs text-ink/60">Does not expire. Works once. The patient creates an account at <span className="font-mono">/register</span> and enters it. Keep it private: whoever uses it first gets access.</p>
            </div>
          )}
          {!issued && invite && (
            <p className="my-2 text-xs text-ink/50">A code was issued {fmtDate(invite.created_at)} and has not been used. For security it cannot be shown again. Generate a new one to replace it, or cancel it.</p>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-3">
            <button disabled={busy} onClick={generate} className="btn-secondary">{busy ? 'Working...' : issued || invite ? 'Generate a new code' : 'Generate activation code'}</button>
            {(issued || invite) && <button disabled={busy} onClick={cancelCode} className="text-xs font-medium text-danger hover:underline">Cancel code</button>}
          </div>
        </>
      )}
    </div>
  )
}
