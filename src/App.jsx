import { lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { isAdministrator, can } from './lib/permissions'
import AppLayout from './components/AppLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Patients from './pages/Patients'
import PatientDetail from './pages/PatientDetail'
import NewPatient from './pages/NewPatient'
import EditPatient from './pages/EditPatient'
import NewVisit from './pages/NewVisit'
import ReferPatient from './pages/ReferPatient'
import Referrals from './pages/Referrals'
import ActivityLog from './pages/ActivityLog'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import Register from './pages/portal/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import PortalLayout from './pages/portal/PortalLayout'

// Heavier or admin-only screens load on demand, to keep the first load small
// on slow clinic connections.
const Reports = lazy(() => import('./pages/Reports'))
const Pharmacy = lazy(() => import('./pages/Pharmacy'))
const Staff = lazy(() => import('./pages/admin/Staff'))
const Appointments = lazy(() => import('./pages/admin/Appointments'))
const Finance = lazy(() => import('./pages/admin/Finance'))
const Inventory = lazy(() => import('./pages/admin/Inventory'))
const AccessControl = lazy(() => import('./pages/admin/AccessControl'))
const Settings = lazy(() => import('./pages/admin/Settings'))

function FullScreenLoading() {
  return <div className="flex h-screen items-center justify-center bg-bg text-sm text-ink/60">Loading...</div>
}

function PrivateRoute({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <FullScreenLoading />
  if (!session) return <Navigate to="/login" replace />
  return children
}

// Administrator-only screens. The database enforces this too; this just
// stops a non-admin landing on a page that would show nothing.
function AdminRoute({ children }) {
  const { profile } = useAuth()
  if (!profile) return <div className="p-6 text-sm text-ink/50">Loading...</div>
  if (!isAdministrator(profile.role_id)) return <Navigate to="/" replace />
  return children
}

function PermissionRoute({ code, children }) {
  const { profile } = useAuth()
  if (!profile) return <div className="p-6 text-sm text-ink/50">Loading...</div>
  if (!can(profile, code)) return <Navigate to="/" replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/portal" element={<PrivateRoute><PortalLayout /></PrivateRoute>} />
      <Route path="/" element={<PrivateRoute><AppLayout /></PrivateRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="patients" element={<Patients />} />
        <Route path="patients/new" element={<PermissionRoute code="patients.register"><NewPatient /></PermissionRoute>} />
        <Route path="patients/:patientId" element={<PatientDetail />} />
        <Route path="patients/:patientId/edit" element={<PermissionRoute code="patients.update"><EditPatient /></PermissionRoute>} />
        <Route path="patients/:patientId/visits/new" element={<PermissionRoute code="clinical.record"><NewVisit /></PermissionRoute>} />
        <Route path="patients/:patientId/refer" element={<PermissionRoute code="referrals.send"><ReferPatient /></PermissionRoute>} />
        <Route path="referrals" element={<Referrals />} />
        <Route path="reports" element={<PermissionRoute code="reports.view"><Reports /></PermissionRoute>} />
        <Route path="pharmacy" element={<PermissionRoute code="dispensing.manage"><Pharmacy /></PermissionRoute>} />
        <Route path="admin/staff" element={<AdminRoute><Staff /></AdminRoute>} />
        <Route path="admin/appointments" element={<AdminRoute><Appointments /></AdminRoute>} />
        <Route path="admin/finance" element={<AdminRoute><Finance /></AdminRoute>} />
        <Route path="admin/inventory" element={<AdminRoute><Inventory /></AdminRoute>} />
        <Route path="admin/access" element={<AdminRoute><AccessControl /></AdminRoute>} />
        <Route path="admin/settings" element={<AdminRoute><Settings /></AdminRoute>} />
        <Route path="activity" element={<AdminRoute><ActivityLog /></AdminRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
