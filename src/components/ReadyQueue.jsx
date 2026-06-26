import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { menuReadiness } from '@/lib/readiness'

// Cross-event "Ready for print prep" queue for the creative team: every
// approved menu whose sponsors are resolved, in one place. Approved menus that
// still need sponsors are summarized so you know what's almost-ready.
export default function ReadyQueue() {
  const [ready, setReady] = useState([])
  const [awaiting, setAwaiting] = useState(0)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      // All approved menus with the slugs needed to link to them.
      const { data: menus } = await supabase
        .from('menus')
        .select('id,name,slug,size,phase,requires_sponsor_approval,event_id,events(slug,series_id,series(slug,brand:brands(slug,name)))')
        .eq('phase', 'approved')
      const list = menus || []
      if (!list.length) { if (alive) { setReady([]); setAwaiting(0); setLoaded(true) }; return }

      const eventIds = [...new Set(list.map(m => m.event_id).filter(Boolean))]
      const seriesIds = [...new Set(list.map(m => m.events?.series_id).filter(Boolean))]
      const menuIds = list.map(m => m.id)
      const [ev, ser, so] = await Promise.all([
        eventIds.length ? supabase.from('event_approval_roles').select('*').in('event_id', eventIds).eq('role', 'sponsorship') : { data: [] },
        seriesIds.length ? supabase.from('series_approval_roles').select('*').in('series_id', seriesIds).eq('role', 'sponsorship') : { data: [] },
        supabase.from('menu_signoffs').select('menu_id, role, user_id').in('menu_id', menuIds).eq('role', 'sponsorship'),
      ])
      const evBy = groupBy(ev.data || [], 'event_id')
      const serBy = groupBy(ser.data || [], 'series_id')
      const soBy = groupBy(so.data || [], 'menu_id')

      const readyRows = []
      let awaitingCount = 0
      for (const m of list) {
        const state = menuReadiness({
          menu: m,
          eventRoles: evBy[m.event_id] || [],
          seriesRoles: serBy[m.events?.series_id] || [],
          signoffs: soBy[m.id] || [],
        })
        if (state === 'ready') readyRows.push(m)
        else if (state === 'awaiting_sponsors') awaitingCount++
      }
      if (!alive) return
      setReady(readyRows); setAwaiting(awaitingCount); setLoaded(true)
    })()
    return () => { alive = false }
  }, [])

  if (!loaded || (ready.length === 0 && awaiting === 0)) return null

  return (
    <div className="card overflow-hidden mb-6">
      <div className="px-4 sm:px-6 py-4 border-b border-surface-200 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink-900">✦ Ready for print prep</h2>
        <span className="text-xs text-ink-400">
          {ready.length} ready{awaiting > 0 ? ` · ${awaiting} awaiting sponsors` : ''}
        </span>
      </div>
      {ready.length === 0 ? (
        <div className="px-6 py-6 text-sm text-ink-400">Nothing ready yet — {awaiting} approved menu{awaiting === 1 ? '' : 's'} still waiting on sponsors.</div>
      ) : (
        <ul className="divide-y divide-surface-100">
          {ready.map(m => {
            const bs = m.events?.series?.brand?.slug, ss = m.events?.series?.slug, es = m.events?.slug
            const to = bs && ss && es ? `/brands/${bs}/series/${ss}/events/${es}/menus/${m.slug}` : null
            const row = (
              <span className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
                <span className="min-w-0">
                  <span className="font-medium text-ink-900">{m.name}</span>
                  {m.size && <span className="text-[10px] uppercase ml-2 px-1.5 py-0.5 rounded bg-surface-100 text-ink-500">{m.size}</span>}
                  <span className="block text-xs text-ink-400 truncate">{m.events?.series?.brand?.name} · {m.events?.slug}</span>
                </span>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex-shrink-0">Ready</span>
              </span>
            )
            return <li key={m.id}>{to ? <Link to={to} className="block table-row-hover">{row}</Link> : row}</li>
          })}
        </ul>
      )}
    </div>
  )
}

function groupBy(rows, key) {
  const out = {}
  for (const r of rows) { const k = r[key]; if (!out[k]) out[k] = []; out[k].push(r) }
  return out
}
