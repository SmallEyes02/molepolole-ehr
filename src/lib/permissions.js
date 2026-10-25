// UI helpers only. The database (RLS) is the real enforcement layer:
// hiding a button here just avoids showing an action that would be rejected.
//
// Two kinds of access:
//  - Administrator-only modules (staff, appointments, finance, inventory,
//    access control, settings): isAdministrator(), hard-wired to role 1.
//  - Configurable permissions (patients.register, patients.update,
//    clinical.record, referrals.send, reports.view): can(), loaded from
//    the role_permissions table and editable by the administrator.
export const ROLES = {
  ADMINISTRATOR: 1,
  DOCTOR: 2,
  NURSE: 3,
  CLINICIAN: 4,
  RECORDS_OFFICER: 5,
  PHARMACIST: 6
}

export function isAdministrator(roleId) {
  return roleId === ROLES.ADMINISTRATOR
}

export function can(profile, code) {
  return Boolean(profile?.permissions?.includes(code))
}
