import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import AdminRoute from './components/AdminRoute'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import DesktopOnly from './components/DesktopOnly'
import Login from './pages/Login'
import MyOpcr from './pages/MyOpcr'
import ReviewForm from './pages/ReviewForm'
import Profile from './pages/Profile'
import TallyBoard from './pages/TallyBoard'
import AuditLogs from './pages/AuditLogs'
import Users from './pages/Users'

export default function App() {
  return (
    <DesktopOnly>
      <AuthProvider>
        <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<TallyBoard />} />
          <Route path="/tally" element={<Navigate to="/" replace />} />
          <Route path="/opcr" element={<MyOpcr />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/admin" element={<Navigate to="/" replace />} />
          <Route
            path="/review/:formId"
            element={
              <AdminRoute>
                <ReviewForm />
              </AdminRoute>
            }
          />
          <Route
            path="/users"
            element={
              <AdminRoute>
                <Users />
              </AdminRoute>
            }
          />
          <Route
            path="/audit"
            element={
              <AdminRoute>
                <AuditLogs />
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
