import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import PageScreen, { PageBody } from '@/components/PageScreen'
import { ensurePushSubscription, clearPushSubscription, hasPushSubscription } from '@/lib/pwa'

/**
 * Full-page profile / account settings.
 *
 * Replaces the old <Modal> in Layout.jsx. Each section is its own card so
 * future additions (notification prefs, two-factor, theme, etc.) can land
 * without crowding a modal. The Save/Cancel buttons live inside each card
 * so you can edit one thing without committing pending changes elsewhere.
 */
export default function ProfilePage() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  // ── Display name ─────────────────────────────────────────────────────────
  const [name, setName] = useState(profile?.full_name || '')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameMsg, setNameMsg] = useState(null) // { kind: 'success' | 'error', text }
  const nameDirty = name.trim() !== (profile?.full_name || '')

  async function saveName(e) {
    e?.preventDefault?.()
    setNameSaving(true); setNameMsg(null)
    const { error } = await supabase
      .from('user_profiles')
      .update({ full_name: name.trim() })
      .eq('id', profile.id)
    setNameSaving(false)
    if (error) { setNameMsg({ kind: 'error', text: error.message }); return }
    if (profile) profile.full_name = name.trim()
    setNameMsg({ kind: 'success', text: 'Saved.' })
  }

  // ── Password change ──────────────────────────────────────────────────────
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)
  const pwDirty = newPassword.length > 0 || confirmPassword.length > 0

  async function savePassword(e) {
    e.preventDefault()
    setPwMsg(null)
    if (newPassword.length < 8) { setPwMsg({ kind: 'error', text: 'Use at least 8 characters.' }); return }
    if (newPassword !== confirmPassword) { setPwMsg({ kind: 'error', text: 'Passwords don\'t match.' }); return }
    setPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPwSaving(false)
    if (error) { setPwMsg({ kind: 'error', text: error.message }); return }
    setNewPassword(''); setConfirmPassword('')
    setPwMsg({ kind: 'success', text: 'Password updated.' })
  }

  function cancelPassword() {
    setNewPassword(''); setConfirmPassword(''); setPwMsg(null)
  }

  // ── Sign out ─────────────────────────────────────────────────────────────
  async function handleSignOut() {
    if (!confirm('Sign out of Menu Hub?')) return
    await signOut()
    navigate('/login')
  }

  return (
    <PageScreen breadcrumbs={[{ label: 'Profile' }]}>
      <PageBody className="max-w-2xl space-y-6">
        {/* Header card */}
        <div className="card p-6 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 text-xl font-semibold flex-shrink-0">
            {profile?.full_name?.[0] || profile?.email?.[0] || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-ink-900 truncate">{profile?.full_name || profile?.email}</h1>
            <p className="text-sm text-ink-500 truncate">{profile?.email}</p>
            <p className="text-xs text-ink-400 mt-1 capitalize">Role: <span className="font-medium text-ink-700">{profile?.role || '—'}</span></p>
          </div>
        </div>

        {/* Display name */}
        <Section title="Display Name" subtitle="What other users see in edit logs and approvals.">
          <form onSubmit={saveName} className="space-y-3">
            <input
              className="input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
            />
            <FormFooter
              dirty={nameDirty}
              saving={nameSaving}
              msg={nameMsg}
              onCancel={() => { setName(profile?.full_name || ''); setNameMsg(null) }}
            />
          </form>
        </Section>

        {/* Email (read-only) */}
        <Section title="Email" subtitle="Email can't be changed here. Contact an admin if it needs updating.">
          <input className="input bg-surface-50 text-ink-400" value={profile?.email || ''} disabled />
        </Section>

        {/* Password change */}
        <Section title="Password" subtitle="Use at least 8 characters. You'll stay signed in after changing.">
          <form onSubmit={savePassword} className="space-y-3">
            <div>
              <label className="label">New password</label>
              <input
                type="password"
                className="input"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            <div>
              <label className="label">Confirm password</label>
              <input
                type="password"
                className="input"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            <FormFooter
              dirty={pwDirty}
              saving={pwSaving}
              msg={pwMsg}
              saveLabel="Update password"
              onCancel={cancelPassword}
            />
          </form>
        </Section>

        <PushNotificationsSection />

        {/* Sign out */}
        <Section title="Sign out" subtitle="End your session on this device.">
          <button onClick={handleSignOut} className="btn-secondary btn-sm text-red-600 border-red-200 hover:bg-red-50">
            Sign out of Menu Hub
          </button>
        </Section>
      </PageBody>
    </PageScreen>
  )
}

