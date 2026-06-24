import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

// Bridges the user's browser Menu Hub session (incl. Google sign-in) into the
// Figma plugin. Shows a one-time code = base64(JSON of the current session)
// that the user pastes into Menu Sync. Only visible to the signed-in user.
export default function PluginAuthPage() {
  const { session, profile, loading } = useAuth()
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!session) { setCode(''); return }
    const payload = {
      access_token:  session.access_token,
      refresh_token: session.refresh_token,
      expires_at:    session.expires_at, // unix seconds
      email:         session.user?.email || null,
    }
    try { setCode(btoa(JSON.stringify(payload))) } catch { setCode('') }
  }, [session])

  async function copy() {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { /* user can select + copy manually */ }
  }

  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center p-6">
      <div className="card p-6 max-w-md w-full space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🍕</span>
          <h1 className="text-lg font-bold text-ink-900">Connect Menu Sync</h1>
        </div>

        {loading ? (
          <p className="text-sm text-ink-400">Loading…</p>
        ) : !session ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-600">Sign in to Menu Hub first, then come back to this page to get your plugin code.</p>
            <Link to="/login" className="btn-primary btn-sm inline-block">Sign in</Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-ink-600">
              Copy this code and paste it into the <strong>Menu Sync</strong> plugin in Figma to connect it as
              {' '}<span className="font-medium">{profile?.full_name || session.user?.email}</span>.
            </p>
            <textarea
              readOnly
              value={code}
              onFocus={e => e.target.select()}
              rows={4}
              className="input w-full font-mono text-xs break-all"
            />
            <button onClick={copy} className="btn-primary btn-sm w-full">
              {copied ? '✓ Copied — paste it in Figma' : 'Copy code'}
            </button>
            <p className="text-[11px] text-ink-400 leading-relaxed">
              This code authorizes the plugin to act as you and expires with your session. Don't share it. You can revoke it any time by signing out of the plugin.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
