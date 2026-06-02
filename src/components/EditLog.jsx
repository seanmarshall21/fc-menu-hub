import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'

export default function EditLog({ menuId }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('edit_log')
      .select('*, menu_item:menu_items(title)')
      .eq('menu_id', menuId)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setLogs(data || [])
        setLoading(false)
      })
  }, [menuId])

  if (loading) return <div className="text-sm text-ink-400">Loading log…</div>
  if (logs.length === 0) return <div className="text-sm text-ink-400">No edits logged yet.</div>

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-100 bg-surface-50">
            <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-400">When</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-400">By</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-400">Item</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-400">Field</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-400">Before</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-400">After</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-400">Phase</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-100">
          {logs.map(log => (
            <tr key={log.id} className="table-row-hover">
              <td className="px-4 py-2.5 text-xs text-ink-400 whitespace-nowrap">
                {format(new Date(log.created_at), 'MMM d, h:mma')}
              </td>
              <td className="px-4 py-2.5 text-xs text-ink-500 whitespace-nowrap">{log.user_email}</td>
              <td className="px-4 py-2.5 font-medium text-ink-900">
                {log.menu_item?.title ?? <span className="text-ink-300 italic">deleted item</span>}
              </td>
              <td className="px-4 py-2.5 text-xs font-mono text-ink-500">{log.field_changed}</td>
              <td className="px-4 py-2.5 text-xs text-red-600 max-w-xs truncate">{log.old_value || '—'}</td>
              <td className="px-4 py-2.5 text-xs text-emerald-700 max-w-xs truncate">{log.new_value || '—'}</td>
              <td className="px-4 py-2.5 text-xs capitalize text-ink-400">{log.phase_at_edit?.replace('_', ' ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
