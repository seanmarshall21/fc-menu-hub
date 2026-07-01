import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import PageScreen, { PageBody } from '@/components/PageScreen'

// Color + label per notification kind, for grouping and at-a-glance scanning.
const KIND_META = {
  phase:          { label: 'Your phase',     chip: 'bg-brand-100 text-brand-700',   accent: 'bg-brand-500' },
  mention:        { label: 'Mentions',       chip: 'bg-purple-100 text-purple-700', accent: 'bg-purple-500' },
  tagged_in_edit: { label: 'Tagged',         chip: 'bg-blue-100 text-blue-700',     accent: 'bg-blue-500' },
  status_change:  { label: 'Status changes', chip: 'bg-indigo-100 text-indigo-700', accent: 'bg-indigo-500' },
  edit:           { label: 'Edits',          chip: 'bg-amber-100 text-amber-800',   accent: 'bg-amber-500' },
  comment:        { label: 'Comments',       chip: 'bg-teal-100 text-teal-700',     accent: 'bg-teal-500' },
}
const KIND_ORDER = ['phase', 'mention', 'tagged_in_edit', 'status_change', 'edit', 'comment']
function kindMeta(k) { return KIND_META[k] || { label: 'Other', chip: 'bg-surface-100 text-ink-500', accent: 'bg-ink-300' } }

/**
 * Personal notifications inbox.
 *
 * Sections:
 *   • Tagged — items the user was tagged on (kind = 'tagged_in_edit')
 *   • My Edits — items the user themselves edited (auto-tagged by RPC)
 *   • Archived — dismissed items (last 30 days, collapsible)
 *
 * Each notification has Visit (navigates to link_url + marks read) and
 * Archive (removes from active list). Bulk actions at the top of each
 * section.
 */
