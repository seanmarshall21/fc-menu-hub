import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useBrands } from '@/hooks/useBrands'
import { useFavorites } from '@/hooks/useFavorites'
import FavoriteButton from '@/components/FavoriteButton'
import PageScreen, { PageBody } from '@/components/PageScreen'
import PhaseBadge from '@/components/PhaseBadge'
import { format } from 'date-fns'

export default function Dashboard() {
  const { profile } = useAuth()
  const { brands } = useBrands()
  const { favorites } = useFavorites()
  const [recentEvents, setRecentEvents] = useState([])
  const [stats, setStats] = useState({ brands: 0, events: 0, menus: 0, pendingEdits: 0 })
  const [favBrands, setFavBrands]   = useState([])
  const [favSeries, setFavSeries]   = useState([])
  const [favEvents, setFavEvents]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [brandsRes, eventsRes, menusRes, pendingRes] = await Promise.all([
        supabase.from('brands').select('id'),
        supabase.from('events').select('id'),
        supabase.from('menus').select('id'),
        supabase.from('menu_items').select('id').eq('edit_status', 'pending_approval'),
      ])

      setStats({
        brands: brandsRes.data?.length || 0,
        events: eventsRes.data?.length || 0,
        menus: menusRes.data?.length || 0,
        pendingEdits: pendingRes.data?.length || 0,
      })

      const { data: events } = await supabase
        .from('events')
        .select('*, series(name, slug, brand:brands(name, slug, color))')
        .order('created_at', { ascending: false })
        .limit(8)

      setRecentEvents(events || [])
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    async function hydrateFavs() {
      const brandIds  = favorites.filter(f => f.target_type === 'brand') .map(f => f.target_id)
      const seriesIds = favorites.filter(f => f.target_type === 'series').map(f => f.target_id)
      const eventIds  = favorites.filter(f => f.target_type === 'event') .map(f => f.target_id)
      const [b, s, e] = await Promise.all([
        brandIds.length  ? supabase.from('brands').select('id, name, slug, logo_url, color').in('id', brandIds)  : { data: [] },
        seriesIds.length ? supabase.from('series').select('id, name, slug, brand:brands(name, slug, logo_url, color)').in('id', seriesIds) : { data: [] },
        eventIds.length  ? supabase.from('events').select('id, name, slug, event_date, series:series(name, slug, brand:brands(name, slug, color))').in('id', eventIds) : { data: [] },
      ])
      setFavBrands(b.data || [])
      setFavSeries(s.data || [])
      setFavEvents(e.data || [])
    }
    hydrateFavs()
  }, [favorites])

  const statCards = [
    { label: 'Brands', value: stats.brands, color: 'text-violet-600' },
    { label: 'Events', value: stats.events, color: 'text-brand-600' },
    { label: 'Menus',  value: stats.menus,  color: 'text-emerald-600' },
    { label: 'Edits',  value: stats.pendingEdits, color: 'text-red-600' },
  ]

  return (
    <PageScreen
      title={`Good ${timeOfDay()}, ${profile?.full_name?.split(' ')[0] || 'there'}`}
      subtitle="Menu Hub · BKSTG"
    >
      <PageBody>
      {/* Hero lockup */}
      <div className="flex items-center justify-center py-4 sm:py-8 mb-2">
        <img src="/menu-hub-lockup.svg" alt="Menu Hub" className="max-w-[320px] sm:max-w-[420px] w-full h-auto" />
      </div>

      {/* Stat cards — 4 across at every breakpoint, centered */}
      <div className="grid grid-cols-4 gap-2 sm:gap-4 mb-6 sm:mb-8">
        {statCards.map(card => (
          <div key={card.label} className="card p-3 sm:p-5 text-center">
            <p className="text-[10px] sm:text-xs font-medium text-ink-400 uppercase tracking-wider mb-1 sm:mb-2">{card.label}</p>
            <p className={`text-xl sm:text-3xl font-semibold ${card.color}`}>{loading ? '—' : card.value}</p>
          </div>
        ))}
      </div>

      {/* Recent events — horizontal scroll on mobile */}
      <div className="card overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-surface-200">
          <h2 className="text-sm font-semibold text-ink-900">Recent Events</h2>
        </div>
        {loading ? (
          <div className="px-6 py-8 text-sm text-ink-400">Loading…</div>
        ) : recentEvents.length === 0 ? (
          <div className="px-6 py-8 text-sm text-ink-400">No events yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[540px]">
              <thead>
                <tr className="border-b border-surface-100">
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-ink-400 uppercase tracking-wider">Event</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-ink-400 uppercase tracking-wider">Brand / Series</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-ink-400 uppercase tracking-wider hidden sm:table-cell">Date</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-ink-400 uppercase tracking-wider hidden sm:table-cell">Venue</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-ink-400 uppercase tracking-wider">Phase</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {recentEvents.map(event => (
                  <tr key={event.id} className="table-row-hover">
                    <td className="px-4 sm:px-6 py-3">
                      <Link
                        to={`/brands/${event.series?.brand?.slug}/series/${event.series?.slug}/events/${event.slug}`}
                        className="font-medium text-ink-900 hover:text-brand-600 transition-colors whitespace-nowrap"
                      >
                        {event.name}
                      </Link>
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-ink-500 whitespace-nowrap">
                      <span className="flex items-center gap-1.5">
                        {event.series?.brand?.color && (
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: event.series.brand.color }} />
                        )}
                        {event.series?.brand?.name} · {event.series?.name}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-ink-500 whitespace-nowrap hidden sm:table-cell">
                      {event.event_date ? format(new Date(event.event_date), 'MMM d, yyyy') : '—'}
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-ink-500 whitespace-nowrap hidden sm:table-cell">{event.venue || '—'}</td>
                    <td className="px-4 sm:px-6 py-3"><PhaseBadge phase={event.phase} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Favorites */}
      {favorites.length > 0 && (
        <div className="mt-6 sm:mt-8">
          <div className="flex items-center justify-between mb-3 px-1">
            <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider">Favorites</p>
            <Link to="/favorites" className="text-xs text-brand-600 hover:text-brand-700 font-medium">View all</Link>
          </div>
          <div className="space-y-2">
            {favBrands.slice(0, 3).map(b => (
              <Link key={`b-${b.id}`} to={`/brands/${b.slug}`} className="card flex items-center gap-3 px-4 py-3 hover:border-brand-200 hover:shadow-sm transition-all group">
                <FavTile logoUrl={b.logo_url} color={b.color} name={b.name} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-ink-900 group-hover:text-brand-600 truncate">{b.name}</div>
                  <div className="text-xs text-ink-400">Brand</div>
                </div>
                <FavoriteButton type="brand" id={b.id} size="sm" />
              </Link>
            ))}
            {favSeries.slice(0, 3).map(s => (
              <Link key={`s-${s.id}`} to={`/brands/${s.brand?.slug}/series/${s.slug}`} className="card flex items-center gap-3 px-4 py-3 hover:border-brand-200 hover:shadow-sm transition-all group">
                <FavTile logoUrl={s.brand?.logo_url} color={s.brand?.color} name={s.brand?.name} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-ink-900 group-hover:text-brand-600 truncate">{s.name}</div>
                  <div className="text-xs text-ink-400 truncate">{s.brand?.name} · Series</div>
                </div>
                <FavoriteButton type="series" id={s.id} size="sm" />
              </Link>
            ))}
            {favEvents.slice(0, 3).map(e => (
              <Link key={`e-${e.id}`} to={`/brands/${e.series?.brand?.slug}/series/${e.series?.slug}/events/${e.slug}`} className="card flex items-center gap-3 px-4 py-3 hover:border-brand-200 hover:shadow-sm transition-all group">
                <FavTile color={e.series?.brand?.color} name={e.series?.brand?.name} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-ink-900 group-hover:text-brand-600 truncate">{e.name}</div>
                  <div className="text-xs text-ink-400 truncate">{e.series?.brand?.name} · {e.series?.name}</div>
                </div>
                <FavoriteButton type="event" id={e.id} size="sm" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Brands list */}
      {brands.length > 0 && (
        <div className="mt-6 sm:mt-8">
          <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-3 px-1">Brands</p>
          <div className="space-y-2">
            {brands.map(brand => (
              <Link
                key={brand.id}
                to={`/brands/${brand.slug}`}
                className="card flex items-center gap-3 px-4 py-3 hover:border-brand-200 hover:shadow-sm transition-all group"
              >
                {brand.logo_url ? (
                  <img
                    src={brand.logo_url}
                    alt=""
                    className="w-10 h-10 rounded-lg object-contain bg-surface-50 border border-surface-200 flex-shrink-0"
                  />
                ) : (
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-semibold text-sm flex-shrink-0"
                    style={{ backgroundColor: brand.color || '#6366f1' }}
                  >
                    {brand.name?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <span className="flex-1 font-semibold text-ink-900 group-hover:text-brand-600 transition-colors truncate">
                  {brand.name}
                </span>
                <svg className="w-4 h-4 text-ink-300 group-hover:text-brand-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      )}
      </PageBody>
    </PageScreen>
  )
}

function FavTile({ logoUrl, color, name }) {
  if (logoUrl) {
    return <img src={logoUrl} alt="" className="w-10 h-10 rounded-lg object-contain bg-surface-50 border border-surface-200 flex-shrink-0" />
  }
  return (
    <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-semibold text-sm flex-shrink-0"
      style={{ backgroundColor: color || '#6366f1' }}>
      {(name?.[0] || '?').toUpperCase()}
    </div>
  )
}

function timeOfDay() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
