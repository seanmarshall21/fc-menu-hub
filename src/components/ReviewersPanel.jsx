import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Grant read-only review access to specific users for an event or a menu.
 * An event grant lets a reviewer see every menu in that event; a menu grant
 * scopes to one menu. Reviewers can view + leave feedback, never edit.
 *
 * Props:
 *   resourceType — 'event' | 'menu'
 *   resourceId   — uuid
 *   canEdit      — bool; only admin/internal manage grants
 */
export default function ReviewersPanel({ resourceType, resourceId, canEdit = false }) {
  const [users, setUsers] = useState([])
  const [grants, setGrants] = useState([])   // resource_viewers rows for this resource
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: u }, { data: g }] = await Promise.all([
      supabase.rpc('list_grantable_users'),
      supabase.from('resource_viewers').select('*').eq('resource_type', resourceType).eq('resource_id', resourceId),
    ])
    setUsers(u || [])
    setGrants(g || [])
    setLoading(false)
  }, [resourceType, resourceId])

  useEffect(() => { load() }, [load])

  const grantedIds = new Set(grants.map(g => g.user_id))

  async function toggle(userId) {
    setBusyId(userId); setError(null)
    try {
      if (grantedIds.has(userId)) {
        const { error: e } = await supabase.from('resource_viewers')
          .delete().eq('resource_type', resourceType).eq('resource_id', resourceId).eq('user_id', userId)
        if (e) throw e
      } else {
        const { error: e } = await supabase.from('resource_viewers')
          .insert({ resource_type: resourceType, resource_id: resourceId, user_id: userId })
        if (e) throw e
      }
      await load()
    } catch (e) { setError(e.message) } finally { setBusyId(null) }
  }

  // Surface the people granted here first, then everyone else.
  const sorted = [...users].sort((a, b) => {
    const ag = grantedIds.has(a.id) ? 0 : 1
    const bg = grantedIds.has(b.id) ? 0 : 1
    if (ag !== bg) return ag - bg
    return (a.full_name || a.email || '').localeCompare(b.full_name || b.email || '')
  })

  return (
    <div className="card p-5 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-ink-900">Reviewers</h2>
        <p className="text-xs text-ink-500 mt-0.5">
          People who can view {resourceType === 'event' ? 'all menus in this event' : 'this menu'} and leave feedback — no editing.
          {' '}Tip: create their account as role <span className="font-mono">viewer</span> in Admin first.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-ink-400">Loading…</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {sorted.length === 0 && <span className="text-xs text-ink-300 italic">No users to grant.</span>}
          {sorted.map(u => {
            const on = grantedIds.has(u.id)
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => canEdit && toggle(u.id)}
                disabled={!canEdit || busyId === u.id}
                title={u.email || ''}
                className={`text-[11px] px-2 py-1 rounded-full border transition-colors whitespace-nowrap ${
                  on ? 'bg-brand-500 text-white border-brand-500'
                     : 'bg-surface-0 text-ink-600 border-surface-300 hover:border-brand-400 hover:text-brand-600'
                } ${!canEdit ? 'cursor-default' : ''}`}
              >
                {on && <span className="mr-1">✓</span>}
                {u.full_name || u.email}
                {u.role !== 'viewer' && <span className="ml-1 opacity-50">· {u.role}</span>}
              </button>
            )
          })}
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
