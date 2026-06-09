import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

function slugify(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/**
 * Cascading parent picker used in every Duplicate modal.
 *
 * Renders only the levels listed in `levels` (e.g. ['brand','series'] for
 * a Duplicate Event flow). Each select supports an "+ Add new…" option
 * that toggles an inline create form for that single level.
 *
 *   <TargetPicker
 *     levels={['brand','series','event']}
 *     defaults={{ brandId, seriesId, eventId }}
 *     allowCreate
 *     onChange={({ brandId, seriesId, eventId }) => …}
 *   />
 *
 * Inline create writes a minimum-viable row (name + slug) and immediately
 * selects it. Caller doesn't need to know about it — just reads brandId /
 * seriesId / eventId from onChange.
 */
export default function TargetPicker({
  levels,
  defaults = {},
  onChange,
  allowCreate = true,
  canEdit = true,
}) {
  const [brands, setBrands] = useState([])
  const [seriesList, setSeriesList] = useState([])
  const [events, setEvents] = useState([])

  const [brandId, setBrandId]   = useState(defaults.brandId  || '')
  const [seriesId, setSeriesId] = useState(defaults.seriesId || '')
  const [eventId, setEventId]   = useState(defaults.eventId  || '')

  // Inline-create state, one per level
  const [creating, setCreating] = useState(null)        // 'brand' | 'series' | 'event'
  const [newName, setNewName]   = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState(null)

  // Brands
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('brands').select('id, name, slug').order('name')
      if (!cancelled) setBrands(data || [])
    })()
    return () => { cancelled = true }
  }, [])

  // Series (filtered by brand)
  useEffect(() => {
    if (!levels.includes('series')) return
    if (!brandId) { setSeriesList([]); return }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('series').select('id, name, slug').eq('brand_id', brandId).order('name')
      if (!cancelled) setSeriesList(data || [])
    })()
    return () => { cancelled = true }
  }, [brandId, levels])

  // Events (filtered by series)
  useEffect(() => {
    if (!levels.includes('event')) return
    if (!seriesId) { setEvents([]); return }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('events').select('id, name, slug').eq('series_id', seriesId).order('name')
      if (!cancelled) setEvents(data || [])
    })()
    return () => { cancelled = true }
  }, [seriesId, levels])

  // Bubble selection upward
  useEffect(() => {
    onChange?.({ brandId, seriesId, eventId })
  }, [brandId, seriesId, eventId])

  // Cascade-clear lower selections when a higher level changes
  useEffect(() => { setSeriesId(''); setEventId('') }, [brandId])
  useEffect(() => { setEventId('') }, [seriesId])

  async function handleCreate(level) {
    const trimmed = newName.trim()
    if (!trimmed) { setCreateError('Name is required.'); return }
    setCreateBusy(true); setCreateError(null)
    try {
      let inserted
      if (level === 'brand') {
        const slug = slugify(trimmed) || `brand-${Date.now()}`
        const { data, error } = await supabase
          .from('brands').insert({ name: trimmed, slug, color: '#6366f1' }).select().single()
        if (error) throw error
        inserted = data
        setBrands(prev => [...prev, inserted].sort((a, b) => a.name.localeCompare(b.name)))
        setBrandId(inserted.id)
      } else if (level === 'series') {
        if (!brandId) throw new Error('Pick a brand first.')
        const slug = slugify(trimmed) || `series-${Date.now()}`
        const { data, error } = await supabase
          .from('series').insert({ brand_id: brandId, name: trimmed, slug }).select().single()
        if (error) throw error
        inserted = data
        setSeriesList(prev => [...prev, inserted].sort((a, b) => a.name.localeCompare(b.name)))
        setSeriesId(inserted.id)
      } else if (level === 'event') {
        if (!seriesId) throw new Error('Pick a series first.')
        const slug = slugify(trimmed) || `event-${Date.now()}`
        const { data, error } = await supabase
          .from('events').insert({ series_id: seriesId, name: trimmed, slug, phase: 'build' }).select().single()
        if (error) throw error
        inserted = data
        setEvents(prev => [...prev, inserted].sort((a, b) => a.name.localeCompare(b.name)))
        setEventId(inserted.id)
      }
      setCreating(null); setNewName('')
    } catch (e) {
      setCreateError(e.message || String(e))
    } finally {
      setCreateBusy(false)
    }
  }

  function renderRow(level, label, options, value, setValue, disabled) {
    const isCreating = creating === level
    if (isCreating) {
      return (
        <div>
          <label className="label">{label} (new)</label>
          <div className="flex items-center gap-2">
            <input
              className="input"
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder={`New ${level} name`}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreate(level) } }}
            />
            <button type="button" disabled={createBusy} onClick={() => handleCreate(level)} className="btn-primary btn-sm whitespace-nowrap">
              {createBusy ? 'Adding…' : 'Add'}
            </button>
            <button type="button" disabled={createBusy} onClick={() => { setCreating(null); setNewName(''); setCreateError(null) }} className="btn-secondary btn-sm">
              Cancel
            </button>
          </div>
          {createError && <p className="text-xs text-red-600 mt-1">{createError}</p>}
        </div>
      )
    }
    return (
      <div>
        <label className="label">{label}</label>
        <div className="flex items-center gap-2">
          <select
            className="input flex-1"
            value={value}
            onChange={e => { if (e.target.value === '__new__') setCreating(level); else setValue(e.target.value) }}
            disabled={disabled}
          >
            <option value="">— select {level} —</option>
            {options.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
            {allowCreate && canEdit && <option value="__new__">+ Add new {level}…</option>}
          </select>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {levels.includes('brand')  && renderRow('brand',  'Brand',  brands,     brandId,  setBrandId,  false)}
      {levels.includes('series') && renderRow('series', 'Series', seriesList, seriesId, setSeriesId, !brandId)}
      {levels.includes('event')  && renderRow('event',  'Event',  events,     eventId,  setEventId,  !seriesId)}
    </div>
  )
}
