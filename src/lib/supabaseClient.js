import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
// Either the new publishable key (sb_publishable_...) or the legacy anon key.
// New projects should use the publishable key: Supabase's Edge Function
// gateway rejects the legacy key on projects that have moved to the new keys.
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(supabaseUrl && supabaseAnonKey)

// createClient throws on empty values, which used to crash the whole app
// into a blank page. Use inert placeholders when unconfigured; main.jsx
// shows a setup message instead of rendering the app in that case.
// Sessions are kept on the device and refreshed automatically, so a patient
// stays signed in and can open their card at any time without logging in again.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
)
