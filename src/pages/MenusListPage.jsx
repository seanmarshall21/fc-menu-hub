import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import PageScreen, { PageBody } from '@/components/PageScreen'
import PhaseBadge from '@/components/PhaseBadge'
import EntityIcon from '@/components/EntityIcon'

export default function MenusListPage() {
  const [menus, setMenus] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    supabase
      .from('menus')
      .select(`
        id, name, slug, category, size, phase, updated_at, last_synced_at, icon_url, icon_name,
        event:events(name, slug, series:series(name, slug, brand:brands(name, slug, color, logo_url, icon_name)))
      `)
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        setMenus(data || [])
        setLoading(false)
      })
  }, [])

  const filtered = query
    ? menus.filter(m => {
        const q = query.toLowerCase()
        return (m.name || '').toLowerCase().includes(q)
          || (m.event?.name || '').toLowerCase().includes(q)
          || (m.event?.series?.brand?.name || '').toLowerCase().includes(q)
          || (m.category || '').toLowerCase().includes(q)
      })
    : menus

  return (
    <PageScreen title="Menus" subtitle={`${menus.length} ${menus.length === 1 ? 'menu' : 'menus'}`} back>
      <PageBody>
        <input
          className="input mb-4"
          placeholder="Search menus, events, brands…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {loading ? (
          <p className="text-sm text-ink-400">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-ink-400">{query ? 'No matches.' : 'No menus yet.'}</p>
        ) : (
          <div className="space-y-2">
            {filtered.map(m => {
              const brand = m.event?.series?.brand
              const series = m.event?.series
              const syncNeeded = (!m.last_synced_at || (m.updated_at && new Date(m.updated_at) > new Date(m.last_synced_at)))
              return (
                <Link
                  key={m.id}
                  to={`/brands/${brand?.slug}/series/${series?.slug}/events/${m.event?.slug}/menus/${m.slug}`}
                  className="card flex items-center gap-3 px-4 py-3 hover:border-brand-200 hover:shadow-sm transition-all group"
                >
                  <EntityIcon
                    iconUrl={m.icon_url || brand?.logo_url}
                    iconName={m.icon_name || brand?.icon_name}
                    fallbackText={m.name || brand?.name}
                    fallbackColor={brand?.color}
                    size={40}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink-900 group-hover:text-brand-600 transition-colors truncate">{m.name}</span>
                      {m.size && <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-100 text-ink-400 font-mono uppercase flex-shrink-0">{m.size}</span>}
                    </div>
                    <div className="text-xs text-ink-400 truncate capitalize">
                      {m.category?.replace('_', ' ')} · {brand?.name} · {m.event?.name}
                    </div>
                  </div>
                  {syncNeeded && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex-shrink-0">Sync</span>
                  )}
                  <PhaseBadge phase={m.phase} />
                </Link>
              )
            })}
          </div>
        )}
      </PageBody>
    </PageScreen>
  )
}
