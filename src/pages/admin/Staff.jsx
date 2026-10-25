import { useEffect, useState } from 'react'
import { UserPlus, KeyRound, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import PageHeader from '../../components/PageHeader'
import Banner from '../../components/Banner'

const blankNew = { first_name: '', last_name: '', email: '', password: '', role_id: 2, department_id: '', phone: '' }

async function functionError(error) {
  // FunctionsFetchError = no usable answer at all (not deployed, wrong name, CORS).
  if (error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError') {
    return 'Could not reach the manage-staff function. Either deploy it (see the README, with Verify JWT turned off), or use "Link an existing login" instead.'
  }

  // FunctionsHttpError = the platform or the function answered with an error status.
  const res = error.context
  const status = res?.status
  let text = ''
  try { text = await res.text() } catch { /* ignore */ }
  let detail = text
  let fromFunction = false
  try {
    const body = JSON.parse(text)
    if (body?.error) { detail = body.error; fromFunction = true }   // our own, readable message
    else detail = body?.message || body?.msg || text
  } catch { /* plain text */ }

  if (fromFunction) return detail
  if (status === 401) return `Supabase rejected the request before the function ran (401: ${detail || 'Invalid JWT'}). In Edge Functions, open manage-staff, turn Verify JWT off and redeploy.`
  if (status === 404) return 'Supabase cannot find a function named manage-staff (404). Check the name is exactly manage-staff and that it is deployed.'
  if (status >= 500) return `The function failed to start or crashed (${status}: ${detail}). Open Edge Functions, manage-staff, Logs for the cause.`
  return `The request failed (${status || 'no status'}${detail ? ': ' + detail : ''}).`
}

export default function Staff() {
  const { profile } = useAuth()
  const [staff, setStaff] = useState([])
  const [departments, setDepartments] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addMode, setAddMode] = useState('create') // 'create' | 'link'
  const [form, setForm] = useState(blankNew)
  const [editing, setEditing] = useState(null) // { id, mode: 'edit' | 'password', draft }
  const [newDept, setNewDept] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: s }, { data: d }, { data: r }] = await Promise.all([
      supabase.from('staff')
        .select('id, first_name, last_name, phone, is_active, role_id, department_id, roles(name), departments(name)')
        .order('last_name'),
      supabase.from('departments').select('id, name').order('name'),
      supabase.from('roles').select('id, name').order('id')
    ])
    setStaff(s || [])
    setDepartments(d || [])
    setRoles(r || [])
    setLoading(false)
  }

  const fail = (text) => setMessage({ kind: 'error', text })
  const ok = (text) => setMessage({ kind: 'success', text })

  async function linkStaff() {
    const { error } = await supabase.rpc('link_staff_account', {
      p_email: form.email,
      p_first_name: form.first_name,
      p_last_name: form.last_name,
      p_role_id: Number(form.role_id),
      p_department_id: form.department_id || null,
      p_phone: form.phone || null
    })
    setBusy(false)
    if (error) return fail(error.message)
    ok(`${form.first_name} ${form.last_name} has been linked and can now sign in.`)
    setForm(blankNew)
    setShowAdd(false)
    load()
  }

  async function createStaff(e) {
    e.preventDefault()
    setMessage(null)
    setBusy(true)
    if (addMode === 'link') return linkStaff()
    const { error } = await supabase.functions.invoke('manage-staff', {
      body: { action: 'create', ...form, role_id: Number(form.role_id), department_id: form.department_id || null }
    })
    setBusy(false)
    if (error) return fail(await functionError(error))
    ok(`Account created for ${form.first_name} ${form.last_name}. Give them the temporary password securely.`)
    setForm(blankNew)
    setShowAdd(false)
    load()
  }

  async function saveEdit() {
    const d = editing.draft
    setMessage(null)
    if (!d.first_name.trim() || !d.last_name.trim()) return fail('First and last name are required.')
    const { error } = await supabase.from('staff').update({
      first_name: d.first_name.trim(),
      last_name: d.last_name.trim(),
      phone: d.phone || null,
      role_id: Number(d.role_id),
      department_id: d.department_id || null
    }).eq('id', editing.id)
    if (error) return fail(error.message)
    ok('Staff details updated.')
    setEditing(null)
    load()
  }

  async function setActive(member, active) {
    setMessage(null)
    const { error } = await supabase.from('staff').update({ is_active: active }).eq('id', member.id)
    if (error) return fail(error.message)
    ok(`${member.first_name} ${member.last_name} ${active ? 'reactivated' : 'deactivated'}.`)
    load()
  }

  async function resetPassword() {
    setMessage(null)
    setBusy(true)
    const { error } = await supabase.functions.invoke('manage-staff', {
      body: { action: 'reset_password', user_id: editing.id, password: editing.draft }
    })
    setBusy(false)
    if (error) return fail(await functionError(error))
    ok('Password reset. Give the new password to the staff member securely.')
    setEditing(null)
  }

  async function addDepartment(e) {
    e.preventDefault()
    if (!newDept.trim()) return
    const { error } = await supabase.from('departments').insert({ facility_id: profile.facility_id, name: newDept.trim() })
    if (error) return fail(error.code === '23505' ? 'That department already exists.' : error.message)
    setNewDept('')
    load()
  }

  async function removeDepartment(dept) {
    const { error } = await supabase.from('departments').delete().eq('id', dept.id)
    if (error) return fail(error.code === '23503' ? `${dept.name} still has staff assigned. Reassign them first.` : error.message)
    load()
  }

  return (
    <div>
      <PageHeader
        title="Staff"
        subtitle="Create accounts, assign roles and departments, and deactivate access."
        action={<button className="btn-primary" onClick={() => setShowAdd((v) => !v)}><UserPlus size={16} />Add staff member</button>}
      />

      <div className="space-y-4 p-6">
        {message && <Banner kind={message.kind}>{message.text}</Banner>}

        {showAdd && (
          <form onSubmit={createStaff} className="card space-y-4 p-4">
            <div className="flex gap-1 border-b border-border">
              {[['create', 'Create new login'], ['link', 'Link an existing login']].map(([k, label]) => (
                <button type="button" key={k} onClick={() => setAddMode(k)}
                  className={`px-3 py-2 text-sm font-medium ${addMode === k ? 'border-b-2 border-ink text-ink' : 'text-ink/50 hover:text-ink'}`}>
                  {label}
                </button>
              ))}
            </div>
            {addMode === 'link' && (
              <Banner kind="info">
                First create the login in the Supabase dashboard under Authentication, Users, Add user (tick Auto Confirm User). Then enter the same email here to give that person a role and facility.
              </Banner>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><label className="label">First name</label><input required className="input" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
              <div><label className="label">Last name</label><input required className="input" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
              <div><label className="label">{addMode === 'link' ? 'Email of the existing login' : 'Work email (used to sign in)'}</label><input required type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              {addMode === 'create' && (
                <div><label className="label">Temporary password (min 8 characters)</label><input required minLength={8} type="text" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              )}
              <div>
                <label className="label">Role</label>
                <select className="input" value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Department</label>
                <select className="input" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                  <option value="">None</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className="btn-primary">{busy ? 'Saving...' : addMode === 'link' ? 'Link login' : 'Create account'}</button>
              <button type="button" className="btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </form>
        )}

        <div className="card overflow-x-auto">
          <table>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink/40">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Department</th>
                <th className="px-4 py-2 font-medium">Phone</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {!loading && staff.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-ink/40">No staff yet.</td></tr>
              )}
              {staff.map((m) => {
                const isSelf = m.id === profile.id
                const edit = editing?.id === m.id ? editing : null
                return (
                  <tr key={m.id} className="border-t border-border align-top text-sm">
                    {edit?.mode === 'edit' ? (
                      <>
                        <td className="px-4 py-2">
                          <div className="flex gap-1">
                            <input className="input" value={edit.draft.first_name} onChange={(e) => setEditing({ ...edit, draft: { ...edit.draft, first_name: e.target.value } })} />
                            <input className="input" value={edit.draft.last_name} onChange={(e) => setEditing({ ...edit, draft: { ...edit.draft, last_name: e.target.value } })} />
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <select className="input" disabled={isSelf} value={edit.draft.role_id} onChange={(e) => setEditing({ ...edit, draft: { ...edit.draft, role_id: e.target.value } })}>
                            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <select className="input" value={edit.draft.department_id || ''} onChange={(e) => setEditing({ ...edit, draft: { ...edit.draft, department_id: e.target.value } })}>
                            <option value="">None</option>
                            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2"><input className="input" value={edit.draft.phone || ''} onChange={(e) => setEditing({ ...edit, draft: { ...edit.draft, phone: e.target.value } })} /></td>
                        <td className="px-4 py-2" />
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <button className="text-xs font-medium text-accent hover:underline" onClick={saveEdit}>Save</button>
                            <button className="text-xs text-ink/50 hover:underline" onClick={() => setEditing(null)}>Cancel</button>
                          </div>
                        </td>
                      </>
                    ) : edit?.mode === 'password' ? (
                      <>
                        <td className="px-4 py-2 text-ink">{m.first_name} {m.last_name}</td>
                        <td className="px-4 py-2" colSpan={3}>
                          <input className="input" placeholder="New password (min 8 characters)" value={edit.draft} onChange={(e) => setEditing({ ...edit, draft: e.target.value })} />
                        </td>
                        <td className="px-4 py-2" />
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <button disabled={busy || edit.draft.length < 8} className="text-xs font-medium text-accent hover:underline disabled:opacity-40" onClick={resetPassword}>Set password</button>
                            <button className="text-xs text-ink/50 hover:underline" onClick={() => setEditing(null)}>Cancel</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2 text-ink">{m.first_name} {m.last_name}{isSelf && <span className="ml-1 text-xs text-ink/40">(you)</span>}</td>
                        <td className="px-4 py-2 text-ink/70">{m.roles?.name}</td>
                        <td className="px-4 py-2 text-ink/70">{m.departments?.name || '—'}</td>
                        <td className="px-4 py-2 text-ink/70">{m.phone || '—'}</td>
                        <td className="px-4 py-2">
                          <span className={`border-l-4 pl-2 text-xs font-medium ${m.is_active ? 'border-success text-success' : 'border-danger text-danger'}`}>
                            {m.is_active ? 'Active' : 'Deactivated'}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap items-center gap-3">
                            <button className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                              onClick={() => setEditing({ id: m.id, mode: 'edit', draft: { first_name: m.first_name, last_name: m.last_name, phone: m.phone, role_id: m.role_id, department_id: m.department_id } })}>
                              <Pencil size={12} />Edit
                            </button>
                            <button className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline" onClick={() => setEditing({ id: m.id, mode: 'password', draft: '' })}>
                              <KeyRound size={12} />Password
                            </button>
                            {!isSelf && (m.is_active
                              ? <button className="text-xs font-medium text-danger hover:underline" onClick={() => setActive(m, false)}>Deactivate</button>
                              : <button className="text-xs font-medium text-success hover:underline" onClick={() => setActive(m, true)}>Reactivate</button>)}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">Departments</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            {departments.length === 0 && <p className="text-sm text-ink/40">No departments yet.</p>}
            {departments.map((d) => (
              <span key={d.id} className="inline-flex items-center gap-2 rounded-sm border border-border bg-bg px-2 py-1 text-sm text-ink">
                {d.name}
                <button onClick={() => removeDepartment(d)} className="text-ink/40 hover:text-danger" aria-label={`Remove ${d.name}`}><Trash2 size={13} /></button>
              </span>
            ))}
          </div>
          <form onSubmit={addDepartment} className="flex max-w-sm gap-2">
            <input className="input" placeholder="New department, e.g. Outpatient" value={newDept} onChange={(e) => setNewDept(e.target.value)} />
            <button type="submit" className="btn-secondary shrink-0">Add</button>
          </form>
        </div>
      </div>
    </div>
  )
}