function PushNotificationsSection() {
  const [enabled, setEnabled] = useState(false)
  const [supported, setSupported] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setSupported(false); return
    }
    hasPushSubscription().then(setEnabled)
  }, [])

  async function turnOn() {
    setBusy(true); setMsg(null)
    const res = await ensurePushSubscription()
    setBusy(false)
    if (!res.ok) {
      const reasonMsg = {
        'vapid-not-configured': 'Push notifications aren\'t set up on the server yet. Ask Sean.',
        'unsupported':          'This browser doesn\'t support push notifications.',
        'denied':               'You blocked notifications. Re-enable them in your browser settings.',
        'not-signed-in':        'Sign back in and try again.',
      }[res.reason] || 'Something went wrong.'
      setMsg({ kind: 'error', text: reasonMsg })
      return
    }
    setEnabled(true)
    setMsg({ kind: 'success', text: 'Push notifications enabled on this device.' })
  }

  async function turnOff() {
    setBusy(true); setMsg(null)
    await clearPushSubscription()
    setEnabled(false); setBusy(false)
    setMsg({ kind: 'success', text: 'Push notifications turned off on this device.' })
  }

  if (!supported) {
    return (
      <Section title="Push notifications" subtitle="Get a desktop alert when you're tagged on an edit or one of yours is resolved.">
        <p className="text-xs text-ink-500">This browser doesn't support web push. Try Chrome, Edge, or Safari 16+.</p>
      </Section>
    )
  }

  return (
    <Section title="Push notifications" subtitle="Get a desktop alert when you're tagged on an edit or one of yours is resolved. Settings are per device — turn it on once per browser/laptop you use.">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm">
          <div className={enabled ? 'text-emerald-700 font-medium' : 'text-ink-600'}>
            {enabled ? '✓ Enabled on this device' : 'Disabled on this device'}
          </div>
          <div className="text-xs text-ink-500 mt-1">
            {enabled ? 'You\'ll get a system notification when something hits your inbox.' : 'Click "Enable" to allow notifications. Your browser will ask for permission once.'}
          </div>
          {msg && (
            <div className={`text-xs mt-2 ${msg.kind === 'success' ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}</div>
          )}
        </div>
        <button
          type="button"
          onClick={enabled ? turnOff : turnOn}
          disabled={busy}
          className={`whitespace-nowrap flex-shrink-0 ${enabled ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'}`}
        >
          {busy ? '…' : (enabled ? 'Turn off' : 'Enable')}
        </button>
      </div>
    </Section>
  )
}

function Section({ title, subtitle, children }) {
  return (
    <div className="card p-6">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
        {subtitle && <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function FormFooter({ dirty, saving, msg, onCancel, saveLabel = 'Save' }) {
  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      <div className="min-h-[20px] text-xs">
        {msg?.kind === 'success' && <span className="text-emerald-700">✓ {msg.text}</span>}
        {msg?.kind === 'error' && <span className="text-red-600">{msg.text}</span>}
      </div>
      <div className="flex items-center gap-2">
        {dirty && (
          <button type="button" onClick={onCancel} className="btn-secondary btn-sm">Cancel</button>
        )}
        <button type="submit" className="btn-primary btn-sm" disabled={!dirty || saving}>
          {saving ? 'Saving…' : saveLabel}
        </button>
      </div>
    </div>
  )
}
