import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import PageScreen, { PageBody } from '@/components/PageScreen'

export default function EditsListPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    supabase
      .from('menu_items')
      .select(`
        id, title, last_edited_at, last_edited_by,
        menu:menus(
          id, name, slug,
          event:events(slug, series:series(slug, brand:brands(slug, color, logo_url, name)))
        )
      `)
      .eq('edit_status', 'pending_approval')
      .order('last_edited_at', { ascending: false })
      .then(({ data }) => {
        setItems(data || [])
        setLoading(false)
      })
  }, [])

  // Group items by menu
  const byMenu = items.reduce((acc, it) => {
    const menuId = it.menu?.id
    if (!menuId) return acc
    if (!acc[menuId]) acc[menuId] = { menu: it.menu, items: [] }
    acc[menuId].items.push(it)
    return acc
  }, {})
  const groups = Object.values(byMenu)

  const filtered = query
    ? groups.filter(g => {
        const q = query.toLowerCase()
        return (g.menu.name || '').toLowerCase().includes(q)
          || g.items.some(i => (i.title || '').toLowerCase().includes(q))
      })
    : groups

  return (
    <PageScreen title="Pending Edits" subtitle={`${items.length} pending across ${groups.length} ${groups.length === 1 ? 'menu' : 'menus'}`} back>
      <PageBody>
        <input
          className="input mb-4"
          placeholder="Search pending items, menus…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {loading ? (
          <p className="text-sm text-ink-400">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="text-sm text-ink-500">{query ? 'No matches.' : 'No pending edits — everything is approved.'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(g => {
              const brand = g.menu?.event?.series?.brand
              return (
                <Link
                  key={g.menu.id}
                  to={`/brands/${brand?.slug}/series/${g.menu.event?.series?.slug}/events/${g.menu.event?.slug}/menus/${g.menu.slug}`}
                  className="card block px-4 py-3 hover:border-brand-200 hover:shadow-sm transition-all group"
                >
                  <div className="flex items-center gap-3 mb-2">
                    {brand?.logo_url ? (
                      <img src={brand.logo_url} alt="" className="w-8 h-8 rounded-lg object-contain bg-surface-50 border border-surface-200 flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-semibold text-[10px] flex-shrink-0" style={{ backgroundColor: brand?.color || '#6366f1' }}>
                        {brand?.name?.[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-ink-900 group-hover:text-brand-600 truncate">{g.menu.name}</div>
                      <div className="text-[11px] text-ink-400 truncate">{brand?.name}</div>
                    </div>
                    <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                      {g.items.length} pending
                    </span>
                  </div>
                  <ul className="text-xs text-ink-500 ml-11 space-y-0.5 list-disc list-inside">
                    {g.items.slice(0, 5).map(i => (
                      <li key={i.id} className="truncate">{i.title}</li>
                    ))}
                    {g.items.length > 5 && (
                      <li className="text-ink-400 italic">+ {g.items.length - 5} more…</li>
                    )}
                  </ul>
                </Link>
              )
            })}
          </div>
        )}
      </PageBody>
    </PageScreen>
  )
}