export default function InboxPage() {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)

  const load = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    // Load active (non-archived) and archived separately, so unread/active
    // notifications always appear even when hundreds of archived ones exist.
    const [act, arc] = await Promise.all([
      supabase.from('notifications').select('*').eq('user_id', profile.id)
        .is('archived_at', null).order('created_at', { ascending: false }).limit(300),
      supabase.from('notifications').select('*').eq('user_id', profile.id)
        .not('archived_at', 'is', null).order('archived_at', { ascending: false }).limit(100),
    ])
    setRows([...(act.data || []), ...(arc.data || [])])
    setLoading(false)
  }, [profile?.id])

  useEffect(() => { load() }, [load])

  // Buckets — grouped by kind, in KIND_ORDER (unknown kinds fall to the end).
  const active   = useMemo(() => rows.filter(r => !r.archived_at), [rows])
  const archived = useMemo(() => rows.filter(r =>  r.archived_at), [rows])
  const grouped  = useMemo(() => {
    const by = {}
    for (const r of active) { (by[r.kind] = by[r.kind] || []).push(r) }
    const keys = Object.keys(by).sort((a, b) => {
      const ia = KIND_ORDER.indexOf(a), ib = KIND_ORDER.indexOf(b)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    })
    return keys.map(k => ({ kind: k, rows: by[k] }))
  }, [active])

  async function markRead(id) {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
    setRows(prev => prev.map(r => r.id === id ? { ...r, read_at: new Date().toISOString() } : r))
  }
  async function markAllRead() {
    const ids = active.filter(r => !r.read_at).map(r => r.id)
    if (!ids.length) return
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids)
    load()
  }
  async function archiveOne(id) {
    await supabase.from('notifications').update({ archived_at: new Date().toISOString() }).eq('id', id)
    setRows(prev => prev.map(r => r.id === id ? { ...r, archived_at: new Date().toISOString() } : r))
  }
  async function unarchiveOne(id) {
    await supabase.from('notifications').update({ archived_at: null }).eq('id', id)
    setRows(prev => prev.map(r => r.id === id ? { ...r, archived_at: null } : r))
  }
  async function archiveAllActive() {
    if (!confirm('Archive every notification in your inbox?')) return
    const ids = active.map(r => r.id)
    if (!ids.length) return
    await supabase.from('notifications').update({ archived_at: new Date().toISOString() }).in('id', ids)
    load()
  }

  function visit(n) {
    markRead(n.id)
    if (n.link_url) navigate(n.link_url)
  }

  // ── Multi-select (checkbox + shift-range + select-all) ───────────────────
  const [selected, setSelected] = useState(() => new Set())
  const lastRef = useRef(null) // { kind, index } for shift-range within a section
  function handleSelect(kind, sectionRows, index, id, shift) {
    setSelected(prev => {
      const next = new Set(prev)
      if (shift && lastRef.current && lastRef.current.kind === kind) {
        const [a, b] = [lastRef.current.index, index].sort((x, y) => x - y)
        for (let i = a; i <= b; i++) if (sectionRows[i]) next.add(sectionRows[i].id)
      } else {
        next.has(id) ? next.delete(id) : next.add(id)
      }
      return next
    })
    lastRef.current = { kind, index }
  }
  function selectAllIn(sectionRows) {
    const ids = sectionRows.map(r => r.id)
    const allOn = ids.every(id => selected.has(id))
    setSelected(prev => { const next = new Set(prev); ids.forEach(id => allOn ? next.delete(id) : next.add(id)); return next })
  }
  function selectAllActive() { setSelected(new Set(active.map(r => r.id))) }
  function clearSelection() { setSelected(new Set()) }
  async function bulkMarkRead() {
    const ids = [...selected]; if (!ids.length) return
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids)
    clearSelection(); load()
  }
  async function bulkArchive() {
    const ids = [...selected]; if (!ids.length) return
    await supabase.from('notifications').update({ archived_at: new Date().toISOString() }).in('id', ids)
    clearSelection(); load()
  }

  return (
    <PageScreen
      tourKey="inbox"
      breadcrumbs={[{ label: 'Inbox' }]}
      actions={(
        <div className="flex items-center gap-2">
          <Link to="/profile" className="btn-secondary btn-sm whitespace-nowrap" title="Choose what notifies you">⚙ Settings</Link>
          {active.length > 0 && (<>
            <button onClick={markAllRead} className="btn-secondary btn-sm" disabled={active.every(r => r.read_at)}>
              Mark all read
            </button>
            <button onClick={archiveAllActive} className="btn-secondary btn-sm">Archive all</button>
          </>)}
        </div>
      )}
    >
      <PageBody className="max-w-3xl space-y-6">
        {loading ? (
          <p className="text-sm text-ink-400">Loading…</p>
        ) : active.length === 0 && archived.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {grouped.length === 0 && archived.length > 0 && (
              <p className="text-sm text-ink-400">Nothing new — see archived below.</p>
            )}
            {selected.size > 0 ? (
              <div className="sticky top-0 z-20 flex items-center gap-2 flex-wrap px-3 py-2.5 rounded-lg bg-brand-50 border border-brand-200">
                <span className="text-sm font-medium text-ink-800">{selected.size} selected</span>
                <button onClick={bulkMarkRead} className="btn-secondary btn-sm">Mark read</button>
                <button onClick={bulkArchive} className="btn-secondary btn-sm">Archive</button>
                <button onClick={selectAllActive} className="text-xs text-brand-600 hover:underline ml-1">Select all {active.length}</button>
                <button onClick={clearSelection} className="text-xs text-ink-400 hover:text-ink-600 ml-auto">Clear</button>
              </div>
            ) : (
              <p className="text-[11px] text-ink-400">Tip: check a notification, then Shift-click another to select the range.</p>
            )}
            {grouped.map(g => (
              <Bucket key={g.kind} kind={g.kind} title={kindMeta(g.kind).label} rows={g.rows} onVisit={visit} onArchive={archiveOne}
                selected={selected} onSelect={handleSelect} onSelectAll={selectAllIn} />
            ))}

            {archived.length > 0 && (
              <div className="pt-2 border-t border-surface-200">
                <button
                  onClick={() => setShowArchived(s => !s)}
                  className="text-xs text-ink-500 hover:text-ink-700 underline-offset-2 hover:underline"
                >
                  {showArchived ? '▾ Hide' : '▸ Show'} archived ({archived.length})
                </button>
                {showArchived && (
                  <div className="mt-3">
                    <Bucket
                      title="Archived"
                      subtitle="Auto-deleted after 30 days. Restore one with the ↺ button."
                      rows={archived}
                      onVisit={visit}
                      onArchive={unarchiveOne}
                      archived
                      defaultOpen
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </PageBody>
    </PageScreen>
  )
}

function Bucket({ title, subtitle, rows, onVisit, onArchive, archived = false, kind, defaultOpen = false, selected, onSelect, onSelectAll }) {
  const [open, setOpen] = useState(defaultOpen)
  const [showAll, setShowAll] = useState(false)
  if (rows.length === 0) return null
  const meta = kindMeta(kind)
  const unread = rows.filter(r => !r.read_at).length
  const shown = showAll ? rows : rows.slice(0, 5)
  const selectable = !!onSelect && !archived
  const allSelected = selectable && rows.length > 0 && rows.every(r => selected?.has(r.id))
  return (
    <section className="card overflow-hidden">
      <div className="w-full px-4 py-3 border-b border-surface-100 flex items-center gap-2 hover:bg-surface-50">
        {selectable && (
          <input type="checkbox" checked={allSelected} onChange={() => onSelectAll(rows)} title="Select all in section" className="flex-shrink-0" />
        )}
        <button onClick={() => setOpen(o => !o)} className="flex-1 flex items-center gap-2 text-left min-w-0">
          <span className={`w-2.5 h-2.5 rounded-full ${meta.accent} flex-shrink-0`} />
          <h2 className="text-sm font-semibold text-ink-900 flex-1 truncate">{title} <span className="text-xs text-ink-400 font-normal">· {rows.length}</span></h2>
          {unread > 0 && <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${meta.chip}`}>{unread} new</span>}
          <svg className={`w-4 h-4 text-ink-300 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
        </button>
      </div>
      {subtitle && open && <p className="text-xs text-ink-400 px-4 pt-2">{subtitle}</p>}
      {open && (<>
      <ul className="divide-y divide-surface-100">
        {shown.map((n, i) => (
          <li
            key={n.id}
            className={`px-4 py-3 flex items-start gap-3 ${selected?.has(n.id) ? 'bg-brand-50/60' : n.read_at ? 'bg-surface-0' : 'bg-brand-50/30'}`}
          >
            {selectable && (
              <input type="checkbox" checked={!!selected?.has(n.id)} onClick={e => onSelect(kind, shown, i, n.id, e.shiftKey)} onChange={() => {}} className="mt-1 flex-shrink-0" />
            )}
            {!selectable && !n.read_at && <span className={`mt-2 w-2 h-2 rounded-full ${meta.accent} flex-shrink-0`} aria-label="Unread" />}
            <div className={`flex-1 min-w-0 ${!selectable && n.read_at ? 'ml-5' : ''}`}>
              <button
                onClick={() => onVisit(n)}
                className="text-left w-full"
              >
                <div className="text-sm font-medium text-ink-900 truncate">{n.title}</div>
                {n.body && <div className="text-xs text-ink-500 mt-0.5">{n.body}</div>}
                <div className="text-[11px] text-ink-400 mt-1">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </div>
              </button>
            </div>
            <button
              onClick={() => onArchive(n.id)}
              className="text-[11px] text-ink-400 hover:text-ink-700 flex-shrink-0"
              title={archived ? 'Restore to inbox' : 'Archive'}
            >
              {archived ? '↺ Restore' : 'Archive'}
            </button>
          </li>
        ))}
      </ul>
      {rows.length > 5 && !showAll && (
        <button onClick={() => setShowAll(true)} className="w-full px-4 py-2.5 text-xs font-medium text-brand-600 hover:bg-surface-50 border-t border-surface-100">
          See all {rows.length}
        </button>
      )}
      </>)}
    </section>
  )
}

function EmptyState() {
  return (
    <div className="card p-10 text-center">
      <div className="text-4xl mb-2">📭</div>
      <h2 className="text-sm font-semibold text-ink-900">Inbox zero</h2>
      <p className="text-xs text-ink-500 mt-1">Notifications about edits you've made or been tagged in will show up here.</p>
    </div>
  )
}
