import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import PageScreen, { PageBody } from '@/components/PageScreen'
import PhaseBadge from '@/components/PhaseBadge'

/**
 * Landing for read-only reviewers. Lists only the menus shared with them —
 * resolved from resource_viewers (event grants expand to the event's menus,
 * menu grants pin to one). Each links to the menu's read-only page where
 * they can preview + leave feedback.
 */
export default function ViewerHome() {
  const { session } = useAuth()
  const uid = session?.user?.id
  const [groups, setGroups] = useState([]) // [{ event, menus:[] }]
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    ;(async () => {
      const { data: grants } = await supabase
        .from('resource_viewers').select('resource_type, resource_id').eq('user_id', uid)
      const eventIds = (grants || []).filter(g => g.resource_type === 'event').map(g => g.resource_id)
      const menuIds  = (grants || []).filter(g => g.resource_type === 'menu').map(g => g.resource_id)

      const sel = 'id, name, slug, phase, category, event:events(id, name, slug, event_date, series:series(slug, brand:brands(slug)))'
      const queries = []
      if (eventIds.length) queries.push(supabase.from('menus').select(sel).in('event_id', eventIds))
      if (menuIds.length)  queries.push(supabase.from('menus').select(sel).in('id', menuIds))
      const results = await Promise.all(queries)
      const seen = new Set()
      const menus = []
      for (const r of results) for (const m of (r.data || [])) {
        if (seen.has(m.id)) continue
        seen.add(m.id); menus.push(m)
      }

      // Group by event
      const byEvent = new Map()
      for (const m of menus) {
        const ev = m.event
        if (!ev) continue
        if (!byEvent.has(ev.id)) byEvent.set(ev.id, { event: ev, menus: [] })
        byEvent.get(ev.id).menus.push(m)
      }
      const grouped = [...byEvent.values()].sort((a, b) =>
        (a.event.event_date || '').localeCompare(b.event.event_date || ''))
      if (!cancelled) { setGroups(grouped); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [uid])

  return (
    <PageScreen breadcrumbs={[{ label: 'Shared with me' }]}>
      <PageBody>
        <p className="text-sm text-ink-400 mb-6">Menus shared with you for review. Open one to preview it and leave feedback.</p>
        {loading ? (
          <p className="text-sm text-ink-400">Loading…</p>
        ) : groups.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-sm text-ink-500">Nothing shared with you yet.</p>
            <p className="text-xs text-ink-400 mt-1">An admin can add you as a reviewer on an event or menu.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map(({ event, menus }) => {
              const brandSlug = event.series?.brand?.slug
              const seriesSlug = event.series?.slug
              return (
                <div key={event.id}>
                  <h2 className="text-sm font-semibold text-ink-900 mb-3">{event.name}</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {menus.map(m => (
                      <Link
                        key={m.id}
                        to={`/brands/${brandSlug}/series/${seriesSlug}/events/${event.slug}/menus/${m.slug}`}
                        className="card p-4 hover:shadow-md hover:border-brand-100 transition-all flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-ink-900 truncate">{m.name}</div>
                          <div className="text-[11px] text-ink-400 capitalize">{m.category}</div>
                        </div>
                        <PhaseBadge phase={m.phase} />
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </PageBody>
    </PageScreen>
  )
}
