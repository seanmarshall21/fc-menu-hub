import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Modal from '@/components/Modal'

export default function SeriesSponsorsTab({ series, canEdit }) {
  const [linked, setLinked] = useState([])      // series_sponsors rows joined with sponsor
  const [allSponsors, setAllSponsors] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [error, setError] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [adding, setAdding] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true); setError(null)
    const [linkedRes, libRes] = await Promise.all([
      supabase
        .from('series_sponsors')
        .select('id, tint_color, sort_order, sponsor:sponsors(id, name, slug, svg_url, figma_layer_name)')
        .eq('series_id', series.id)
        .order('sort_order'),
      supabase.from('sponsors').select('id, name, slug, svg_url, figma_layer_name').order('name'),
    ])
    if (linkedRes.error) setError(linkedRes.error.message)
    setLinked(linkedRes.data || [])
    setAllSponsors(libRes.data || [])
    setLoading(false)
  }, [series.id])

  useEffect(() => { reload() }, [reload])

  const linkedIds = new Set(linked.map(l => l.sponsor?.id))
  const availableToAdd = allSponsors.filter(s => !linkedIds.has(s.id))

  async function setTint(rowId, color) {
    setSavingId(rowId); setError(null)
    setLinked(prev => prev.map(l => l.id === rowId ? { ...l, tint_color: color } : l))
    const { error: err } = await supabase
      .from('series_sponsors')
      .update({ tint_color: color || null })
      .eq('id', rowId)
    if (err) setError(err.message)
    setSavingId(null)
  }

  async function moveRow(rowId, direction) {
    const idx = linked.findIndex(l => l.id === rowId)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= linked.length) return
    const a = linked[idx]
    const b = linked[swapIdx]
    setSavingId(rowId)
    const next = [...linked]
    next[idx] = b
    next[swapIdx] = a
    setLinked(next.map((row, i) => ({ ...row, sort_order: i })))
    await Promise.all([
      supabase.from('series_sponsors').update({ sort_order: swapIdx }).eq('id', a.id),
      supabase.from('series_sponsors').update({ sort_order: idx }).eq('id', b.id),
    ])
    setSavingId(null)
  }

  async function removeRow(rowId) {
    setSavingId(rowId)
    setLinked(prev => prev.filter(l => l.id !== rowId))
    const { error: err } = await supabase.from('series_sponsors').delete().eq('id', rowId)
    if (err) { setError(err.message); reload() }
    setSavingId(null)
  }

  async function addSponsors(ids) {
    if (!ids.length) return
    setAdding(true); setError(null)
    const rows = ids.map((sponsor_id, i) => ({
      series_id: series.id,
      sponsor_id,
      sort_order: linked.length + i,
    }))
    const { error: err } = await supabase.from('series_sponsors').insert(rows)
    setAdding(false)
    if (err) { setError(err.message); return }
    setShowAdd(false)
    reload()
  }

  if (loading) return <p className="text-sm text-ink-400">Loading sponsors…</p>

  return (
    <div>
      <div className="flex items-start justify-between mb-4 gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">Series Sponsors</h3>
          <p className="text-xs text-ink-400 mt-0.5">
            Pick which library sponsors apply to this series and the color each should render in. Used by the in-app preview and the Figma plugin.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowAdd(true)}
            disabled={availableToAdd.length === 0}
            className="btn-primary btn-sm flex-shrink-0 disabled:opacity-50"
          >
            + Add sponsor
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}

      {linked.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-sm text-ink-500">No sponsors linked to this series yet.</p>
          <p className="text-xs text-ink-400 mt-1">
            {availableToAdd.length > 0
              ? 'Tap "Add sponsor" to bring some in from the library.'
              : 'Add sponsors at /sponsors first, then come back here.'}
          </p>
        </div>
      ) : (
        <div className="card divide-y divide-surface-100 overflow-hidden">
          {linked.map((row, i) => (
            <SponsorRow
              key={row.id}
              row={row}
              canEdit={canEdit}
              saving={savingId === row.id}
              isFirst={i === 0}
              isLast={i === linked.length - 1}
              onTintChange={color => setTint(row.id, color)}
              onMoveUp={() => moveRow(row.id, 'up')}
              onMoveDown={() => moveRow(row.id, 'down')}
              onRemove={() => removeRow(row.id)}
            />
          ))}
        </div>
      )}

      {showAdd && (
        <AddSponsorModal
          available={availableToAdd}
          adding={adding}
          onClose={() => setShowAdd(false)}
          onConfirm={addSponsors}
        />
      )}
    </div>
  )
}

