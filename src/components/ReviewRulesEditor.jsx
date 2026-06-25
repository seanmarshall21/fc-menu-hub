import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// Manage custom AI-review rules for one scope (brand / series / event / menu).
// Rules cascade down: a menu's review applies rules from its brand, series,
// event, and itself. Each rule can target a category and be a flag or an edit.
//
// Props:
//   scopeType  — 'brand' | 'series' | 'event' | 'menu'
//   scopeId    — uuid of the row
//   scopeLabel — e.g. "this event" (for copy)
//   canEdit    — bool

const CATEGORIES = [
  { value: '', label: 'All menu types' },
  { value: 'bar', label: 'Bar only' },
  { value: 'food', label: 'Food only' },
  { value: 'vip', label: 'VIP only' },
  { value: 'happy_hour', label: 'Happy Hour only' },
  { value: 'custom', label: 'Custom only' },
]

export default function ReviewRulesEditor({ scopeType, scopeId, scopeLabel = 'this level', canEdit = true }) {
  const { profile } = useAuth()
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [category, setCategory] = useState('')
  const [mode, setMode] = useState('flag')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!scopeId) return
    setLoading(true)
    const { data, error: err } = await supabase.from('review_rules')
      .select('*').eq('scope_id', scopeId).eq('scope_type', scopeType)
      .order('created_at', { ascending: true })
    if (err) setError(err.message)
    setRules(data || [])
    setLoading(false)
  }, [scopeId, scopeType])

  useEffect(() => { load() }, [load])

  async function addRule(e) {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true); setError(null)
    const { error: err } = await supabase.from('review_rules').insert({
      scope_type: scopeType, scope_id: scopeId, text: text.trim(),
      category: category || null, mode, created_by: profile?.id || null,
    })
    setBusy(false)
    if (err) { setError(err.message); return }
    setText(''); setCategory(''); setMode('flag')
    load()
  }

  async function removeRule(id) {
    await supabase.from('review_rules').delete().eq('id', id)
    load()
  }

  const catLabel = (c) => (CATEGORIES.find(x => x.value === (c || ''))?.label) || c

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-ink-900">AI review rules</h2>
        <p className="text-xs text-ink-400 mt-0.5">
          Extra things the AI checks for. Rules set on {scopeLabel} apply to every menu under it (they stack with rules from higher levels).
          E.g. <span className="italic">"All instances of vodka must say 'Tito's Handmade Vodka'."</span>
        </p>
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {loading ? (
        <p className="text-sm text-ink-400">Loading…</p>
      ) : rules.length === 0 ? (
        <p className="text-sm text-ink-400 italic">No rules at {scopeLabel} yet.</p>
      ) : (
        <ul className="space-y-2">
          {rules.map(r => (
            <li key={r.id} className="flex items-start gap-3 text-sm border border-surface-200 rounded-lg px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-ink-800">{r.text}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-100 text-ink-500">{catLabel(r.category)}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${r.mode === 'edit' ? 'bg-brand-50 text-brand-700' : 'bg-amber-50 text-amber-700'}`}>
                    {r.mode === 'edit' ? 'suggest fix' : 'flag only'}
                  </span>
                </div>
              </div>
              {canEdit && (
                <button onClick={() => removeRule(r.id)} className="text-[11px] text-red-400 hover:text-red-600 flex-shrink-0">Remove</button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <form onSubmit={addRule} className="space-y-2 border-t border-surface-100 pt-4">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="e.g. Every mention of vodka must read 'Tito's Handmade Vodka'."
            rows={2}
            className="input w-full resize-y text-sm"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <select value={category} onChange={e => setCategory(e.target.value)} className="input py-1.5 text-sm w-auto">
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <select value={mode} onChange={e => setMode(e.target.value)} className="input py-1.5 text-sm w-auto">
              <option value="flag">Flag only</option>
              <option value="edit">Flag + suggest fix</option>
            </select>
            <button type="submit" disabled={busy || !text.trim()} className="btn-primary btn-sm ml-auto disabled:opacity-50">
              {busy ? 'Adding…' : 'Add rule'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
