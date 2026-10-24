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

### Creating staff accounts (Edge Function)

Creating a login needs Supabase's admin API, which must never be exposed in the browser, so it runs in an Edge Function.

1. Supabase dashboard, **Edge Functions**, **Deploy a new function**, name it exactly `manage-staff`.
2. Paste in `supabase/functions/manage-staff/index.ts` and deploy. Leave **Verify JWT** on. No secrets need to be set.
3. Sign in as an administrator, open **Staff**, **Add staff member**.

Until the function is deployed, the Add and Password buttons will show an error. You can still create a login under Authentication, Users and attach it with the `insert into staff` SQL from the setup section.

### Upgrading a project that already runs an earlier version

Run `supabase/migrations/0010_admin_module.sql` in the SQL editor. It is safe to run more than once. A fresh project only needs `schema_full.sql`, which already includes it.

After a permission change, users see updated menus the next time they sign in. The database enforces the change immediately.

### Not covered

- Working hours are shown and used as a default but not enforced when booking.
- Dispensing a prescription does not reduce stock automatically; stock changes are recorded on the Inventory page.
- Bills are entered by the administrator; there are no insurance claims, taxes or printed receipts.

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
