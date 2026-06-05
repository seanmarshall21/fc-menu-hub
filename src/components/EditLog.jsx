import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'

export default function EditLog({ menuId, onApproveAll, onChange }) {
  const { isAdmin, isInternal } = useAuth()
  const canApprove = isAdmin || isInternal

  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(new Set())
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('edit_log')
      .select('*, menu_item:menu_items(id, title, edit_status)')
      .eq('menu_id', menuId)
      .order('created_at', { ascending: false })
      .limit(200)
    const rows = data || []
    // Hydrate display names from user_profiles (fall back to email if no name)
    const ids = [...new Set(rows.map(r => r.user_id).filter(Boolean))]
    if (ids.length) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, full_name, email')
        .in('id', ids)
      const map = new Map((profiles || []).map(p => [p.id, p]))
      rows.forEach(r => { r.user_profile = map.get(r.user_id) || null })
    }
    setLogs(rows)
    setLoading(false)
  }, [menuId])

  useEffect(() => { load() }, [load])

  function toggle(id) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function approveItem(menuItemId) {
    setBusyId(menuItemId)
    try {
      await supabase.from('menu_items').update({ edit_status: 'approved' }).eq('id', menuItemId)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  async function rejectItem(menuItemId) {
    if (!confirm('Mark this edit as rejected? The item stays as-is and the change is logged as not approved.')) return
    setBusyId(menuItemId)
    try {
      await supabase.from('menu_items').update({ edit_status: 'rejected' }).eq('id', menuItemId)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  async function saveNote(logId, note) {
    await supabase.from('edit_log').update({ note: note || null }).eq('id', logId)
    setLogs(prev => prev.map(l => l.id === logId ? { ...l, note: note || null } : l))
  }

  if (loading) return <div className="text-sm text-ink-400">Loading log…</div>
  if (logs.length === 0) return <div className="text-sm text-ink-400">No edits logged yet.</div>

  // Group: pending / approved / rejected / other
  const pending     = logs.filter(l => l.menu_item?.edit_status === 'pending_approval')
  const approved    = logs.filter(l => l.menu_item?.edit_status === 'approved')
  const rejected    = logs.filter(l => l.menu_item?.edit_status === 'rejected')
  const historical  = logs.filter(l => !['pending_approval', 'approved', 'rejected'].includes(l.menu_item?.edit_status))

  function renderTable(rows, headingLabel, colorClass, extra = null) {
    if (rows.length === 0) return null
    return (
      <div className="card overflow-hidden">
        <div className={`px-4 py-2.5 border-b border-surface-100 flex items-center justify-between gap-2 ${colorClass}`}>
          <h3 className="text-xs font-semibold uppercase tracking-wider">{headingLabel}</h3>
          <div className="flex items-center gap-2">
            {extra}
            <span className="text-xs opacity-70">{rows.length}</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="border-b border-surface-100 bg-surface-50">
                <th className="px-3 sm:px-4 py-2.5 text-left text-xs font-medium text-ink-400">When</th>
                <th className="px-3 sm:px-4 py-2.5 text-left text-xs font-medium text-ink-400">By</th>
                <th className="px-3 sm:px-4 py-2.5 text-left text-xs font-medium text-ink-400">Item</th>
                <th className="px-3 sm:px-4 py-2.5 text-left text-xs font-medium text-ink-400">Field</th>
                <th className="px-3 sm:px-4 py-2.5 text-left text-xs font-medium text-ink-400">Change</th>
                <th className="px-3 sm:px-4 py-2.5 text-left text-xs font-medium text-ink-400">Phase</th>
                {canApprove && <th className="px-3 sm:px-4 py-2.5 text-right text-xs font-medium text-ink-400">Status</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {rows.map(log => {
              const isOpen = expanded.has(log.id)
              const itemPending = log.menu_item?.edit_status === 'pending_approval'
              const itemApproved = log.menu_item?.edit_status === 'approved'
              const isBusy = busyId === log.menu_item?.id
              return (
                <tr key={log.id} className="table-row-hover align-top">
                  <td className="px-3 sm:px-4 py-2.5 text-xs text-ink-500 whitespace-nowrap">
                    <div className="font-medium text-ink-700">{format(new Date(log.created_at), 'MMM d, yyyy')}</div>
                    <div className="text-ink-400 text-[11px]">{format(new Date(log.created_at), 'h:mma').toLowerCase()}</div>
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 text-xs whitespace-nowrap">
                    <div className="text-ink-700 font-medium">{log.user_profile?.full_name || log.user_email || '—'}</div>
                    {log.user_profile?.full_name && log.user_email && (
                      <div className="text-ink-400 text-[11px]">{log.user_email}</div>
                    )}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 font-medium text-ink-900 whitespace-nowrap">
                    {log.menu_item?.title ?? <span className="text-ink-300 italic">deleted item</span>}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 text-xs font-mono text-ink-500 whitespace-nowrap">{log.field_changed}</td>
                  <td className="px-3 sm:px-4 py-2.5 text-xs min-w-[260px]">
                    <button
                      onClick={() => toggle(log.id)}
                      className="w-full text-left hover:underline"
                      title={isOpen ? 'Collapse' : 'Show full text'}
                    >
                      <div className={`text-red-600 ${isOpen ? '' : 'truncate max-w-[260px]'}`}>
                        <span className="text-ink-300 mr-1">−</span>
                        {log.old_value || <span className="text-ink-300">—</span>}
                      </div>
                      <div className={`text-emerald-700 mt-0.5 ${isOpen ? '' : 'truncate max-w-[260px]'}`}>
                        <span className="text-ink-300 mr-1">+</span>
                        {log.new_value || <span className="text-ink-300">—</span>}
                      </div>
                    </button>
                    {isOpen && canApprove && (
                      <NoteEditor logId={log.id} initial={log.note || ''} onSave={(v) => saveNote(log.id, v)} />
                    )}
                    {!isOpen && log.note && (
                      <div className="mt-1 text-[11px] text-ink-500 italic truncate max-w-[260px]" title={log.note}>
                        📝 {log.note}
                      </div>
                    )}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 text-xs capitalize text-ink-400 whitespace-nowrap">
                    {log.phase_at_edit?.replace('_', ' ')}
                  </td>
                  {canApprove && (
                    <td className="px-3 sm:px-4 py-2.5 text-right whitespace-nowrap">
                      {!log.menu_item ? (
                        <span className="text-[10px] text-ink-300 italic">deleted</span>
                      ) : itemPending ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => approveItem(log.menu_item.id)}
                            disabled={isBusy}
                            className="text-xs px-2 py-0.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
                          >
                            ✓ Approve
                          </button>
                          <button
                            onClick={() => rejectItem(log.menu_item.id)}
                            disabled={isBusy}
                            className="text-xs px-2 py-0.5 rounded-md bg-white border border-surface-200 text-ink-500 hover:text-red-600"
                            title="Reject this edit"
                          >
                            ✕
                          </button>
                        </div>
                      ) : itemApproved ? (
                        <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">approved</span>
                      ) : log.menu_item?.edit_status === 'rejected' ? (
                        <span className="text-[10px] font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">rejected</span>
                      ) : (
                        <span className="text-[10px] text-ink-300">clean</span>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
        <p className="text-[11px] text-ink-400 px-4 py-2 border-t border-surface-100">Tap a change row to expand long values.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {renderTable(pending, 'Pending approval', 'bg-amber-50 text-amber-800', onApproveAll && (
        <button
          onClick={async () => { await onApproveAll(); onChange?.() }}
          className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
        >
          ✓ Approve all
        </button>
      ))}
      {renderTable(approved,   'Approved',         'bg-emerald-50 text-emerald-800')}
      {renderTable(rejected,   'Rejected',         'bg-red-50 text-red-800')}
      {renderTable(historical, 'History',          'bg-surface-100 text-ink-600')}
    </div>
  )
}

function NoteEditor({ logId, initial, onSave }) {
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const dirty = value !== initial

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(value)
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-2">
      <label className="block text-[10px] text-ink-400 uppercase tracking-wider mb-1">Reviewer note</label>
      <textarea
        className="input input-sm text-xs w-full"
        rows={2}
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Why is this edit being made? Or why is it rejected?"
      />
      {dirty && (
        <div className="flex items-center gap-2 mt-1">
          <button onClick={handleSave} disabled={saving} className="text-[11px] text-brand-600 hover:text-brand-700 font-medium">
            {saving ? 'Saving…' : 'Save note'}
          </button>
          <button onClick={() => setValue(initial)} className="text-[11px] text-ink-400">Cancel</button>
        </div>
      )}
      {saved && !dirty && <span className="text-[11px] text-emerald-600">Saved.</span>}
    </div>
  )
}
