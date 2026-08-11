import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'

import ProtectedRoute from './router/ProtectedRoute'
import RoleRoute from './router/RoleRoute'
import AppLayout from './components/layout/AppLayout'

import Login from './pages/auth/Login'
import Dashboard from './pages/Dashboard'
import TakeDropoff from './pages/TakeDropoff'
import Items from './pages/Items'
import Requests from './pages/Requests'
import Receiving from './pages/Receiving'
import Counts from './pages/Counts'
import Orders from './pages/Orders'
import Vendors from './pages/Vendors'
import Locations from './pages/Locations'
import Projects from './pages/Projects'
import Users from './pages/Users'
import Reports from './pages/Reports'

function RoleRedirect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return <Navigate to={isAuthenticated ? '/' : '/login'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          {/* All three roles */}
          <Route path="/" element={<Dashboard />} />
          <Route path="/take-dropoff" element={<TakeDropoff />} />
          <Route path="/items" element={<Items />} />
          <Route path="/requests" element={<Requests />} />

          {/* Specialist + admin: receiving, order tracking, reports */}
          <Route element={<RoleRoute allowedRoles={['specialist', 'admin']} />}>
            <Route path="/receiving" element={<Receiving />} />
            <Route path="/counts" element={<Counts />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/reports" element={<Reports />} />
          </Route>

          {/* Admin only: total control */}
          <Route element={<RoleRoute allowedRoles={['admin']} />}>
            <Route path="/vendors" element={<Vendors />} />
            <Route path="/locations" element={<Locations />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/users" element={<Users />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<RoleRedirect />} />
    </Routes>
  )
}
