import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { LoadingState } from './ui'

export default function AdminRoute({ children }) {
  const { loading, isAdmin, session } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Loading account…" />
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/" replace />
  return children
}
