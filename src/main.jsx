import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { isConfigured } from './lib/supabaseClient'
import './index.css'

function SetupNeeded() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="card w-full max-w-lg p-6">
        <h1 className="mb-2 text-lg font-semibold text-ink">Supabase is not configured</h1>
        <p className="mb-3 text-sm text-ink/70">
          The app needs your Supabase project details before it can start.
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink/70">
          <li>In the project folder, copy <code className="font-mono text-xs">.env.example</code> to <code className="font-mono text-xs">.env</code>.</li>
          <li>Open <code className="font-mono text-xs">.env</code> and set <code className="font-mono text-xs">VITE_SUPABASE_URL</code> and <code className="font-mono text-xs">VITE_SUPABASE_ANON_KEY</code> (Supabase dashboard, Project Settings, API).</li>
          <li>Stop the dev server (Ctrl+C) and run <code className="font-mono text-xs">npm run dev</code> again. Vite only reads <code className="font-mono text-xs">.env</code> at startup.</li>
        </ol>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isConfigured ? (
      <BrowserRouter>
        <App />
      </BrowserRouter>
    ) : (
      <SetupNeeded />
    )}
  </React.StrictMode>
)
