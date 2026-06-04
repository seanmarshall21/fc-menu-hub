import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'

export default function EditLog({ menuId }) {
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
    setLogs(data || [])
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

  async function revertItem(menuItemId) {
    // 'revert' here means: leave it pending but visually note the user rejected.
    // For now we just mark it clean (back to baseline) — equivalent to a soft reject.
    if (!confirm('Mark this edit as not approved? The item stays as-is but the pending flag clears.')) return
    setBusyId(menuItemId)
    try {
      await supabase.from('menu_items').update({ edit_status: 'clean' }).eq('id', menuItemId)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <div className="text-sm text-ink-400">Loading log…</div>
  if (logs.length === 0) return <div className="text-sm text-ink-400">No edits logged yet.</div>

  // Group by pending vs approved/historical
  const pending = logs.filter(l => l.menu_item?.edit_status === 'pending_approval')
  const historical = logs.filter(l => l.menu_item?.edit_status !== 'pending_approval')

  function renderTable(rows, headingLabel, colorClass) {
    if (rows.length === 0) return null
    return (
      <div className="card overflow-hidden">
        <div className={`px-4 py-2.5 border-b border-surface-100 flex items-center justify-between ${colorClass}`}>
          <h3 className="text-xs font-semibold uppercase tracking-wider">{headingLabel}</h3>
          <span className="text-xs opacity-70">{rows.length}</span>
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
                  <td className="px-3 sm:px-4 py-2.5 text-xs text-ink-400 whitespace-nowrap">
                    {format(new Date(log.created_at), 'MMM d, h:mma')}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 text-xs text-ink-500 whitespace-nowrap">{log.user_email}</td>
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
                            onClick={() => revertItem(log.menu_item.id)}
                            disabled={isBusy}
                            className="text-xs px-2 py-0.5 rounded-md bg-white border border-surface-200 text-ink-500 hover:text-red-600"
                            title="Mark as not approved (clears the pending flag)"
                          >
                            ✕
                          </button>
                        </div>
                      ) : itemApproved ? (
                        <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">approved</span>
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
      {renderTable(pending,    'Pending approval', 'bg-amber-50 text-amber-800')}
      {renderTable(historical, 'Approved & history', 'bg-emerald-50 text-emerald-800')}
    </div>
  )
}
