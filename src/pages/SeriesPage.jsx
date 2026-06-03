import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import Breadcrumbs from '@/components/Breadcrumbs'
import PhaseBadge from '@/components/PhaseBadge'
import Modal from '@/components/Modal'
import SeriesStylesTab from '@/components/SeriesStylesTab'
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
  const [showNewEvent, setShowNewEvent] = useState(false)
  const [eventName, setEventName] = useState('')
  const [eventSlugField, setEventSlugField] = useState('')
  const [eventVenue, setEventVenue] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventPhase, setEventPhase] = useState('build')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  async function loadData() {
    const { data: brandData } = await supabase.from('brands').select('id, name, slug, color').eq('slug', brandSlug).single()
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
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl">
      <Breadcrumbs crumbs={[
        { label: 'Dashboard', to: '/' },
        { label: brand?.name, to: `/brands/${brandSlug}` },
        { label: series.name },
      ]} />

      <h1 className="text-xl sm:text-2xl font-semibold text-ink-900 tracking-tight mb-4">{series.name}</h1>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-surface-200 mb-6">
        {[{ key: 'events', label: 'Events' }, { key: 'styles', label: 'Styles' }].map(t => (
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

      {tab === 'styles' ? (
        <SeriesStylesTab series={series} canEdit={isAdmin || isInternal} onSaved={loadData} />
      ) : (
      <div className="card overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-surface-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-900">Events</h2>
          {(isAdmin || isInternal) && (
            <button onClick={() => { setEventName(''); setEventSlugField(''); setEventVenue(''); setEventDate(''); setEventPhase('planning'); setSaveError(null); setShowNewEvent(true) }}
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
            <div className="grid grid-cols-2 gap-3">
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
    </div>
  )
}
