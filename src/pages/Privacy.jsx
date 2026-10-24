import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export default function Privacy() {
  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link to="/login" className="mb-6 inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
          <ArrowLeft size={14} /> Back to sign in
        </Link>

        <h1 className="mb-1 text-xl font-semibold text-ink">Privacy Policy</h1>
        <p className="mb-8 text-sm text-ink/50">Last updated: 26 September 2026</p>

        <div className="card space-y-6 p-6 text-sm leading-relaxed text-ink/80">
          <section>
            <h2 className="mb-1 font-semibold text-ink">1. Information we hold</h2>
            <p>The system stores patient demographic details (name, date of birth, sex, Omang number, contact details, village), clinical records (visits, vitals, diagnoses, prescriptions, lab orders and results, immunizations, allergies), and staff account details needed to operate the facility's clinical workflow.</p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-ink">2. Why we hold it</h2>
            <p>Patient information is held to provide continuity of clinical care at the facility where the patient is registered, to support facility reporting obligations, and to maintain an audit trail of who accessed or changed a record.</p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-ink">3. Who can access it</h2>
            <p>Access to a patient record is restricted to staff assigned to the facility where that patient is registered, enforced at the database level. Staff cannot view records belonging to other facilities. Access levels vary by role, for example a records officer does not have the same access as a doctor.</p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-ink">4. How it is protected</h2>
            <p>Data is stored in an access-controlled database with row-level security rules, encrypted in transit between the browser and the server. Every account requires a password to sign in, and all data access is scoped to the signed-in staff member's facility.</p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-ink">5. Data retention</h2>
            <p>Clinical records are retained for as long as required by the facility's record-keeping obligations under Botswana health regulations. Records are not deleted on request where retention is legally required for continuity of care.</p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-ink">6. Sharing outside the facility</h2>
            <p>Patient information is not shared outside the treating facility except where required for referral to another health facility, a legal or public health reporting obligation, or with the explicit consent of the patient or their guardian.</p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-ink">7. Patient rights</h2>
            <p>Patients, or their legal guardian, may request a copy of their held information or request correction of inaccurate details by making a request to the facility where they are registered.</p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-ink">8. Contact</h2>
            <p>Questions about this policy should be directed to your facility's system administrator or data protection point of contact.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
