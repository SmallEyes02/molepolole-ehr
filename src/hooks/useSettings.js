import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// Facility settings merged over the defaults from setting_definitions.
// Only administrators can read facility_settings (RLS); for anyone else
// this simply returns the defaults.
export function useSettings() {
  const [settings, setSettings] = useState({
    currency_code: 'BWP',
    appointment_slot_minutes: '30',
    clinic_opening_time: '07:30',
    clinic_closing_time: '16:30'
  })

  useEffect(() => {
    let alive = true
    async function load() {
      const [{ data: defs }, { data: vals }] = await Promise.all([
        supabase.from('setting_definitions').select('key, default_value'),
        supabase.from('facility_settings').select('key, value')
      ])
      const merged = {}
      for (const d of defs || []) merged[d.key] = d.default_value
      for (const v of vals || []) merged[v.key] = v.value
      if (alive && defs) setSettings((s) => ({ ...s, ...merged }))
    }
    load()
    return () => { alive = false }
  }, [])

  return settings
}
