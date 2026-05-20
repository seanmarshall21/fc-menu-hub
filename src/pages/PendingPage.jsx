import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function PendingPage() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center">

        {/* Logo */}
        <div className="w-12 h-12 bg-brand-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <span
            className="material-symbols-outlined text-white"
            style={{ fontSize: 24, fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
          >fastfood</span>
        </div>

        {/* Card */}
        <div className="card p-8">
          {/* Pending indicator */}
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          <h1 className="text-lg font-semibold text-ink-900 mb-2">Access Pending</h1>
          <p className="text-sm text-ink-500 mb-1">
            Your account has been created but hasn't been approved yet.
          </p>
          <p className="text-sm text-ink-500 mb-6">
            Contact your administrator to get access to Menu Hub.
          </p>

          {profile?.email && (
            <div className="bg-surface-50 border border-surface-200 rounded-lg px-3 py-2 mb-6">
              <p className="text-xs text-ink-400">Signed in as</p>
              <p className="text-sm font-medium text-ink-700 truncate">{profile.email}</p>
            </div>
          )}

          <button
            onClick={handleSignOut}
            className="w-full btn-secondary btn-sm justify-center"
          >
            Sign Out
          </button>
        </div>

        <p className="mt-4 text-xs text-ink-400">Menu Hub · BKSTG</p>
      </div>
    </div>
  )
}
