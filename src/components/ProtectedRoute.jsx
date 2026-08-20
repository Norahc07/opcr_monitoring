import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { LoadingState } from './ui'

export default function ProtectedRoute({ children }) {
  const { loading, session, configured } = useAuth()

  if (!configured) return <Navigate to="/login" replace />
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Loading account…" />
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />
  return children
}
