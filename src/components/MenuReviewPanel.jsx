import { useEffect, useMemo, useRef, useState } from 'react'
import { reviewMenuItems } from '@/lib/menuReview'
import { supabase } from '@/lib/supabase'
import Modal from '@/components/Modal'

// Small stable hash of the reviewable content — the AI only re-runs when this
// changes, so cached findings survive navigation and don't re-bill on re-open.
function hashStr(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

/**
 * Inline review banner for a menu's items. Runs the deterministic checks
 * from menuReview.js and shows a collapsible list of findings.
 *
 * Single-item findings (spacing/typo/repeat) get an inline "Accept edit"
 * that writes the suggested value. Consistency findings get a "Details"
 * modal that lists every occurrence + offers one-click "make all use X".
 *
 * Props:
 *   items        — the menu's items
 *   onJumpToItem — (itemId) => void, scroll/highlight an item row
 *   onChanged    — () => void, called after any edit is written (refetch)
 */

// Replace whole-word occurrences of `wordLower` with `targetForm`, keeping
// surrounding spacing + punctuation intact.
function replaceWordPreservingPunct(text, wordLower, targetForm) {
  return String(text).split(/(\s+)/).map(tok => {
    const m = tok.match(/^([^A-Za-z'’-]*)([A-Za-z'’-]+)([^A-Za-z'’-]*)$/)
    if (!m) return tok
    if (m[2].toLowerCase() === wordLower) return m[1] + targetForm + m[3]
    return tok
  }).join('')
}

// Stable signature for a finding so an "ignore" survives recomputation.
function findingKey(f) {
  return [f.kind, f.field || '', f.itemId || '', f.word || f.message || ''].join('|')
}

export default function MenuReviewPanel({ items, menuId, onJumpToItem, onChanged }) {
  const allFindings = useMemo(() => reviewMenuItems(items), [items])
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState(null)   // a consistency finding
  const [busyId, setBusyId] = useState(null)

  // Review decisions persist in the DB (per menu, shared across devices/users).
  //   'ignored' = hide for now (resettable)
  //   'correct' = permanently confirmed correct; never re-flag + fed back to
  //               the AI so it stops generating it.
  const [decisions, setDecisions] = useState([])
  const [decisionsLoaded, setDecisionsLoaded] = useState(false)
  useEffect(() => {
    let cancelled = false
    setDecisionsLoaded(false)
    ;(async () => {
      if (!menuId) { setDecisionsLoaded(true); return }
      const { data } = await supabase.from('menu_review_decisions').select('*').eq('menu_id', menuId)
      if (!cancelled) { setDecisions(data || []); setDecisionsLoaded(true) }
    })()
    return () => { cancelled = true }
  }, [menuId])

  const correctSet = useMemo(() => new Set(decisions.filter(d => d.decision === 'correct').map(d => d.signature)), [decisions])
  const ignoredSet = useMemo(() => new Set(decisions.filter(d => d.decision === 'ignored').map(d => d.signature)), [decisions])
  const hidden = (sig) => correctSet.has(sig) || ignoredSet.has(sig)

  async function saveDecision(f, decision) {
    if (!menuId) return
    const row = {
      menu_id: menuId, signature: findingKey(f), decision,
      kind: f.kind || null, field: f.field || null,
      label: f.itemTitle || f.word || null,
      detail: f.message || f.suggestion || null,
    }
    setDecisions(prev => [...prev.filter(d => d.signature !== row.signature), { ...row, id: 'tmp-' + row.signature }])
    await supabase.from('menu_review_decisions').upsert(row, { onConflict: 'menu_id,signature' })
  }
  function ignore(f) { saveDecision(f, 'ignored'); setActedOn(prev => new Map(prev).set(findingKey(f), { f, action: 'ignored' })) }
  function markCorrect(f) { saveDecision(f, 'correct'); setActedOn(prev => new Map(prev).set(findingKey(f), { f, action: 'correct' })) }
  async function clearIgnored() {
    setDecisions(prev => prev.filter(d => d.decision !== 'ignored'))
    if (menuId) await supabase.from('menu_review_decisions').delete().eq('menu_id', menuId).eq('decision', 'ignored')
  }

  // Undo a session action; Clear removes the (resolved) flag from view.
  async function undoAction(key) {
    const rec = actedOn.get(key)
    if (!rec) return
    if (rec.action === 'accepted' && rec.prev) {
      await supabase.from('menu_items').update({ [rec.prev.field]: rec.prev.value }).eq('id', rec.prev.itemId)
      onChanged?.()
    } else if (menuId) {
      await supabase.from('menu_review_decisions').delete().eq('menu_id', menuId).eq('signature', key)
      setDecisions(prev => prev.filter(d => d.signature !== key))
    }
    setActedOn(prev => { const n = new Map(prev); n.delete(key); return n })
  }
  function clearFlag(key) { setCleared(prev => new Set(prev).add(key)) }

  // AI review (LLM): spelling, grammar, semantic naming consistency. Runs on
  // demand via the review-menu edge function. Results merge with the
  // heuristic findings and respect the same ignore list.
  const [aiFindings, setAiFindings] = useState([])
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState(null)
  const [aiRan, setAiRan] = useState(false)
  const [cacheStale, setCacheStale] = useState(false)

  // Content hash of the reviewable items — drives caching.
  const contentHash = useMemo(() => {
    const r = (items || [])
      .filter(i => i && (i.status === 'active' || i.status === 'pending_approval'))
      .map(i => ({ id: i.id, s: i.section || '', t: i.title || '', d: i.description || '' }))
    return hashStr(JSON.stringify(r))
  }, [items])

  async function runAiReview() {
    setAiBusy(true); setAiError(null)
    try {
      // Feed confirmed-correct items back so the model stops re-flagging them.
      const correct = decisions.filter(d => d.decision === 'correct')
        .map(d => ({ field: d.field, label: d.label, kind: d.kind, message: d.detail }))
      const { data, error } = await supabase.functions.invoke('review-menu', { body: { items, correct } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      const fnd = Array.isArray(data?.findings) ? data.findings : []
      setAiFindings(fnd); setAiRan(true); setCacheStale(false)
      // Caching is handled by the sync effect below (keeps the cache = the
      // still-unresolved AI findings at the current content).
    } catch (e) {
      setAiError(e.message || 'AI review failed')
    } finally {
      setAiBusy(false)
    }
  }

  // Auto-run on open: load the cached review; if it matches current content,
  // show it (no API call). Otherwise auto-run once. Waits for decisions so the
  // confirmed-correct list is included. Later content changes mark it stale
  // (shown as a hint) rather than auto-re-billing.
  const autoRanFor = useRef(null)
  useEffect(() => {
    if (!decisionsLoaded || !menuId || !(items || []).length) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('menu_ai_reviews')
        .select('content_hash, findings').eq('menu_id', menuId).maybeSingle()
      if (cancelled) return
      if (data && data.content_hash === contentHash) {
        setAiFindings(Array.isArray(data.findings) ? data.findings : [])
        setAiRan(true); setCacheStale(false)
      } else if (autoRanFor.current !== menuId) {
        autoRanFor.current = menuId
        runAiReview()
      } else if (data) {
        // Already auto-ran this menu; content changed again → show cache + stale.
        setAiFindings(Array.isArray(data.findings) ? data.findings : [])
        setAiRan(true); setCacheStale(true)
      }
    })()
    return () => { cancelled = true }
  }, [decisionsLoaded, menuId, contentHash])  // eslint-disable-line react-hooks/exhaustive-deps

  // Flags acted on THIS session stay visible (resolved-in-place) with Undo +
  // Clear, instead of vanishing. They go away on reload (the decision/edit
  // persists). `cleared` removes them from view entirely.
  const [actedOn, setActedOn] = useState(() => new Map())  // key → { f, action, prev }
  const [cleared, setCleared] = useState(() => new Set())
  useEffect(() => { setActedOn(new Map()); setCleared(new Set()) }, [menuId])

  // Build the render list: acted-on (kept) first, then unresolved findings.
  const baseFindings = [...allFindings, ...aiFindings]
  const renderList = []
  const seenKeys = new Set()
  for (const [key, rec] of actedOn) {
    if (cleared.has(key)) continue
    renderList.push({ f: rec.f, rec }); seenKeys.add(key)
  }
  for (const f of baseFindings) {
    const key = findingKey(f)
    if (seenKeys.has(key) || cleared.has(key) || hidden(key)) continue
    renderList.push({ f, rec: null }); seenKeys.add(key)
  }
  const unresolvedCount = renderList.filter(x => !x.rec).length
  const ignoredCount = decisions.filter(d => d.decision === 'ignored').length

  // Keep the cached review = the still-unresolved AI findings AT THE CURRENT
  // content. So: handling a flag (incl. accepting an edit, which changes the
  // content) settles the cache to the new content — the menu shows "done" and
  // won't re-run until INDEPENDENT edits change it. Empty = fully handled.
  const cacheSyncRef = useRef('')
  useEffect(() => {
    if (!menuId || !aiRan || aiBusy) return
    const unresolvedAi = renderList.filter(x => !x.rec && x.f && x.f.source === 'ai').map(x => x.f)
    const key = contentHash + '|' + unresolvedAi.map(f => findingKey(f)).sort().join(',')
    if (cacheSyncRef.current === key) return
    cacheSyncRef.current = key
    supabase.from('menu_ai_reviews').upsert(
      { menu_id: menuId, content_hash: contentHash, findings: unresolvedAi, reviewed_at: new Date().toISOString() }
    )
  }, [menuId, aiRan, aiBusy, contentHash, renderList])  // eslint-disable-line react-hooks/exhaustive-deps

  // Reusable AI-review button shown in both the clean banner + the flags header.
  const aiButton = (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); runAiReview() }}
      disabled={aiBusy}
      className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-white border border-purple-200 text-purple-700 hover:bg-purple-50 inline-flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 disabled:opacity-50"
      title="Run an AI pass for spelling, grammar, and naming consistency"
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5L13 3z" />
      </svg>
      {aiBusy ? 'Reviewing…' : aiRan ? 'Re-run AI review' : 'AI review'}
    </button>
  )

  const itemsById = useMemo(() => {
    const m = new Map()
    for (const it of (items || [])) m.set(it.id, it)
    return m
  }, [items])

  if (!renderList.length) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 mb-4 flex items-center gap-2 text-sm text-emerald-800 flex-wrap">
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <span className="font-medium">{aiBusy ? 'Reviewing…' : aiRan ? 'AI review complete' : 'Looks clean'}</span>
        <span className="text-emerald-700">
          {aiBusy ? '' : aiRan
            ? ` — all flags handled${ignoredCount > 0 ? ` (${ignoredCount} ignored)` : ''}.`
            : ` — no basic spelling or consistency issues (run AI for a deeper pass).`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {ignoredCount > 0 && (
            <button onClick={clearIgnored} className="text-[11px] text-emerald-700 underline hover:text-emerald-900">
              Reset ignored
            </button>
          )}
          {aiButton}
        </div>
        {aiError && <p className="w-full text-[11px] text-red-600 mt-1">{aiError}</p>}
      </div>
    )
  }

  const counts = renderList.filter(x => !x.rec).reduce((acc, x) => {
    acc[x.f.kind] = (acc[x.f.kind] || 0) + 1
    return acc
  }, {})

  // Apply a single-item suggestion (spacing/typo/repeat).
  async function acceptSuggestion(f, idx) {
    if (!f.itemId || f.suggestion == null) return
    setBusyId(`s${idx}`)
    try {
      const prevVal = itemsById.get(f.itemId)?.[f.field] ?? ''
      setActedOn(prev => new Map(prev).set(findingKey(f), { f, action: 'accepted', prev: { itemId: f.itemId, field: f.field, value: prevVal } }))
      await supabase.from('menu_items').update({ [f.field]: f.suggestion }).eq('id', f.itemId)
      onChanged?.()
    } finally { setBusyId(null) }
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 mb-4 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-2.5 flex items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2 text-sm text-amber-900">
          <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-semibold">{unresolvedCount > 0 ? `${unresolvedCount} review ${unresolvedCount === 1 ? 'flag' : 'flags'}` : 'Flags handled'}</span>
          <span className="text-amber-700">
            {Object.entries(counts).map(([k, v]) => `${v} ${kindLabel(k)}`).join(' · ')}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {cacheStale && <span className="text-[10px] text-amber-600 whitespace-nowrap" title="Items changed since the last AI pass">items changed</span>}
          {aiButton}
          <span className="text-[11px] text-amber-700">{open ? 'Hide' : 'Show'}</span>
        </div>
      </button>
      {aiError && <p className="px-4 pb-2 text-[11px] text-red-600">{aiError}</p>}
      {open && (
        <ul className="divide-y divide-amber-100 bg-white">
          {renderList.map(({ f, rec }, i) => (
            <li key={i} className={`px-4 py-2.5 text-sm ${rec ? 'bg-surface-50/60' : ''}`}>
              <div className="flex items-start gap-3">
                <span className={`flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold uppercase ${rec ? 'bg-surface-200 text-ink-400' : kindBadgeClass(f.kind)}`}>
                  {kindShort(f.kind)}
                </span>
                <div className="flex-1 min-w-0">
                  {f.itemTitle ? (
                    <button
                      type="button"
                      onClick={() => f.itemId && onJumpToItem?.(f.itemId)}
                      className="text-ink-900 font-medium hover:text-brand-600"
                    >
                      {f.itemTitle}
                    </button>
                  ) : f.affectedItemIds ? (
                    <span className="text-ink-700 font-medium">{f.affectedItemIds.length} items</span>
                  ) : (
                    <span className="text-ink-700 font-medium">Across menu</span>
                  )}
                  {f.field && f.field !== 'multiple' && (
                    <span className="text-[11px] text-ink-400 ml-2">({f.field})</span>
                  )}
                  <div className="text-xs text-ink-600 mt-0.5">{f.message}</div>
                  {f.suggestion && (
                    <div className="mt-1 text-[11px] text-ink-500 italic truncate">
                      Suggested: <span className="text-ink-700 not-italic">{f.suggestion}</span>
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0 flex flex-col items-end gap-1">
                  {rec ? (
                    /* Resolved this session — show what was done + Undo / Clear */
                    <>
                      <span className="text-[11px] font-medium text-ink-500 whitespace-nowrap">
                        {rec.action === 'accepted' ? '✓ Edit accepted' : rec.action === 'correct' ? '✓ Marked correct' : '✓ Ignored'}
                      </span>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => undoAction(findingKey(f))}
                          className="text-[11px] text-brand-600 hover:text-brand-800 whitespace-nowrap px-1">Undo</button>
                        <button type="button" onClick={() => clearFlag(findingKey(f))}
                          className="text-[11px] text-ink-400 hover:text-ink-700 whitespace-nowrap px-1" title="Remove this flag from the list">Clear</button>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Single-item findings with a concrete suggestion → inline accept */}
                      {f.itemId && f.suggestion != null && (
                        <button type="button" onClick={() => acceptSuggestion(f, i)} disabled={busyId === `s${i}`}
                          className="btn-primary btn-sm whitespace-nowrap w-full">
                          {busyId === `s${i}` ? '…' : 'Accept edit'}
                        </button>
                      )}
                      {/* Consistency findings → details modal */}
                      {f.kind === 'consistency' && f.occurrences && (
                        <button type="button" onClick={() => setDetail(f)} className="btn-secondary btn-sm whitespace-nowrap w-full">Details</button>
                      )}
                      {/* Confirm correct — never flag again + teach the AI */}
                      <button type="button" onClick={() => markCorrect(f)}
                        className="text-[11px] text-emerald-600 hover:text-emerald-800 whitespace-nowrap px-1"
                        title="This is correct as written — never flag it again, and the AI learns to skip it">
                        Correct as is
                      </button>
                      {/* Ignore for now (resettable) */}
                      <button type="button" onClick={() => ignore(f)}
                        className="text-[11px] text-ink-400 hover:text-ink-700 whitespace-nowrap px-1"
                        title="Hide for now — resettable; the AI may still surface it">
                        Ignore
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && ignoredCount > 0 && (
        <div className="px-4 py-1.5 bg-white border-t border-amber-100 text-[11px] text-ink-400 flex items-center justify-between">
          <span>{ignoredCount} flag{ignoredCount === 1 ? '' : 's'} ignored on this menu</span>
          <button onClick={clearIgnored} className="underline hover:text-ink-700">Reset ignored</button>
        </div>
      )}

      {detail && (
        <ConsistencyDetailModal
          finding={detail}
          itemsById={itemsById}
          onClose={() => setDetail(null)}
          onChanged={onChanged}
        />
      )}
    </div>
  )
}

// ── Consistency details modal ────────────────────────────────────────────────
function ConsistencyDetailModal({ finding, itemsById, onClose, onChanged }) {
  const { word, field, targetForms, occurrences } = finding
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // Make every affected item use `targetForm` for this word in this field.
  async function makeAll(targetForm) {
    setBusy(true); setError(null)
    try {
      const itemIds = [...new Set(occurrences.map(o => o.itemId))]
      for (const id of itemIds) {
        const item = itemsById.get(id)
        if (!item) continue
        const current = String(item[field] || '')
        const next = replaceWordPreservingPunct(current, word, targetForm)
        if (next !== current) {
          const { error: err } = await supabase.from('menu_items').update({ [field]: next }).eq('id', id)
          if (err) throw err
        }
      }
      onChanged?.()
      onClose()
    } catch (e) {
      setError(e.message || String(e))
    } finally { setBusy(false) }
  }

  return (
    <Modal title={`"${word}" — ${field === 'title' ? 'title' : 'description'} casing`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-ink-600">
          This word is capitalized inconsistently across {field === 'title' ? 'titles' : 'descriptions'}.
          Pick the form everything should use:
        </p>

        {/* Quick bulk actions */}
        <div className="flex flex-wrap gap-2">
          {targetForms.map(({ form, count }) => (
            <button
              key={form}
              type="button"
              onClick={() => makeAll(form)}
              disabled={busy}
              className="btn-primary btn-sm whitespace-nowrap"
              title={`Currently used in ${count} item${count === 1 ? '' : 's'}`}
            >
              Make all “{form}”
            </button>
          ))}
        </div>

        {/* Per-occurrence breakdown */}
        <div className="border border-surface-200 rounded-lg overflow-hidden">
          <div className="px-3 py-1.5 bg-surface-50 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            {occurrences.length} occurrence{occurrences.length === 1 ? '' : 's'}
          </div>
          <ul className="divide-y divide-surface-100">
            {occurrences.map((o, i) => {
              const item = itemsById.get(o.itemId)
              const value = item ? String(item[field] || '') : ''
              return (
                <li key={i} className="px-3 py-2 text-sm flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-ink-800 truncate">{o.itemTitle || '(untitled)'}</div>
                    <div className="text-[11px] text-ink-500 truncate">{value}</div>
                  </div>
                  <span className="flex-shrink-0 px-2 py-0.5 rounded bg-surface-100 text-ink-600 text-xs font-mono">{o.form}</span>
                </li>
              )
            })}
          </ul>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex items-center justify-end pt-1">
          <button type="button" onClick={onClose} className="btn-secondary btn-sm" disabled={busy}>Close</button>
        </div>
      </div>
    </Modal>
  )
}

function kindLabel(k) {
  if (k === 'typo') return 'typo'
  if (k === 'spelling') return 'spelling'
  if (k === 'grammar') return 'grammar'
  if (k === 'spacing') return 'spacing'
  if (k === 'duplicate-word') return 'repeat'
  if (k === 'consistency') return 'consistency'
  if (k === 'punctuation') return 'punctuation'
  return k
}
function kindShort(k) {
  if (k === 'typo') return 'sp'
  if (k === 'spelling') return 'sp'
  if (k === 'grammar') return 'gr'
  if (k === 'spacing') return 'sp'
  if (k === 'duplicate-word') return '2x'
  if (k === 'consistency') return '!='
  if (k === 'punctuation') return 'pn'
  return '?'
}
function kindBadgeClass(k) {
  if (k === 'consistency') return 'bg-blue-100 text-blue-700'
  if (k === 'typo' || k === 'spelling') return 'bg-red-100 text-red-700'
  if (k === 'grammar')     return 'bg-purple-100 text-purple-700'
  return 'bg-amber-100 text-amber-700'
}
