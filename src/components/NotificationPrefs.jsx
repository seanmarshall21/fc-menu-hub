import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// Per-user global notification subscriptions. Mentions and explicit "notify for
// edits" tags always reach you; these add firehose-style subscriptions for
// leads who want eyes on everything.
const OPTIONS = [
  { key: 'all_status', label: 'All status changes', blurb: 'Any menu moving between phases (Proof, Approved, Exported…), on any menu.' },
  { key: 'all_edits',  label: 'All edits',           blurb: 'Any edit to any menu item, by anyone — including pulls back from Figma.' },
  { key: 'comments',   label: 'All comments',        blurb: 'New activity/comments on any menu or event (you’re always notified when @mentioned).' },
]

export default function NotificationPrefs() {
  const { profile } = useAuth()
  const [prefs, setPrefs] = useState({ all_status: false, all_edits: false, comments: false })
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(null)

  useEffect(() => {
    if (!profile?.id) return
    ;(async () => {
      const { data } = await supabase.from('notification_prefs').select('*').eq('user_id', profile.id).maybeSingle()
      if (data) setPrefs({ all_status: !!data.all_status, all_edits: !!data.all_edits, comments: !!data.comments })
      setLoaded(true)
    })()
  }, [profile?.id])

  async function toggle(key) {
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next); setSaving(key)
    await supabase.from('notification_prefs').upsert({
      user_id: profile.id, ...next, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    setSaving(null)
  }

  if (!loaded) return <div className="text-sm text-ink-400">Loading notification settings…</div>

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-ink-900 mb-1">Notifications</h2>
      <p className="text-xs text-ink-500 mb-4">Choose what lands in your inbox. @mentions and menus you’re tagged on always notify you.</p>
      <div className="space-y-3">
        {OPTIONS.map(o => (
          <label key={o.key} className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={prefs[o.key]} onChange={() => toggle(o.key)} disabled={saving === o.key} className="mt-0.5" />
            <span className="min-w-0">
              <span className="text-sm font-medium text-ink-800">{o.label}</span>
              <span className="block text-[11px] text-ink-400">{o.blurb}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
