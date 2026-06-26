import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { menuReadiness, READINESS_META } from '@/lib/readiness'

// Per-event readiness dashboard: a compact bar of counts by state, so leads see
// the bottleneck at a glance. Self-contained — loads the sponsorship rosters +
// this event's menu sign-offs itself.
//
// Props: menus (array with id, phase, requires_sponsor_approval), eventId, seriesId
export default function EventReadiness({ menus = [], eventId, seriesId }) {
  const [eventRoles, setEventRoles] = useState([])
  const [seriesRoles, setSeriesRoles] = useState([])
  const [signoffs, setSignoffs] = useState([])

  const menuIds = useMemo(() => menus.map(m => m.id), [menus])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [ev, ser, so] = await Promise.all([
        eventId ? supabase.from('event_approval_roles').select('*').eq('event_id', eventId).eq('role', 'sponsorship') : Promise.resolve({ data: [] }),
        seriesId ? supabase.from('series_approval_roles').select('*').eq('series_id', seriesId).eq('role', 'sponsorship') : Promise.resolve({ data: [] }),
        menuIds.length ? supabase.from('menu_signoffs').select('menu_id, role, user_id').in('menu_id', menuIds).eq('role', 'sponsorship') : Promise.resolve({ data: [] }),
      ])
      if (!alive) return
      setEventRoles(ev.data || []); setSeriesRoles(ser.data || []); setSignoffs(so.data || [])
    })()
    return () => { alive = false }
  }, [eventId, seriesId, menuIds])

  const counts = useMemo(() => {
    const soByMenu = new Map()
    for (const s of signoffs) { if (!soByMenu.has(s.menu_id)) soByMenu.set(s.menu_id, []); soByMenu.get(s.menu_id).push(s) }
    const c = {}
    for (const m of menus) {
      const state = menuReadiness({ menu: m, eventRoles, seriesRoles, signoffs: soByMenu.get(m.id) || [] })
      c[state] = (c[state] || 0) + 1
    }
    return c
  }, [menus, eventRoles, seriesRoles, signoffs])

  if (!menus.length) return null
  const order = ['in_progress', 'awaiting_sponsors', 'ready', 'exported', 'complete', 'archived']
  const shown = order.filter(k => counts[k])

  return (
    <div className="flex items-center gap-2 flex-wrap mb-4">
      <span className="text-xs font-medium text-ink-500">Readiness:</span>
      {shown.map(k => (
        <span key={k} className={`text-xs font-medium px-2 py-0.5 rounded-full ${READINESS_META[k].cls}`}>
          {counts[k]} {READINESS_META[k].label.toLowerCase()}
        </span>
      ))}
      {counts.ready > 0 && (
        <span className="text-[11px] text-emerald-700 ml-1">— {counts.ready} ready for creative to prep</span>
      )}
    </div>
  )
}
