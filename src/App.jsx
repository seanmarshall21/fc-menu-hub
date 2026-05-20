import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import PendingPage from '@/pages/PendingPage'
import Dashboard from '@/pages/Dashboard'
import BrandPage from '@/pages/BrandPage'
import SeriesPage from '@/pages/SeriesPage'
import EventPage from '@/pages/EventPage'
import MenuPage from '@/pages/MenuPage'
import AdminPage from '@/pages/AdminPage'
import HelpPage from '@/pages/HelpPage'

function ProtectedRoute({ children }) {
  const { session, loading, isPending } = useAuth()
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontSize: 14, color: '#667085' }}>
      Loading...
    </div>
  )
  if (!session) return <Navigate to="/login" replace />
  if (isPending) return <PendingPage />
  return children
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="help" element={<HelpPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="brands/:brandSlug" element={<BrandPage />} />
            <Route path="brands/:brandSlug/series/:seriesSlug" element={<SeriesPage />} />
            <Route path="brands/:brandSlug/series/:seriesSlug/events/:eventSlug" element={<EventPage />} />
            <Route path="brands/:brandSlug/series/:seriesSlug/events/:eventSlug/menus/:menuSlug" element={<MenuPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
