import { useEffect, useState } from 'react'
import { PackagePlus, Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import PageHeader from '../../components/PageHeader'
import Banner from '../../components/Banner'

const REASONS = [
  ['received', 'Stock received'],
  ['dispensed', 'Dispensed or used'],
  ['expired', 'Expired'],
  ['damaged', 'Damaged'],
  ['adjustment', 'Stock count correction (+ or -)']
]
const OUTGOING = ['dispensed', 'expired', 'damaged']

function MedicationSearch({ value, onChange }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('medications').select('id, name, form, strength').ilike('name', `%${query}%`).limit(8)
      setResults(data || [])
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-sm border border-border bg-bg px-3 py-2 text-sm">
        <span>{value.name} <span className="text-xs text-ink/50">({value.form}, {value.strength})</span></span>
        <button type="button" onClick={() => onChange(null)} className="text-ink/40 hover:text-danger" aria-label="Clear medication"><X size={14} /></button>
      </div>
    )
  }
  return (
    <div className="relative">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
      <input className="input pl-9" placeholder="Search medication" value={query} onChange={(e) => setQuery(e.target.value)} />
      {results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-sm border border-border bg-white shadow-sm">
          {results.map((r) => (
            <button type="button" key={r.id} onClick={() => { onChange(r); setQuery('') }} className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-bg">
              <span>{r.name}</span><span className="text-xs text-ink/40">{r.form}, {r.strength}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Inventory() {
  const { profile } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [kind, setKind] = useState('medicine')
  const [medication, setMedication] = useState(null)
  const [add, setAdd] = useState({ supply_name: '', unit: '', reorder_level: 0 })
  const [move, setMove] = useState(null) // { id, reason, quantity, note }
  const [lowOnly, setLowOnly] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('stock_levels').select('*').order('item_name')
    setItems(data || [])
    setLoading(false)
  }

  const fail = (text) => setMessage({ kind: 'error', text })
  const ok = (text) => setMessage({ kind: 'success', text })

  async function addItem(e) {
    e.preventDefault()
    setMessage(null)
    if (kind === 'medicine' && !medication) return fail('Choose a medication.')
    if (kind === 'supply' && !add.supply_name.trim()) return fail('Enter the supply name.')
    if (!add.unit.trim()) return fail('Enter the unit, for example tablets, boxes or bottles.')
    const { error } = await supabase.from('inventory_items').insert({
      facility_id: profile.facility_id,
      medication_id: kind === 'medicine' ? medication.id : null,
      supply_name: kind === 'supply' ? add.supply_name.trim() : null,
      unit: add.unit.trim(),
      reorder_level: Number(add.reorder_level) || 0
    })
    if (error) return fail(error.code === '23505' ? 'That item is already in the inventory.' : error.message)
    ok('Item added. Record a stock received movement to set its opening stock.')
    setMedication(null)
    setAdd({ supply_name: '', unit: '', reorder_level: 0 })
    setShowAdd(false)
    load()
  }

  async function saveMovement() {
    setMessage(null)
    const q = Number(move.quantity)
    if (!q || (move.reason !== 'adjustment' && q < 0)) return fail('Enter a quantity above zero.')
    const change = OUTGOING.includes(move.reason) ? -Math.abs(q) : move.reason === 'received' ? Math.abs(q) : q
    const { error } = await supabase.from('stock_movements').insert({
      inventory_item_id: move.id,
      quantity_change: change,
      reason: move.reason,
      note: move.note || null,
      recorded_by: profile.id
    })
    if (error) return fail(error.message)
    ok('Stock updated.')
    setMove(null)
    load()
  }

  const lowCount = items.filter((i) => i.is_low).length
  const visible = items.filter((i) => !lowOnly || i.is_low)

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Medicines and supplies, with stock levels worked out from every movement."
        action={<button className="btn-primary" onClick={() => setShowAdd((v) => !v)}><PackagePlus size={16} />Add item</button>}
      />

      <div className="space-y-4 p-6">
        {message && <Banner kind={message.kind}>{message.text}</Banner>}

        <div className="grid grid-cols-2 gap-4 sm:max-w-md">
          <div className="card p-4"><p className="text-xs text-ink/50">Items tracked</p><p className="text-xl font-semibold text-ink">{loading ? '—' : items.length}</p></div>
          <div className="card p-4"><p className="text-xs text-ink/50">At or below reorder level</p><p className={`text-xl font-semibold ${lowCount ? 'text-danger' : 'text-ink'}`}>{loading ? '—' : lowCount}</p></div>
        </div>

        {showAdd && (
          <form onSubmit={addItem} className="card space-y-4 p-4">
            <h2 className="text-sm font-semibold text-ink">New inventory item</h2>
            <div className="flex gap-4 text-sm">
              {[['medicine', 'Medicine'], ['supply', 'Supply (non-drug)']].map(([k, l]) => (
                <label key={k} className="flex items-center gap-2"><input type="radio" checked={kind === k} onChange={() => setKind(k)} />{l}</label>
              ))}
            </div>
            {kind === 'medicine'
              ? <div><label className="label">Medication</label><MedicationSearch value={medication} onChange={setMedication} /></div>
              : <div><label className="label">Supply name</label><input className="input" placeholder="e.g. Examination gloves" value={add.supply_name} onChange={(e) => setAdd({ ...add, supply_name: e.target.value })} /></div>}
            <div className="grid grid-cols-2 gap-3 sm:max-w-md">
              <div><label className="label">Unit</label><input className="input" placeholder="tablets, boxes..." value={add.unit} onChange={(e) => setAdd({ ...add, unit: e.target.value })} /></div>
              <div><label className="label">Reorder level</label><input type="number" min="0" className="input" value={add.reorder_level} onChange={(e) => setAdd({ ...add, reorder_level: e.target.value })} /></div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary">Add item</button>
              <button type="button" className="btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </form>
        )}

        <label className="flex items-center gap-2 text-sm text-ink/70">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
          Show only items at or below their reorder level
        </label>

        <div className="card overflow-x-auto">
          <table>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink/40">
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 text-right font-medium">On hand</th>
                <th className="px-4 py-2 text-right font-medium">Reorder at</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {!loading && visible.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-ink/40">No items to show.</td></tr>
              )}
              {visible.map((i) => (
                <tr key={i.inventory_item_id} className="border-t border-border align-top text-sm">
                  <td className="px-4 py-2 text-ink">{i.item_name}</td>
                  <td className="px-4 py-2 capitalize text-ink/70">{i.category}</td>
                  <td className="px-4 py-2 text-right font-medium text-ink">{i.on_hand} <span className="text-xs font-normal text-ink/40">{i.unit}</span></td>
                  <td className="px-4 py-2 text-right text-ink/70">{i.reorder_level}</td>
                  <td className="px-4 py-2"><span className={`border-l-4 pl-2 text-xs font-medium ${i.is_low ? 'border-danger text-danger' : 'border-success text-success'}`}>{i.is_low ? 'Reorder' : 'In stock'}</span></td>
                  <td className="px-4 py-2">
                    {move?.id === i.inventory_item_id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <select className="input w-56" value={move.reason} onChange={(e) => setMove({ ...move, reason: e.target.value })}>
                          {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <input type="number" className="input w-24" placeholder="Qty" value={move.quantity} onChange={(e) => setMove({ ...move, quantity: e.target.value })} />
                        <input className="input w-36" placeholder="Note (optional)" value={move.note} onChange={(e) => setMove({ ...move, note: e.target.value })} />
                        <button className="text-xs font-medium text-accent hover:underline" onClick={saveMovement}>Save</button>
                        <button className="text-xs text-ink/50 hover:underline" onClick={() => setMove(null)}>Cancel</button>
                      </div>
                    ) : (
                      <button className="text-xs font-medium text-accent hover:underline" onClick={() => setMove({ id: i.inventory_item_id, reason: 'received', quantity: '', note: '' })}>Update stock</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