function SponsorRow({ row, canEdit, saving, isFirst, isLast, onTintChange, onMoveUp, onMoveDown, onRemove }) {
  const sp = row.sponsor
  const tint = row.tint_color || ''
  return (
    <div className="flex items-center gap-3 p-3 sm:p-4">
      <div
        className="w-12 h-12 rounded-lg border border-surface-200 bg-surface-50 flex items-center justify-center overflow-hidden flex-shrink-0"
        style={{ color: tint || '#1a1a1a' }}
      >
        {sp?.svg_url
          ? <img src={sp.svg_url} alt="" className="max-w-full max-h-full object-contain p-1" />
          : <span className="text-[10px] text-ink-300">no svg</span>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-ink-900 truncate">{sp?.name}</div>
        <div className="text-[11px] text-ink-400 font-mono truncate">sponsor--{sp?.figma_layer_name || sp?.slug}</div>
      </div>
      {canEdit && (
        <>
          <label className="flex items-center gap-2 flex-shrink-0">
            <input
              type="color"
              value={tint || '#000000'}
              onChange={e => onTintChange(e.target.value)}
              disabled={saving}
              className="w-7 h-7 rounded border border-surface-200 cursor-pointer"
            />
            <input
              type="text"
              value={tint}
              onChange={e => onTintChange(e.target.value)}
              placeholder="#000000"
              className="input input-sm w-24 font-mono text-xs"
              disabled={saving}
            />
          </label>
          <div className="flex flex-col flex-shrink-0">
            <button onClick={onMoveUp}   disabled={isFirst || saving} className="text-ink-400 hover:text-ink-700 p-0.5 disabled:opacity-30 disabled:cursor-default" aria-label="Move up">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
            </button>
            <button onClick={onMoveDown} disabled={isLast  || saving} className="text-ink-400 hover:text-ink-700 p-0.5 disabled:opacity-30 disabled:cursor-default" aria-label="Move down">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
          </div>
          <button
            onClick={onRemove}
            disabled={saving}
            className="text-red-400 hover:text-red-600 p-1 flex-shrink-0"
            aria-label="Remove"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </>
      )}
    </div>
  )
}

function AddSponsorModal({ available, adding, onClose, onConfirm }) {
  const [picked, setPicked] = useState(new Set())
  const toggle = (id) => {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  return (
    <Modal title="Add Sponsors" onClose={onClose}>
      <p className="text-xs text-ink-500 mb-3">Pick one or more sponsors from the library to link to this series.</p>
      <div className="space-y-1 max-h-64 overflow-y-auto -mx-2 px-2">
        {available.map(sp => {
          const checked = picked.has(sp.id)
          return (
            <button
              key={sp.id}
              type="button"
              onClick={() => toggle(sp.id)}
              className={`w-full flex items-center gap-3 p-2 rounded-lg border transition-colors text-left ${
                checked
                  ? 'bg-brand-50 border-brand-200'
                  : 'bg-white border-surface-100 hover:border-brand-200'
              }`}
            >
              <div className="w-9 h-9 rounded-md border border-surface-200 bg-surface-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                {sp.svg_url ? <img src={sp.svg_url} alt="" className="max-w-full max-h-full object-contain p-1" /> : <span className="text-[9px] text-ink-300">no svg</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink-900 truncate">{sp.name}</div>
                <div className="text-[10px] text-ink-400 font-mono truncate">sponsor--{sp.figma_layer_name || sp.slug}</div>
              </div>
              <div className={`w-4 h-4 rounded border-2 flex-shrink-0 ${checked ? 'bg-brand-600 border-brand-600' : 'border-surface-300'}`}>
                {checked && (
                  <svg className="w-full h-full text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                )}
              </div>
            </button>
          )
        })}
      </div>
      <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t border-surface-100">
        <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
        <button
          onClick={() => onConfirm([...picked])}
          disabled={adding || picked.size === 0}
          className="btn-primary btn-sm"
        >
          {adding ? 'Adding…' : `Add ${picked.size || ''}`}
        </button>
      </div>
    </Modal>
  )
}
