import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ROLES, effectiveRoster, gateStatus } from '@/lib/roster'

// Loads the effective approval roster (event override → series default) for a
// menu's event, plus that menu's sign-offs, and returns per-role gate status.
// Shared by the menu header (summary + gating) and the sign-off panel.
export function useMenuGates(menuId, eventId, seriesId) {
  const [eventRows, setEventRows] = useState([])
  const [seriesRows, setSeriesRows] = useState([])
  const [signoffs, setSignoffs] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!menuId) return
    const [ev, ser, so, u] = await Promise.all([
      eventId ? supabase.from('event_approval_roles').select('*').eq('event_id', eventId) : Promise.resolve({ data: [] }),
      seriesId ? supabase.from('series_approval_roles').select('*').eq('series_id', seriesId) : Promise.resolve({ data: [] }),
      supabase.from('menu_signoffs').select('*').eq('menu_id', menuId),
      supabase.rpc('list_taggable_users'),
    ])
    setEventRows(ev.data || [])
    setSeriesRows(ser.data || [])
    setSignoffs(so.data || [])
    setUsers(u.data || [])
    setLoading(false)
  }, [menuId, eventId, seriesId])

  useEffect(() => { reload() }, [reload])

  const byRole = {}
  for (const r of ROLES) {
    const eff = effectiveRoster(eventRows, seriesRows, r.key)
    byRole[r.key] = {
      roster: eff.rows,
      inherited: eff.inherited,
      mode: eff.mode,
      gate: gateStatus(eff.rows, signoffs, r.key, eff.mode),
    }
  }
  return { loading, byRole, signoffs, users, reload }
}
