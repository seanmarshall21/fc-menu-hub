import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import PageScreen, { PageBody } from '@/components/PageScreen'
import PhaseBadge from '@/components/PhaseBadge'
import FavoriteButton from '@/components/FavoriteButton'
import { format } from 'date-fns'

export default function EventsListPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    supabase
      .from('events')
      .select('*, series(name, slug, brand:brands(name, slug, color, logo_url))')
      .order('event_date', { ascending: false })
      .then(({ data }) => {
        setEvents(data || [])
        setLoading(false)
      })
  }, [])

  const filtered = query
    ? events.filter(e => {
        const q = query.toLowerCase()
        return (e.name || '').toLowerCase().includes(q)
          || (e.venue || '').toLowerCase().includes(q)
          || (e.series?.name || '').toLowerCase().includes(q)
          || (e.series?.brand?.name || '').toLowerCase().includes(q)
      })
    : events

  return (
    <PageScreen title="Events" subtitle={`${events.length} ${events.length === 1 ? 'event' : 'events'}`} back>
      <PageBody>
        <input
          className="input mb-4"
          placeholder="Search events, venues, brands…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {loading ? (
          <p className="text-sm text-ink-400">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-ink-400">{query ? 'No matches.' : 'No events yet.'}</p>
        ) : (
          <div className="space-y-2">
            {filtered.map(ev => {
              const brand = ev.series?.brand
              return (
                <Link
                  key={ev.id}
                  to={`/brands/${brand?.slug}/series/${ev.series?.slug}/events/${ev.slug}`}
                  className="card flex items-center gap-3 px-4 py-3 hover:border-brand-200 hover:shadow-sm transition-all group"
                >
                  {brand?.logo_url ? (
                    <img src={brand.logo_url} alt="" className="w-10 h-10 rounded-lg object-contain bg-surface-50 border border-surface-200 flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-semibold text-xs flex-shrink-0" style={{ backgroundColor: brand?.color || '#6366f1' }}>
                      {brand?.name?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-ink-900 group-hover:text-brand-600 transition-colors truncate">{ev.name}</div>
                    <div className="text-xs text-ink-400 truncate">
                      {brand?.name} · {ev.series?.name}
                      {ev.event_date && <> · {format(new Date(ev.event_date), 'MMM d, yyyy')}</>}
                    </div>
                  </div>
                  <PhaseBadge phase={ev.phase} />
                  <FavoriteButton type="event" id={ev.id} size="sm" />
                </Link>
              )
            })}
          </div>
        )}
      </PageBody>
    </PageScreen>
  )
}
