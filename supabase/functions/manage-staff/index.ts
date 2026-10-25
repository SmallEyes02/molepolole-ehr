// Edge Function: manage-staff
// Creates staff logins and resets passwords. This needs the Supabase
// service-role key, which must never reach the browser, so it runs here.
// Every call first verifies the caller is an ACTIVE ADMINISTRATOR, and an
// administrator can only act on staff at their own facility.
//
// Deploy: Supabase dashboard -> Edge Functions -> Deploy a new function
// named exactly "manage-staff" and paste this file.
// Turn "Verify JWT" OFF: browsers send the CORS preflight (OPTIONS)
// without a token, and the gateway would reject it with a 401. This is
// safe because the code below verifies the caller itself on every real
// request and refuses anyone who is not an active administrator.
// CLI: supabase functions deploy manage-staff --no-verify-jwt
// SUPABASE_URL and the secret key are provided automatically.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const baseCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
}

// Echo back whatever headers the browser asks to send, so a newer
// supabase-js adding a header can never break the preflight check.
function corsFor(req: Request) {
  return {
    ...baseCors,
    'Access-Control-Allow-Headers':
      req.headers.get('Access-Control-Request-Headers') ?? 'authorization, x-client-info, apikey, content-type'
  }
}

// Projects on Supabase's newer API keys may supply the secret key as
// SUPABASE_SECRET_KEYS (a JSON object, usually {"default": "sb_secret_..."})
// instead of SUPABASE_SERVICE_ROLE_KEY. SERVICE_KEY is an optional secret
// you can set yourself (Edge Functions, Secrets) to override both.
function secretKey(): string {
  const own = Deno.env.get('SERVICE_KEY')
  if (own) return own
  const multi = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (multi) {
    try {
      const parsed = JSON.parse(multi)
      const found = parsed.default ?? Object.values(parsed)[0]
      if (found) return String(found)
    } catch { /* fall through to the legacy variable */ }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
}

Deno.serve(async (req) => {
  const cors = corsFor(req)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey())

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

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return json({ error: 'The request body must be valid JSON.' }, 400)
    }

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
      if (![1, 2, 3, 4, 5, 6].includes(roleId)) return json({ error: 'Choose a valid role.' }, 400)

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
