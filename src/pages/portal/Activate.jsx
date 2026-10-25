import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { claimMessage } from '../../lib/portal'
import Banner from '../../components/Banner'

// Shown to a signed-in patient whose login is not yet linked to a record.
export default function Activate() {
  const { reloadProfile } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { data, error: rpcError } = await supabase.rpc('claim_portal_invite', { p_code: code })
    if (rpcError) {
      setBusy(false)
      return setError(rpcError.message)
    }
    const message = claimMessage(data)
    if (message) {
      setBusy(false)
      return setError(message)
    }
    await reloadProfile()
    setBusy(false)
  }

  return (
    <form onSubmit={submit} className="card mx-auto mt-6 max-w-md space-y-4 p-6">
      <div className="flex items-center gap-2">
        <KeyRound size={20} className="text-accent" />
        <h1 className="text-lg font-semibold text-ink">Link your health record</h1>
      </div>
      <p className="text-sm text-ink/70">
        Your login is ready, but it is not connected to your record yet. Enter the activation code the clinic gave you.
        If you do not have one, ask at the front desk. They will check who you are and issue one.
      </p>
      <Banner>{error}</Banner>
      <div>
        <label className="label" htmlFor="code">Activation code</label>
        <input id="code" required className="input font-mono text-lg uppercase tracking-widest" placeholder="ABCD-EFGH" value={code}
          onChange={(e) => setCode(e.target.value)} autoComplete="off" maxLength={12} />
      </div>
      <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Checking...' : 'Link my record'}</button>
    </form>
  )
}
