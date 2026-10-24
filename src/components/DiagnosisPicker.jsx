import { useEffect, useState } from 'react'
import { X, Search } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

// Lets a clinician search icd_codes by code or description and build up a
// list of selected diagnoses for the current encounter, one marked primary.
export default function DiagnosisPicker({ selected, onChange }) {
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
      .from('icd_codes')
      .select('id, code, description')
      .or(`code.ilike.%${query}%,description.ilike.%${query}%`)
      .limit(8)
    if (!error) setResults(data)
  }

  function addDiagnosis(icd) {
    if (selected.some((d) => d.id === icd.id)) return
    const next = [...selected, { ...icd, is_primary: selected.length === 0 }]
    onChange(next)
    setQuery('')
    setResults([])
  }

  function removeDiagnosis(id) {
    const next = selected.filter((d) => d.id !== id)
    if (next.length && !next.some((d) => d.is_primary)) next[0].is_primary = true
    onChange(next)
  }

  function setPrimary(id) {
    onChange(selected.map((d) => ({ ...d, is_primary: d.id === id })))
  }

  return (
    <div>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
        <input
          className="input pl-9"
          placeholder="Search ICD-10 code or condition, e.g. malaria"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-sm border border-border bg-white shadow-sm">
            {results.map((r) => (
              <button
                type="button"
                key={r.id}
                onClick={() => addDiagnosis(r)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-bg"
              >
                <span className="font-mono text-xs text-ink/50">{r.code}</span>
                <span className="text-ink">{r.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <ul className="mt-2 space-y-1">
          {selected.map((d) => (
            <li key={d.id} className="flex items-center justify-between rounded-sm border border-border bg-bg px-3 py-1.5 text-sm">
              <span>
                <span className="font-mono text-xs text-ink/50">{d.code}</span>{' '}
                <span className="text-ink">{d.description}</span>
              </span>
              <span className="flex items-center gap-3">
                <label className="flex items-center gap-1 text-xs text-ink/60">
                  <input
                    type="radio"
                    name="primary-diagnosis"
                    checked={d.is_primary}
                    onChange={() => setPrimary(d.id)}
                  />
                  Primary
                </label>
                <button type="button" onClick={() => removeDiagnosis(d.id)} className="text-ink/40 hover:text-danger">
                  <X size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
