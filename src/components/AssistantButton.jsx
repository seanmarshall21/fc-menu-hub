import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { effectiveRoster, gateStatus } from '@/lib/roster'

// Full reference checklist — the entire process, shown under "View full
// checklist" regardless of live state. Check-off persists per user.
const FULL_CHECKLIST = [
  { group: 'Proofing', items: [
    'Run the AI review on each menu and read it over.',
    'Sign off proofing on each menu (Approvals tab) — that moves it to Approved.',
    'Re-review anything that dropped back to Edits.',
  ] },
  { group: 'Sponsorship', items: [
    'Go through all menus and flag the ones that need sponsors.',
    'Add sponsors to each flagged menu (multi-select, set 1–3 lines).',
    'Upload an SVG for any sponsor showing ⚠ (no logo).',
    'Mark each menu checked once its sponsors are right.',
  ] },
  { group: 'Creative / Print', items: [
    'Sync ready menus to Figma (Menu Sync — auto-fits spacing + recommends size).',
    'Adjust the layout in Figma if needed.',
    'Pull edits from Figma back into the app if you changed text on the canvas.',
    'Refresh the preview image so the app matches Figma.',
    'Run the Visual check on the preview.',
    'Set the menu to Exported and paste the Dropbox print-file link.',
    'Add the event’s print-files folder link.',
    'Lock the menu + mark it Done in the plugin.',
  ] },
]

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
  const [showAll, setShowAll] = useState(false)
  const ckKey = `assistantChecked:${uid || 'anon'}`
  const [checked, setChecked] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`assistantChecked:${uid || 'anon'}`) || '{}') } catch { return {} }
  })
  function toggleCheck(key) {
    setChecked(prev => { const next = { ...prev, [key]: !prev[key] }; localStorage.setItem(ckKey, JSON.stringify(next)); return next })
  }

  // Load the event list once the panel opens.
  useEffect(() => {
    if (!open || events.length) return
    ;(async () => {
      const { data: evs } = await supabase
        .from('events')
        .select('id, name, slug, print_folder_url, series(id, slug, name, brand:brands(slug, name))')
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
        supabase.from('menus').select('id, name, slug, phase, requires_sponsor_approval, sponsors_updated_at, sponsors_checked_at, print_file_url, last_synced_at, updated_at').eq('event_id', eventId),
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

      // Creative / print pipeline. "Ready" = approved + sponsors resolved.
      const sponsorRoster = effectiveRoster(eventRoles, seriesRoles, 'sponsorship').rows
      const sponsorsResolved = (m) => {
        if (!m.requires_sponsor_approval) return true
        const g = gateStatus(sponsorRoster, signoffs.filter(s => s.menu_id === m.id), 'sponsorship')
        return !g.hasRoster || g.complete
      }
      const ready = menus.filter(m => m.phase === 'approved' && sponsorsResolved(m))
      const readyUnsynced = ready.filter(m => !m.last_synced_at || (m.updated_at && new Date(m.updated_at) > new Date(m.last_synced_at)))
      if (ready.length) out.push({ msg: `${ready.length} menu${ready.length === 1 ? '' : 's'} ready for print prep — build/sync in Figma${readyUnsynced.length ? ` (${readyUnsynced.length} need a sync)` : ''}.`, to: path && `${path}?tab=menus` })

      const exportedNoLink = menus.filter(m => m.phase === 'exported' && !m.print_file_url)
      if (exportedNoLink.length) out.push({ msg: `${exportedNoLink.length} exported menu${exportedNoLink.length === 1 ? '' : 's'} missing a Dropbox print-file link.`, to: path && `${path}?tab=menus` })

      const anyExported = menus.some(m => m.phase === 'exported' || m.phase === 'complete')
      if (anyExported && !ev?.print_folder_url) out.push({ msg: `Add this event’s print-files folder link (Edit Event).`, to: path })
    }
    return out
  }, [data, uid, isInternal, isAdmin])

  function go(to) { if (to) { setOpen(false); navigate(to) } }

  // ── Voice: push-to-talk (Web Speech API) + spoken replies ────────────────
  const recRef = useRef(null)
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState('')
  const [reply, setReply] = useState('')
  const [pendingTo, setPendingTo] = useState(null)
  const voiceSupported = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

  const audioRef = useRef(null)
  function speakBrowser(text) {
    try { window.speechSynthesis?.cancel(); window.speechSynthesis?.speak(new SpeechSynthesisUtterance(text)) } catch (_) {}
  }
  async function speak(text) {
    // Prefer the server TTS (Google / cloned voice); fall back to the browser
    // voice if it's not configured or errors.
    try {
      const { data, error } = await supabase.functions.invoke('tts', { body: { text } })
      if (!error && data?.audio) {
        try { audioRef.current?.pause() } catch (_) {}
        const a = new Audio('data:audio/mp3;base64,' + data.audio)
        audioRef.current = a
        await a.play()
        return
      }
    } catch (_) { /* fall through */ }
    speakBrowser(text)
  }
  function say(text, to) { setReply(text); setPendingTo(to || null); speak(text) }

  function handleVoice(raw) {
    const t = (raw || '').toLowerCase().trim()
    if (!t) return
    // Affirmative → act on the last offered destination.
    if (/(^|\b)(yes|yeah|yep|sure|ok|okay|do it|take me|go there|let'?s go|next|start|get started|continue)\b/.test(t) && pendingTo) {
      say('Taking you there.'); const dest = pendingTo; setPendingTo(null); setTimeout(() => go(dest), 600); return
    }
    if (/(^|\b)(no|nope|not now|cancel|stop)\b/.test(t)) { say('Okay — standing by.'); return }
    // "what do I need / have left / to review / to do"
    if (/(what|anything|something).*(do|left|review|to-?do|remaining|next|pending|outstanding)|(need|have).*(do|left|review)/.test(t)) {
      if (!eventId) { say('Pick an event first, then ask me again.'); return }
      if (!tasks.length) { say('You’re all clear on this event — nothing waiting on you.'); return }
      const list = tasks.map(x => x.msg).join(' ')
      const first = tasks.find(x => x.to)
      const tail = first ? ' Want me to take you to the first one?' : ''
      say(`You have ${tasks.length} ${tasks.length === 1 ? 'thing' : 'things'} left. ${list}${tail}`, first?.to)
      return
    }
    say('Try “what do I still have to do?”, then say “yes” and I’ll take you there.')
  }

  function startListening() {
    if (!voiceSupported || listening) return
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR()
    rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1
    rec.onresult = (e) => { const txt = e?.results?.[0]?.[0]?.transcript || ''; setHeard(txt); handleVoice(txt) }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    recRef.current = rec
    setHeard(''); setListening(true)
    try { rec.start() } catch (_) { setListening(false) }
  }
  function stopListening() { try { recRef.current?.stop() } catch (_) {} }
  function toggleListening() { if (listening) stopListening(); else startListening() }

  return createPortal(
    <>
      {open && (
        <>
          <div className="fixed inset-0 z-[94] bg-black/30" onClick={() => setOpen(false)} />
          <div className="fixed z-[95] inset-x-0 bottom-0 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[390px] h-[88vh] sm:h-[660px] sm:max-h-[88vh] bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 text-white flex items-center justify-between shrink-0" style={{ background: 'linear-gradient(145deg, #4a4a4a 0%, #1c1c1c 42%, #000 60%, #2e2e2e 100%)' }}>
              <span className="text-sm font-semibold"><span style={{ color: '#FFB020' }}>✦</span> Quick check</span>
              <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white text-lg leading-none">✕</button>
            </div>

            {/* Body (scrolls) */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              <div className="bg-surface-100 text-ink-700 text-sm rounded-2xl rounded-tl-sm px-3 py-2 inline-block max-w-[90%]">
                Hi! Pick an event and I’ll show what still needs doing — or just ask me out loud.
              </div>

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
                <p className="text-xs text-ink-400">I’ll base this on your role and what’s assigned to you.</p>
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

              <div className="pt-1">
                <button onClick={() => setShowAll(s => !s)} className="text-xs text-brand-600 hover:text-brand-800 font-medium">
                  {showAll ? '▾ Hide full checklist' : '▸ View full checklist'}
                </button>
                {showAll && (
                  <div className="mt-2 space-y-3">
                    {FULL_CHECKLIST.map(grp => (
                      <div key={grp.group}>
                        <div className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide mb-1">{grp.group}</div>
                        <ul className="space-y-1">
                          {grp.items.map((it, i) => {
                            const k = `${grp.group}:${i}`
                            return (
                              <li key={i} className="flex items-start gap-2 text-xs">
                                <input type="checkbox" checked={!!checked[k]} onChange={() => toggleCheck(k)} className="mt-0.5" />
                                <span className={checked[k] ? 'text-ink-400 line-through' : 'text-ink-700'}>{it}</span>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer — voice */}
            <div className="shrink-0 border-t border-surface-100 px-4 py-4">
              {(heard || reply) && (
                <div className="mb-3 text-xs space-y-1">
                  {heard && <div className="text-ink-400">“{heard}”</div>}
                  {reply && <div className="text-ink-800">{reply}{pendingTo && <button onClick={() => { const d = pendingTo; setPendingTo(null); go(d) }} className="text-brand-600 hover:underline ml-1">→ go</button>}</div>}
                </div>
              )}
              {voiceSupported ? (
                <div className="flex flex-col items-center gap-2">
                  <button onClick={toggleListening} title="Tap to talk"
                    className={`w-16 h-16 rounded-full flex items-center justify-center shadow-md text-white transition ${listening ? 'bg-red-500 animate-pulse' : ''}`}
                    style={listening ? {} : { background: 'linear-gradient(135deg, #FFD54F 0%, #FFB300 50%, #FB8C00 100%)' }}>
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 013 3v7a3 3 0 01-6 0V4a3 3 0 013-3zM19 10a7 7 0 01-14 0M12 17v4" /></svg>
                  </button>
                  <span className="text-xs text-ink-400 text-center">{listening ? 'Listening… tap to stop' : 'Tap to talk — “what’s left to do?”'}</span>
                </div>
              ) : (
                <p className="text-xs text-ink-400 text-center">Voice needs Chrome or Edge.</p>
              )}
            </div>
          </div>
        </>
      )}
      <button onClick={() => setOpen(o => !o)} title="Quick check"
        className="fixed bottom-28 sm:bottom-4 right-4 z-[95] w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-xl ring-1 ring-white/10"
        style={{ background: 'linear-gradient(145deg, #4a4a4a 0%, #1c1c1c 42%, #000 60%, #2e2e2e 100%)' }}>
        <span style={{ color: '#FFB020' }}>✦</span>
      </button>
    </>,
    document.body
  )
}
