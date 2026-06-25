import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { reviewMenuItems, reviewContentHash, reviewFindingKey } from '@/lib/menuReview'
import Modal from '@/components/Modal'

// Event-wide AI review hub: aggregates every outstanding review flag across all
// of the event's menus, and lets you resolve each (Accept / type-in Replace /
// Correct as is / Ignore) without opening each menu. Reuses the cached reviews
// + decisions, so handled menus don't re-run. A "Run AI on all" button fills
// in any menu that hasn't been AI-checked at its current content.
//
// Props: menus (with menu_items), brand, series, event, onChanged

export default function EventAiReviewPanel({ menus = [], brand, series, event, onChanged }) {
  const { profile } = useAuth()
  const [decisions, setDecisions] = useState([])     // rows
  const [reviews, setReviews] = useState(new Map())  // menuId → {content_hash, findings}
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState('')
  const [detail, setDetail] = useState(null)         // a flag being viewed
  const [busyKey, setBusyKey] = useState(null)

  const menuIds = useMemo(() => menus.map(m => m.id), [menus])

  const load = useCallback(async () => {
    if (!menuIds.length) { setLoading(false); return }
    setLoading(true)
    const scopeIds = [brand?.id, series?.id, event?.id, ...menuIds].filter(Boolean)
    const [d, r, ru] = await Promise.all([
      supabase.from('menu_review_decisions').select('*').in('menu_id', menuIds),
      supabase.from('menu_ai_reviews').select('menu_id, content_hash, findings').in('menu_id', menuIds),
      supabase.from('review_rules').select('*').in('scope_id', scopeIds),
    ])
    setDecisions(d.data || [])
    setReviews(new Map((r.data || []).map(x => [x.menu_id, x])))
    setRules(ru.data || [])
    setLoading(false)
  }, [menuIds, brand?.id, series?.id, event?.id])

  useEffect(() => { load() }, [load])

  const decidedByMenu = useMemo(() => {
    const m = new Map()
    for (const d of decisions) {
      if (!m.has(d.menu_id)) m.set(d.menu_id, new Set())
      m.get(d.menu_id).add(d.signature)
    }
    return m
  }, [decisions])

  function rulesFor(menu) {
    return rules.filter(r => !r.category || r.category === menu.category)
  }

  // Every outstanding flag across menus, + which menus still need an AI pass.
  const { flags, needRun } = useMemo(() => {
    const out = []
    const need = []
    for (const m of menus) {
      const items = m.menu_items || []
      const reviewable = items.filter(i => i && (i.status === 'active' || i.status === 'pending_approval'))
      const decided = decidedByMenu.get(m.id) || new Set()
      const review = reviews.get(m.id)
      const aiCurrent = review && review.content_hash === reviewContentHash(items)
      if (reviewable.length && !aiCurrent) need.push(m)
      const aiFindings = aiCurrent ? (review.findings || []) : []
      const heur = reviewMenuItems(items)
      for (const f of [...heur, ...aiFindings]) {
        const sig = reviewFindingKey(f)
        if (decided.has(sig)) continue
        out.push({ menu: m, f, sig })
      }
    }
    return { flags: out, needRun: need }
  }, [menus, reviews, decidedByMenu])

  // Run AI on every menu that isn't current, caching each result.
  async function runAll() {
    setRunning(true)
    const targets = needRun
    for (let i = 0; i < targets.length; i++) {
      const m = targets[i]
      setProgress(`Reviewing ${i + 1} of ${targets.length}: ${m.name}…`)
      try {
        const correct = decisions.filter(d => d.menu_id === m.id && d.decision === 'correct')
          .map(d => ({ field: d.field, label: d.label, kind: d.kind, message: d.detail }))
        const ruleList = rulesFor(m).map(r => ({ text: r.text + (r.mode === 'edit' ? ' (suggest the corrected text)' : '') }))
        const { data } = await supabase.functions.invoke('review-menu', { body: { items: m.menu_items || [], correct, rules: ruleList } })
        const fnd = Array.isArray(data?.findings) ? data.findings : []
        await supabase.from('menu_ai_reviews').upsert({
          menu_id: m.id, content_hash: reviewContentHash(m.menu_items || []), findings: fnd, reviewed_at: new Date().toISOString(),
        })
      } catch (_) { /* skip this menu, keep going */ }
    }
    setProgress('')
    setRunning(false)
    load()
  }

  async function updateCache(menuId, removeSig, items) {
    const review = reviews.get(menuId)
    const remaining = (review?.findings || []).filter(x => reviewFindingKey(x) !== removeSig)
    await supabase.from('menu_ai_reviews').upsert({
      menu_id: menuId, content_hash: reviewContentHash(items), findings: remaining, reviewed_at: new Date().toISOString(),
    })
  }

  async function resolve(flag, action, replacement) {
    const { menu, f, sig } = flag
    setBusyKey(menu.id + sig)
    try {
      if (action === 'accept' || action === 'replace') {
        const val = action === 'accept' ? f.suggestion : replacement
        if (f.itemId && val != null) {
          await supabase.from('menu_items').update({ [f.field]: val }).eq('id', f.itemId)
          const updated = (menu.menu_items || []).map(i => i.id === f.itemId ? { ...i, [f.field]: val } : i)
          await updateCache(menu.id, sig, updated)
        }
      } else {
        const decision = action === 'correct' ? 'correct' : 'ignored'
        await supabase.from('menu_review_decisions').upsert({
          menu_id: menu.id, signature: sig, decision,
          kind: f.kind || null, field: f.field || null,
          label: f.itemTitle || f.word || null, detail: f.message || f.suggestion || null,
          created_by: profile?.id || null,
        }, { onConflict: 'menu_id,signature' })
        if (f.source === 'ai') await updateCache(menu.id, sig, menu.menu_items || [])
      }
      setDetail(null)
      await load()
      onChanged?.()
    } finally { setBusyKey(null) }
  }

  if (loading) return <div className="card p-5 text-sm text-ink-400">Loading review…</div>

  // Group flags by menu for a tidy list.
  const byMenu = []
  const idx = new Map()
  for (const fl of flags) {
    if (!idx.has(fl.menu.id)) { idx.set(fl.menu.id, byMenu.length); byMenu.push({ menu: fl.menu, items: [] }) }
    byMenu[idx.get(fl.menu.id)].items.push(fl)
  }

  return (
    <div className="space-y-4">
      <div className="card p-5 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-ink-900 flex items-center gap-1.5">
            <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5L13 3z" /></svg>
            AI review — all menus
          </h2>
          <p className="text-xs text-ink-400 mt-0.5">
            {flags.length === 0 ? 'No outstanding flags.' : `${flags.length} outstanding flag${flags.length === 1 ? '' : 's'} across ${byMenu.length} menu${byMenu.length === 1 ? '' : 's'}.`}
            {needRun.length > 0 && ` · ${needRun.length} menu${needRun.length === 1 ? '' : 's'} not yet AI-checked.`}
          </p>
        </div>
        <button onClick={runAll} disabled={running || needRun.length === 0}
          className="btn-primary btn-sm whitespace-nowrap disabled:opacity-50">
          {running ? 'Running…' : needRun.length ? `Run AI on ${needRun.length} menu${needRun.length === 1 ? '' : 's'}` : 'All menus checked'}
        </button>
      </div>
      {progress && <p className="text-xs text-ink-500 px-1">{progress}</p>}

      {byMenu.map(group => (
        <div key={group.menu.id} className="card overflow-hidden">
          <div className="px-4 py-2.5 bg-surface-50 border-b border-surface-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-ink-800">{group.menu.name}</span>
            <span className="text-[11px] text-ink-400 capitalize">{group.menu.category} · {group.items.length} flag{group.items.length === 1 ? '' : 's'}</span>
          </div>
          <ul className="divide-y divide-surface-100">
            {group.items.map((fl, i) => (
              <li key={i} className="px-4 py-2.5 text-sm flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-ink-900">{fl.f.itemTitle || 'Across menu'}</span>
                  {fl.f.field && fl.f.field !== 'multiple' && <span className="text-[11px] text-ink-400 ml-2">({fl.f.field})</span>}
                  <div className="text-xs text-ink-600 mt-0.5">{fl.f.message}</div>
                  {fl.f.suggestion && <div className="text-[11px] text-ink-500 italic mt-0.5 truncate">Suggested: <span className="text-ink-700 not-italic">{fl.f.suggestion}</span></div>}
                </div>
                <div className="flex-shrink-0 flex flex-col items-end gap-1">
                  <button onClick={() => setDetail(fl)} className="btn-secondary btn-sm whitespace-nowrap w-full">View</button>
                  {fl.f.itemId && fl.f.suggestion != null && (
                    <button onClick={() => resolve(fl, 'accept')} disabled={busyKey === fl.menu.id + fl.sig}
                      className="btn-primary btn-sm whitespace-nowrap w-full">Accept</button>
                  )}
                  <div className="flex items-center gap-2">
                    <button onClick={() => resolve(fl, 'correct')} className="text-[11px] text-emerald-600 hover:text-emerald-800 px-1">Correct</button>
                    <button onClick={() => resolve(fl, 'ignore')} className="text-[11px] text-ink-400 hover:text-ink-700 px-1">Ignore</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {detail && (
        <FlagDetailModal flag={detail} busy={busyKey === detail.menu.id + detail.sig}
          onClose={() => setDetail(null)} onResolve={resolve} />
      )}
    </div>
  )
}

// Modal showing the flagged item in context with a type-in replacement.
function FlagDetailModal({ flag, busy, onClose, onResolve }) {
  const { menu, f } = flag
  const item = (menu.menu_items || []).find(i => i.id === f.itemId)
  const current = item ? String(item[f.field] || '') : ''
  const [replacement, setReplacement] = useState(f.suggestion || current)

  return (
    <Modal title={`${menu.name} — review`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-1">{f.itemTitle || 'Across menu'} {f.field ? `· ${f.field}` : ''}</div>
          <div className="text-sm text-ink-700">{f.message}</div>
        </div>
        {f.itemId && (
          <>
            <div className="text-xs text-ink-500">
              Current: <span className="text-ink-800">{current || '(empty)'}</span>
            </div>
            <div>
              <label className="label">Replace with</label>
              <textarea className="input w-full resize-y text-sm" rows={2} value={replacement} onChange={e => setReplacement(e.target.value)} />
            </div>
          </>
        )}
        <div className="flex items-center justify-end gap-2 pt-1 flex-wrap">
          <button onClick={() => onResolve(flag, 'ignore')} disabled={busy} className="btn-secondary btn-sm">Ignore</button>
          <button onClick={() => onResolve(flag, 'correct')} disabled={busy} className="btn-secondary btn-sm">Correct as is</button>
          {f.itemId && (
            <button onClick={() => onResolve(flag, 'replace', replacement)} disabled={busy} className="btn-primary btn-sm">
              {busy ? 'Saving…' : 'Apply change'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
