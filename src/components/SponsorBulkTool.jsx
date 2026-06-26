import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Bulk sponsor assignment for the sponsorship team. List the event's menus,
// flag which need sponsors, then add sponsors to each via a multi-select —
// without leaving the page — set how many lines the sponsor row may wrap to,
// and check it off when done. Operates on menu_sponsors (per-menu) using the
// event's sponsor pool (event_sponsors).
//
// Props: event, canEdit, onChange
export default function SponsorBulkTool({ event, canEdit, onChange }) {
  const [menus, setMenus] = useState([])
  const [pool, setPool] = useState([])          // active event_sponsors
  const [links, setLinks] = useState([])         // menu_sponsors rows
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')    // 'all' | 'flagged'
  const [openId, setOpenId] = useState(null)
  const [busy, setBusy] = useState(null)
  const [expanded, setExpanded] = useState(false) // section accordion (default closed)

  const load = useCallback(async () => {
    setLoading(true)
    const [m, es] = await Promise.all([
      supabase.from('menus').select('id, name, category, requires_sponsor_approval, sponsor_max_lines, sponsors_updated_at, sponsors_checked_at').eq('event_id', event.id).order('category').order('name'),
      supabase.from('event_sponsors').select('id, name, slug, logo_url').eq('event_id', event.id).eq('active', true).order('sort_order'),
    ])
    const menuRows = m.data || []
    setMenus(menuRows); setPool(es.data || [])
    const ids = menuRows.map(r => r.id)
    const ms = ids.length ? await supabase.from('menu_sponsors').select('id, menu_id, event_sponsor_id').in('menu_id', ids) : { data: [] }
    setLinks(ms.data || [])
    setLoading(false)
  }, [event.id])

  useEffect(() => { load() }, [load])

  const linksByMenu = useMemo(() => {
    const by = new Map()
    for (const l of links) { if (!by.has(l.menu_id)) by.set(l.menu_id, new Map()); by.get(l.menu_id).set(l.event_sponsor_id, l) }
    return by
  }, [links])

  const checkedNeedsRefresh = (m) => !!m.sponsors_updated_at && (!m.sponsors_checked_at || new Date(m.sponsors_updated_at) > new Date(m.sponsors_checked_at))

  async function toggleFlag(m) {
    setBusy(m.id)
    try {
      await supabase.from('menus').update({ requires_sponsor_approval: !m.requires_sponsor_approval }).eq('id', m.id)
      await load(); onChange?.()
    } finally { setBusy(null) }
  }
  async function toggleSponsor(menu, sponsor) {
    const existing = linksByMenu.get(menu.id)?.get(sponsor.id)
    setBusy(menu.id + sponsor.id)
    try {
      if (existing) {
        await supabase.from('menu_sponsors').delete().eq('id', existing.id)
      } else {
        const count = linksByMenu.get(menu.id)?.size || 0
        await supabase.from('menu_sponsors').insert({ menu_id: menu.id, event_sponsor_id: sponsor.id, sort_order: count })
      }
      await load(); onChange?.()
    } finally { setBusy(null) }
  }
  async function setLines(menu, n) {
    await supabase.from('menus').update({ sponsor_max_lines: n }).eq('id', menu.id); load()
  }
  async function markChecked(menu) {
    await supabase.from('menus').update({ sponsors_checked_at: new Date().toISOString() }).eq('id', menu.id)
    load(); onChange?.()
  }

  const shown = filter === 'flagged' ? menus.filter(m => m.requires_sponsor_approval) : menus
  const flaggedCount = menus.filter(m => m.requires_sponsor_approval).length

  return (
    <section className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-100 flex items-center justify-between gap-3 flex-wrap">
        <button type="button" onClick={() => setExpanded(e => !e)} className="flex items-start gap-2 text-left min-w-0">
          <svg className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          <span>
            <h3 className="text-sm font-semibold text-ink-900">Add sponsors to menus</h3>
            <p className="text-xs text-ink-400 mt-0.5">Flag the menus that need sponsors, then add them inline. {flaggedCount} flagged.</p>
          </span>
        </button>
        {expanded && (
          <div className="flex rounded-lg border border-surface-200 overflow-hidden text-xs">
            {['all', 'flagged'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 ${filter === f ? 'bg-brand-50 text-brand-700 font-medium' : 'text-ink-500 hover:bg-surface-50'}`}>
                {f === 'all' ? 'All menus' : 'Needs sponsors'}
              </button>
            ))}
          </div>
        )}
      </div>

      {expanded && loading && <div className="px-4 py-6 text-sm text-ink-400">Loading menus…</div>}

      {expanded && !loading && pool.length === 0 && (
        <div className="px-4 py-3 text-xs text-amber-700 bg-amber-50">No sponsors in this event's pool yet — toggle some on in the section above first.</div>
      )}

      {expanded && !loading && (
      <ul className="divide-y divide-surface-100">
        {shown.map(m => {
          const sel = linksByMenu.get(m.id) || new Map()
          const open = openId === m.id
          const needsCheck = checkedNeedsRefresh(m)
          return (
            <li key={m.id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                {canEdit && (
                  <button onClick={() => toggleFlag(m)} disabled={busy === m.id}
                    className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap flex-shrink-0 ${m.requires_sponsor_approval ? 'bg-red-50 text-red-700 border-red-200' : 'bg-surface-50 text-ink-400 border-surface-200'}`}
                    title={m.requires_sponsor_approval ? 'Flagged as needing sponsors — click to clear' : 'Flag as needing sponsors'}>
                    {m.requires_sponsor_approval ? '⚑ Needs sponsors' : 'Flag'}
                  </button>
                )}
                <span className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-ink-900">{m.name}</span>
                  <span className="text-[11px] text-ink-400 ml-2">{sel.size} sponsor{sel.size === 1 ? '' : 's'}</span>
                  {needsCheck && <span className="text-[10px] text-amber-700 ml-2">· changed, not checked</span>}
                </span>
                {canEdit && (
                  <button onClick={() => setOpenId(open ? null : m.id)} className="btn-secondary btn-sm whitespace-nowrap flex-shrink-0">
                    {open ? 'Done' : 'Edit sponsors'}
                  </button>
                )}
              </div>

              {open && canEdit && (
                <div className="mt-3 pl-1 space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {pool.map(s => {
                      const on = sel.has(s.id)
                      return (
                        <button key={s.id} onClick={() => toggleSponsor(m, s)} disabled={busy === m.id + s.id}
                          className={`text-xs px-2.5 py-1 rounded-full border ${on ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-white text-ink-500 border-surface-200 hover:border-brand-300'}`}>
                          {on ? '✓ ' : ''}{s.name}{!s.logo_url ? ' ⚠' : ''}
                        </button>
                      )
                    })}
                  </div>
                  {[...sel.keys()].some(id => { const s = pool.find(p => p.id === id); return s && !s.logo_url }) && (
                    <p className="text-[11px] text-amber-700">⚠ = no logo uploaded yet. Add the SVG on the Series → Sponsors tab.</p>
                  )}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-ink-500">Sponsor rows:</span>
                    {[1, 2, 3].map(n => (
                      <button key={n} onClick={() => setLines(m, n)}
                        className={`w-7 h-7 rounded ${m.sponsor_max_lines === n ? 'bg-brand-600 text-white' : 'bg-surface-100 text-ink-600 hover:bg-surface-200'}`}>
                        {n}
                      </button>
                    ))}
                    <span className="text-[11px] text-ink-400">line{m.sponsor_max_lines === 1 ? '' : 's'} (evenly spaced)</span>
                    <button onClick={() => markChecked(m)} className="btn-primary btn-sm ml-auto whitespace-nowrap">✓ Mark checked</button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      )}
    </section>
  )
}
