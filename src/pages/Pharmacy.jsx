import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { suggestQuantity, STATUS_LABEL, STATUS_STYLE } from '../lib/pharmacy'
import { fmtDate, fmtDateTime } from '../lib/portal'
import PageHeader from '../components/PageHeader'
import Banner from '../components/Banner'

const PERIODS = [
  ['today', 'Today'],
  ['7', 'Last 7 days'],
  ['30', 'Last 30 days']
]

function sinceFor(period) {
  const d = new Date()
  if (period === 'today') d.setHours(0, 0, 0, 0)
  else d.setDate(d.getDate() - Number(period))
  return d.toISOString()
}

export default function Pharmacy() {
  const [tab, setTab] = useState('queue')
  const [message, setMessage] = useState(null)

  // queue
  const [view, setView] = useState('waiting')           // waiting | dispensed
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)                // the open dispense form
  const [busy, setBusy] = useState(false)

  // history
  const [period, setPeriod] = useState('7')
  const [history, setHistory] = useState([])
  const [reversing, setReversing] = useState(null)      // { id, reason }

  // stock
  const [stock, setStock] = useState([])

  const unitByMedication = useMemo(() => Object.fromEntries(stock.map((s) => [s.medication_id, s.unit])), [stock])
  const fail = (text) => setMessage({ kind: 'error', text })
  const ok = (text) => setMessage({ kind: 'success', text })

  useEffect(() => { loadStock() }, [])
  useEffect(() => {
    if (tab !== 'queue') return
    const t = setTimeout(loadQueue, 250)
    return () => clearTimeout(t)
  }, [tab, view, search])
  useEffect(() => { if (tab === 'history') loadHistory() }, [tab, period])

  async function loadStock() {
    const { data } = await supabase.from('pharmacy_stock').select('*').order('item_name')
    setStock(data || [])
  }

  async function loadQueue() {
    setLoading(true)
    let q = supabase.from('pharmacy_queue').select('*').limit(200)
    q = view === 'waiting'
      ? q.in('status', ['pending', 'partial']).order('created_at', { ascending: true })
      : q.eq('status', 'dispensed').order('created_at', { ascending: false })
    const term = search.trim().replace(/[,()]/g, ' ')
    if (term) {
      q = q.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,card_number.ilike.%${term}%,medication_name.ilike.%${term}%`)
    }
    const { data, error } = await q
    if (error) fail(error.message)
    setRows(data || [])
    setLoading(false)
  }

  async function loadHistory() {
    const { data, error } = await supabase
      .from('dispensing_history').select('*')
      .gte('dispensed_at', sinceFor(period))
      .order('dispensed_at', { ascending: false }).limit(300)
    if (error) fail(error.message)
    setHistory(data || [])
  }

  function openForm(row) {
    const s = suggestQuantity(row)
    setMessage(null)
    setForm({ id: row.prescription_id, quantity: s ? String(s.quantity) : '', suggested: s, partial: false, partialTouched: false, note: '' })
  }

  function changeQuantity(value) {
    setForm((f) => {
      const q = Number(value)
      const auto = !f.partialTouched && f.suggested && q > 0 ? q < f.suggested.quantity : f.partial
      return { ...f, quantity: value, partial: auto }
    })
  }

  async function dispense(row) {
    setMessage(null)
    const quantity = Number(form.quantity)
    if (!Number.isInteger(quantity) || quantity <= 0) return fail('Enter the quantity as a whole number above zero.')
    setBusy(true)
    const { error } = await supabase.rpc('dispense_prescription', {
      p_prescription_id: row.prescription_id,
      p_quantity: quantity,
      p_is_partial: form.partial,
      p_note: form.note || null
    })
    setBusy(false)
    if (error) return fail(error.message)
    const unit = unitByMedication[row.medication_id] || ''
    ok(`${form.partial ? 'Part-dispensed' : 'Dispensed'} ${quantity} ${unit} of ${row.medication_name} to ${row.first_name} ${row.last_name} (${row.card_number}).`.replace('  ', ' '))
    setForm(null)
    loadQueue()
    loadStock()
  }

  async function reverse() {
    setMessage(null)
    if (!reversing.reason.trim()) return fail('Give a reason for reversing this dispensing.')
    setBusy(true)
    const { error } = await supabase.rpc('reverse_dispensing', { p_dispensing_id: reversing.id, p_reason: reversing.reason })
    setBusy(false)
    if (error) return fail(error.message)
    ok('Dispensing reversed. The stock has been returned and the prescription is waiting again.')
    setReversing(null)
    loadHistory()
    loadStock()
  }

  const waitingCount = view === 'waiting' ? rows.length : null

  return (
    <div>
      <PageHeader
        title="Pharmacy"
        subtitle={waitingCount !== null ? `${waitingCount} prescription${waitingCount === 1 ? '' : 's'} waiting${search ? ' (matching your search)' : ''}.` : 'Dispense medicines to patients and keep track of stock.'}
      />

      <div className="space-y-4 p-6">
        {message && <Banner kind={message.kind}>{message.text}</Banner>}

        <div className="flex gap-1 border-b border-border">
          {[['queue', 'Dispensing'], ['history', 'History'], ['stock', 'Stock']].map(([k, label]) => (
            <button key={k} onClick={() => { setTab(k); setMessage(null) }}
              className={`px-4 py-2 text-sm font-medium ${tab === k ? 'border-b-2 border-ink text-ink' : 'text-ink/50 hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'queue' && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full max-w-sm">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
                <input className="input pl-9" placeholder="Card number, patient or medicine" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="flex gap-1">
                {[['waiting', 'Waiting'], ['dispensed', 'Dispensed']].map(([k, label]) => (
                  <button key={k} onClick={() => setView(k)}
                    className={`rounded-sm border px-3 py-1.5 text-sm ${view === k ? 'border-ink bg-ink text-white' : 'border-border bg-white text-ink/70 hover:bg-bg'}`}>{label}</button>
                ))}
              </div>
            </div>

            <div className="card overflow-x-auto">
              <table>
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-ink/40">
                    <th className="px-4 py-2 font-medium">Patient</th>
                    <th className="px-4 py-2 font-medium">Medicine</th>
                    <th className="px-4 py-2 font-medium">Directions</th>
                    <th className="px-4 py-2 font-medium">Prescribed</th>
                    <th className="px-4 py-2 text-right font-medium">In stock</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {!loading && rows.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-ink/40">
                      {search ? 'Nothing matches your search.' : view === 'waiting' ? 'No prescriptions are waiting.' : 'Nothing has been dispensed yet.'}
                    </td></tr>
                  )}
                  {rows.flatMap((r) => {
                    const unit = unitByMedication[r.medication_id] || ''
                    const open = form?.id === r.prescription_id
                    const tracked = r.on_hand !== null
                    const low = tracked && Number(r.on_hand) <= 0
                    const needs = open && form.suggested ? form.suggested.quantity : null
                    const qty = open ? Number(form.quantity) : 0
                    const tooMany = open && tracked && qty > Number(r.on_hand)
                    const line = (
                      <tr key={r.prescription_id} className="border-t border-border align-top text-sm">
                        <td className="px-4 py-2"><p className="text-ink">{r.first_name} {r.last_name}</p><p className="font-mono text-xs text-ink/50">{r.card_number}</p></td>
                        <td className="px-4 py-2 text-ink">{r.medication_name}<p className="text-xs text-ink/50">{r.form}, {r.strength}</p></td>
                        <td className="px-4 py-2 text-ink/70">{r.dosage}, {r.frequency.toLowerCase()}{r.duration_days ? ` for ${r.duration_days} days` : ''}{r.instructions && <p className="text-xs text-ink/50">{r.instructions}</p>}</td>
                        <td className="px-4 py-2 text-ink/70">{fmtDate(r.created_at)}{r.prescribed_by_name && <p className="text-xs text-ink/50">{r.prescribed_by_name}</p>}</td>
                        <td className={`px-4 py-2 text-right ${low ? 'font-medium text-danger' : 'text-ink/70'}`}>{tracked ? `${r.on_hand} ${unit}` : <span className="text-xs text-warning">Not in stock list</span>}</td>
                        <td className="px-4 py-2">
                          <span className={`border-l-4 pl-2 text-xs font-medium ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                          {r.status === 'partial' && <p className="pl-2 text-xs text-ink/50">{r.dispensed_quantity} {unit} given</p>}
                        </td>
                        <td className="px-4 py-2">
                          {r.status !== 'dispensed' && !open && <button className="text-xs font-medium text-accent hover:underline" onClick={() => openForm(r)}>{r.status === 'partial' ? 'Give balance' : 'Dispense'}</button>}
                        </td>
                      </tr>
                    )
                    if (!open) return [line]
                    return [line, (
                      <tr key={r.prescription_id + '-form'} className="border-t border-border bg-bg">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="flex flex-wrap items-end gap-3">
                            <div>
                              <label className="label" htmlFor={`qty-${r.prescription_id}`}>Quantity {unit && `(${unit})`}</label>
                              <input id={`qty-${r.prescription_id}`} type="number" min="1" className="input w-32" value={form.quantity} onChange={(e) => changeQuantity(e.target.value)} autoFocus />
                            </div>
                            <label className="flex items-center gap-2 pb-2 text-sm text-ink/70">
                              <input type="checkbox" checked={form.partial} onChange={(e) => setForm({ ...form, partial: e.target.checked, partialTouched: true })} />
                              Balance still owed (part fill)
                            </label>
                            <div className="min-w-48 flex-1">
                              <label className="label" htmlFor={`note-${r.prescription_id}`}>Note (optional)</label>
                              <input id={`note-${r.prescription_id}`} className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. counselled on finishing the course" />
                            </div>
                            <button className="btn-primary" disabled={busy || !tracked || tooMany || !(qty > 0)} onClick={() => dispense(r)}>{busy ? 'Saving...' : 'Confirm dispense'}</button>
                            <button className="btn-secondary" onClick={() => setForm(null)}>Cancel</button>
                          </div>
                          <div className="mt-2 space-y-0.5 text-xs">
                            {needs && <p className="text-ink/60">Suggested {needs} {unit} ({form.suggested.explanation}). Check it before confirming.</p>}
                            {!needs && <p className="text-ink/60">Enter the number of {unit || 'units'} you are handing over.</p>}
                            {!tracked && <p className="text-warning">This medicine is not in the stock list. Ask an administrator to add it under Inventory before it can be dispensed.</p>}
                            {tooMany && <p className="text-danger">Only {r.on_hand} {unit} in stock.</p>}
                            {open && form.partial && <p className="text-ink/60">This will be recorded as a part fill, and the prescription stays on the waiting list for the balance.</p>}
                          </div>
                        </td>
                      </tr>
                    )]
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'history' && (
          <>
            <select className="input w-auto" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period">
              {PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <div className="card overflow-x-auto">
              <table>
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-ink/40">
                    <th className="px-4 py-2 font-medium">When</th>
                    <th className="px-4 py-2 font-medium">Patient</th>
                    <th className="px-4 py-2 font-medium">Medicine</th>
                    <th className="px-4 py-2 text-right font-medium">Quantity</th>
                    <th className="px-4 py-2 font-medium">By</th>
                    <th className="px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-ink/40">Nothing was dispensed in this period.</td></tr>}
                  {history.map((h) => (
                    <tr key={h.dispensing_id} className={`border-t border-border align-top text-sm ${h.reversed_at ? 'text-ink/40' : ''}`}>
                      <td className="px-4 py-2">{fmtDateTime(h.dispensed_at)}</td>
                      <td className="px-4 py-2">{h.first_name} {h.last_name}<p className="font-mono text-xs text-ink/50">{h.card_number}</p></td>
                      <td className="px-4 py-2">{h.medication_name}<p className="text-xs text-ink/50">{h.form}, {h.strength}</p>{h.note && <p className="text-xs text-ink/50">{h.note}</p>}</td>
                      <td className="px-4 py-2 text-right">{h.quantity}{h.is_partial && <p className="text-xs text-accent">part fill</p>}</td>
                      <td className="px-4 py-2">{h.dispensed_by_name || '—'}</td>
                      <td className="px-4 py-2">
                        {h.reversed_at ? (
                          <p className="text-xs text-danger">Reversed: {h.reversal_reason}{h.reversed_by_name ? ` (${h.reversed_by_name})` : ''}</p>
                        ) : reversing?.id === h.dispensing_id ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <input className="input w-56" placeholder="Reason for reversing" value={reversing.reason} onChange={(e) => setReversing({ ...reversing, reason: e.target.value })} autoFocus />
                            <button disabled={busy} className="text-xs font-medium text-danger hover:underline" onClick={reverse}>Reverse</button>
                            <button className="text-xs text-ink/50 hover:underline" onClick={() => setReversing(null)}>Back</button>
                          </div>
                        ) : (
                          <button className="text-xs font-medium text-danger hover:underline" onClick={() => setReversing({ id: h.dispensing_id, reason: '' })}>Reverse</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'stock' && (
          <>
            <div className="card overflow-x-auto">
              <table>
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-ink/40">
                    <th className="px-4 py-2 font-medium">Medicine</th>
                    <th className="px-4 py-2 text-right font-medium">On hand</th>
                    <th className="px-4 py-2 text-right font-medium">Reorder at</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stock.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-ink/40">No medicines are in the stock list yet. Ask an administrator to add them under Inventory.</td></tr>}
                  {stock.map((s) => (
                    <tr key={s.inventory_item_id} className="border-t border-border text-sm">
                      <td className="px-4 py-2 text-ink">{s.item_name}</td>
                      <td className="px-4 py-2 text-right font-medium text-ink">{s.on_hand} <span className="text-xs font-normal text-ink/40">{s.unit}</span></td>
                      <td className="px-4 py-2 text-right text-ink/70">{s.reorder_level}</td>
                      <td className="px-4 py-2"><span className={`border-l-4 pl-2 text-xs font-medium ${s.is_low ? 'border-danger text-danger' : 'border-success text-success'}`}>{s.is_low ? 'Reorder' : 'In stock'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink/50">Stock goes down automatically when you dispense. New stock is received by an administrator under Inventory.</p>
          </>
        )}
      </div>
    </div>
  )
}
