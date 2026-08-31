/**
 * SizesAdmin — manage the menu size list (the `size_defs` table).
 *
 * Adding a size here makes it appear everywhere a size is chosen: the menu's
 * primary-size dropdown, the "Add a size" picker on each menu, and the Event →
 * Templates upload grid. Width/height (inches) drive the render proportions
 * automatically. `figma_tokens` are the substrings the sync plugin will match
 * in a Figma frame name (used once the plugin's multi-size pass ships).
 */
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { invalidateSizeDefs } from '@/lib/sizes'
import Modal from '@/components/Modal'
import { useToast } from '@/contexts/ToastContext'

function tokenize(str) {
  return String(str || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

const BLANK = { id: '', label: '', name: '', width_in: '', height_in: '', figma_tokens: '', sort_order: 100, active: true }

export default function SizesAdmin() {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | 'new' | <existing id>
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('size_defs').select('*').order('sort_order', { ascending: true })
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function openNew() {
    setForm({ ...BLANK, sort_order: (rows.reduce((m, r) => Math.max(m, r.sort_order || 0), 0) + 10) })
    setError(null)
    setEditing('new')
  }
  function openEdit(r) {
    setForm({
      id: r.id, label: r.label || '', name: r.name || '',
      width_in: r.width_in ?? '', height_in: r.height_in ?? '',
      figma_tokens: (r.figma_tokens || []).join(', '),
      sort_order: r.sort_order ?? 100, active: r.active !== false,
    })
    setError(null)
    setEditing(r.id)
  }

  async function save(e) {
    e.preventDefault()
    setError(null)
    const isNew = editing === 'new'
    const id = isNew ? tokenize(form.id || form.name || form.label) : form.id
    if (!id) { setError('A token (id) is required — e.g. “poster-24x36”.'); return }
    const w = Number(form.width_in), h = Number(form.height_in)
    if (!(w > 0) || !(h > 0)) { setError('Width and height (inches) must be positive numbers.'); return }
    const payload = {
      id,
      label: (form.label || id).trim().toUpperCase(),
      name: form.name.trim() || null,
      width_in: w,
      height_in: h,
      figma_tokens: form.figma_tokens.split(',').map(s => s.trim()).filter(Boolean),
      sort_order: Number(form.sort_order) || 0,
      active: !!form.active,
      updated_at: new Date().toISOString(),
    }
    setSaving(true)
    try {
      // Upsert: insert a new size or update an existing one by primary key.
      const { error: err } = await supabase.from('size_defs').upsert(payload, { onConflict: 'id' })
      if (err) throw err
      invalidateSizeDefs()
      setEditing(null)
      toast('Size saved')
      load()
    } catch (err) {
      setError(err?.message || String(err))
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(r) {
    const { error: err } = await supabase.from('size_defs')
      .update({ active: !(r.active !== false), updated_at: new Date().toISOString() }).eq('id', r.id)
    if (err) { toast('Could not update', { type: 'error' }); return }
    invalidateSizeDefs()
    load()
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-sm font-semibold text-ink-900">Menu sizes</h2>
          <p className="text-sm text-ink-400 mt-0.5">
            Physical print sizes a menu can be produced in. Add one and it appears in every size picker automatically.
          </p>
        </div>
        <button onClick={openNew} className="btn-primary btn-sm gap-1.5 whitespace-nowrap flex-shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add size
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-ink-400">Loading…</p>
      ) : (
        <div className="card divide-y divide-surface-200">
          {rows.map(r => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3 flex-wrap">
              <span className="text-xs font-mono font-semibold text-ink-700 uppercase w-16 shrink-0">{r.label}</span>
              <span className="min-w-0 flex-1">
                <span className="text-sm text-ink-800">{r.name || r.id}</span>
                <span className="text-xs text-ink-400 ml-2 whitespace-nowrap">{r.width_in}" × {r.height_in}"</span>
                <span className="block text-[11px] text-ink-300 font-mono truncate">{r.id}{(r.figma_tokens || []).length ? ` · figma: ${(r.figma_tokens || []).join(', ')}` : ''}</span>
              </span>
              <button
                onClick={() => toggleActive(r)}
                className={`text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 whitespace-nowrap ${r.active !== false ? 'text-emerald-700 bg-emerald-50' : 'text-ink-400 bg-surface-100'}`}
                title="Toggle whether this size is offered"
              >
                {r.active !== false ? 'Active' : 'Hidden'}
              </button>
              <button onClick={() => openEdit(r)} className="btn-secondary btn-sm whitespace-nowrap flex-shrink-0">Edit</button>
            </div>
          ))}
          {!rows.length && <p className="text-sm text-ink-400 px-4 py-3">No sizes yet.</p>}
        </div>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'Add a size' : `Edit ${form.label || form.id}`} onClose={() => setEditing(null)}>
          <form onSubmit={save} className="space-y-4">
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Short label</label>
                <input className="input" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="POSTER" required />
              </div>
              <div>
                <label className="label">Name</label>
                <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="24 × 36 Poster" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Width (inches)</label>
                <input className="input" type="number" step="0.01" min="0" value={form.width_in}
                  onChange={e => setForm(f => ({ ...f, width_in: e.target.value }))} required />
              </div>
              <div>
                <label className="label">Height (inches)</label>
                <input className="input" type="number" step="0.01" min="0" value={form.height_in}
                  onChange={e => setForm(f => ({ ...f, height_in: e.target.value }))} required />
              </div>
            </div>
            <div>
              <label className="label">Token (id)</label>
              {editing === 'new' ? (
                <input className="input font-mono text-xs" value={form.id}
                  onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
                  placeholder="poster-24x36 (auto from name if blank)" />
              ) : (
                <input className="input font-mono text-xs bg-surface-100 text-ink-400" value={form.id} disabled />
              )}
              <p className="mt-1 text-[11px] text-ink-400">Permanent id used in the database. {editing !== 'new' && 'Cannot be changed after creation.'}</p>
            </div>
            <div>
              <label className="label">Figma frame tokens <span className="text-ink-300 font-normal">(comma-separated)</span></label>
              <input className="input font-mono text-xs" value={form.figma_tokens}
                onChange={e => setForm(f => ({ ...f, figma_tokens: e.target.value }))}
                placeholder="poster, _24x36" />
              <p className="mt-1 text-[11px] text-ink-400">Substrings the sync plugin matches in a Figma frame name (used once the plugin’s multi-size support ships).</p>
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <label className="label">Sort order</label>
                <input className="input" type="number" value={form.sort_order}
                  onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))} />
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-ink-600 pb-2">
                <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                Offered in pickers
              </label>
            </div>
            <div className="flex items-center justify-end gap-3 pt-1">
              <button type="button" onClick={() => setEditing(null)} className="btn-secondary btn-sm">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary btn-sm whitespace-nowrap">{saving ? 'Saving…' : 'Save size'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
