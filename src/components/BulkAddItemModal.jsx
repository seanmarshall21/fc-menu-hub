import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Modal from '@/components/Modal'

// Add one item to many menus at once. The section name is matched (case-
// insensitively) against each menu's existing sections: if it exists, the item
// is inserted at the end of that section; if not, it starts a new section.
// Props: menus (event menus with menu_items), onClose, onDone
export default function BulkAddItemModal({ menus, onClose, onDone }) {
  const [section, setSection] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [twoSizes, setTwoSizes] = useState(false)
  const [size1, setSize1] = useState('')
  const [price1, setPrice1] = useState('')
  const [size2, setSize2] = useState('')
  const [price2, setPrice2] = useState('')
  const [diet, setDiet] = useState({ vt: false, ve: false, gf: false })
  const [selected, setSelected] = useState(() => new Set())
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const [error, setError] = useState(null)

  // Section names already used across the event, for autocomplete.
  const allSections = useMemo(() => {
    const s = new Set()
    for (const m of menus) for (const it of (m.menu_items || [])) if (it.section) s.add(it.section)
    return [...s].sort()
  }, [menus])

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase()
    return menus.filter(m => !n || m.name.toLowerCase().includes(n))
  }, [menus, q])

  function toggle(id) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }
  function selectAll() { setSelected(new Set(filtered.map(m => m.id))) }
  function clearAll() { setSelected(new Set()) }

  async function submit() {
    if (!title.trim()) { setError('Give the item a name.'); return }
    if (!section.trim()) { setError('Give the item a section.'); return }
    if (selected.size === 0) { setError('Pick at least one menu.'); return }
    setBusy(true); setError(null)
    const norm = (s) => (s || '').trim().toLowerCase()
    const sec = section.trim()
    const base = {
      // Two-size items use the side-by-side price layout ('alt'); single price is 'main'.
      title: title.trim(), layout: twoSizes ? 'alt' : 'main', section: sec,
      description: description.trim() || null,
      two_sizes: twoSizes,
      size1: size1.trim() || null, price1: price1.trim() || null,
      size2: twoSizes ? (size2.trim() || null) : null,
      price2: twoSizes ? (price2.trim() || null) : null,
      vt: diet.vt, ve: diet.ve, gf: diet.gf,
      status: 'active',
    }
    let ok = 0
    try {
      for (const m of menus.filter(x => selected.has(x.id))) {
        const items = [...(m.menu_items || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        // Insert after the last item of the matching section, else at the end.
        let insertIdx = items.length
        for (let i = items.length - 1; i >= 0; i--) {
          if (norm(items[i].section) === norm(sec)) { insertIdx = i + 1; break }
        }
        const { data: created, error: insErr } = await supabase.from('menu_items')
          .insert({ ...base, menu_id: m.id, sort_order: 0 }).select('id').single()
        if (insErr) throw insErr
        const order = [...items.slice(0, insertIdx).map(x => x.id), created.id, ...items.slice(insertIdx).map(x => x.id)]
        // Renumber so the new item lands in the right place.
        await Promise.all(order.map((id, idx) => supabase.from('menu_items').update({ sort_order: idx }).eq('id', id)))
        ok++
      }
      setDone(ok)
      onDone?.()
    } catch (e) {
      setError(`Added to ${ok} before failing: ${e.message}`)
    } finally { setBusy(false) }
  }

  if (done != null) {
    return (
      <Modal title="Item added" onClose={onClose}>
        <p className="text-sm text-ink-700">Added <strong>{title}</strong> to <strong>{done}</strong> menu{done === 1 ? '' : 's'} under “{section}”.</p>
        <p className="text-[11px] text-ink-400 mt-2">Any approved menus you added to were reopened to Edits for re-verification.</p>
        <div className="mt-4 text-right"><button onClick={onClose} className="btn-primary btn-sm">Done</button></div>
      </Modal>
    )
  }

  return (
    <Modal title="Add an item to multiple menus" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className="label">Section</label>
            <input className="input" list="bulk-sections" value={section} onChange={e => setSection(e.target.value)} placeholder="e.g. Non-Alcoholic" />
            <datalist id="bulk-sections">{allSections.map(s => <option key={s} value={s} />)}</datalist>
            <p className="text-[11px] text-ink-400 mt-0.5">Matches an existing section by name, or creates a new one.</p>
          </div>
          <div className="col-span-2">
            <label className="label">Item name</label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Water" autoFocus />
          </div>
          <div className="col-span-2">
            <label className="label">Description <span className="text-ink-400 font-normal">(optional)</span></label>
            <input className="input" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="label">Size 1</label>
            <input className="input" value={size1} onChange={e => setSize1(e.target.value)} placeholder="e.g. 16oz" />
          </div>
          <div>
            <label className="label">Price 1</label>
            <input className="input" value={price1} onChange={e => setPrice1(e.target.value)} placeholder="e.g. 5" />
          </div>
          {twoSizes && <>
            <div><label className="label">Size 2</label><input className="input" value={size2} onChange={e => setSize2(e.target.value)} /></div>
            <div><label className="label">Price 2</label><input className="input" value={price2} onChange={e => setPrice2(e.target.value)} /></div>
          </>}
        </div>
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={twoSizes} onChange={e => setTwoSizes(e.target.checked)} /> Two sizes</label>
          <span className="text-ink-300">·</span>
          {['vt', 've', 'gf'].map(k => (
            <label key={k} className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={diet[k]} onChange={e => setDiet(d => ({ ...d, [k]: e.target.checked }))} /> {k.toUpperCase()}</label>
          ))}
        </div>

        <div className="border-t border-surface-100 pt-3">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label className="label mb-0">Add to ({selected.size} selected)</label>
            <div className="flex items-center gap-2 text-xs">
              <button onClick={selectAll} className="text-brand-600 hover:underline">All</button>
              <button onClick={clearAll} className="text-ink-400 hover:underline">None</button>
            </div>
          </div>
          <input className="input py-1.5 text-sm mb-2" value={q} onChange={e => setQ(e.target.value)} placeholder="Filter menus…" />
          <div className="max-h-48 overflow-y-auto border border-surface-100 rounded-lg divide-y divide-surface-100">
            {filtered.map(m => (
              <label key={m.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-surface-50">
                <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
                <span className="text-ink-800">{m.name}</span>
                {m.size && <span className="text-[10px] uppercase px-1 py-0.5 rounded bg-surface-100 text-ink-500">{m.size}</span>}
              </label>
            ))}
            {filtered.length === 0 && <p className="px-3 py-2 text-xs text-ink-400">No menus match.</p>}
          </div>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
          <button onClick={submit} disabled={busy} className="btn-primary btn-sm disabled:opacity-50">
            {busy ? 'Adding…' : `Add to ${selected.size || ''} menu${selected.size === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </Modal>
  )
}
