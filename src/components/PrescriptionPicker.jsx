import { useEffect, useState } from 'react'
import { Search, X, Plus } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

const FREQUENCIES = ['Once daily', 'Twice daily', 'Three times daily', 'Four times daily', 'As needed', 'Once only']

// selected: [{ id, name, form, strength, dosage, frequency, duration_days, instructions }]
export default function PrescriptionPicker({ selected, onChange }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    const timeout = setTimeout(search, 200)
    return () => clearTimeout(timeout)
  }, [query])

  async function search() {
    const { data, error } = await supabase
      .from('medications')
      .select('id, name, form, strength')
      .ilike('name', `%${query}%`)
      .limit(8)
    if (!error) setResults(data)
  }

  function addMedication(med) {
    onChange([
      ...selected,
      { ...med, lineKey: `${med.id}-${Date.now()}`, dosage: '', frequency: FREQUENCIES[0], duration_days: 5, instructions: '' }
    ])
    setQuery('')
    setResults([])
  }

  function updateLine(lineKey, field, value) {
    onChange(selected.map((s) => (s.lineKey === lineKey ? { ...s, [field]: value } : s)))
  }

  function removeLine(lineKey) {
    onChange(selected.filter((s) => s.lineKey !== lineKey))
  }

  return (
    <div>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
        <input
          className="input pl-9"
          placeholder="Search medication, e.g. amoxicillin"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-sm border border-border bg-white shadow-sm">
            {results.map((r) => (
              <button
                type="button"
                key={r.id}
                onClick={() => addMedication(r)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-bg"
              >
                <span className="text-ink">{r.name}</span>
                <span className="text-xs text-ink/40">{r.form}, {r.strength}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className="mt-3 space-y-3">
          {selected.map((line) => (
            <div key={line.lineKey} className="rounded-sm border border-border bg-bg p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-ink">{line.name} <span className="text-xs font-normal text-ink/50">({line.form}, {line.strength})</span></span>
                <button type="button" onClick={() => removeLine(line.lineKey)} className="text-ink/40 hover:text-danger">
                  <X size={14} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <input
                  className="input"
                  placeholder="Dosage, e.g. 1 tablet"
                  value={line.dosage}
                  onChange={(e) => updateLine(line.lineKey, 'dosage', e.target.value)}
                />
                <select className="input" value={line.frequency} onChange={(e) => updateLine(line.lineKey, 'frequency', e.target.value)}>
                  {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <input
                  type="number"
                  min="1"
                  className="input"
                  placeholder="Days"
                  value={line.duration_days}
                  onChange={(e) => updateLine(line.lineKey, 'duration_days', e.target.value)}
                />
                <input
                  className="input"
                  placeholder="Instructions (optional)"
                  value={line.instructions}
                  onChange={(e) => updateLine(line.lineKey, 'instructions', e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
