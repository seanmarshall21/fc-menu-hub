import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { menuReadiness, READINESS_META } from '@/lib/readiness'

// Per-event readiness dashboard: a compact bar of counts by state, so leads see
// the bottleneck at a glance. Self-contained — loads the sponsorship rosters +
// this event's menu sign-offs itself.
//
// Props: menus (array with id, phase, requires_sponsor_approval), eventId, seriesId
export default function EventReadiness({ menus = [], eventId, seriesId, onSelect }) {
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
    <div className="flex items-center gap-1.5 flex-wrap mb-4">
      {shown.map(k => (
        <button key={k} onClick={() => onSelect?.(k)} title={`${counts[k]} ${READINESS_META[k].label} — click to view`}
          className={`text-xs font-medium px-2 py-1 rounded-full inline-flex items-center gap-1 hover:opacity-80 whitespace-nowrap ${READINESS_META[k].cls}`}>
          {counts[k]} {READINESS_META[k].label.toLowerCase()}
        </button>
      ))}
    </div>
  )
}

// Single-color Lucide icons per readiness state (stroke = currentColor).
const svg = (children) => (
  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">{children}</svg>
)
const READY_ICON = {
  // wrench — work in progress
  in_progress: svg(<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />),
  // flag — needs sponsors
  awaiting_sponsors: svg(<><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></>),
  // file — ready for print
  ready: svg(<><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" /><path d="M14 2v5h5" /></>),
  // printer — exported / prepped
  exported: svg(<><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></>),
  // check-circle — complete
  complete: svg(<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m22 4-10 10.01-3-3" /></>),
  // archive
  archived: svg(<><rect x="2" y="4" width="20" height="5" /><path d="M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" /><line x1="10" y1="13" x2="14" y2="13" /></>),
}
