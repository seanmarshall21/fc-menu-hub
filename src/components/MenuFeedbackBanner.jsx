import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'

/**
 * Compact top-of-page banner surfacing OPEN feedback notes for a menu, the
 * same way the spell-check review panel sits at the top. Renders nothing when
 * there's no open feedback. Internal/admin can resolve inline.
 *
 * Props:
 *   menuId       — the menu
 *   canResolve   — bool, whether the current user can resolve notes
 *   onOpenThread — optional, jump to the full Feedback tab
 */
export default function MenuFeedbackBanner({ menuId, canResolve = false, onOpenThread }) {
  const [open, setOpen] = useState([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('menu_comments')
      .select('*')
      .eq('menu_id', menuId)
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
    const rows = data || []
    const ids = [...new Set(rows.map(r => r.user_id).filter(Boolean))]
    if (ids.length) {
      const { data: profs } = await supabase.from('user_profiles').select('id, full_name, email').in('id', ids)
      const map = new Map((profs || []).map(p => [p.id, p]))
      rows.forEach(r => { r.author = map.get(r.user_id) || null })
    }
    setOpen(rows)
    setLoaded(true)
  }, [menuId])

  useEffect(() => { load() }, [load])

  async function resolve(c) {
    await supabase.from('menu_comments')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', c.id)
    load()
  }

  if (!loaded || open.length === 0) return null

  return (
    <div className="card border-amber-200 bg-amber-50/60 p-4 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
          💬 {open.length} feedback note{open.length === 1 ? '' : 's'} to address
        </h3>
        {onOpenThread && (
          <button onClick={onOpenThread} className="text-xs text-amber-700 hover:text-amber-900 hover:underline whitespace-nowrap flex-shrink-0">
            Open thread →
          </button>
        )}
      </div>
      <ul className="space-y-2">
        {open.map(c => (
          <li key={c.id} className="flex items-start gap-3 text-sm">
            <div className="min-w-0 flex-1">
              <span className="font-medium text-ink-800">{c.author?.full_name || c.author?.email || 'Someone'}</span>
              <span className="text-[11px] text-ink-400 ml-1.5">{format(new Date(c.created_at), 'MMM d, h:mma')}</span>
              <p className="text-ink-700 whitespace-pre-wrap">{c.body}</p>
            </div>
            {canResolve && (
              <button onClick={() => resolve(c)} className="text-[11px] text-ink-500 hover:text-emerald-700 whitespace-nowrap flex-shrink-0 mt-0.5">
                Resolve
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
