import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export default function Terms() {
  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link to="/login" className="mb-6 inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
          <ArrowLeft size={14} /> Back to sign in
        </Link>

        <h1 className="mb-1 text-xl font-semibold text-ink">Terms of Use</h1>
        <p className="mb-8 text-sm text-ink/50">Last updated: 26 September 2026</p>

        <div className="card space-y-6 p-6 text-sm leading-relaxed text-ink/80">
          <section>
            <h2 className="mb-1 font-semibold text-ink">1. Purpose of this system</h2>
            <p>Molepolole EHR is a clinical record system for use by authorized staff at participating primary healthcare facilities in Molepolole, Botswana. It is provided as a prototype for evaluation and is not yet certified for unrestricted production use in a live clinical setting.</p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-ink">2. Authorized use</h2>
            <p>Access is limited to staff accounts created by a facility administrator. Each account may only be used by the individual it was issued to. Staff must access only the patient records required for their duties, in line with facility policy and the Botswana Data Protection Act.</p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-ink">3. Accuracy of records</h2>
            <p>Staff entering clinical data are responsible for the accuracy of what they record. The system does not verify the clinical correctness of diagnoses, prescriptions, or lab results entered by users.</p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-ink">4. Data ownership</h2>
            <p>Patient records remain the property of the facility at which the patient is registered. Facilities are responsible for retention and disclosure decisions in line with applicable health record regulations.</p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-ink">5. Availability</h2>
            <p>As a prototype, the system may be updated, restarted, or taken offline for maintenance without prior notice. Facilities should maintain a paper-based fallback process for periods when the system is unavailable.</p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-ink">6. Account security</h2>
            <p>Staff must keep login credentials confidential and report a lost or compromised account to their facility administrator immediately.</p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-ink">7. Patient portal</h2>
            <p>Patients who are given portal access must keep their login and activation code private and must not share them. Information shown in the portal is a summary for the patient's reference and does not replace advice from a clinician. Portal access does not expire. Anyone who can sign in to your account can see your records, so keep your phone and password safe and tell the clinic straight away if you lose them. A facility may withdraw portal access at any time.</p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-ink">8. Changes to these terms</h2>
            <p>These terms may be revised as the system moves from prototype to production. Continued use after a revision constitutes acceptance of the updated terms.</p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-ink">9. Contact</h2>
            <p>Questions about these terms should be directed to your facility's system administrator.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
