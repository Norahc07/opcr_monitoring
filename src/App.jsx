import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import AdminRoute from './components/AdminRoute'
import Layout from './components/Layout'
import LazyPage from './components/LazyPage'
import ProtectedRoute from './components/ProtectedRoute'
import DesktopOnly from './components/DesktopOnly'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import WorkRoutePlaceholder from './components/WorkRoutePlaceholder'

const Profile = lazy(() => import('./pages/Profile'))
const ReviewForm = lazy(() => import('./pages/ReviewForm'))
const AuditLogs = lazy(() => import('./pages/AuditLogs'))
const Users = lazy(() => import('./pages/Users'))

export default function App() {
  return (
    <DesktopOnly>
      <AuthProvider>
        <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<WorkRoutePlaceholder />} />
          <Route path="/my-tally" element={<WorkRoutePlaceholder />} />
          <Route path="/tally" element={<Navigate to="/my-tally" replace />} />
          <Route path="/opcr" element={<WorkRoutePlaceholder />} />
          <Route path="/daily" element={<WorkRoutePlaceholder />} />
          <Route
            path="/profile"
            element={
              <LazyPage label="Loading profile…">
                <Profile />
              </LazyPage>
            }
          />
          <Route path="/admin" element={<Navigate to="/" replace />} />
          <Route
            path="/review/:formId"
            element={
              <AdminRoute>
                <LazyPage label="Loading review…">
                  <ReviewForm />
                </LazyPage>
              </AdminRoute>
            }
          />
          <Route
            path="/users"
            element={
              <AdminRoute>
                <LazyPage label="Loading users…">
                  <Users />
                </LazyPage>
              </AdminRoute>
            }
          />
          <Route
            path="/audit"
            element={
              <AdminRoute>
                <LazyPage label="Loading audit logs…">
                  <AuditLogs />
                </LazyPage>
              </AdminRoute>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </AuthProvider>
    </DesktopOnly>
  )
}
