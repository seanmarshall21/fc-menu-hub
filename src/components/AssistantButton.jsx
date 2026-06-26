import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { effectiveRoster } from '@/lib/roster'

// Opt-in "AI sister" — a floating ✦ that, for a chosen event, shows YOUR
// outstanding tasks computed from live data + your roster roles. Tasks resolve
// themselves as work gets done, so it always reflects what still needs doing.
export default function AssistantButton() {
  const { profile, isAdmin, isInternal } = useAuth()
  const uid = profile?.id
  const navigate = useNavigate()
  const location = useLocation()

  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState([])
  const [eventId, setEventId] = useState(() => localStorage.getItem('assistantEvent') || '')
  const [data, setData] = useState(null)   // { menus, links, signoffs, eventRoles, seriesRoles, ev }
  const [loading, setLoading] = useState(false)

  // Load the event list once the panel opens.
  useEffect(() => {
    if (!open || events.length) return
    ;(async () => {
      const { data: evs } = await supabase
        .from('events')
        .select('id, name, slug, series(id, slug, name, brand:brands(slug, name))')
        .order('event_date', { ascending: false })
      setEvents(evs || [])
      // Infer from the current URL if we're on an event/menu page.
      const m = location.pathname.match(/events\/([^/]+)/)
      if (m && !eventId) {
        const match = (evs || []).find(e => e.slug === m[1])
        if (match) { setEventId(match.id); localStorage.setItem('assistantEvent', match.id) }
      }
    })()
  }, [open]) // eslint-disable-line

  // Load the selected event's state.
  useEffect(() => {
    if (!open || !eventId) { setData(null); return }
    let alive = true
    setLoading(true)
    ;(async () => {
      const ev = events.find(e => e.id === eventId)
      const seriesId = ev?.series?.id || null
      const [m, er, sr] = await Promise.all([
        supabase.from('menus').select('id, name, slug, phase, requires_sponsor_approval, sponsors_updated_at, sponsors_checked_at, print_file_url').eq('event_id', eventId),
        supabase.from('event_approval_roles').select('*').eq('event_id', eventId),
        seriesId ? supabase.from('series_approval_roles').select('*').eq('series_id', seriesId) : Promise.resolve({ data: [] }),
      ])
      const menus = m.data || []
      const ids = menus.map(x => x.id)
      const [ms, so] = await Promise.all([
        ids.length ? supabase.from('menu_sponsors').select('menu_id').in('menu_id', ids) : Promise.resolve({ data: [] }),
        ids.length ? supabase.from('menu_signoffs').select('menu_id, role, user_id').in('menu_id', ids) : Promise.resolve({ data: [] }),
      ])
      if (!alive) return
      const sponsorCount = new Map()
      for (const r of (ms.data || [])) sponsorCount.set(r.menu_id, (sponsorCount.get(r.menu_id) || 0) + 1)
      setData({ ev, menus, sponsorCount, signoffs: so.data || [], eventRoles: er.data || [], seriesRoles: sr.data || [] })
      setLoading(false)
    })()
    return () => { alive = false }
  }, [open, eventId, events])

  const tasks = useMemo(() => {
    if (!data) return []
    const { ev, menus, sponsorCount, signoffs, eventRoles, seriesRoles } = data
    const path = ev?.series?.brand ? `/brands/${ev.series.brand.slug}/series/${ev.series.slug}/events/${ev.slug}` : null
    const proofRoster = effectiveRoster(eventRoles, seriesRoles, 'proofing').rows
    const amProofer = proofRoster.some(r => r.user_id === uid)
    const out = []

    // Proofing sign-off (only if I'm a required proofer)
    if (amProofer) {
      const need = menus.filter(m => ['build', 'proof', 'edits'].includes(m.phase) &&
        !signoffs.some(s => s.menu_id === m.id && s.role === 'proofing' && s.user_id === uid))
      if (need.length) out.push({ msg: `Sign off proofing on ${need.length} menu${need.length === 1 ? '' : 's'} (run the AI review, then sign).`, to: path && `${path}?tab=menus` })
    }
    // Sponsorship (team-wide for internal/admin, or sponsorship roster members)
    const amSponsor = effectiveRoster(eventRoles, seriesRoles, 'sponsorship').rows.some(r => r.user_id === uid)
    if (amSponsor || isInternal || isAdmin) {
      const flagged = menus.filter(m => m.requires_sponsor_approval)
      const noSponsors = flagged.filter(m => !(sponsorCount.get(m.id) > 0))
      const unchecked = flagged.filter(m => m.sponsors_updated_at && (!m.sponsors_checked_at || new Date(m.sponsors_updated_at) > new Date(m.sponsors_checked_at)))
      if (noSponsors.length) out.push({ msg: `${noSponsors.length} flagged menu${noSponsors.length === 1 ? '' : 's'} still need sponsors added.`, to: path && `${path}?tab=sponsors` })
      if (unchecked.length) out.push({ msg: `${unchecked.length} menu${unchecked.length === 1 ? '' : 's'} have sponsor changes not checked off.`, to: path && `${path}?tab=sponsors` })
    }
    // Team-wide (internal/admin)
    if (isInternal || isAdmin) {
      const edits = menus.filter(m => m.phase === 'edits')
      if (edits.length) out.push({ msg: `${edits.length} menu${edits.length === 1 ? '' : 's'} in Edits — need another review.`, to: path && `${path}?tab=menus` })
      const exportedNoLink = menus.filter(m => m.phase === 'exported' && !m.print_file_url)
      if (exportedNoLink.length) out.push({ msg: `${exportedNoLink.length} exported menu${exportedNoLink.length === 1 ? '' : 's'} missing a print-file link.`, to: path && `${path}?tab=menus` })
    }
    return out
  }, [data, uid, isInternal, isAdmin])

  function go(to) { if (to) { setOpen(false); navigate(to) } }

  return createPortal(
    <>
      {open && (
        <div className="fixed bottom-36 sm:bottom-20 right-4 z-[95] w-[340px] max-w-[calc(100vw-2rem)] bg-white border border-surface-200 rounded-xl shadow-2xl overflow-hidden">
          <div className="px-4 py-3 bg-brand-600 text-white flex items-center justify-between">
            <span className="text-sm font-semibold">✦ Quick check</span>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white">✕</button>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="text-[11px] font-semibold text-ink-400 uppercase tracking-wide">Working on</label>
              <select value={eventId} onChange={e => { setEventId(e.target.value); localStorage.setItem('assistantEvent', e.target.value) }}
                className="input py-1.5 text-sm w-full mt-1">
                <option value="">Pick an event…</option>
                {events.map(e => (
                  <option key={e.id} value={e.id}>{e.series?.brand?.name ? `${e.series.brand.name} · ` : ''}{e.name}</option>
                ))}
              </select>
            </div>

            {!eventId ? (
              <p className="text-xs text-ink-400">Pick an event and I’ll show what still needs doing — based on your role and what’s assigned to you.</p>
            ) : loading ? (
              <p className="text-xs text-ink-400">Checking…</p>
            ) : tasks.length === 0 ? (
              <p className="text-sm text-emerald-700">✓ You’re all clear on this event — nothing waiting on you.</p>
            ) : (
              <ul className="space-y-2">
                {tasks.map((t, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />
                    <span className="text-ink-700">
                      {t.msg}{' '}
                      {t.to && <button onClick={() => go(t.to)} className="text-brand-600 hover:underline whitespace-nowrap">→ go</button>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-ink-400">Shows your outstanding tasks for this event; updates as work gets done.</p>
          </div>
        </div>
      )}
      <button onClick={() => setOpen(o => !o)} title="Quick check"
        className="fixed bottom-20 sm:bottom-4 right-4 z-[95] w-12 h-12 rounded-full bg-brand-600 hover:bg-brand-700 text-white shadow-lg flex items-center justify-center text-xl">
        ✦
      </button>
    </>,
    document.body
  )
}
