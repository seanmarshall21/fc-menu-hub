import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

const STATUS_OPTIONS = ['active', 'not_added', 'draft']
const STATUS_LABELS  = { active: 'Active', not_added: 'Not Added', draft: 'Draft' }
const STATUS_CLASSES = {
  active:    'text-emerald-700 bg-emerald-50',
  not_added: 'text-ink-400 bg-surface-100',
  draft:     'text-amber-700 bg-amber-50',
}
const LAYOUT_OPTIONS = [
  { value: 'main', label: 'Main — title, description, dietary, price' },
  { value: 'alt',  label: 'Alt — title and price only' },
]

export default function MenuItemRow({ item, menu, canEdit, onUpdated, sections, onMoveUp, onMoveDown, isFirst, isLast }) {
  const { profile } = useAuth()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ ...item })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [deleting, setDeleting] = useState(false)

  async function save() {
    setSaving(true)
    setSaveError(null)
    const changes = {}
    const logEntries = []
    const fields = ['title', 'description', 'price1', 'size1', 'price2', 'size2', 'status', 'notes', 'vt', 've', 'gf', 'two_sizes', 'section', 'layout']

    for (const field of fields) {
      if (form[field] !== item[field]) {
        changes[field] = form[field]
        if (['title','description','price1','size1','price2','size2','status'].includes(field)) {
          logEntries.push({ field, old: String(item[field] || ''), new: String(form[field] || '') })
        }
      }
    }

    if (Object.keys(changes).length === 0) { setEditing(false); setSaving(false); return }

    // Only add tracking fields if they exist — avoids silent failure if columns missing
    if (profile?.id) changes.last_edited_by = profile.id
    changes.last_edited_at = new Date().toISOString()
    changes.edit_status = 'pending_approval'

    const { error: updateErr } = await supabase.from('menu_items').update(changes).eq('id', item.id)
    if (updateErr) {
      // Retry without tracking fields in case schema differs
      const { title, description, price1, size1, price2, size2, status, notes, vt, ve, gf, two_sizes, section, layout } = changes
      const coreChanges = Object.fromEntries(
        Object.entries({ title, description, price1, size1, price2, size2, status, notes, vt, ve, gf, two_sizes, section, layout })
          .filter(([, v]) => v !== undefined)
      )
      const { error: retryErr } = await supabase.from('menu_items').update(coreChanges).eq('id', item.id)
      if (retryErr) { setSaveError(retryErr.message); setSaving(false); return }
    }

    // Log edits (non-blocking — ignore errors)
    for (const entry of logEntries) {
      supabase.rpc('log_menu_item_edit', {
        p_item_id: item.id, p_menu_id: menu.id,
        p_field: entry.field, p_old_value: entry.old, p_new_value: entry.new, p_phase: menu.phase,
      }).catch(() => {})
    }

    setSaving(false); setEditing(false); onUpdated()
  }

  async function handleDelete() {
    if (!confirm(`Delete "${item.title}"?`)) return
    setDeleting(true)
    await supabase.from('menu_items').delete().eq('id', item.id)
    onUpdated()
  }

  function cancel() { setForm({ ...item }); setEditing(false) }

  const pendingFlag = item.edit_status === 'pending_approval'

  if (!editing) {
    return (
      <tr className={`table-row-hover ${pendingFlag ? 'bg-red-50' : ''}`}>
        <td className="px-4 py-3 min-w-[140px]">
          <div className="flex items-start gap-1.5">
            {canEdit && (
              <div className="flex flex-col flex-shrink-0 mt-0.5 -ml-1">
                <button
                  onClick={onMoveUp} disabled={isFirst}
                  className="text-ink-200 hover:text-brand-400 disabled:opacity-0 disabled:cursor-default leading-none py-0.5 px-1 text-[10px]"
                  title="Move up"
                >▲</button>
                <button
                  onClick={onMoveDown} disabled={isLast}
                  className="text-ink-200 hover:text-brand-400 disabled:opacity-0 disabled:cursor-default leading-none py-0.5 px-1 text-[10px]"
                  title="Move down"
                >▼</button>
              </div>
            )}
            {pendingFlag && <span className="mt-0.5 w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="Pending approval" />}
            <div>
              <span className="font-medium text-ink-900">{item.title}</span>
              {item.layout === 'alt' && (
                <span className="ml-1.5 text-xs text-ink-300 font-normal">alt</span>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-ink-500 max-w-xs">
          {item.layout === 'main' ? (item.description || '—') : <span className="text-ink-300 italic text-xs">alt layout</span>}
        </td>
        <td className="px-4 py-3 text-center whitespace-nowrap">
          {item.layout === 'main' && (
            <span className="text-xs text-ink-400 space-x-1">
              {item.vt && <span className="bg-emerald-100 text-emerald-700 rounded px-1">VT</span>}
              {item.ve && <span className="bg-emerald-100 text-emerald-700 rounded px-1">VE</span>}
              {item.gf && <span className="bg-amber-100 text-amber-700 rounded px-1">GF</span>}
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-ink-700 text-xs whitespace-nowrap">
          {item.two_sizes ? (
            <span>{item.size1} <b>{item.price1}</b> / {item.size2} <b>{item.price2}</b></span>
          ) : (
            <span>{item.size1} <b>{item.price1}</b></span>
          )}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLASSES[item.status] || ''}`}>
              {STATUS_LABELS[item.status] || item.status}
            </span>
            {canEdit && (
              <>
                <button onClick={() => { setForm({ ...item }); setEditing(true) }} className="text-xs text-brand-500 hover:text-brand-700 font-medium">Edit</button>
                <button onClick={handleDelete} disabled={deleting} className="text-xs text-red-400 hover:text-red-600 font-medium">{deleting ? '…' : 'Del'}</button>
              </>
            )}
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="bg-brand-50">
      <td colSpan={5} className="px-4 py-4">
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <label className="label">Title</label>
            <input className="input" spellCheck value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <label className="label">Layout</label>
            <select className="input" value={form.layout || 'main'} onChange={e => setForm(f => ({ ...f, layout: e.target.value }))}>
              {LAYOUT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Section</label>
            <div className="flex gap-2">
              <input
                className="input"
                list="sections-list"
                value={form.section || ''}
                onChange={e => setForm(f => ({ ...f, section: e.target.value }))}
                placeholder="Section name"
                spellCheck
              />
              <datalist id="sections-list">
                {(sections || []).map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
          </div>
        </div>

        {form.layout !== 'alt' && (
          <div className="mb-3">
            <label className="label">Description</label>
            <textarea className="input" rows={2} spellCheck value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
        )}

        <div className="grid grid-cols-4 gap-3 mb-3">
          <div>
            <label className="label">Size 1</label>
            <input className="input" value={form.size1 || ''} onChange={e => setForm(f => ({ ...f, size1: e.target.value }))} />
          </div>
          <div>
            <label className="label">Price 1</label>
            <input className="input" value={form.price1 || ''} onChange={e => setForm(f => ({ ...f, price1: e.target.value }))} />
          </div>
          <div>
            <label className="label">Size 2</label>
            <input className="input" value={form.size2 || ''} onChange={e => setForm(f => ({ ...f, size2: e.target.value }))} disabled={!form.two_sizes} />
          </div>
          <div>
            <label className="label">Price 2</label>
            <input className="input" value={form.price2 || ''} onChange={e => setForm(f => ({ ...f, price2: e.target.value }))} disabled={!form.two_sizes} />
          </div>
        </div>

        <div className="flex items-center gap-4 mb-4 text-sm flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="rounded" checked={!!form.two_sizes} onChange={e => setForm(f => ({ ...f, two_sizes: e.target.checked }))} />
            Two sizes
          </label>
          {form.layout !== 'alt' && (
            <>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded" checked={!!form.vt} onChange={e => setForm(f => ({ ...f, vt: e.target.checked }))} />
                VT
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded" checked={!!form.ve} onChange={e => setForm(f => ({ ...f, ve: e.target.checked }))} />
                VE
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded" checked={!!form.gf} onChange={e => setForm(f => ({ ...f, gf: e.target.checked }))} />
                GF
              </label>
            </>
          )}
        </div>

        {saveError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{saveError}</p>
        )}

        <div className="flex items-center gap-2">
          <button onClick={save} disabled={saving} className="btn-primary btn-sm">{saving ? 'Saving…' : 'Save'}</button>
          <button onClick={cancel} className="btn-secondary btn-sm">Cancel</button>
        </div>
      </td>
    </tr>
  )
}
