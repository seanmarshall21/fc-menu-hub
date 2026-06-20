import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { format } from 'date-fns'

/**
 * Menu-level feedback thread. Anyone with view access to the menu (reviewers,
 * internal, admin) can post; internal/admin can resolve. Reviewers leave
 * notes here instead of editing the menu — keeps feedback out of the content
 * pipeline entirely.
 *
 * Props:
 *   menuId    — the menu
 *   canResolve— bool, whether the current user can mark comments resolved
 */
export default function MenuComments({ menuId, canResolve = false }) {
  const { session } = useAuth()
  const uid = session?.user?.id
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [showResolved, setShowResolved] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('menu_comments')
      .select('*')
      .eq('menu_id', menuId)
      .order('created_at', { ascending: true })
    if (err) { setError(err.message); setComments([]); setLoading(false); return }
    const rows = data || []
    // Hydrate author names
    const ids = [...new Set(rows.map(r => r.user_id).filter(Boolean))]
    if (ids.length) {
      const { data: profs } = await supabase.from('user_profiles').select('id, full_name, email').in('id', ids)
      const map = new Map((profs || []).map(p => [p.id, p]))
      rows.forEach(r => { r.author = map.get(r.user_id) || null })
    }
    setComments(rows)
    setLoading(false)
  }, [menuId])

  useEffect(() => { load() }, [load])

  async function post() {
    const text = body.trim()
    if (!text) return
    setPosting(true); setError(null)
    const { error: err } = await supabase.from('menu_comments').insert({ menu_id: menuId, user_id: uid, body: text })
    setPosting(false)
    if (err) { setError(err.message); return }
    setBody('')
    await load()
  }

  async function toggleResolved(c) {
    const patch = c.resolved_at
      ? { resolved_at: null, resolved_by: null }
      : { resolved_at: new Date().toISOString(), resolved_by: uid }
    await supabase.from('menu_comments').update(patch).eq('id', c.id)
    await load()
  }

  async function remove(c) {
    if (!confirm('Delete this comment?')) return
    await supabase.from('menu_comments').delete().eq('id', c.id)
    await load()
  }

  const open = comments.filter(c => !c.resolved_at)
  const resolved = comments.filter(c => c.resolved_at)

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink-900">Feedback</h2>
        <span className="text-xs text-ink-400">{open.length} open{resolved.length ? ` · ${resolved.length} resolved` : ''}</span>
      </div>

      {/* Composer */}
      <div className="space-y-2">
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Leave feedback on this menu…"
          rows={3}
          className="input w-full resize-y"
        />
        <div className="flex items-center justify-end gap-2">
          <button onClick={post} disabled={posting || !body.trim()} className="btn-primary btn-sm whitespace-nowrap disabled:opacity-50">
            {posting ? 'Posting…' : 'Post feedback'}
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      {/* Open comments */}
      {loading ? (
        <p className="text-sm text-ink-400">Loading…</p>
      ) : open.length === 0 && resolved.length === 0 ? (
        <p className="text-sm text-ink-400 italic">No feedback yet.</p>
      ) : (
        <ul className="space-y-3">
          {open.map(c => (
            <CommentRow key={c.id} c={c} uid={uid} canResolve={canResolve} onToggle={toggleResolved} onDelete={remove} />
          ))}
        </ul>
      )}

      {resolved.length > 0 && (
        <div className="pt-2 border-t border-surface-100">
          <button onClick={() => setShowResolved(s => !s)} className="text-xs text-ink-500 hover:text-ink-700">
            {showResolved ? 'Hide' : 'Show'} {resolved.length} resolved
          </button>
          {showResolved && (
            <ul className="space-y-3 mt-3 opacity-70">
              {resolved.map(c => (
                <CommentRow key={c.id} c={c} uid={uid} canResolve={canResolve} onToggle={toggleResolved} onDelete={remove} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function CommentRow({ c, uid, canResolve, onToggle, onDelete }) {
  const author = c.author?.full_name || c.author?.email || 'Someone'
  const mine = c.user_id === uid
  return (
    <li className="text-sm">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="font-medium text-ink-900">{author}</span>
        <span className="text-[11px] text-ink-400">{format(new Date(c.created_at), 'MMM d, h:mma')}</span>
        {c.resolved_at && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">resolved</span>}
        <span className="ml-auto flex items-center gap-2">
          {canResolve && (
            <button onClick={() => onToggle(c)} className="text-[11px] text-ink-500 hover:text-emerald-700 whitespace-nowrap">
              {c.resolved_at ? 'Reopen' : 'Resolve'}
            </button>
          )}
          {mine && (
            <button onClick={() => onDelete(c)} className="text-[11px] text-ink-400 hover:text-red-600 whitespace-nowrap">Delete</button>
          )}
        </span>
      </div>
      <p className="text-ink-700 whitespace-pre-wrap">{c.body}</p>
    </li>
  )
}
