import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Manages the notify_user_ids list on a single entity (brand, series,
 * event, or menu). Cascades down: anyone toggled here is added to the
 * pool of people the next level inherits.
 *
 * Props:
 *   table     — 'brands' | 'series' | 'events' | 'menus'
 *   entityId  — uuid of the row to update
 *   current   — uuid[] currently on the row (may be null)
 *   inheritedIds — uuid[] resolved from ancestors (used to show which
 *                  people are already inherited and shouldn't be toggled
 *                  off at this level)
 *   inheritedFromLabel — string for the "Inherited from {label}" hint
 *                        e.g. "CRSSD (brand)" or "Spring 2026 (event)"
 *   onSaved   — callback after a successful save (parent can refetch)
 *   canEdit   — bool; renders read-only chips when false
 */
export default function NotifyForEditsEditor({
  table, entityId, current, inheritedIds = [], inheritedFromLabel,
  onSaved, canEdit = true,
}) {
  const [users, setUsers]   = useState([])
  const [draft, setDraft]   = useState(() => new Set(current || []))
  const [server, setServer] = useState(() => new Set(current || []))
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  // Refresh draft + server snapshot whenever the entity changes
  useEffect(() => {
    setDraft(new Set(current || []))
    setServer(new Set(current || []))
  }, [entityId, JSON.stringify(current || [])])

  // Load admin + internal users so they can be toggled
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('id, full_name, email, role')
        .in('role', ['admin', 'internal'])
        .order('full_name')
      if (!cancelled) setUsers(data || [])
    })()
    return () => { cancelled = true }
  }, [])

  function toggle(id) {
    setDraft(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const dirty = (() => {
    if (draft.size !== server.size) return true
    for (const id of draft) if (!server.has(id)) return true
    return false
  })()

  async function save() {
    setSaving(true); setError(null)
    const next = [...draft]
    const { error: err } = await supabase
      .from(table)
      .update({ notify_user_ids: next.length ? next : [] })
      .eq('id', entityId)
    setSaving(false)
    if (err) { setError(err.message); return }
    setServer(new Set(next))
    onSaved?.(next)
  }

  function cancel() {
    setDraft(new Set(server))
    setError(null)
  }

  const inherited = new Set(inheritedIds || [])

  return (
    <div className="space-y-3">
      {/* Inherited summary */}
      {inheritedIds.length > 0 && inheritedFromLabel && (
        <div className="text-[11px] text-ink-500 bg-surface-50 border border-surface-200 rounded-lg px-3 py-2">
          <div className="font-medium text-ink-600 mb-1">Inherited from {inheritedFromLabel}</div>
          <div className="flex flex-wrap gap-1.5">
            {inheritedIds.map(uid => {
              const u = users.find(x => x.id === uid)
              if (!u) return null
              return (
                <span key={uid} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-surface-300 text-ink-600">
                  ✓ {u.full_name || u.email}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Add at this level */}
      <div>
        <div className="text-xs text-ink-500 mb-1.5">Add or remove people notified at this level:</div>
        <div className="flex flex-wrap gap-1.5">
          {users.length === 0 && <span className="text-xs text-ink-300 italic">Loading…</span>}
          {users.map(u => {
            const isInherited = inherited.has(u.id)
            const isOn = draft.has(u.id) || isInherited
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => canEdit && !isInherited && toggle(u.id)}
                disabled={!canEdit || isInherited}
                title={isInherited
                  ? `Already notified via ${inheritedFromLabel || 'a parent'} — can't remove from here`
                  : (u.email || '')}
                className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                  isInherited
                    ? 'bg-surface-100 text-ink-500 border-surface-200 cursor-not-allowed'
                    : isOn
                      ? 'bg-brand-500 text-white border-brand-500'
                      : 'bg-white text-ink-600 border-surface-300 hover:border-brand-400 hover:text-brand-600'
                }`}
              >
                {(isOn || isInherited) && <span className="mr-1">✓</span>}
                {u.full_name || u.email}
              </button>
            )
          })}
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {canEdit && dirty && (
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-100">
          <button onClick={cancel} className="btn-secondary btn-sm" disabled={saving}>Cancel</button>
          <button onClick={save} className="btn-primary btn-sm" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}
