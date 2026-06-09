import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import Layout from '@/components/Layout'
import ErrorBoundary from '@/components/ErrorBoundary'
import Login from '@/pages/Login'
import PendingPage from '@/pages/PendingPage'
import Dashboard from '@/pages/Dashboard'
import BrandsListPage from '@/pages/BrandsListPage'
import EventsListPage from '@/pages/EventsListPage'
import MenusListPage from '@/pages/MenusListPage'
import EditsListPage from '@/pages/EditsListPage'
import BrandPage from '@/pages/BrandPage'
import SeriesPage from '@/pages/SeriesPage'
import EventPage from '@/pages/EventPage'
import MenuPage from '@/pages/MenuPage'
import AdminPage from '@/pages/AdminPage'
import HelpPage from '@/pages/HelpPage'
import FavoritesPage from '@/pages/FavoritesPage'
import SponsorsPage from '@/pages/SponsorsPage'
import SearchPage from '@/pages/SearchPage'
import ProfilePage from '@/pages/ProfilePage'

function ProtectedRoute({ children }) {
  const { session, loading, isPending } = useAuth()
  if (loading) return (
    <div className="flex items-center justify-center h-screen text-sm text-ink-400">
      Loading…
    </div>
  )
  if (!session) return <Navigate to="/login" replace />
  if (isPending) return <PendingPage />
  return <ErrorBoundary fallback={({ error, reset }) => (
    <div className="p-6 max-w-xl mx-auto">
      <div className="card p-5 border-red-200 bg-red-50">
        <h2 className="text-base font-semibold text-red-800 mb-1">Page crashed</h2>
        <p className="text-sm text-red-700 mb-3 break-all font-mono text-xs">{String(error?.message || error)}</p>
        <div className="flex gap-2">
          <button onClick={reset} className="btn-secondary btn-sm">Try again</button>
          <button onClick={() => { window.location.href = '/' }} className="btn-primary btn-sm">Go home</button>
        </div>
      </div>
    </div>
  )}>{children}</ErrorBoundary>
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
            <Route path="profile" element={<ProfilePage />} />
            <Route path="help" element={<HelpPage />} />
            <Route path="favorites" element={<FavoritesPage />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="sponsors" element={<SponsorsPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="brands" element={<BrandsListPage />} />
            <Route path="events" element={<EventsListPage />} />
            <Route path="menus" element={<MenusListPage />} />
            <Route path="edits" element={<EditsListPage />} />
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
