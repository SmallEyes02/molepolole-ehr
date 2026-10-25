# Molepolole EHR (Prototype)

Electronic Health Record system for primary healthcare facilities in Molepolole, Botswana.
React (Vite) + Tailwind CSS + Lucide icons on the front end, Supabase (PostgreSQL, Auth, Row Level Security) on the back end.

## What's included

- Staff login (Supabase Auth), scoped to one facility per staff account
- Patient registration and search
- Patient chart with encounter history
- New encounter form with vitals capture
- Dashboard with live counts and recent encounters
- Terms of Use and Privacy Policy pages
- Database schema normalized to 3NF with Row Level Security
- SVG favicon, deploy configs for a custom domain on Netlify or Vercel

## 1. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run **`supabase/schema_full.sql`** — this one file contains the complete, current database: every table, function, RLS policy, trigger, and seed row (facilities, ICD-10 codes, villages, medications). It's the only file you need for a new project.

   It has been tested to run cleanly on a fresh database, and to run again with no errors and no duplicate rows if you ever need to re-apply it (every `CREATE POLICY`/`CREATE TRIGGER` is preceded by a matching `DROP ... IF EXISTS`, and every seed `INSERT` uses `ON CONFLICT DO NOTHING` against that table's natural unique key).

   The numbered files in `supabase/migrations/` (`0001` through `0008`) are kept only as a change history of how the schema got here — **don't run them if you've already run `schema_full.sql`**, since it already contains everything they do. If you're maintaining an existing project that was built up from the numbered migrations one at a time, keep using new numbered files for anything after `0008`, and update `schema_full.sql` to match so it stays a true single-file mirror of the database.
3. Under Authentication, create your first staff user (email + password), or enable sign-ups temporarily.
4. Run this in the SQL editor to attach that user to a facility as an administrator (replace the two placeholder values):

   ```sql
   insert into staff (id, facility_id, role_id, first_name, last_name)
   values (
     'PASTE-THE-NEW-USER-UUID-HERE',
     (select id from facilities where name = 'Molepolole Clinic'),
     1, 'Your', 'Name'
   );
   ```
5. Under Project Settings -> API, copy the Project URL and the anon public key.

## 2. Configure and run the frontend

```bash
cp .env.example .env
# paste your Supabase URL and anon key into .env
npm install
npm run dev
```

The app runs at `http://localhost:5173`.

## 3. Deploy

```bash
npm run build
```

This produces a `dist/` folder you can deploy to Netlify or Vercel (config files for both are included). In either platform's dashboard, set the same two environment variables from `.env` before building.

## 4. Point a custom domain at it

**Netlify:** Site settings -> Domain management -> Add a domain. Add the CNAME record Netlify gives you at your domain registrar. HTTPS is issued automatically.

**Vercel:** Project -> Settings -> Domains -> Add. Add the A or CNAME record Vercel gives you at your registrar. HTTPS is issued automatically.

Either way, a domain must first be purchased from a registrar (for example a `.bw` domain through the Botswana Communications Regulatory Authority's registry, or a generic domain through any registrar) — this project cannot register one on your behalf.

## Database design notes (3NF)

Every table's non-key columns depend only on that table's whole primary key, and no column is derived from another non-key column:

- Repeated descriptive data (diagnosis names, medication names, lab test names, villages, allergy names, immunization names) lives once each in its own reference table and is linked by a foreign key id, never copied into clinical records.
- Many-to-many relationships (a patient can have several allergies, a visit can have several diagnoses) use junction tables (`patient_allergies`, `visit_diagnoses`) instead of repeating columns.
- One-to-one clinical data (`vitals` per visit, `lab_results` per `lab_order`) is split into its own table rather than widening the parent table, since a single visit or order should only ever have one row of that data.
- `village_id` on `patients` points to a `villages` table that also carries `district`, so district is never duplicated per patient and stays consistent if a village's district record is corrected once.

## Functions built so far

- [x] Staff login, facility-scoped access
- [x] Patient registration and search
- [x] Village/ward captured on registration and shown in the patient list and chart
- [x] Encounter recording with vitals
- [x] Diagnosis capture (ICD-10 search, multiple diagnoses per visit, one marked primary)
- [x] Referrals between facilities, with continuity of care (receiving facility gets scoped read access to that one patient)
- [x] Audit logging (patient, visit, diagnosis, and referral changes are recorded with who and when)
- [x] Role-based access — clinical write actions require a clinical role (Administrator, Doctor, Nurse, Clinician), enforced by RLS, not just hidden in the UI
- [x] Health-planning reports — encounters by type and most recorded diagnoses, last 30 days
- [x] Tablet/mobile-responsive layout (collapsible navigation)
- [x] Prescriptions — medication search, dosage/frequency/duration per line item, shown as a running medication list on the patient chart
- [ ] Lab orders and results
- [ ] Allergies
- [ ] Immunizations
- [ ] Offline / low-connectivity fallback mode

## Administrator module

Everything below is restricted to the **Administrator** role (role 1) by the database itself (RLS), not just hidden from menus. A doctor, nurse or records officer who calls these tables directly gets nothing back and cannot write.

| Requirement | Where | How it is enforced |
|---|---|---|
| Secure login | Supabase Auth, `/login` | Deactivated accounts are signed out with a notice and see no data |
| User management: create, update, deactivate | **Staff** | `staff` updates are admin-only; an admin cannot demote or deactivate their own account; accounts are created by the `manage-staff` Edge Function |
| Staff management: add doctors, departments, details | **Staff** (departments panel) | Admin-only writes, scoped to the admin's own facility |
| Patient management: register, update demographics | **Patients**, **Edit details** | Governed by the `patients.register` and `patients.update` permissions (admin always has both) |
| Appointments: schedule, reschedule, cancel | **Appointments** | Admin-only; a clinician or patient cannot be double-booked; cancelled slots free up |
| Financial: bills, payments, outstanding balances | **Finance** | Admin-only; totals and balances are calculated, never stored; payments cannot exceed the balance; a bill with payments cannot be voided |
| Inventory: medicines, supplies, stock levels | **Inventory** | Admin-only; stock on hand is calculated from movements and can never go negative; reorder flags |
| Reporting: patients, staff, finances, activity | **Reports** (CSV export) | Needs the `reports.view` permission (admin by default); finance and appointment sections are admin-only data |
| Access control: permissions per role | **Access control** | Admin edits a role-by-permission matrix; the Administrator role can never lose a permission |
| System configuration | **Settings** | Facility details plus currency, default appointment length and working hours; admin-only |
| Audit trail | **Activity log** | Every admin action is recorded with who and when; readable by admins only |

Security problems found and fixed while building this:

1. Any staff member could edit their own `role_id`, which meant a nurse could make themselves Administrator.
2. The audit log could be read by every staff member through the API.
3. `is_active` was never checked, so deactivated accounts kept full access.

### Creating staff accounts

There are two ways to add a staff member. Both are on **Staff**, **Add staff member**.

**Option 1: Link an existing login (no deployment needed).**
1. In the Supabase dashboard, open Authentication, Users, Add user. Enter an email and password and tick **Auto Confirm User**.
2. In the app, choose **Link an existing login**, enter the same email, a name, a role and a department.

This needs `0011_link_staff_account.sql` (included in `schema_full.sql`). Resetting a password for these accounts is done in the Supabase dashboard (Authentication, Users).

**Option 2: Create the login from inside the app (Edge Function).** Creating a login needs Supabase's admin API, which must never be exposed in a browser, so it runs in a small server-side function that first checks the caller is an active administrator.
1. Supabase dashboard, **Edge Functions**, **Deploy a new function**, name it exactly `manage-staff`.
2. Paste in `supabase/functions/manage-staff/index.ts`.
3. Turn **Verify JWT OFF**. Browsers send a CORS preflight without a token and the gateway would reject it. This is safe because the function verifies the caller itself on every request.
4. Deploy. (CLI: `supabase functions deploy manage-staff --no-verify-jwt`.) No secrets need to be set.

**If you see "blocked by CORS policy ... does not have HTTP ok status"**, the browser's preflight got a non-success reply, so the function never ran. Find out which with this (Windows PowerShell; keep `curl.exe`):

```
curl.exe -i -X OPTIONS https://YOUR-PROJECT-REF.supabase.co/functions/v1/manage-staff -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: POST"
```

- `404`: not deployed, or the name is not exactly `manage-staff`.
- `401`: Verify JWT is on. Turn it off and redeploy.
- `500` or `503`: the function crashed on start. Open Edge Functions, `manage-staff`, Logs.
- `204`: the function is fine and the problem is elsewhere.

**If the response body says `INVALID_API_KEY` ... "apikey looks like a legacy JWT-based key"**, your `.env` still holds the old `anon` key (the long `eyJ...` one) but the project uses Supabase's new API keys. In Project Settings, API Keys, copy the **Publishable key** (`sb_publishable_...`), put it in `.env` as `VITE_SUPABASE_ANON_KEY`, and restart `npm run dev`. Never use the secret key in the browser.

**If the Staff page says "Edge Function returned a non-2xx status code"** (or now, a more specific message), the request reached Supabase but was refused. The most common cause is **Verify JWT** being on: projects that use Supabase's newer signing keys fail the gateway's check even for a signed-in admin, and the response is a 401 that never reaches the function. Turn Verify JWT off and redeploy. To see the exact response yourself, open the browser's developer tools (F12), Network tab, click the `manage-staff` request, then Response. The function's own errors are always `{"error": "..."}`; anything else came from the platform.

### Upgrading a project that already runs an earlier version

Run `supabase/migrations/0010_admin_module.sql`, then `0011_link_staff_account.sql`, then `0012_patient_portal.sql`, then `0013_digital_card.sql`, then `0014_pharmacy.sql`, in the SQL editor. All are safe to run more than once. A fresh project only needs `schema_full.sql`, which already includes it.

After a permission change, users see updated menus the next time they sign in. The database enforces the change immediately.

### Not covered

- Working hours are shown and used as a default but not enforced when booking.
- Bills are entered by the administrator; there are no insurance claims, taxes or printed receipts.

## Patient portal (the digital health card)

The portal replaces the paper clinic card. A patient signs in once and can then open their card at any time, from any phone or computer: **their health card** (name, card number, date of birth, Omang, clinic), **appointments**, **medical history** (visits, measurements, diagnoses, medicines) and **notifications**. It is read-only, and **access never expires**.

**Card number.** Every patient has a permanent card number such as `MP000123`, like the number on a paper card. It is fixed once issued, unique, and searchable by staff. It identifies a record but is not a secret: it does not give anyone access on its own.

**How a patient gets access** (a name or Omang number alone is never enough):
1. At the front desk, staff with the `portal.manage` permission (Administrator and Records Officer by default) confirm the patient's identity, open their record, and choose **Patient portal, Generate activation code**.
2. They give the patient the code (for example `K7QM-4XWP`). It is shown once and stored only as a hash. **It does not expire.** It works once, and is replaced if a new one is generated or can be cancelled by staff.
3. The patient opens `/register`, creates a login (email and password), and enters the code once. After that they just sign in.
4. Wrong guesses are limited: 5 failed attempts locks that login's claiming for 15 minutes. A login without a code sees nothing at all.
5. Staff can remove a patient's access from the same card (for example after a lost phone).

**Staying signed in.** The app keeps patients signed in on their device and refreshes the session automatically. In the Supabase dashboard, under Authentication, Sessions, leave **Time-box user sessions** and **Inactivity timeout** switched **off** (or at zero); those settings sign people out and would defeat this.

**Never locked out.** On the sign-in page, **Forgot your password?** emails a reset link. Two things are needed in Supabase: under Authentication, URL Configuration, add your site address (and `http://localhost:5173`) to **Redirect URLs**; and be aware the built-in email sender is heavily rate-limited, so before real use set up your own email service (Authentication, SMTP settings).

**Quick access.** The app has a home-screen icon and manifest, so on a phone the patient can choose **Add to Home Screen** and open their card in one tap. (This is a shortcut: it still needs a connection.)

**Notifications** (shown in the portal):
- Booked, moved or cancelled appointments notify the patient.
- A reminder appears when an appointment is within **Reminder (hours before)** hours (Settings, default 24). Reminders are created when the patient opens the portal, so no scheduled job is needed, and each appointment time is only ever reminded once. Reminders for moved or cancelled appointments are hidden.

**Supabase settings to check:** Authentication, Sign In / Providers, **Allow new users to sign up** must be on or patients cannot create a login. If **Confirm email** is on (recommended), patients confirm their email first, then sign in and enter their code.

**Upgrading:** run `supabase/migrations/0012_patient_portal.sql`, then `0013_digital_card.sql` (both safe to run more than once). A fresh project only needs `schema_full.sql`. Codes issued before 0013 keep the 7-day expiry they were given; new ones never expire.

**Security, and what comes later.** Patients are read-only and limited to their own rows by the database, not by the app. They cannot see staff, other patients, bills, stock, settings, the audit log, or the base appointments table. For now, anyone who can sign in to a patient's account can see that patient's records, which is what makes the card easy to use but also means a signed-in phone is as sensitive as a paper card in someone's pocket. Staff can remove access immediately if a phone is lost. Stronger proof that the owner is the one opening it (for example fingerprint or face unlock) is planned for production and can be added to the sign-in step without changing the records or permissions.

### Not covered yet

- **Texts and emails are not sent.** A patient sees notifications after signing in. Sending an SMS or email needs a provider account and its key; the reminder records already exist, so it is a small addition once you choose.
- **No offline use.** The card needs a connection to open. Working with no signal would need the app to cache itself and the last-viewed record on the phone, which has its own privacy trade-offs on shared phones.
- Patients cannot book, reschedule or cancel online.
- Laboratory results and allergies are not shown (those features are not built yet).

## Pharmacy (dispensing)

A **Pharmacist** role and a **Pharmacy** screen let medicines be handed to patients, with stock kept up to date automatically.

**Setting it up**
1. Run `supabase/migrations/0014_pharmacy.sql` (a fresh project only needs `schema_full.sql`). If you create staff with the Edge Function, redeploy it so it accepts the new role; "Link an existing login" works without that.
2. An administrator adds pharmacists under **Staff** (role: Pharmacist).
3. An administrator lists each medicine under **Inventory** and records the stock received. A medicine that is not in the stock list cannot be dispensed, and the screen says so.

**Day to day**
- The **Dispensing** tab lists prescriptions waiting at the facility, oldest first. Search by the patient's **card number** (they can show it on their phone), name or medicine.
- **Dispense** opens a form with a suggested quantity worked out from the prescription (for example 4 tablets, twice a day, for 3 days = 24). It is only a suggestion and only for tablets and capsules; the pharmacist confirms the number.
- If less than the suggestion is given, it is recorded as a **part fill** and the prescription stays on the waiting list for the balance.
- Dispensing records who, what and how much, and **reduces stock in the same step**. Stock can never go negative, and two people dispensing at the same moment cannot both take the last box.
- A prescription can be fully dispensed only once.
- **History** lists everything dispensed. A mistake can be **reversed** with a reason: the stock goes back and the prescription is waiting again. Nothing is deleted, and who reversed it and why is kept.
- **Stock** shows medicine levels, read-only, with a reorder flag. Receiving stock stays with the administrator.

**Who sees what**
- A pharmacist can dispense, reverse, and see pharmacy stock. They cannot open encounters, write prescriptions, register patients, or see finance, staff, settings or the audit log. Access is a normal permission (`dispensing.manage`) on the Access control page, held by Pharmacists and Administrators by default.
- Doctors and nurses see on a patient's chart whether each prescription has been dispensed.
- **Patients** see, under their medicines, whether each is *waiting at the pharmacy*, *part collected* or *collected on* a date.
- Every dispensing and reversal is recorded in the activity log under the pharmacist's name.

### Not covered yet

- **No allergy or interaction checks.** Allergies cannot yet be recorded, so the pharmacy screen cannot warn about them. Build that before relying on this clinically.
- Dispensing is only for prescriptions from the pharmacist's own facility.
- No label printing, no link to billing or prices, and no controlled-drug register.

## Requirements traceability

This build was cross-checked against the requirements derived from the project's own proposal (reducing data loss vs. paper health cards, enabling referral between facilities, role-based access for doctors/nurses/pharmacists, audit trails, and reporting dashboards for health planning). The table below maps each into what's built:

| Requirement | Where it's implemented |
|---|---|
| Reduce data loss vs. paper cards | `patients`, `visits`, `vitals`, `visit_diagnoses` — a full digital record replacing the paper card |
| Referral between facilities | `referrals` table + `/referrals` page + scoped RLS read access for the receiving facility |
| Role-based access | `staff.role_id`, `my_role_id()` in RLS policies, `src/lib/permissions.js` in the UI |
| Audit trail of access | `audit_log` table + trigger functions in `0005_audit_log.sql` + `/activity` page (Administrator only) |
| Reporting for health planning | `/reports` page |
| Confidentiality policy | `/privacy` page |
| Works on tablets | Responsive sidebar/top-bar in `AppLayout.jsx` |

## Known limitations of this prototype

- No offline mode; a low-connectivity fallback would need a service worker and local queue, not included here.
- No SMS/USSD patient reminders.

## Critical fix: RLS infinite recursion (migration 0009)

Testing against a live PostgreSQL instance with simulated staff accounts found that `my_facility_id()` and `my_role_id()` recursed infinitely. Both look up the current user in `staff`, but `staff` has its own RLS policy that calls `my_facility_id()`, so every facility-scoped query failed with "stack depth limit exceeded". A `vite build` cannot catch this because it is a database runtime issue.

The fix marks both functions `SECURITY DEFINER`. It is already in `schema_full.sql`, and is available as `supabase/migrations/0009_fix_rls_recursion.sql`. If you ran an earlier version against a real Supabase project, run 0009 now. It is a `CREATE OR REPLACE` and safe to run at any point.

With the fix in place, the following was verified using a restricted (non-superuser) Postgres role: a Records Officer can view and register patients but cannot open an encounter, add a diagnosis or write a prescription; a Doctor can do all of those; a referral gives the receiving facility read access to that one patient only; and the audit log attributes each action to the right staff member, scoped to their facility.

## Running on Windows

If PowerShell reports that running scripts is disabled, run
`Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`, or use `npm.cmd` instead of `npm`, or use Command Prompt.
