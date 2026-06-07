import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import SegmentedToggle from '@/components/SegmentedToggle'
import SortableList, { DragHandle } from '@/components/SortableList'

const ORDER_OPTIONS = [
  { value: 'inherit',  label: 'Inherit from series' },
  { value: 'override', label: 'Override order' },
]

/**
 * Per-event sponsor pool — driven by the parent series' sponsor list
 * (series_sponsors → library sponsors). Each sponsor can be toggled on/off
 * for this event. One default tint color sits on the event; per-sponsor
 * overrides are available but optional.
 *
 *   <EventSponsorsTab event={event} series={series} canEdit={canEdit} onChange={refresh} />
 */
export default function EventSponsorsTab({ event, series, canEdit, onChange }) {
  const [seriesSponsors, setSeriesSponsors] = useState([])   // series_sponsors rows w/ library data
  const [eventSponsors, setEventSponsors]   = useState([])   // event_sponsors rows for this event
  const [defaultColor, setDefaultColor]     = useState(event?.sponsor_tint_color || '')
  const [overrideOrder, setOverrideOrder]   = useState(!!event?.override_sponsor_order)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [busy, setBusy]       = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const [ss, es] = await Promise.all([
      supabase
        .from('series_sponsors')
        .select('id, tint_color, sort_order, sponsor:sponsors(id, name, slug, svg_url, figma_layer_name)')
        .eq('series_id', series.id)
        .order('sort_order'),
      supabase
        .from('event_sponsors')
        .select('id, sponsor_id, tint_color_override, active, sort_order, name, slug, logo_url')
        .eq('event_id', event.id)
        .order('sort_order'),
    ])
    if (ss.error) setError(ss.error.message)
    if (es.error) setError(es.error.message)
    setSeriesSponsors((ss.data || []).filter(r => r.sponsor))
    setEventSponsors(es.data || [])
    setDefaultColor(event?.sponsor_tint_color || '')
    setOverrideOrder(!!event?.override_sponsor_order)
    setLoading(false)
  }, [series?.id, event?.id, event?.sponsor_tint_color, event?.override_sponsor_order])

  useEffect(() => { load() }, [load])

  // Map sponsor_id → event_sponsors row (only the library-linked ones)
  const linkedByLibraryId = useMemo(() => {
    const m = new Map()
    for (const row of eventSponsors) {
      if (row.sponsor_id) m.set(row.sponsor_id, row)
    }
    return m
  }, [eventSponsors])

  // Legacy custom sponsors (added before the library existed) — preserve, but flag.
  const customSponsors = eventSponsors.filter(r => !r.sponsor_id)

  async function toggleSponsor(ss) {
    if (!canEdit) return
    setBusy(ss.sponsor.id); setError(null)
    const existing = linkedByLibraryId.get(ss.sponsor.id)
    try {
      if (existing) {
        const { error: err } = await supabase.from('event_sponsors').delete().eq('id', existing.id)
        if (err) throw err
      } else {
        const sortOrder = eventSponsors.length
        const { error: err } = await supabase.from('event_sponsors').insert({
          event_id: event.id,
          sponsor_id: ss.sponsor.id,
          name: ss.sponsor.name,
          slug: ss.sponsor.slug,
          logo_url: ss.sponsor.svg_url || null,
          active: true,
          sort_order: sortOrder,
        })
        if (err) throw err
      }
      await load()
      onChange?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  async function setSponsorOverride(eventSponsorId, color) {
    setBusy(eventSponsorId)
    try {
      const { error: err } = await supabase
        .from('event_sponsors')
        .update({ tint_color_override: color || null })
        .eq('id', eventSponsorId)
      if (err) throw err
      await load()
    } catch (e) { setError(e.message) }
    finally { setBusy(null) }
  }

  // Persist event_sponsors.sort_order to match the active rows' current
  // index in the series_sponsors ordering. Called when we need to resync
  // (e.g. user just turned off Override).
  async function resyncSortOrderToSeries() {
    const seriesIndex = new Map(seriesSponsors.map((ss, i) => [ss.sponsor?.id, i]))
    const updates = eventSponsors
      .filter(es => es.sponsor_id)
      .map(es => ({ id: es.id, sort_order: seriesIndex.get(es.sponsor_id) ?? 9999 }))
    await Promise.all(updates.map(u =>
      supabase.from('event_sponsors').update({ sort_order: u.sort_order }).eq('id', u.id)
    ))
  }

  async function toggleOverrideOrder(next) {
    if (next === overrideOrder) return
    setBusy('order-toggle'); setError(null)
    try {
      const { error: err } = await supabase
        .from('events')
        .update({ override_sponsor_order: next })
        .eq('id', event.id)
      if (err) throw err
      setOverrideOrder(next)
      // When switching back to inherit, snap event order to mirror series.
      if (!next) await resyncSortOrderToSeries()
      onChange?.()
      await load()
    } catch (e) { setError(e.message) }
    finally { setBusy(null) }
  }

  // Reorder active rows when override is on. New ordering is persisted to
  // event_sponsors.sort_order in one batch.
  async function reorderActive(newActiveRows) {
    setBusy('reorder')
    try {
      const updates = newActiveRows.map((row, i) => ({ id: row.eventSponsorId, sort_order: i }))
      // Optimistic UI
      setEventSponsors(prev => prev.map(es => {
        const u = updates.find(x => x.id === es.id)
        return u ? { ...es, sort_order: u.sort_order } : es
      }))
      await Promise.all(updates.map(u =>
        supabase.from('event_sponsors').update({ sort_order: u.sort_order }).eq('id', u.id)
      ))
    } catch (e) { setError(e.message) }
    finally { setBusy(null) }
  }

  async function saveDefaultColor() {
    setBusy('default-color')
    try {
      const { error: err } = await supabase
        .from('events')
        .update({ sponsor_tint_color: defaultColor || null })
        .eq('id', event.id)
      if (err) throw err
      onChange?.()
    } catch (e) { setError(e.message) }
    finally { setBusy(null) }
  }

  if (loading) return <div className="text-sm text-ink-400">Loading…</div>

  return (
    <div className="space-y-6">
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}

      {/* Event-level default sponsor color */}
      {canEdit && (
        <section className="card p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold text-ink-900">Default tint color</h3>
              <p className="text-xs text-ink-500 mt-0.5">One color applied to all sponsor logos for this event. Per-sponsor overrides below.</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={defaultColor || '#000000'}
                onChange={e => setDefaultColor(e.target.value)}
                className="w-9 h-9 rounded border border-surface-200 cursor-pointer"
              />
              <input
                type="text"
                className="input input-sm w-28 font-mono text-xs"
                value={defaultColor}
                onChange={e => setDefaultColor(e.target.value)}
                placeholder="#000000"
              />
              <button
                onClick={saveDefaultColor}
                disabled={busy === 'default-color'}
                className="btn-primary btn-sm"
              >
                {busy === 'default-color' ? 'Saving…' : 'Save'}
              </button>
              {defaultColor && (
                <button
                  onClick={() => { setDefaultColor(''); setTimeout(saveDefaultColor, 0) }}
                  className="text-xs text-ink-400 hover:text-red-600"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Library sponsors scoped to this series — pick which appear on this event */}
      <section className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-100 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">Sponsors for this event</h3>
            <p className="text-xs text-ink-400 mt-0.5">
              Pulls from {series?.name || 'the series'}'s sponsor list. Toggle which appear on this event's menus.
              {seriesSponsors.length === 0 && (
                <> Empty — add some on the <strong>Series → Sponsors</strong> tab first.</>
              )}
            </p>
          </div>
          {canEdit && seriesSponsors.length > 0 && (
            <SegmentedToggle
              value={overrideOrder ? 'override' : 'inherit'}
              options={ORDER_OPTIONS}
              onChange={v => toggleOverrideOrder(v === 'override')}
              disabled={busy === 'order-toggle'}
            />
          )}
        </div>

        {(() => {
          if (seriesSponsors.length === 0) {
            return (
              <div className="px-4 py-8 text-center text-sm text-ink-400">
                No series sponsors yet.
              </div>
            )
          }

          // Split sponsors into active (have an event_sponsors row) and inactive.
          const activeSponsors = seriesSponsors.filter(ss => linkedByLibraryId.has(ss.sponsor.id))
          const inactiveSponsors = seriesSponsors.filter(ss => !linkedByLibraryId.has(ss.sponsor.id))

          // When override is on, sort active by event_sponsors.sort_order;
          // when off, keep the incoming series_sponsors order.
          const sortedActive = overrideOrder
            ? [...activeSponsors].sort((a, b) => {
                const aOrder = linkedByLibraryId.get(a.sponsor.id)?.sort_order ?? 0
                const bOrder = linkedByLibraryId.get(b.sponsor.id)?.sort_order ?? 0
                return aOrder - bOrder
              })
            : activeSponsors

          // Each active row needs a stable id and a reference to its event_sponsors row id.
          const activeRows = sortedActive.map(ss => ({
            id: ss.sponsor.id,
            ss,
            eventSponsorId: linkedByLibraryId.get(ss.sponsor.id).id,
          }))

          return (
            <ul className="divide-y divide-surface-100">
              {overrideOrder && canEdit && activeRows.length > 0 ? (
                <SortableList
                  items={activeRows}
                  getId={r => r.id}
                  onReorder={reorderActive}
                  disabled={busy === 'reorder'}
                >
                  {(row, { handleListeners }) => (
                    <SponsorListRow
                      ss={row.ss}
                      linked={linkedByLibraryId.get(row.ss.sponsor.id)}
                      defaultColor={defaultColor}
                      canEdit={canEdit}
                      busy={busy}
                      toggleSponsor={toggleSponsor}
                      setSponsorOverride={setSponsorOverride}
                      handleListeners={handleListeners}
                    />
                  )}
                </SortableList>
              ) : (
                activeRows.map(row => (
                  <SponsorListRow
                    key={row.id}
                    ss={row.ss}
                    linked={linkedByLibraryId.get(row.ss.sponsor.id)}
                    defaultColor={defaultColor}
                    canEdit={canEdit}
                    busy={busy}
                    toggleSponsor={toggleSponsor}
                    setSponsorOverride={setSponsorOverride}
                  />
                ))
              )}
              {inactiveSponsors.map(ss => (
                <SponsorListRow
                  key={ss.sponsor.id}
                  ss={ss}
                  linked={null}
                  defaultColor={defaultColor}
                  canEdit={canEdit}
                  busy={busy}
                  toggleSponsor={toggleSponsor}
                  setSponsorOverride={setSponsorOverride}
                />
              ))}
            </ul>
          )
        })()}
      </section>

      {/* Legacy custom sponsors (no library link) — show only if any exist */}
      {customSponsors.length > 0 && (
        <section className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-100 bg-amber-50">
            <h3 className="text-sm font-semibold text-amber-900">Custom sponsors</h3>
            <p className="text-xs text-amber-700 mt-0.5">These were added before the library existed and aren't linked to a library entry. Re-add them via the Sponsors tab to keep things tidy.</p>
          </div>
          <ul className="divide-y divide-surface-100">
            {customSponsors.map(cs => (
              <li key={cs.id} className="px-4 py-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-surface-50 border border-surface-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {cs.logo_url ? (
                    <img src={cs.logo_url} alt="" className="max-w-full max-h-full object-contain p-1" />
                  ) : (
                    <span className="text-[10px] text-ink-300">no svg</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink-900 truncate">{cs.name}</div>
                  <div className="text-[11px] text-ink-400 font-mono truncate">sponsor--{cs.slug}</div>
                </div>
                {canEdit && (
                  <button
                    onClick={async () => {
                      if (!confirm(`Delete custom sponsor "${cs.name}" from this event?`)) return
                      setBusy(cs.id)
                      try {
                        await supabase.from('event_sponsors').delete().eq('id', cs.id)
                        await load()
                      } finally { setBusy(null) }
                    }}
                    disabled={busy === cs.id}
                    className="text-[11px] text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function SponsorListRow({ ss, linked, defaultColor, canEdit, busy, toggleSponsor, setSponsorOverride, handleListeners }) {
  const active         = !!linked
  const seriesColor    = ss.tint_color || null
  const eventOverride  = linked?.tint_color_override || ''
  const effectiveColor = eventOverride || defaultColor || seriesColor || '#888'
  const tinted         = ss.sponsor.svg_url

  return (
    <li className={`px-4 py-3 flex items-center gap-3 bg-white ${!active ? 'opacity-50' : ''}`}>
      {handleListeners && canEdit && active && (
        <DragHandle listeners={handleListeners} />
      )}
      <button
        onClick={() => toggleSponsor(ss)}
        disabled={!canEdit || busy === ss.sponsor.id}
        className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 relative ${
          active ? 'bg-emerald-500' : 'bg-surface-200'
        }`}
        title={active ? 'Click to remove from this event' : 'Click to add to this event'}
        aria-label={active ? 'Remove sponsor' : 'Add sponsor'}
      >
        <span className={`absolute top-0.5 ${active ? 'left-5' : 'left-0.5'} w-5 h-5 rounded-full bg-white transition-all`} />
      </button>
      <div className="w-10 h-10 rounded-lg bg-surface-50 border border-surface-200 flex items-center justify-center overflow-hidden flex-shrink-0" style={{ color: effectiveColor }}>
        {tinted ? (
          <img src={tinted} alt="" className="max-w-full max-h-full object-contain p-1" />
        ) : (
          <span className="text-[10px] text-ink-300">no svg</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink-900 truncate">{ss.sponsor.name}</div>
        <div className="text-[11px] text-ink-400 font-mono truncate">sponsor--{ss.sponsor.figma_layer_name || ss.sponsor.slug}</div>
      </div>
      {active && canEdit && (
        <ColorOverride
          value={eventOverride}
          onChange={c => setSponsorOverride(linked.id, c)}
          disabled={busy === linked.id}
          placeholder={defaultColor || seriesColor || ''}
        />
      )}
    </li>
  )
}

function ColorOverride({ value, onChange, disabled, placeholder }) {
  const [open, setOpen] = useState(false)
  if (!open && !value) {
    return (
      <button onClick={() => setOpen(true)} disabled={disabled} className="text-[11px] text-ink-400 hover:text-brand-600">
        Override color
      </button>
    )
  }
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        value={value || '#000000'}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="w-7 h-7 rounded border border-surface-200 cursor-pointer"
      />
      <input
        type="text"
        className="input input-sm w-20 font-mono text-[11px]"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || '#000'}
        disabled={disabled}
      />
      {value && (
        <button onClick={() => { onChange(''); setOpen(false) }} className="text-[11px] text-ink-400 hover:text-red-600" title="Clear override">
          ✕
        </button>
      )}
    </div>
  )
}
