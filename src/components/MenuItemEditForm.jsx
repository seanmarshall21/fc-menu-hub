import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

const STATUS_OPTIONS = ['active', 'not_added', 'draft']
const STATUS_LABELS  = { active: 'Active', not_added: 'Not Added', draft: 'Draft' }
const LAYOUT_OPTIONS = [
  { value: 'main', label: 'Main — title, description, dietary, price' },
  { value: 'alt',  label: 'Alt — title and price only' },
]

/**
 * Self-contained edit form for a menu item — shared between the desktop
 * inline-edit row (MenuItemRow) and the mobile card edit modal (MenuItemCard).
 * Renders just the form body + actions; the caller frames it (in a <td colSpan>,
 * a <Modal>, etc).
 *
 * Calls onSaved() after a successful save or delete so the caller can refresh.
 * Calls onCancel() when the user dismisses.
 */
export default function MenuItemEditForm({ item, menu, sections, onSaved, onCancel }) {
  const { profile } = useAuth()
  const [form, setForm] = useState({ ...item })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saveError, setSaveError] = useState(null)

  async function save() {
    setSaving(true); setSaveError(null)
    try {
      const changes = {}
      const logEntries = []
      const fields = ['title','description','price1','size1','price2','size2','status','notes','vt','ve','gf','two_sizes','section','layout']
      for (const field of fields) {
        if (form[field] !== item[field]) {
          changes[field] = form[field]
          if (['title','description','price1','size1','price2','size2','status'].includes(field)) {
            logEntries.push({ field, old: String(item[field] || ''), new: String(form[field] || '') })
          }
        }
      }
      if (Object.keys(changes).length === 0) { onCancel?.(); return }
      if (profile?.id) changes.last_edited_by = profile.id
      changes.last_edited_at = new Date().toISOString()
      changes.edit_status = 'pending_approval'
      const { error: updateErr } = await supabase.from('menu_items').update(changes).eq('id', item.id)
      if (updateErr) {
        const { title, description, price1, size1, price2, size2, status, notes, vt, ve, gf, two_sizes, section, layout } = changes
        const core = Object.fromEntries(
          Object.entries({ title, description, price1, size1, price2, size2, status, notes, vt, ve, gf, two_sizes, section, layout })
            .filter(([, v]) => v !== undefined)
        )
        const { error: retryErr } = await supabase.from('menu_items').update(core).eq('id', item.id)
        if (retryErr) throw retryErr
      }
      for (const e of logEntries) {
        supabase.rpc('log_menu_item_edit', {
          p_item_id: item.id, p_menu_id: menu.id,
          p_field: e.field, p_old_value: e.old, p_new_value: e.new, p_phase: menu.phase,
        }).then(() => {}, () => {})
      }
      onSaved?.()
    } catch (e) {
      setSaveError(e?.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${item.title}"?`)) return
    setDeleting(true)
    try {
      await supabase.from('menu_items').delete().eq('id', item.id)
      onSaved?.()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
        <div>
          <label className="label">Layout</label>
          <select className="input" value={form.layout || 'main'} onChange={e => setForm(f => ({ ...f, layout: e.target.value }))}>
            {LAYOUT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Section</label>
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

      {form.layout !== 'alt' && (
        <div className="mb-3">
          <label className="label">Description</label>
          <textarea className="input" rows={2} spellCheck value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
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

      <div className="mb-3">
        <label className="label">Notes <span className="text-ink-400 font-normal">(internal only)</span></label>
        <textarea className="input text-xs" rows={2} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Internal notes — not shown on the menu" />
      </div>

      {saveError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{saveError}</p>
      )}

      <div className="flex items-center justify-between gap-2 pt-3 border-t border-surface-200">
        <button onClick={handleDelete} disabled={deleting || saving} className="text-xs text-red-500 hover:text-red-700 font-medium">
          {deleting ? 'Deleting…' : 'Delete item'}
        </button>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="btn-secondary btn-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary btn-sm">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
