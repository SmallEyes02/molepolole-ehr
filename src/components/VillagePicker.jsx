import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

// Single-select search against the villages reference table.
// value: { id, name, district } | null. onChange(value | null)
export default function VillagePicker({ value, onChange }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])

  useEffect(() => {
    if (query.trim().length < 1) {
      setResults([])
      return
    }
    const timeout = setTimeout(search, 200)
    return () => clearTimeout(timeout)
  }, [query])

  async function search() {
    const { data, error } = await supabase
      .from('villages')
      .select('id, name, district')
      .ilike('name', `%${query}%`)
      .order('name')
      .limit(8)
    if (!error) setResults(data)
  }

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-sm border border-border bg-bg px-3 py-2 text-sm">
        <span className="text-ink">{value.name}</span>
        <button type="button" onClick={() => onChange(null)} className="text-ink/40 hover:text-danger">
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
      <input
        className="input pl-9"
        placeholder="Search village or ward"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-sm border border-border bg-white shadow-sm">
          {results.map((r) => (
            <button
              type="button"
              key={r.id}
              onClick={() => { onChange(r); setQuery('') }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-bg"
            >
              <span className="text-ink">{r.name}</span>
              <span className="text-xs text-ink/40">{r.district}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
