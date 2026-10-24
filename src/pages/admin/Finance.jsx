import { useEffect, useMemo, useState } from 'react'
import { FilePlus, Plus, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { useSettings } from '../../hooks/useSettings'
import PageHeader from '../../components/PageHeader'
import Banner from '../../components/Banner'
import PatientPicker from '../../components/PatientPicker'

const METHODS = [
  ['cash', 'Cash'],
  ['card', 'Card'],
  ['mobile_money', 'Mobile money'],
  ['insurance', 'Insurance']
]

function billStatus(b) {
  if (b.is_void) return ['Void', 'border-ink/30 text-ink/50']
  if (Number(b.total) === 0) return ['No items', 'border-ink/30 text-ink/50']
  if (Number(b.balance) <= 0) return ['Paid', 'border-success text-success']
  if (Number(b.paid) > 0) return ['Part paid', 'border-warning text-warning']
  return ['Unpaid', 'border-danger text-danger']
}

export default function Finance() {
  const { profile } = useAuth()
  const settings = useSettings()
  const [tab, setTab] = useState('bills')
  const [bills, setBills] = useState([])
  const [services, setServices] = useState([])
  const [outstandingOnly, setOutstandingOnly] = useState(false)
  const [message, setMessage] = useState(null)
  const [loading, setLoading] = useState(true)

  const [showNew, setShowNew] = useState(false)
  const [patient, setPatient] = useState(null)
  const [lines, setLines] = useState([{ service_id: '', quantity: 1 }])
  const [paying, setPaying] = useState(null) // { id, amount, method, reference }
  const [newService, setNewService] = useState({ name: '', price: '' })

  const money = useMemo(() => {
    return (n) => {
      const v = Number(n || 0)
      try {
        return new Intl.NumberFormat('en-GB', { style: 'currency', currency: settings.currency_code }).format(v)
      } catch {
        return `${settings.currency_code} ${v.toFixed(2)}`
      }
    }
  }, [settings.currency_code])

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: b }, { data: s }] = await Promise.all([
      supabase.from('bill_balances').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('services').select('id, name, price, is_active').order('name')
    ])
    setBills(b || [])
    setServices(s || [])
    setLoading(false)
  }

  const fail = (text) => setMessage({ kind: 'error', text })
  const ok = (text) => setMessage({ kind: 'success', text })

  const live = bills.filter((b) => !b.is_void)
  const billed = live.reduce((t, b) => t + Number(b.total), 0)
  const collected = live.reduce((t, b) => t + Number(b.paid), 0)
  const outstanding = live.reduce((t, b) => t + Number(b.balance), 0)
  const visible = bills.filter((b) => !outstandingOnly || (!b.is_void && Number(b.balance) > 0))

  async function createBill(e) {
    e.preventDefault()
    setMessage(null)
    if (!patient) return fail('Choose a patient.')
    const merged = {}
    for (const l of lines) {
      if (!l.service_id) continue
      merged[l.service_id] = (merged[l.service_id] || 0) + Number(l.quantity || 0)
    }
    const items = Object.entries(merged)
      .filter(([, q]) => q > 0)
      .map(([service_id, quantity]) => ({
        service_id: Number(service_id),
        quantity,
        unit_price: services.find((s) => s.id === Number(service_id)).price
      }))
    if (items.length === 0) return fail('Add at least one service.')

    const { data: bill, error } = await supabase
      .from('bills')
      .insert({ patient_id: patient.id, facility_id: profile.facility_id, created_by: profile.id })
      .select('id')
      .single()
    if (error) return fail(error.message)

    const { error: itemError } = await supabase.from('bill_items').insert(items.map((i) => ({ ...i, bill_id: bill.id })))
    if (itemError) {
      await supabase.from('bills').delete().eq('id', bill.id)
      return fail(itemError.message)
    }
    ok('Bill created.')
    setPatient(null)
    setLines([{ service_id: '', quantity: 1 }])
    setShowNew(false)
    load()
  }

  async function recordPayment() {
    setMessage(null)
    const amount = Number(paying.amount)
    if (!(amount > 0)) return fail('Enter a payment amount above zero.')
    const { error } = await supabase.from('payments').insert({
      bill_id: paying.id,
      amount,
      method: paying.method,
      reference: paying.reference || null,
      received_by: profile.id
    })
    if (error) return fail(error.message)
    ok('Payment recorded.')
    setPaying(null)
    load()
  }

  async function voidBill(id) {
    const { error } = await supabase.from('bills').update({ is_void: true }).eq('id', id)
    if (error) return fail(error.message)
    ok('Bill voided.')
    load()
  }

  async function addService(e) {
    e.preventDefault()
    setMessage(null)
    const price = Number(newService.price)
    if (!newService.name.trim() || !(price >= 0)) return fail('Enter a service name and a price.')
    const { error } = await supabase.from('services').insert({ facility_id: profile.facility_id, name: newService.name.trim(), price })
    if (error) return fail(error.code === '23505' ? 'That service already exists.' : error.message)
    setNewService({ name: '', price: '' })
    load()
  }

  async function updateService(s, patch) {
    const { error } = await supabase.from('services').update(patch).eq('id', s.id)
    if (error) return fail(error.message)
    load()
  }

  return (
    <div>
      <PageHeader
        title="Finance"
        subtitle="Bills, payments and outstanding balances."
        action={tab === 'bills' && <button className="btn-primary" onClick={() => setShowNew((v) => !v)}><FilePlus size={16} />New bill</button>}
      />

      <div className="space-y-4 p-6">
        {message && <Banner kind={message.kind}>{message.text}</Banner>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[['Billed', billed], ['Collected', collected], ['Outstanding', outstanding]].map(([label, v]) => (
            <div key={label} className="card p-4">
              <p className="text-xs text-ink/50">{label}</p>
              <p className="text-xl font-semibold text-ink">{loading ? '—' : money(v)}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-1 border-b border-border">
          {[['bills', 'Bills'], ['prices', 'Price list']].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-4 py-2 text-sm font-medium ${tab === k ? 'border-b-2 border-ink text-ink' : 'text-ink/50 hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'bills' && (
          <>
            {showNew && (
              <form onSubmit={createBill} className="card space-y-4 p-4">
                <h2 className="text-sm font-semibold text-ink">New bill</h2>
                {services.filter((s) => s.is_active).length === 0 && (
                  <Banner kind="info">Add services with prices in the Price list tab first.</Banner>
                )}
                <div><label className="label">Patient</label><PatientPicker value={patient} onChange={setPatient} /></div>
                <div className="space-y-2">
                  <label className="label">Services</label>
                  {lines.map((l, i) => (
                    <div key={i} className="flex gap-2">
                      <select className="input" value={l.service_id} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, service_id: e.target.value } : x)))}>
                        <option value="">Select service</option>
                        {services.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name} ({money(s.price)})</option>)}
                      </select>
                      <input type="number" min="1" className="input w-24" value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
                      {lines.length > 1 && <button type="button" className="text-ink/40 hover:text-danger" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove line"><X size={16} /></button>}
                    </div>
                  ))}
                  <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline" onClick={() => setLines([...lines, { service_id: '', quantity: 1 }])}><Plus size={12} />Add line</button>
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary">Create bill</button>
                  <button type="button" className="btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
                </div>
              </form>
            )}

            <label className="flex items-center gap-2 text-sm text-ink/70">
              <input type="checkbox" checked={outstandingOnly} onChange={(e) => setOutstandingOnly(e.target.checked)} />
              Show only bills with an outstanding balance
            </label>

            <div className="card overflow-x-auto">
              <table>
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-ink/40">
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Patient</th>
                    <th className="px-4 py-2 text-right font-medium">Total</th>
                    <th className="px-4 py-2 text-right font-medium">Paid</th>
                    <th className="px-4 py-2 text-right font-medium">Balance</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {!loading && visible.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-ink/40">No bills to show.</td></tr>
                  )}
                  {visible.map((b) => {
                    const [label, style] = billStatus(b)
                    return (
                      <tr key={b.bill_id} className="border-t border-border align-top text-sm">
                        <td className="px-4 py-2 text-ink/50">{new Date(b.created_at).toLocaleDateString('en-GB')}</td>
                        <td className="px-4 py-2 text-ink">{b.first_name} {b.last_name}</td>
                        <td className="px-4 py-2 text-right text-ink/70">{money(b.total)}</td>
                        <td className="px-4 py-2 text-right text-ink/70">{money(b.paid)}</td>
                        <td className="px-4 py-2 text-right font-medium text-ink">{money(b.balance)}</td>
                        <td className="px-4 py-2"><span className={`border-l-4 pl-2 text-xs font-medium ${style}`}>{label}</span></td>
                        <td className="px-4 py-2">
                          {paying?.id === b.bill_id ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <input type="number" step="0.01" min="0" className="input w-28" value={paying.amount} onChange={(e) => setPaying({ ...paying, amount: e.target.value })} />
                              <select className="input w-36" value={paying.method} onChange={(e) => setPaying({ ...paying, method: e.target.value })}>
                                {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                              </select>
                              <input className="input w-32" placeholder="Reference" value={paying.reference} onChange={(e) => setPaying({ ...paying, reference: e.target.value })} />
                              <button className="text-xs font-medium text-accent hover:underline" onClick={recordPayment}>Save</button>
                              <button className="text-xs text-ink/50 hover:underline" onClick={() => setPaying(null)}>Cancel</button>
                            </div>
                          ) : !b.is_void && (
                            <div className="flex gap-3">
                              {Number(b.balance) > 0 && <button className="text-xs font-medium text-accent hover:underline" onClick={() => setPaying({ id: b.bill_id, amount: Number(b.balance).toFixed(2), method: 'cash', reference: '' })}>Record payment</button>}
                              {Number(b.paid) === 0 && <button className="text-xs font-medium text-danger hover:underline" onClick={() => voidBill(b.bill_id)}>Void</button>}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'prices' && (
          <>
            <form onSubmit={addService} className="card flex flex-wrap items-end gap-3 p-4">
              <div className="min-w-48 flex-1"><label className="label">Service</label><input className="input" placeholder="e.g. Consultation" value={newService.name} onChange={(e) => setNewService({ ...newService, name: e.target.value })} /></div>
              <div className="w-36"><label className="label">Price ({settings.currency_code})</label><input type="number" step="0.01" min="0" className="input" value={newService.price} onChange={(e) => setNewService({ ...newService, price: e.target.value })} /></div>
              <button type="submit" className="btn-primary">Add service</button>
            </form>
            <div className="card overflow-x-auto">
              <table>
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-ink/40">
                    <th className="px-4 py-2 font-medium">Service</th>
                    <th className="px-4 py-2 font-medium">Price</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {!loading && services.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-ink/40">No services yet.</td></tr>
                  )}
                  {services.map((s) => (
                    <tr key={s.id} className="border-t border-border text-sm">
                      <td className="px-4 py-2 text-ink">{s.name}</td>
                      <td className="px-4 py-2">
                        <input type="number" step="0.01" min="0" className="input w-32" defaultValue={s.price}
                          onBlur={(e) => Number(e.target.value) !== Number(s.price) && Number(e.target.value) >= 0 && updateService(s, { price: Number(e.target.value) })} />
                      </td>
                      <td className="px-4 py-2 text-ink/70">{s.is_active ? 'Active' : 'Inactive'}</td>
                      <td className="px-4 py-2">
                        <button className="text-xs font-medium text-accent hover:underline" onClick={() => updateService(s, { is_active: !s.is_active })}>
                          {s.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink/50">Changing a price only affects future bills. Existing bills keep the price they were issued at.</p>
          </>
        )}
      </div>
    </div>
  )
}
