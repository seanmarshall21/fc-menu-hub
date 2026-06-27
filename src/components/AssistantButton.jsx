import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { effectiveRoster, gateStatus } from '@/lib/roster'
import { loadAssistantSettings, speakWith } from '@/lib/assistantVoice'

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

// A tiny silent WAV used to "unlock" audio on iOS: Safari only allows .play()
// that originates from a user gesture, so we play this on the first tap and
// reuse the same element for the (async) TTS replies.
function makeSilentWav() {
  const sr = 8000, n = Math.floor(sr * 0.05), buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf)
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ')
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true)
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true)
  w(36, 'data'); dv.setUint32(40, n * 2, true)
  let bin = ''; const u8 = new Uint8Array(buf); for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i])
  return 'data:audio/wav;base64,' + btoa(bin)
}
const SILENT_WAV = typeof window !== 'undefined' ? makeSilentWav() : ''

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

  // ── Chat (text + record→server STT) + spoken replies ─────────────────────
  const [messages, setMessages] = useState([])   // {role:'user'|'assistant', text, to?}
  const [input, setInput] = useState('')
  const [recording, setRecording] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [pendingTo, setPendingTo] = useState(null)
  const [tasksOpen, setTasksOpen] = useState(true)
  const mrRef = useRef(null)
  const chunksRef = useRef([])
  const scrollRef = useRef(null)
  const audioRef = useRef(null)
  const primedRef = useRef(false)
  const vadRef = useRef(null)
  const [settings, setSettings] = useState(() => loadAssistantSettings(uid))
  useEffect(() => { if (open) setSettings(loadAssistantSettings(uid)) }, [open]) // eslint-disable-line
  const canRecord = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && settings.inputMode !== 'text'

  function getAudioEl() {
    if (!audioRef.current) { const a = new Audio(); a.setAttribute('playsinline', ''); audioRef.current = a }
    return audioRef.current
  }
  // Call inside a user gesture (tapping mic / send) so iOS lets us play TTS later.
  function primeAudio() {
    if (primedRef.current) return
    const a = getAudioEl()
    a.src = SILENT_WAV
    a.play().then(() => { primedRef.current = true }).catch(() => {})
  }

  // Seed a greeting + keep the chat scrolled to the newest message.
  useEffect(() => {
    if (open && messages.length === 0) setMessages([{ role: 'assistant', text: 'Hi! Ask me what’s left to do, or pick an event above and I’ll show you. Talk or type — whatever’s easier.' }])
  }, [open]) // eslint-disable-line
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, thinking])

  async function speak(text) { await speakWith(text, settings.voice, getAudioEl()) }
  function reply(text, to) { setMessages(m => [...m, { role: 'assistant', text, to: to || null }]); setPendingTo(to || null); speak(text) }

  // Compact, factual snapshot of the selected event for the assistant brain.
  function buildContext() {
    if (!data) return { event: null }
    const { ev, menus, sponsorCount, signoffs, eventRoles, seriesRoles } = data
    const sponsorRoster = effectiveRoster(eventRoles, seriesRoles, 'sponsorship').rows
    const sponsorsResolved = (m) => {
      if (!m.requires_sponsor_approval) return true
      const g = gateStatus(sponsorRoster, signoffs.filter(s => s.menu_id === m.id), 'sponsorship')
      return !g.hasRoster || g.complete
    }
    const byPhase = {}; for (const m of menus) byPhase[m.phase] = (byPhase[m.phase] || 0) + 1
    const flagged = menus.filter(m => m.requires_sponsor_approval)
    const ready = menus.filter(m => m.phase === 'approved' && sponsorsResolved(m))
    return {
      event: ev?.name || null,
      totalMenus: menus.length,
      byPhase,
      flaggedForSponsors: flagged.length,
      flaggedStillNeedingSponsorsAdded: flagged.filter(m => !(sponsorCount.get(m.id) > 0)).length,
      sponsorChangesNotCheckedOff: flagged.filter(m => m.sponsors_updated_at && (!m.sponsors_checked_at || new Date(m.sponsors_updated_at) > new Date(m.sponsors_checked_at))).length,
      readyForPrintPrep: ready.length,
      readyButNeedFigmaSync: ready.filter(m => !m.last_synced_at || (m.updated_at && new Date(m.updated_at) > new Date(m.last_synced_at))).length,
      inEdits: byPhase['edits'] || 0,
      exportedMissingPrintLink: menus.filter(m => m.phase === 'exported' && !m.print_file_url).length,
      yourTasks: tasks.map(t => ({ label: t.msg, route: t.to || null })),
    }
  }

  const AFFIRM = /^(yes|yeah|yep|yup|sure|ok|okay|do it|take me( there)?|go( there)?|let'?s go|next|start|get started|continue|please( do)?)[.! ]*$/i
  async function respondTo(raw) {
    const t = (raw || '').trim()
    if (!t) return
    // Short affirmation → act on the last offered destination (no round-trip).
    if (AFFIRM.test(t) && pendingTo) {
      const dest = pendingTo; setPendingTo(null); reply('Taking you there.'); setTimeout(() => go(dest), 700); return
    }
    if (!eventId) { reply('Pick an event up top first — I answer based on the event you’re working on.'); return }
    setThinking(true)
    try {
      const history = messages.slice(-6).map(m => ({ role: m.role, text: m.text }))
      const { data: res, error } = await supabase.functions.invoke('assistant-chat', { body: { question: t, context: buildContext(), history } })
      setThinking(false)
      if (error || !res?.text) { reply('Hmm — I couldn’t work that out. Ask me what’s left, about sponsors, edits, or what’s ready for print.'); return }
      reply(res.text, res.navigate || null)
    } catch (_) { setThinking(false); reply('Something glitched — try that again in a sec.') }
  }

  function submit(text) {
    const t = (text || '').trim()
    if (!t) return
    primeAudio()
    setMessages(m => [...m, { role: 'user', text: t }])
    setInput('')
    setTimeout(() => respondTo(t), 60)
  }

  function blobToBase64(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader()
      r.onloadend = () => res(String(r.result).split(',')[1] || '')
      r.onerror = rej
      r.readAsDataURL(blob)
    })
  }
  async function startRecording() {
    if (!canRecord || recording) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stopVad()
        stream.getTracks().forEach(t => t.stop())
        setRecording(false); setThinking(true)
        try {
          const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
          const b64 = await blobToBase64(blob)
          const { data, error } = await supabase.functions.invoke('stt', { body: { audio: b64, mime: mr.mimeType || 'audio/webm' } })
          setThinking(false)
          if (error || !data?.text) { setMessages(m => [...m, { role: 'assistant', text: 'I didn’t catch that — try again, or type it below.' }]); return }
          submit(data.text)
        } catch (_) { setThinking(false); setMessages(m => [...m, { role: 'assistant', text: 'Voice failed — you can type instead.' }]) }
      }
      mr.start(); mrRef.current = mr; setRecording(true)
      if (settings.inputMode === 'listening') startVad(stream)
    } catch (_) { setMessages(m => [...m, { role: 'assistant', text: 'I need mic access for that — allow it, or type below.' }]) }
  }
  function stopRecording() { try { mrRef.current?.stop() } catch (_) {} }
  function toggleRecording() { primeAudio(); recording ? stopRecording() : startRecording() }

  // Listening mode: stop recording automatically after `pause` seconds of silence.
  function stopVad() {
    const v = vadRef.current
    if (!v) return
    try { cancelAnimationFrame(v.raf) } catch (_) {}
    try { v.ac.close() } catch (_) {}
    vadRef.current = null
  }
  function startVad(stream) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      const ac = new AC()
      const an = ac.createAnalyser(); an.fftSize = 512
      ac.createMediaStreamSource(stream).connect(an)
      const buf = new Uint8Array(an.fftSize)
      let spoke = false, silentSince = 0
      const startedAt = Date.now()
      const tick = () => {
        an.getByteTimeDomainData(buf)
        let sum = 0; for (let i = 0; i < buf.length; i++) { const x = (buf[i] - 128) / 128; sum += x * x }
        const rms = Math.sqrt(sum / buf.length), now = Date.now()
        if (rms > 0.045) { spoke = true; silentSince = 0 }
        else if (spoke && !silentSince) silentSince = now
        if ((spoke && silentSince && now - silentSince > settings.pause * 1000) || now - startedAt > 20000) { stopRecording(); return }
        if (vadRef.current) vadRef.current.raf = requestAnimationFrame(tick)
      }
      vadRef.current = { ac, raf: requestAnimationFrame(tick) }
    } catch (_) { /* VAD unsupported — manual tap still works */ }
  }

  return createPortal(
    <>
      {open && (
        <>
          <div className="fixed inset-0 z-[96] bg-black/30" onClick={() => setOpen(false)} />
          <div className="fixed z-[97] inset-x-0 bottom-0 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[390px] h-[90vh] sm:h-[680px] sm:max-h-[90vh] bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 text-white flex items-center justify-between shrink-0" style={{ background: 'linear-gradient(145deg, #4a4a4a 0%, #1c1c1c 42%, #000 60%, #2e2e2e 100%)' }}>
              <span className="text-sm font-semibold"><span style={{ color: '#FFB020' }}>✦</span> Quick check</span>
              <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white text-lg leading-none">✕</button>
            </div>

            {/* Pinned, collapsible: event picker + live tasks + full checklist */}
            <div className="shrink-0 border-b border-surface-200 bg-surface-50">
              <div className="px-4 pt-3 pb-1">
                <select value={eventId} onChange={e => { setEventId(e.target.value); localStorage.setItem('assistantEvent', e.target.value) }}
                  className="input py-1.5 text-sm w-full">
                  <option value="">Pick an event…</option>
                  {events.map(e => (
                    <option key={e.id} value={e.id}>{e.series?.brand?.name ? `${e.series.brand.name} · ` : ''}{e.name}</option>
                  ))}
                </select>
              </div>
              <button onClick={() => setTasksOpen(o => !o)} className="w-full px-4 py-2 flex items-center justify-between text-xs font-semibold text-ink-500">
                <span>{tasksOpen ? '▾' : '▸'} What’s left{eventId && !loading ? ` · ${tasks.length}` : ''}</span>
                {!tasksOpen && tasks.length > 0 && <span className="w-2 h-2 rounded-full bg-brand-500" />}
              </button>
              {tasksOpen && (
                <div className="px-4 pb-3 max-h-[32vh] overflow-y-auto space-y-3">
                  {!eventId ? (
                    <p className="text-xs text-ink-400">I’ll base this on your role and what’s assigned to you.</p>
                  ) : loading ? (
                    <p className="text-xs text-ink-400">Checking…</p>
                  ) : tasks.length === 0 ? (
                    <p className="text-sm text-emerald-700">✓ All clear — nothing waiting on you.</p>
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
                  <div>
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
              )}
            </div>

            {/* Chat transcript */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] text-sm rounded-2xl px-3 py-2 ${msg.role === 'user' ? 'bg-brand-600 text-white rounded-tr-sm' : 'bg-surface-100 text-ink-800 rounded-tl-sm'}`}>
                    {msg.text}
                    {msg.to && <button onClick={() => go(msg.to)} className={`block mt-1 text-xs underline ${msg.role === 'user' ? 'text-white/90' : 'text-brand-600'}`}>→ Take me there</button>}
                  </div>
                </div>
              ))}
              {thinking && <div className="flex justify-start"><div className="bg-surface-100 text-ink-400 text-sm rounded-2xl rounded-tl-sm px-3 py-2">…</div></div>}
            </div>

            {/* Input bar */}
            <div className="shrink-0 border-t border-surface-100 p-3 flex items-center gap-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              {canRecord && (
                <button onClick={toggleRecording} title={recording ? 'Tap to stop' : 'Tap to talk'}
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition ${recording ? 'bg-red-500 text-white animate-pulse' : 'bg-surface-100 text-ink-600 hover:bg-surface-200'}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 013 3v7a3 3 0 01-6 0V4a3 3 0 013-3zM19 10a7 7 0 01-14 0M12 17v4" /></svg>
                </button>
              )}
              <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit(input) }}
                placeholder={recording ? 'Listening…' : 'Ask or type…'} disabled={recording}
                className="input flex-1 py-2 text-sm" />
              <button onClick={() => submit(input)} disabled={!input.trim()} title="Send"
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #FFD54F 0%, #FFB300 50%, #FB8C00 100%)' }}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>
        </>
      )}
      {!open && (
        <button onClick={() => setOpen(true)} title="Quick check"
          className="fixed bottom-28 sm:bottom-4 right-4 z-[95] w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-xl ring-1 ring-white/10"
          style={{ background: 'linear-gradient(145deg, #4a4a4a 0%, #1c1c1c 42%, #000 60%, #2e2e2e 100%)' }}>
          <span style={{ color: '#FFB020' }}>✦</span>
        </button>
      )}
    </>,
    document.body
  )
}
