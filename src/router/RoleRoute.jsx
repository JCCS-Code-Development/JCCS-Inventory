import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function RoleRoute({ allowedRoles }) {
  const user = useAuthStore((s) => s.user)
  if (allowedRoles.includes(user?.role)) return <Outlet />
  return <Navigate to="/" replace />
}
