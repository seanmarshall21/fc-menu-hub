import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { menuReadiness } from '@/lib/readiness'

// Loads every approved menu and computes which are "ready for print prep"
// (sponsors resolved) vs still awaiting sponsors. Shared by the dashboard
// widget (top 3) and the full Ready-for-print page.
export function useReadyMenus() {
  const [ready, setReady] = useState([])
  const [awaiting, setAwaiting] = useState(0)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: menus } = await supabase
        .from('menus')
        .select('id,name,slug,size,phase,requires_sponsor_approval,event_id,events(name,slug,series_id,series(name,slug,brand:brands(slug,name)))')
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

  return { ready, awaiting, loaded }
}

export function readyMenuLink(m) {
  const bs = m.events?.series?.brand?.slug, ss = m.events?.series?.slug, es = m.events?.slug
  return bs && ss && es ? `/brands/${bs}/series/${ss}/events/${es}/menus/${m.slug}` : null
}

function groupBy(rows, key) {
  const out = {}
  for (const r of rows) { const k = r[key]; if (!out[k]) out[k] = []; out[k].push(r) }
  return out
}
