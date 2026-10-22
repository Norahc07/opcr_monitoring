import { Navigate } from 'react-router-dom'
import MyOpcr from './MyOpcr'
import { useAuth } from '../context/useAuth'

export default function MyIpcr() {
  const { isAdmin } = useAuth()
  if (isAdmin) return <Navigate to="/" replace />
  return <MyOpcr mode="ipcr" />
}
