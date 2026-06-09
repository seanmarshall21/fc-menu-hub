import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import PageScreen, { PageBody } from '@/components/PageScreen'
import PhaseBadge from '@/components/PhaseBadge'
import Modal from '@/components/Modal'
import SeriesStylesTab from '@/components/SeriesStylesTab'
import SeriesSponsorsTab from '@/components/SeriesSponsorsTab'
import NotifyForEditsEditor from '@/components/NotifyForEditsEditor'
import TargetPicker from '@/components/TargetPicker'
import { duplicateEventTo } from '@/lib/duplicate'
import FavoriteButton from '@/components/FavoriteButton'
import { useFocusRefresh } from '@/hooks/useFocusRefresh'
import { format } from 'date-fns'

const PHASES = [
  { value: 'build',      label: 'Build' },
  { value: 'proof',      label: 'Proof' },
  { value: 'print_prep', label: 'Print Prep' },
  { value: 'approved',   label: 'Approved' },
  { value: 'archived',   label: 'Archived' },
]

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export default function SeriesPage() {
  const { brandSlug, seriesSlug } = useParams()
  const { isAdmin, isInternal } = useAuth()
  const [brand, setBrand] = useState(null)
  const [series, setSeries] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  const [tab, setTab] = useState('events') // 'events' | 'styles'
  const [duplicatingEvent, setDuplicatingEvent] = useState(null)
  const [deletingEvent, setDeletingEvent] = useState(null)
  const [showNewEvent, setShowNewEvent] = useState(false)
  const [eventName, setEventName] = useState('')
  const [eventSlugField, setEventSlugField] = useState('')
  const [eventVenue, setEventVenue] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventPhase, setEventPhase] = useState('build')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  async function loadData() {
    const { data: brandData } = await supabase.from('brands').select('id, name, slug, color, notify_user_ids').eq('slug', brandSlug).single()
    setBrand(brandData)
    if (brandData) {
      const { data: seriesData } = await supabase.from('series').select('*').eq('brand_id', brandData.id).eq('slug', seriesSlug).single()
      setSeries(seriesData)
      if (seriesData) {
        const { data: eventsData } = await supabase.from('events').select('*, menus(id)').eq('series_id', seriesData.id).order('event_date', { ascending: false })
        setEvents(eventsData || [])
      }
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [brandSlug, seriesSlug])
  useFocusRefresh(loadData)

  async function handleCreateEvent(e) {
    e.preventDefault()
    setSaving(true); setSaveError(null)
    const { error } = await supabase.from('events').insert({
      name: eventName.trim(), slug: eventSlugField.trim(), series_id: series.id,
      venue: eventVenue.trim() || null, event_date: eventDate || null, phase: eventPhase,
    })
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    setShowNewEvent(false); loadData()
  }

  if (loading) return <div className="px-8 py-8 text-sm text-ink-400">Loading…</div>
  if (!series) return <div className="px-8 py-8 text-sm text-red-500">Series not found.</div>

  return (
    <PageScreen
      breadcrumbs={[
        { label: brand?.name, to: `/brands/${brandSlug}` },
        { label: series.name },
      ]}
      actions={<FavoriteButton type="series" id={series.id} />}
      below={(
        <div className="flex items-center gap-1">
          {[
            { key: 'events',   label: 'Events' },
            { key: 'sponsors', label: 'Sponsors' },
            { key: 'approvals',label: 'Approvals' },
            ...(isAdmin ? [{ key: 'styles', label: 'Styles' }] : []),
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-ink-500 hover:text-ink-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    >
      <PageBody>

      {tab === 'styles' ? (
        <SeriesStylesTab series={series} canEdit={isAdmin || isInternal} onSaved={loadData} />
      ) : tab === 'sponsors' ? (
        <SeriesSponsorsTab series={series} canEdit={isAdmin || isInternal} />
      ) : tab === 'approvals' ? (
        <div className="space-y-4 max-w-2xl">
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-ink-900 mb-1">Notify for edits</h2>
            <p className="text-xs text-ink-500 mb-4">
              Anyone toggled here gets an inbox notification for every edit on any
              menu under this series. Inherited people from the brand stay on
              automatically and can only be removed at the brand level.
            </p>
            <NotifyForEditsEditor
              table="series"
              entityId={series.id}
              current={series.notify_user_ids || []}
              inheritedIds={brand?.notify_user_ids || []}
              inheritedFromLabel={brand?.name ? `${brand.name} (brand)` : 'the brand'}
              canEdit={isAdmin || isInternal}
              onSaved={loadData}
            />
          </div>
        </div>
      ) : (
      <div className="card overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-surface-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-900">Events</h2>
          {(isAdmin || isInternal) && (
            <button onClick={() => { setEventName(''); setEventSlugField(''); setEventVenue(''); setEventDate(''); setEventPhase('build'); setSaveError(null); setShowNewEvent(true) }}
              className="btn-secondary btn-sm gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Event
            </button>
          )}
        </div>
        {events.length === 0 ? (
          <div className="px-6 py-8 text-sm text-ink-400">No events yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-surface-100">
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-ink-400 uppercase tracking-wider">Event</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-ink-400 uppercase tracking-wider">Date</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-ink-400 uppercase tracking-wider">Venue</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-ink-400 uppercase tracking-wider">Menus</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-ink-400 uppercase tracking-wider">Phase</th>
                  {(isAdmin || isInternal) && <th className="px-4 sm:px-6 py-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {events.map(event => (
                  <tr key={event.id} className="table-row-hover">
                    <td className="px-4 sm:px-6 py-3">
                      <Link to={`/brands/${brandSlug}/series/${seriesSlug}/events/${event.slug}`}
                        className="font-medium text-ink-900 hover:text-brand-600 transition-colors whitespace-nowrap">
                        {event.name}
                      </Link>
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-ink-500 whitespace-nowrap">
                      {event.event_date ? format(new Date(event.event_date), 'MMM d, yyyy') : '—'}
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-ink-500 whitespace-nowrap">{event.venue || '—'}</td>
                    <td className="px-4 sm:px-6 py-3 text-ink-500">{event.menus?.length || 0}</td>
                    <td className="px-4 sm:px-6 py-3"><PhaseBadge phase={event.phase} /></td>
                    {(isAdmin || isInternal) && (
                      <td className="px-2 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => setDuplicatingEvent(event)}
                          className="text-[11px] text-ink-500 hover:text-brand-600 mr-3"
                          title="Duplicate event (with all its menus)"
                        >
                          Duplicate
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => setDeletingEvent(event)}
                            className="text-[11px] text-ink-400 hover:text-red-600"
                            title="Delete event and all its menus"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {showNewEvent && (
        <Modal title="New Event" onClose={() => setShowNewEvent(false)}>
          <form onSubmit={handleCreateEvent} className="space-y-4">
            <div>
              <label className="label">Event Name</label>
              <input className="input" value={eventName}
                onChange={e => { setEventName(e.target.value); setEventSlugField(slugify(e.target.value)) }}
                placeholder="e.g. CRSSD Fall 2025" required autoFocus />
            </div>
            <div>
              <label className="label">Slug</label>
              <input className="input font-mono text-sm" value={eventSlugField}
                onChange={e => setEventSlugField(slugify(e.target.value))} placeholder="crssd-fall-2025" required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Date</label>
                <input type="date" className="input" value={eventDate} onChange={e => setEventDate(e.target.value)} />
              </div>
              <div>
                <label className="label">Phase</label>
                <select className="input" value={eventPhase} onChange={e => setEventPhase(e.target.value)}>
                  {PHASES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Venue</label>
              <input className="input" value={eventVenue} onChange={e => setEventVenue(e.target.value)} placeholder="e.g. Waterfront Park" />
            </div>
            {saveError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</p>}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button type="button" onClick={() => setShowNewEvent(false)} className="btn-secondary btn-sm">Cancel</button>
              <button type="submit" className="btn-primary btn-sm" disabled={saving}>{saving ? 'Creating…' : 'Create Event'}</button>
            </div>
          </form>
        </Modal>
      )}

      {duplicatingEvent && (
        <DuplicateEventModal
          sourceEvent={duplicatingEvent}
          currentSeriesId={series?.id}
          currentBrandId={brand?.id}
          onClose={() => setDuplicatingEvent(null)}
          onDuplicated={() => { setDuplicatingEvent(null); loadData() }}
        />
      )}

      {deletingEvent && (
        <DeleteEventModal
          event={deletingEvent}
          onClose={() => setDeletingEvent(null)}
          onDeleted={() => { setDeletingEvent(null); loadData() }}
        />
      )}
      </PageBody>
    </PageScreen>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Duplicate Event modal — cascades all menus underneath via duplicateEventTo.
// ─────────────────────────────────────────────────────────────────────────────
function DuplicateEventModal({ sourceEvent, currentSeriesId, currentBrandId, onClose, onDuplicated }) {
  const [name, setName] = useState(`${sourceEvent.name} (copy)`)
  const [target, setTarget] = useState({ brandId: currentBrandId || '', seriesId: currentSeriesId || '' })
  const [setAllItemsToDraft, setSetAllItemsToDraft] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const menuCount = sourceEvent.menus?.length || 0

  async function submit(e) {
    e.preventDefault()
    if (!name.trim())       { setError('Give the new event a name.'); return }
    if (!target.seriesId)   { setError('Pick a target series.'); return }
    setBusy(true); setError(null)
    try {
      await duplicateEventTo(sourceEvent.id, {
        name: name.trim(),
        targetSeriesId: target.seriesId,
        setAllItemsToDraft,
      })
      onDuplicated?.()
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Duplicate event" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="text-xs text-ink-500">
          Cloning <strong className="text-ink-900">{sourceEvent.name}</strong>
          {menuCount > 0 && <span> · {menuCount} menu{menuCount === 1 ? '' : 's'} (with items + sponsors)</span>}
        </div>

        <div>
          <label className="label">New event name</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} required autoFocus />
        </div>

        <TargetPicker
          levels={['brand', 'series']}
          defaults={{ brandId: currentBrandId, seriesId: currentSeriesId }}
          onChange={setTarget}
        />

        <label className="inline-flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={setAllItemsToDraft}
            onChange={e => setSetAllItemsToDraft(e.target.checked)}
            className="rounded border-surface-300 text-brand-600 focus:ring-brand-500"
          />
          Set all copied items to <strong>Draft</strong>
        </label>

        <p className="text-[11px] text-ink-400">
          The new event keeps the menus' design/config but gets a blank date, no Figma link, and no preview images.
          Sponsor toggles on each menu only carry over when staying in the same event — for a brand-new event, you'll re-toggle on each menu.
        </p>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-surface-100">
          <button type="button" onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
          <button type="submit" disabled={busy} className="btn-primary btn-sm">{busy ? 'Duplicating…' : 'Duplicate'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete Event modal — typed-DELETE confirmation. Cascades through menus →
// items → sponsors → edit_log via the existing on-delete-cascade FKs in
// schema.sql. Admin-only.
// ─────────────────────────────────────────────────────────────────────────────
function DeleteEventModal({ event, onClose, onDeleted }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState(null)
  const menuCount = event.menus?.length || 0
  const armed = typed.trim().toUpperCase() === 'DELETE'

  async function submit(e) {
    e.preventDefault()
    if (!armed) return
    setBusy(true); setError(null)
    try {
      const { error: err } = await supabase.from('events').delete().eq('id', event.id)
      if (err) throw err
      onDeleted?.()
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Delete event?" onClose={() => { if (!busy) onClose() }}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-ink-700">
          <strong>{event.name}</strong>{menuCount > 0 && (
            <span className="text-ink-500"> · {menuCount} menu{menuCount === 1 ? '' : 's'}</span>
          )} will be permanently removed.
        </p>

        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          This cascades through every menu, item, edit log entry, sponsor toggle,
          and template under this event. There's no undo.
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-700 mb-1">
            Type <code className="bg-surface-100 px-1 rounded text-red-600">DELETE</code> to confirm
          </label>
          <input
            type="text"
            className="input"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder="DELETE"
            autoFocus
          />
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-surface-100">
          <button type="button" onClick={onClose} disabled={busy} className="btn-secondary btn-sm">Cancel</button>
          <button
            type="submit"
            disabled={!armed || busy}
            className={`btn-sm text-white ${armed ? 'bg-red-600 hover:bg-red-700' : 'bg-red-300 cursor-not-allowed'}`}
          >
            {busy ? 'Deleting…' : 'Delete event'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
