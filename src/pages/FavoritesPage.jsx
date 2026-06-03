import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useFavorites } from '@/hooks/useFavorites'
import FavoriteButton from '@/components/FavoriteButton'
import { format } from 'date-fns'

export default function FavoritesPage() {
  const { favorites, loading } = useFavorites()
  const [brands, setBrands]   = useState([])
  const [series, setSeries]   = useState([])
  const [events, setEvents]   = useState([])
  const [hydrating, setHydrating] = useState(false)

  useEffect(() => {
    async function hydrate() {
      const brandIds  = favorites.filter(f => f.target_type === 'brand') .map(f => f.target_id)
      const seriesIds = favorites.filter(f => f.target_type === 'series').map(f => f.target_id)
      const eventIds  = favorites.filter(f => f.target_type === 'event') .map(f => f.target_id)

      setHydrating(true)
      const [bRes, sRes, eRes] = await Promise.all([
        brandIds.length
          ? supabase.from('brands').select('id, name, slug, logo_url, color').in('id', brandIds)
          : Promise.resolve({ data: [] }),
        seriesIds.length
          ? supabase.from('series').select('id, name, slug, brand:brands(name, slug, logo_url, color)').in('id', seriesIds)
          : Promise.resolve({ data: [] }),
        eventIds.length
          ? supabase.from('events').select('id, name, slug, event_date, venue, phase, series:series(name, slug, brand:brands(name, slug, color))').in('id', eventIds)
          : Promise.resolve({ data: [] }),
      ])
      setBrands(bRes.data || [])
      setSeries(sRes.data || [])
      setEvents(eRes.data || [])
      setHydrating(false)
    }
    hydrate()
  }, [favorites])

  const empty = !loading && !hydrating && favorites.length === 0

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl">
      <div className="mb-6 flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-400 flex-shrink-0">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.86 5.706a1 1 0 00.95.69h6.001c.969 0 1.371 1.24.588 1.81l-4.857 3.527a1 1 0 00-.364 1.118l1.86 5.706c.3.921-.755 1.688-1.539 1.118l-4.857-3.527a1 1 0 00-1.176 0l-4.857 3.527c-.784.57-1.838-.197-1.539-1.118l1.86-5.706a1 1 0 00-.364-1.118L2.6 11.133c-.783-.57-.38-1.81.588-1.81h6.002a1 1 0 00.95-.69l1.86-5.706z" /></svg>
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-ink-900 tracking-tight">Favorites</h1>
          <p className="text-sm text-ink-500 mt-1">Brands, series, and events you've starred.</p>
        </div>
      </div>

      {loading && <div className="text-sm text-ink-400">Loading…</div>}

      {empty && (
        <div className="card p-8 text-center">
          <p className="text-sm text-ink-500">No favorites yet.</p>
          <p className="text-xs text-ink-400 mt-1">Tap the ★ on a brand, series, or event to add one here.</p>
        </div>
      )}

      {brands.length > 0 && (
        <Section title="Brands">
          {brands.map(b => (
            <Link key={b.id} to={`/brands/${b.slug}`} className="card flex items-center gap-3 px-4 py-3 hover:border-brand-200 hover:shadow-sm transition-all group">
              <Avatar logoUrl={b.logo_url} color={b.color} name={b.name} />
              <span className="flex-1 font-semibold text-ink-900 group-hover:text-brand-600 transition-colors truncate">{b.name}</span>
              <FavoriteButton type="brand" id={b.id} size="sm" />
            </Link>
          ))}
        </Section>
      )}

      {series.length > 0 && (
        <Section title="Series">
          {series.map(s => (
            <Link key={s.id} to={`/brands/${s.brand?.slug}/series/${s.slug}`} className="card flex items-center gap-3 px-4 py-3 hover:border-brand-200 hover:shadow-sm transition-all group">
              <Avatar logoUrl={s.brand?.logo_url} color={s.brand?.color} name={s.brand?.name} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-ink-900 group-hover:text-brand-600 transition-colors truncate">{s.name}</div>
                <div className="text-xs text-ink-400">{s.brand?.name}</div>
              </div>
              <FavoriteButton type="series" id={s.id} size="sm" />
            </Link>
          ))}
        </Section>
      )}

      {events.length > 0 && (
        <Section title="Events">
          {events.map(e => (
            <Link key={e.id} to={`/brands/${e.series?.brand?.slug}/series/${e.series?.slug}/events/${e.slug}`} className="card flex items-center gap-3 px-4 py-3 hover:border-brand-200 hover:shadow-sm transition-all group">
              <Avatar color={e.series?.brand?.color} name={e.series?.brand?.name} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-ink-900 group-hover:text-brand-600 transition-colors truncate">{e.name}</div>
                <div className="text-xs text-ink-400 truncate">
                  {e.series?.brand?.name} · {e.series?.name}
                  {e.event_date ? ` · ${format(new Date(e.event_date), 'MMM d, yyyy')}` : ''}
                </div>
              </div>
              <FavoriteButton type="event" id={e.id} size="sm" />
            </Link>
          ))}
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="mt-6 first:mt-0">
      <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-3 px-1">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Avatar({ logoUrl, color, name }) {
  if (logoUrl) {
    return <img src={logoUrl} alt="" className="w-10 h-10 rounded-lg object-contain bg-surface-50 border border-surface-200 flex-shrink-0" />
  }
  return (
    <div
      className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-semibold text-sm flex-shrink-0"
      style={{ backgroundColor: color || '#6366f1' }}
    >
      {(name?.[0] || '?').toUpperCase()}
    </div>
  )
}
