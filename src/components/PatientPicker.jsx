import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

// Single-select patient search. value: { id, first_name, last_name } | null
export default function PatientPicker({ value, onChange }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    const t = setTimeout(async () => {
      const q = query.replace(/[,()]/g, ' ')
      const { data } = await supabase
        .from('patients')
        .select('id, first_name, last_name, omang_number, card_number')
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,omang_number.ilike.%${q}%,card_number.ilike.%${q}%`)
        .limit(8)
      setResults(data || [])
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-sm border border-border bg-bg px-3 py-2 text-sm">
        <span className="text-ink">{value.first_name} {value.last_name}</span>
        <button type="button" onClick={() => onChange(null)} className="text-ink/40 hover:text-danger" aria-label="Clear patient">
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
      <input className="input pl-9" placeholder="Search by name, Omang or card number" value={query} onChange={(e) => setQuery(e.target.value)} />
      {results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-sm border border-border bg-white shadow-sm">
          {results.map((r) => (
            <button type="button" key={r.id} onClick={() => { onChange(r); setQuery('') }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-bg">
              <span className="text-ink">{r.first_name} {r.last_name}</span>
              <span className="font-mono text-xs text-ink/40">{r.card_number}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
