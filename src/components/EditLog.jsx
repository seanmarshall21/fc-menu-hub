import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'

export default function EditLog({ menuId, onApproveAll, onChange, canApprove = false }) {
  const { session, isAdmin } = useAuth()
  const user = session?.user
  // canApprove is passed in by MenuPage from the cascading edit-approver list

  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(new Set())
  const [busyId, setBusyId] = useState(null)
  const [showArchived, setShowArchived] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    // 1) Pull raw edit_log rows for this menu — embedding the menu_items join
    //    has been unreliable (Supabase relationship guess sometimes drops the
    //    embedded value), so we hydrate it separately.
    const { data: rows, error: logErr } = await supabase
      .from('edit_log')
      .select('*')
      .eq('menu_id', menuId)
      .order('created_at', { ascending: false })
      .limit(200)
    if (logErr) {
      console.error('EditLog: edit_log query failed', logErr)
      setLogs([]); setLoading(false); return
    }
    const list = rows || []

    // 2) Hydrate joined menu_items (title + current edit_status)
    const itemIds = [...new Set(list.map(r => r.menu_item_id).filter(Boolean))]
    if (itemIds.length) {
      const { data: items } = await supabase
        .from('menu_items')
        .select('id, title, edit_status')
        .in('id', itemIds)
      const map = new Map((items || []).map(i => [i.id, i]))
      list.forEach(r => { r.menu_item = map.get(r.menu_item_id) || null })
    }

    // 3) Hydrate user names from user_profiles (fall back to email if no name)
    const userIds = [...new Set(list.map(r => r.user_id).filter(Boolean))]
    if (userIds.length) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, full_name, email')
        .in('id', userIds)
      const map = new Map((profiles || []).map(p => [p.id, p]))
      list.forEach(r => { r.user_profile = map.get(r.user_id) || null })
    }

    setLogs(list)
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

  // Selection is tracked by menu_item_id (approve/reject operate per item;
  // a single item can have several edit_log rows).
  const [selected, setSelected] = useState(new Set())
  function toggleSelect(itemId) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId)
      return next
    })
  }
  const [batchBusy, setBatchBusy] = useState(false)

  async function approveItem(menuItemId) {
    setBusyId(menuItemId)
    try {
      await supabase.from('menu_items').update({ edit_status: 'approved' }).eq('id', menuItemId)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  // Core reject logic, no confirm — reused by single + batch reject.
  async function rejectItemCore(menuItemId) {
    const { data: pendingLogs } = await supabase
      .from('edit_log')
      .select('id, field_changed, old_value, note, created_at')
      .eq('menu_item_id', menuItemId)
      .is('archived_at', null)
      .order('created_at', { ascending: true })
    const revertable = new Set(['title','description','price1','size1','price2','size2','status'])
    const revertMap = {}
    for (const log of (pendingLogs || [])) {
      if (!revertable.has(log.field_changed)) continue
      if (!(log.field_changed in revertMap)) {
        revertMap[log.field_changed] = log.old_value === '' ? null : log.old_value
      }
    }
    await supabase.from('menu_items')
      .update({ ...revertMap, edit_status: 'active', last_edited_at: null, last_edited_by: null })
      .eq('id', menuItemId)
    for (const log of (pendingLogs || [])) {
      const tagged = log.note
        ? (log.note.includes('[rejected]') ? log.note : `${log.note} [rejected]`)
        : '[rejected]'
      await supabase.from('edit_log').update({ note: tagged }).eq('id', log.id)
    }
  }

  async function batchApproveSelected() {
    if (selected.size === 0) return
    setBatchBusy(true)
    try {
      await supabase.from('menu_items').update({ edit_status: 'approved' }).in('id', [...selected])
      setSelected(new Set())
      await load(); onChange?.()
    } finally { setBatchBusy(false) }
  }

  async function batchRejectSelected() {
    if (selected.size === 0) return
    if (!confirm(`Reject edits on ${selected.size} item${selected.size === 1 ? '' : 's'}? Each reverts to its pre-edit values. This cannot be undone.`)) return
    setBatchBusy(true)
    try {
      for (const id of selected) await rejectItemCore(id)
      setSelected(new Set())
      await load(); onChange?.()
    } finally { setBatchBusy(false) }
  }

  async function rejectItem(menuItemId) {
    if (!confirm('Reject these edits? The item will be reverted to its pre-edit values. This cannot be undone.')) return
    setBusyId(menuItemId)
    try {
      // Pull every pending edit-log row for this item (each row = one field's
      // old → new transition). Walk them oldest-first and capture the EARLIEST
      // old_value seen per field — that's the value before any pending edits
      // started piling up, which is what we restore.
      const { data: pendingLogs } = await supabase
        .from('edit_log')
        .select('id, field_changed, old_value, note, created_at')
        .eq('menu_item_id', menuItemId)
        .is('archived_at', null)
        .order('created_at', { ascending: true })

      const revertable = new Set(['title','description','price1','size1','price2','size2','status'])
      const revertMap = {}
      for (const log of (pendingLogs || [])) {
        if (!revertable.has(log.field_changed)) continue
        if (!(log.field_changed in revertMap)) {
          revertMap[log.field_changed] = log.old_value === '' ? null : log.old_value
        }
      }

      // If we found prior values, revert them. Either way, clear the pending
      // state so the item drops back to whatever it was before.
      const update = { ...revertMap, edit_status: 'active', last_edited_at: null, last_edited_by: null }
      await supabase.from('menu_items').update(update).eq('id', menuItemId)

      // Mark the rejected log rows so the history shows they were denied
      // instead of silently disappearing. We use phase_at_edit since there's
      // no dedicated outcome column; UI key is the menu_item.edit_status.
      // Tag each rejected log row in the existing note column so the history
      // shows it was denied. Preserve any pre-existing reviewer note.
      for (const log of (pendingLogs || [])) {
        const tagged = log.note
          ? (log.note.includes('[rejected]') ? log.note : `${log.note} [rejected]`)
          : '[rejected]'
        await supabase.from('edit_log').update({ note: tagged }).eq('id', log.id)
      }

      await load()
    } finally {
      setBusyId(null)
    }
  }

  async function saveNote(logId, note) {
    await supabase.from('edit_log').update({ note: note || null }).eq('id', logId)
    setLogs(prev => prev.map(l => l.id === logId ? { ...l, note: note || null } : l))
  }

  async function archiveLog(logId) {
    await supabase.from('edit_log').update({
      archived_at: new Date().toISOString(),
      archived_by: user?.id || null,
    }).eq('id', logId)
    await load()
  }
  async function unarchiveLog(logId) {
    await supabase.from('edit_log').update({ archived_at: null, archived_by: null }).eq('id', logId)
    await load()
  }
  async function deleteLog(logId) {
    if (!confirm('Permanently delete this log entry? This cannot be undone.')) return
    await supabase.from('edit_log').delete().eq('id', logId)
    await load()
  }
  async function redactLog(logId) {
    if (!confirm('Redact your own values from this log entry? The row stays but old/new values + note are blanked.')) return
    await supabase.from('edit_log').update({
      old_value: null, new_value: null, note: null,
      redacted_at: new Date().toISOString(),
      redacted_by: user?.id || null,
    }).eq('id', logId)
    await load()
  }

  if (loading) return <div className="text-sm text-ink-400">Loading log…</div>
  if (logs.length === 0) return <div className="text-sm text-ink-400">No edits logged yet.</div>

  // Group: active by status, plus archived bucket. Archived rows never appear
  // in the status buckets — they live in their own collapsible section.
  const active      = logs.filter(l => !l.archived_at)
  const archived    = logs.filter(l => l.archived_at)
  const pending     = active.filter(l => l.menu_item?.edit_status === 'pending_approval')
  const approved    = active.filter(l => l.menu_item?.edit_status === 'approved')
  const rejected    = active.filter(l => l.menu_item?.edit_status === 'rejected')
  const historical  = active.filter(l => !['pending_approval', 'approved', 'rejected'].includes(l.menu_item?.edit_status))

  // Approval is per ITEM (menu_items.edit_status), but the log shows one row
  // per field change — so an item edited in N fields has N pending rows.
  // Group them so each item's Approve/Reject shows ONCE (on its first row),
  // making it obvious the action covers all of that item's edits.
  const pendingGrouped = (() => {
    const groups = new Map()
    for (const r of pending) {
      const k = r.menu_item_id || r.id
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k).push(r)
    }
    const out = []
    for (const rows of groups.values()) {
      rows.forEach((r, idx) => { r._firstOfItem = idx === 0; r._groupCount = rows.length })
      out.push(...rows)
    }
    return out
  })()

  function renderTable(rows, headingLabel, colorClass, extra = null, headless = false, selectable = false) {
    if (rows.length === 0) return null
    // Distinct selectable items in this bucket (for the select-all checkbox).
    const itemIdsHere = [...new Set(rows.map(r => r.menu_item?.id).filter(Boolean))]
    const allSelected = selectable && itemIdsHere.length > 0 && itemIdsHere.every(id => selected.has(id))
    // When wrapped in <Accordion>, skip our own card+header — the accordion
    // supplies both. Keeps double-shells from stacking up.
    const Wrap = headless ? 'div' : 'div'
    return (
      <Wrap className={headless ? '' : 'card overflow-hidden'}>
        {!headless && (
          <div className={`px-4 py-2.5 border-b border-surface-100 flex items-center justify-between gap-2 ${colorClass}`}>
            <h3 className="text-xs font-semibold uppercase tracking-wider">{headingLabel}</h3>
            <div className="flex items-center gap-2">
              {extra}
              <span className="text-xs opacity-70">{rows.length}</span>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="border-b border-surface-100 bg-surface-50">
                {selectable && (
                  <th className="pl-3 pr-1 py-2.5 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => {
                        setSelected(prev => {
                          const next = new Set(prev)
                          if (allSelected) itemIdsHere.forEach(id => next.delete(id))
                          else itemIdsHere.forEach(id => next.add(id))
                          return next
                        })
                      }}
                      className="rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                      title="Select all"
                    />
                  </th>
                )}
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
                  {selectable && (
                    <td className="pl-3 pr-1 py-2.5">
                      {log.menu_item?.id && (
                        <input
                          type="checkbox"
                          checked={selected.has(log.menu_item.id)}
                          onChange={() => toggleSelect(log.menu_item.id)}
                          className="rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                        />
                      )}
                    </td>
                  )}
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
                    {log.menu_item?.title
                      ?? (log.field_changed === 'sponsor'
                          ? <span className="text-ink-500 italic">Menu sponsors</span>
                          : <span className="text-ink-300 italic">deleted item</span>)}
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
                    {log.redacted_at && (
                      <div className="mt-1 text-[10px] text-ink-400 italic">redacted by author</div>
                    )}
                    {isOpen && canApprove && !log.redacted_at && (
                      <NoteEditor logId={log.id} initial={log.note || ''} onSave={(v) => saveNote(log.id, v)} />
                    )}
                    {!isOpen && log.note && (
                      <div className="mt-1 text-[11px] text-ink-500 italic truncate max-w-[260px]" title={log.note}>
                        📝 {log.note}
                      </div>
                    )}
                    {isOpen && canApprove && (
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                        {!log.archived_at ? (
                          <button onClick={() => archiveLog(log.id)} className="text-ink-500 hover:text-ink-700">
                            Archive
                          </button>
                        ) : (
                          <button onClick={() => unarchiveLog(log.id)} className="text-ink-500 hover:text-ink-700">
                            Unarchive
                          </button>
                        )}
                        {log.user_id === user?.id && !itemApproved && !log.redacted_at && (
                          <button onClick={() => redactLog(log.id)} className="text-amber-700 hover:text-amber-900" title="Blank out your own old/new values + note">
                            Redact mine
                          </button>
                        )}
                        {isAdmin && (
                          <button onClick={() => deleteLog(log.id)} className="text-red-600 hover:text-red-800">
                            Delete
                          </button>
                        )}
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
                        log._firstOfItem === false ? (
                          <span className="text-[10px] text-ink-300 italic" title="Part of the same item — approve/reject from its first row above">↳ same item</span>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => approveItem(log.menu_item.id)}
                              disabled={isBusy}
                              className="text-xs px-2 py-0.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 whitespace-nowrap"
                              title={log._groupCount > 1 ? `Approve all ${log._groupCount} pending edits on this item` : 'Approve this edit'}
                            >
                              ✓ Approve{log._groupCount > 1 ? ` (${log._groupCount})` : ''}
                            </button>
                            <button
                              onClick={() => rejectItem(log.menu_item.id)}
                              disabled={isBusy}
                              className="text-xs px-2 py-0.5 rounded-md bg-surface-0 border border-surface-200 text-ink-500 hover:text-red-600"
                              title={log._groupCount > 1 ? `Reject all ${log._groupCount} edits on this item` : 'Reject this edit'}
                            >
                              ✕
                            </button>
                          </div>
                        )
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
      </Wrap>
    )
  }

  return (
    <div className="space-y-3">
      {/* Pending is the only one open by default — that's what reviewers want
          to act on. Approved / Rejected / History collapse to save vertical
          space; click the chevron to expand. */}
      <Accordion
        title="Pending approval"
        count={pending.length}
        defaultOpen={true}
        headColor="bg-amber-50 text-amber-800 border-amber-200"
        extra={canApprove && onApproveAll && pending.length > 0 && (
          <button
            onClick={async (e) => { e.stopPropagation(); await onApproveAll(); onChange?.() }}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 whitespace-nowrap"
          >
            ✓ Approve all
          </button>
        )}
      >
        {/* Batch action bar — appears when items are selected via checkboxes */}
        {canApprove && selected.size > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-brand-50 border-b border-brand-100 flex-wrap">
            <span className="text-xs font-medium text-ink-700">{selected.size} selected</span>
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={batchApproveSelected} disabled={batchBusy}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 whitespace-nowrap flex-shrink-0 disabled:opacity-50">
                {batchBusy ? 'Working…' : `✓ Approve ${selected.size}`}
              </button>
              <button onClick={batchRejectSelected} disabled={batchBusy}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-surface-0 border border-red-200 text-red-600 hover:bg-red-50 whitespace-nowrap flex-shrink-0 disabled:opacity-50">
                ✕ Reject {selected.size}
              </button>
              <button onClick={() => setSelected(new Set())} disabled={batchBusy}
                className="text-[11px] text-ink-500 hover:text-ink-700 whitespace-nowrap flex-shrink-0">
                Clear
              </button>
            </div>
          </div>
        )}
        {renderTable(pendingGrouped, 'Pending approval', 'bg-amber-50 text-amber-800', null, /*headless*/ true, /*selectable*/ canApprove)}
      </Accordion>

      <Accordion title="Approved" count={approved.length} defaultOpen={false} headColor="bg-emerald-50 text-emerald-800 border-emerald-200">
        {renderTable(approved, 'Approved', 'bg-emerald-50 text-emerald-800', null, true)}
      </Accordion>

      <Accordion title="Rejected" count={rejected.length} defaultOpen={false} headColor="bg-red-50 text-red-800 border-red-200">
        {renderTable(rejected, 'Rejected', 'bg-red-50 text-red-800', null, true)}
      </Accordion>

      <Accordion title="History" count={historical.length} defaultOpen={false} headColor="bg-surface-100 text-ink-600 border-surface-200">
        {renderTable(historical, 'History', 'bg-surface-100 text-ink-600', null, true)}
      </Accordion>

      {archived.length > 0 && (
        <Accordion title="Archived" count={archived.length} defaultOpen={false} headColor="bg-surface-200 text-ink-500 border-surface-300">
          {renderTable(archived, 'Archived', 'bg-surface-200 text-ink-500', null, true)}
        </Accordion>
      )}
    </div>
  )
}

// Collapsible section wrapper. The button shows the title + count and
// flips a chevron; children render only when open.
function Accordion({ title, count, defaultOpen, headColor, extra, children }) {
  const [open, setOpen] = useState(!!defaultOpen)
  // Hide the whole accordion when there's nothing in it.
  if (!count || count === 0) return null
  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full px-4 py-2.5 border-b border-transparent flex items-center justify-between gap-2 text-left ${headColor} ${open ? 'border-b-current/10' : ''}`}
      >
        <div className="flex items-center gap-2">
          <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <h3 className="text-xs font-semibold uppercase tracking-wider">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {extra}
          <span className="text-xs opacity-70">{count}</span>
        </div>
      </button>
      {open && <div>{children}</div>}
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
