import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import PhaseBadge from '@/components/PhaseBadge'
import { format } from 'date-fns'

export default function Dashboard() {
  const { profile } = useAuth()
  const [recentEvents, setRecentEvents] = useState([])
  const [stats, setStats] = useState({ brands: 0, events: 0, menus: 0, pendingEdits: 0 })
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

  const statCards = [
    { label: 'Brands', value: stats.brands, color: 'text-violet-600' },
    { label: 'Events', value: stats.events, color: 'text-brand-600' },
    { label: 'Menus', value: stats.menus, color: 'text-emerald-600' },
    { label: 'Pending Edits', value: stats.pendingEdits, color: 'text-red-600' },
  ]

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-6 sm:mb-8 flex items-center gap-4">
        <img src="/logo-tile.svg" alt="Menu Hub" className="w-10 h-10 flex-shrink-0 opacity-90" />
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-ink-900 tracking-tight">
            Good {timeOfDay()}, {profile?.full_name?.split(' ')[0] || 'there'}
          </h1>
          <p className="text-sm text-ink-500 mt-1">Menu Hub · BKSTG</p>
        </div>
      </div>

      {/* Stat cards — 2 col mobile, 4 col desktop */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        {statCards.map(card => (
          <div key={card.label} className="card p-4 sm:p-5">
            <p className="text-xs font-medium text-ink-400 uppercase tracking-wider mb-2">{card.label}</p>
            <p className={`text-2xl sm:text-3xl font-semibold ${card.color}`}>{loading ? '—' : card.value}</p>
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
    </div>
  )
}

function timeOfDay() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
