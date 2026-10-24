// Edge Function: manage-staff
// Creates staff logins and resets passwords. This needs the Supabase
// service-role key, which must never reach the browser, so it runs here.
// Every call first verifies the caller is an ACTIVE ADMINISTRATOR, and an
// administrator can only act on staff at their own facility.
//
// Deploy: Supabase dashboard -> Edge Functions -> Deploy a new function
// named "manage-staff", paste this file, keep "Verify JWT" ON.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // 1. who is calling?
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData.user) return json({ error: 'You are not signed in.' }, 401)

    // 2. are they an active administrator?
    const { data: caller } = await admin
      .from('staff')
      .select('facility_id, role_id, is_active')
      .eq('id', userData.user.id)
      .single()
    if (!caller || !caller.is_active || caller.role_id !== 1) {
      return json({ error: 'Administrator access is required.' }, 403)
    }

    const body = await req.json()

    // ---- create a staff login + staff record ----
    if (body.action === 'create') {
      const email = String(body.email ?? '').trim().toLowerCase()
      const password = String(body.password ?? '')
      const firstName = String(body.first_name ?? '').trim()
      const lastName = String(body.last_name ?? '').trim()
      const roleId = Number(body.role_id)

      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400)
      if (password.length < 8) return json({ error: 'The password must be at least 8 characters.' }, 400)
      if (!firstName || !lastName) return json({ error: 'First and last name are required.' }, 400)
      if (![1, 2, 3, 4, 5].includes(roleId)) return json({ error: 'Choose a valid role.' }, 400)

      if (body.department_id) {
        const { data: dept } = await admin
          .from('departments').select('id').eq('id', body.department_id).eq('facility_id', caller.facility_id).maybeSingle()
        if (!dept) return json({ error: 'That department does not belong to your facility.' }, 400)
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email, password, email_confirm: true
      })
      if (createError || !created.user) {
        return json({ error: createError?.message ?? 'Could not create the login.' }, 400)
      }

      const { error: staffError } = await admin.from('staff').insert({
        id: created.user.id,
        facility_id: caller.facility_id,
        role_id: roleId,
        department_id: body.department_id || null,
        first_name: firstName,
        last_name: lastName,
        phone: body.phone || null
      })
      if (staffError) {
        await admin.auth.admin.deleteUser(created.user.id)   // no orphan login
        return json({ error: staffError.message }, 400)
      }
      return json({ ok: true, id: created.user.id })
    }

    // ---- reset a staff member's password ----
    if (body.action === 'reset_password') {
      const password = String(body.password ?? '')
      if (password.length < 8) return json({ error: 'The password must be at least 8 characters.' }, 400)

      const { data: target } = await admin
        .from('staff').select('id').eq('id', body.user_id).eq('facility_id', caller.facility_id).maybeSingle()
      if (!target) return json({ error: 'That staff member is not at your facility.' }, 404)

      const { error: resetError } = await admin.auth.admin.updateUserById(target.id, { password })
      if (resetError) return json({ error: resetError.message }, 400)
      return json({ ok: true })
    }

    return json({ error: 'Unknown action.' }, 400)
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
