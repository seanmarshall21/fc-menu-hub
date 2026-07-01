import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useDepartments, DEPT_PERMISSIONS, LIFECYCLE_PHASES } from '@/hooks/useDepartments'
import { useToast } from '@/contexts/ToastContext'

const slug = (s) => (s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

// Admin panel to manage the departments list — add, edit label/permissions/
// phases, delete custom ones. Built-in departments can be edited but not deleted.
export default function DepartmentsAdmin() {
  const { departments, reload } = useDepartments()
  const toast = useToast()
  const [editing, setEditing] = useState(null)   // dept row, or 'new'
  const [form, setForm] = useState(null)

  function startEdit(d) {
    setEditing(d)
    setForm(d === 'new'
      ? { label: '', blurb: '', permissions: [], phases: [] }
      : { label: d.label, blurb: d.blurb || '', permissions: d.permissions || [], phases: d.phases || [] })
  }
  function toggle(field, val) {
    setForm(f => ({ ...f, [field]: f[field].includes(val) ? f[field].filter(x => x !== val) : [...f[field], val] }))
  }
  async function save() {
    if (!form.label.trim()) { toast('Give it a name', { type: 'error' }); return }
    const payload = { label: form.label.trim(), blurb: form.blurb.trim() || null, permissions: form.permissions, phases: form.phases }
    let error
    if (editing === 'new') {
      ({ error } = await supabase.from('departments').insert({ ...payload, key: slug(form.label), sort_order: departments.length + 1 }))
    } else {
      ({ error } = await supabase.from('departments').update(payload).eq('id', editing.id))
    }
    if (error) { toast('Could not save', { type: 'error' }); return }
    toast('Saved'); setEditing(null); setForm(null); reload()
  }
  async function remove(d) {
    if (!confirm(`Delete the “${d.label}” department? People assigned to it keep the tag until you reassign them.`)) return
    const { error } = await supabase.from('departments').delete().eq('id', d.id)
    if (error) { toast('Could not delete', { type: 'error' }); return }
    toast('Deleted'); reload()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-500">Departments drive My Tasks + phase notifications. Add your own beyond the built-in three.</p>
        {editing !== 'new' && <button onClick={() => startEdit('new')} className="btn-primary btn-sm whitespace-nowrap">+ Department</button>}
      </div>

      {editing === 'new' && <Editor form={form} setForm={setForm} toggle={toggle} onSave={save} onCancel={() => { setEditing(null); setForm(null) }} isNew />}

      <div className="space-y-2">
        {departments.map(d => (
          editing && editing.id === d.id ? (
            <Editor key={d.id} form={form} setForm={setForm} toggle={toggle} onSave={save} onCancel={() => { setEditing(null); setForm(null) }} />
          ) : (
            <div key={d.key} className="card p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-ink-900">{d.label}</h3>
                  {d.built_in && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-100 text-ink-400">built-in</span>}
                </div>
                {d.blurb && <p className="text-[11px] text-ink-400 mt-0.5">{d.blurb}</p>}
                <div className="flex flex-wrap gap-1 mt-2">
                  {(d.phases || []).map(p => <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-100 text-ink-500">{p}</span>)}
                  {(d.permissions || []).map(p => <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-brand-50 text-brand-600">{DEPT_PERMISSIONS.find(x => x.key === p)?.label || p}</span>)}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => startEdit(d)} className="text-xs text-brand-600 hover:underline">Edit</button>
                {!d.built_in && <button onClick={() => remove(d)} className="text-xs text-ink-400 hover:text-red-600">Delete</button>}
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  )
}

function Editor({ form, setForm, toggle, onSave, onCancel, isNew }) {
  return (
    <div className="card p-4 space-y-3 border-brand-200">
      <div>
        <label className="label">Name</label>
        <input className="input" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Logistics" autoFocus />
      </div>
      <div>
        <label className="label">Blurb <span className="text-ink-400 font-normal">(optional)</span></label>
        <input className="input" value={form.blurb} onChange={e => setForm(f => ({ ...f, blurb: e.target.value }))} />
      </div>
      <div>
        <label className="label">Permissions members get</label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {DEPT_PERMISSIONS.map(p => (
            <button key={p.key} type="button" onClick={() => toggle('permissions', p.key)}
              className={`text-xs px-2.5 py-1 rounded-full border ${form.permissions.includes(p.key) ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-surface-0 border-surface-200 text-ink-500'}`}>
              {form.permissions.includes(p.key) ? '✓ ' : ''}{p.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label">Phases they own</label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {LIFECYCLE_PHASES.map(p => (
            <button key={p} type="button" onClick={() => toggle('phases', p)}
              className={`text-xs px-2.5 py-1 rounded-full border capitalize ${form.phases.includes(p) ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-surface-0 border-surface-200 text-ink-500'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="btn-secondary btn-sm">Cancel</button>
        <button onClick={onSave} className="btn-primary btn-sm">{isNew ? 'Add department' : 'Save'}</button>
      </div>
    </div>
  )
}
