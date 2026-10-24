import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import PageHeader from '../../components/PageHeader'
import Banner from '../../components/Banner'

const ADMIN_ONLY = [
  'Staff accounts, roles and departments',
  'Appointments',
  'Finance: bills, payments and price list',
  'Inventory and stock',
  'Access control (this page)',
  'System settings',
  'Activity log'
]

export default function AccessControl() {
  const [permissions, setPermissions] = useState([])
  const [roles, setRoles] = useState([])
  const [granted, setGranted] = useState(new Set())
  const [message, setMessage] = useState(null)
  const [busyKey, setBusyKey] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: p }, { data: r }, { data: rp }] = await Promise.all([
      supabase.from('permissions').select('code, description').order('code'),
      supabase.from('roles').select('id, name').order('id'),
      supabase.from('role_permissions').select('role_id, permission_code')
    ])
    setPermissions(p || [])
    setRoles(r || [])
    setGranted(new Set((rp || []).map((x) => `${x.role_id}:${x.permission_code}`)))
    setLoading(false)
  }

  async function toggle(roleId, code) {
    const key = `${roleId}:${code}`
    setMessage(null)
    setBusyKey(key)
    const has = granted.has(key)
    const { error } = has
      ? await supabase.from('role_permissions').delete().eq('role_id', roleId).eq('permission_code', code)
      : await supabase.from('role_permissions').insert({ role_id: roleId, permission_code: code })
    setBusyKey('')
    if (error) return setMessage({ kind: 'error', text: error.message })
    const next = new Set(granted)
    has ? next.delete(key) : next.add(key)
    setGranted(next)
  }

  return (
    <div>
      <PageHeader title="Access control" subtitle="Choose what each role is allowed to do." />

      <div className="space-y-4 p-6">
        {message && <Banner kind={message.kind}>{message.text}</Banner>}

        <div className="card overflow-x-auto">
          <table>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink/40">
                <th className="px-4 py-2 font-medium">Permission</th>
                {roles.map((r) => <th key={r.id} className="px-4 py-2 text-center font-medium">{r.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {!loading && permissions.map((p) => (
                <tr key={p.code} className="border-t border-border text-sm">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{p.description}</p>
                    <p className="font-mono text-xs text-ink/40">{p.code}</p>
                  </td>
                  {roles.map((r) => {
                    const key = `${r.id}:${p.code}`
                    const locked = r.id === 1
                    return (
                      <td key={r.id} className="px-4 py-3 text-center">
                        {locked
                          ? <Lock size={14} className="mx-auto text-ink/30" aria-label="Always allowed" />
                          : <input type="checkbox" className="h-4 w-4" checked={granted.has(key)} disabled={busyKey === key}
                              onChange={() => toggle(r.id, p.code)} aria-label={`${r.name}: ${p.description}`} />}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-ink/50">
          The Administrator role always keeps every permission so nobody can be locked out. A change is enforced by the
          database straight away; menus and buttons update the next time that person signs in.
        </p>

        <div className="card p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">Administrator only</h2>
          <p className="mb-2 text-sm text-ink/60">These areas cannot be granted to any other role.</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink/80">
            {ADMIN_ONLY.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </div>
      </div>
    </div>
  )
}
