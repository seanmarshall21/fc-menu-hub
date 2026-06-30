import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { effectiveRoster, gateStatus } from '@/lib/roster'

// Loads every menu across all events once and computes per-department work
// lists for the My Tasks view. Each entry is a menu with a deep link + labels.
export function useMyTasks() {
  const [loading, setLoading] = useState(true)
  const [lists, setLists] = useState(empty())

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: menus } = await supabase
        .from('menus')
        .select('id,name,slug,phase,requires_sponsor_approval,sponsors_updated_at,sponsors_checked_at,last_synced_at,updated_at,event_id,events(name,slug,series_id,series(slug,brand:brands(slug,name)))')
      const all = (menus || []).filter(m => m.phase !== 'archived')
      if (!all.length) { if (alive) { setLists(empty()); setLoading(false) }; return }

      const ids = all.map(m => m.id)
      const eventIds = [...new Set(all.map(m => m.event_id).filter(Boolean))]
      const seriesIds = [...new Set(all.map(m => m.events?.series_id).filter(Boolean))]
      const [ms, so, er, sr] = await Promise.all([
        supabase.from('menu_sponsors').select('menu_id').in('menu_id', ids),
        supabase.from('menu_signoffs').select('menu_id, role, user_id').in('menu_id', ids).eq('role', 'sponsorship'),
        eventIds.length ? supabase.from('event_approval_roles').select('*').in('event_id', eventIds).eq('role', 'sponsorship') : { data: [] },
        seriesIds.length ? supabase.from('series_approval_roles').select('*').in('series_id', seriesIds).eq('role', 'sponsorship') : { data: [] },
      ])
      if (!alive) return
      const sponsorCount = new Map()
      for (const r of (ms.data || [])) sponsorCount.set(r.menu_id, (sponsorCount.get(r.menu_id) || 0) + 1)
      const evBy = groupBy(er.data || [], 'event_id')
      const serBy = groupBy(sr.data || [], 'series_id')
      const soBy = groupBy(so.data || [], 'menu_id')

      const out = empty()
      for (const m of all) {
        const eff = effectiveRoster(evBy[m.event_id] || [], serBy[m.events?.series_id] || [], 'sponsorship')
        const g = gateStatus(eff.rows, soBy[m.id] || [], 'sponsorship', eff.mode)
        const flagged = !!m.requires_sponsor_approval
        const hasSponsors = (sponsorCount.get(m.id) || 0) > 0
        const needsCheck = !!m.sponsors_updated_at && (!m.sponsors_checked_at || new Date(m.sponsors_updated_at) > new Date(m.sponsors_checked_at))
        const sponsorsResolved = !flagged || !g.hasRoster || g.complete
        const preApproval = ['build', 'proof', 'edits'].includes(m.phase)
        const syncStale = !m.last_synced_at || (m.updated_at && new Date(m.updated_at) > new Date(m.last_synced_at))
        const row = { id: m.id, name: m.name, to: link(m), event: `${m.events?.series?.brand?.name || ''} · ${m.events?.name || m.events?.slug || ''}` }

        // Sponsorship
        if (flagged && !hasSponsors) out.sponsorship.attach.push(row)
        if (flagged && hasSponsors && needsCheck) out.sponsorship.verify.push(row)
        // Food & Beverage
        if (preApproval) out.food_bev.notApproved.push(row)
        if (preApproval && sponsorsResolved && !needsCheck) out.food_bev.readyToApprove.push(row)
        if (m.phase === 'approved') out.food_bev.approved.push(row)
        if (m.phase === 'exported') out.food_bev.exported.push(row)
        if (m.phase === 'complete') out.food_bev.complete.push(row)
        // Design. Approved + Figma current → ready to export. Approved but the
        // Figma doesn't match the approved content yet → sync that version first.
        const everSyncedM = !!m.last_synced_at
        const figmaCurrent = everSyncedM && !syncStale
        if (m.phase === 'approved' && sponsorsResolved && figmaCurrent) out.design.readyToExport.push(row)
        if (m.phase === 'approved' && sponsorsResolved && !figmaCurrent) out.design.needsSync.push(row)
        if (preApproval && everSyncedM && syncStale) out.design.needsSync.push(row)
        if (m.phase === 'exported') out.design.exported.push(row)
      }
      setLists(out); setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  return { loading, lists }
}

function empty() {
  return {
    sponsorship: { attach: [], verify: [] },
    food_bev: { notApproved: [], readyToApprove: [], approved: [], exported: [], complete: [] },
    design: { readyToExport: [], needsSync: [], exported: [] },
  }
}
function link(m) {
  const bs = m.events?.series?.brand?.slug, ss = m.events?.series?.slug, es = m.events?.slug
  return bs && ss && es ? `/brands/${bs}/series/${ss}/events/${es}/menus/${m.slug}` : null
}
function groupBy(rows, key) {
  const out = {}
  for (const r of rows) { const k = r[key]; if (!out[k]) out[k] = []; out[k].push(r) }
  return out
}
