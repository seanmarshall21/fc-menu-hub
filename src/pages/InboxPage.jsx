import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import PageScreen, { PageBody } from '@/components/PageScreen'

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
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(200)
    setRows(data || [])
    setLoading(false)
  }, [profile?.id])

  useEffect(() => { load() }, [load])

  // Buckets
  const active   = useMemo(() => rows.filter(r => !r.archived_at), [rows])
  const archived = useMemo(() => rows.filter(r =>  r.archived_at), [rows])
  const tagged   = useMemo(() => active.filter(r => r.kind === 'tagged_in_edit'), [active])
  const mine     = useMemo(() => active.filter(r => r.kind !== 'tagged_in_edit'), [active])

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

  return (
    <PageScreen
      breadcrumbs={[{ label: 'Inbox' }]}
      actions={active.length > 0 && (
        <div className="flex items-center gap-2">
          <button onClick={markAllRead} className="btn-secondary btn-sm" disabled={active.every(r => r.read_at)}>
            Mark all read
          </button>
          <button onClick={archiveAllActive} className="btn-secondary btn-sm">Archive all</button>
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
            <Bucket title="Tagged in edits" subtitle="Items where someone explicitly notified you." rows={tagged} onVisit={visit} onArchive={archiveOne} />
            <Bucket title="My edits" subtitle="Notifications about items you edited." rows={mine} onVisit={visit} onArchive={archiveOne} />

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

function Bucket({ title, subtitle, rows, onVisit, onArchive, archived = false }) {
  if (rows.length === 0) return null
  return (
    <section className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-100">
        <h2 className="text-sm font-semibold text-ink-900">{title} <span className="text-xs text-ink-400 font-normal">· {rows.length}</span></h2>
        {subtitle && <p className="text-xs text-ink-400 mt-0.5">{subtitle}</p>}
      </div>
      <ul className="divide-y divide-surface-100">
        {rows.map(n => (
          <li
            key={n.id}
            className={`px-4 py-3 flex items-start gap-3 ${n.read_at ? 'bg-white' : 'bg-brand-50/30'}`}
          >
            {!n.read_at && <span className="mt-2 w-2 h-2 rounded-full bg-brand-500 flex-shrink-0" aria-label="Unread" />}
            <div className={`flex-1 min-w-0 ${n.read_at ? 'ml-5' : ''}`}>
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
