import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import PageScreen, { PageBody } from '@/components/PageScreen'

const GROUP_ORDER = ['brand', 'series', 'event', 'menu', 'item']
const GROUP_LABELS = {
  brand:  'Brands',
  series: 'Series',
  event:  'Events',
  menu:   'Menus',
  item:   'Items',
}

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const requestSeq = useRef(0)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (!query.trim()) { setResults(null); setLoading(false); return }
    const term = query.trim()
    const seq = ++requestSeq.current
    setLoading(true)
    const t = setTimeout(async () => {
      const like = `%${term}%`
      const [b, s, e, m, i] = await Promise.all([
        supabase.from('brands')
          .select('id, name, slug, color, logo_url')
          .ilike('name', like)
          .limit(10),
        supabase.from('series')
          .select('id, name, slug, brand:brands(name, slug, color, logo_url)')
          .ilike('name', like)
          .limit(10),
        supabase.from('events')
          .select('id, name, slug, event_date, venue, series:series(slug, brand:brands(slug, name, color, logo_url))')
          .or(`name.ilike.${like},venue.ilike.${like}`)
          .limit(15),
        supabase.from('menus')
          .select('id, name, slug, category, size, event:events(slug, series:series(slug, brand:brands(slug, name, color, logo_url)))')
          .ilike('name', like)
          .limit(15),
        supabase.from('menu_items')
          .select('id, title, description, menu:menus(name, slug, event:events(slug, series:series(slug, brand:brands(slug, name, color, logo_url))))')
          .or(`title.ilike.${like},description.ilike.${like}`)
          .limit(20),
      ])
      if (seq !== requestSeq.current) return
      setResults({
        brand:  (b.data || []).map(x => ({ type: 'brand',  raw: x })),
        series: (s.data || []).map(x => ({ type: 'series', raw: x })),
        event:  (e.data || []).map(x => ({ type: 'event',  raw: x })),
        menu:   (m.data || []).map(x => ({ type: 'menu',   raw: x })),
        item:   (i.data || []).map(x => ({ type: 'item',   raw: x })),
      })
      setLoading(false)
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  const totalHits = results
    ? GROUP_ORDER.reduce((sum, k) => sum + (results[k]?.length || 0), 0)
    : 0

  return (
    <PageScreen title="Search" subtitle="Brands, series, events, menus, items" back>
      <PageBody>
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-300 pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            ref={inputRef}
            className="input pl-9 pr-9"
            placeholder="Search…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
          {query && (
            <button
              onClick={() => { setQuery(''); inputRef.current?.focus() }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink-600"
              aria-label="Clear"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {!query.trim() && (
          <div className="card p-6 text-center">
            <p className="text-sm text-ink-500">Type to search across everything in Menu Hub.</p>
            <p className="text-xs text-ink-400 mt-2">Try a brand, an event, a cocktail name, or a venue.</p>
          </div>
        )}

        {query.trim() && loading && !results && (
          <p className="text-sm text-ink-400">Searching…</p>
        )}

        {results && totalHits === 0 && !loading && (
          <div className="card p-6 text-center">
            <p className="text-sm text-ink-500">No matches for "{query}".</p>
          </div>
        )}

        {results && totalHits > 0 && (
          <div className="space-y-5">
            {GROUP_ORDER.map(group => {
              const items = results[group]
              if (!items?.length) return null
              return (
                <section key={group}>
                  <div className="flex items-baseline justify-between mb-2 px-1">
                    <h2 className="text-xs font-semibold text-ink-500 uppercase tracking-wider">{GROUP_LABELS[group]}</h2>
                    <span className="text-[11px] text-ink-400">{items.length}{items.length >= maxFor(group) ? '+' : ''}</span>
                  </div>
                  <div className="space-y-1.5">
                    {items.map(hit => <ResultRow key={`${hit.type}-${hit.raw.id}`} hit={hit} />)}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </PageBody>
    </PageScreen>
  )
}

function maxFor(group) {
  return group === 'item' ? 20 : group === 'menu' || group === 'event' ? 15 : 10
}

function ResultRow({ hit }) {
  const { type, raw } = hit
  const brand = (() => {
    if (type === 'brand') return raw
    if (type === 'series') return raw.brand
    if (type === 'event')  return raw.series?.brand
    if (type === 'menu')   return raw.event?.series?.brand
    if (type === 'item')   return raw.menu?.event?.series?.brand
    return null
  })()

  const to = (() => {
    if (type === 'brand')  return `/brands/${raw.slug}`
    if (type === 'series') return `/brands/${raw.brand?.slug}/series/${raw.slug}`
    if (type === 'event')  return `/brands/${raw.series?.brand?.slug}/series/${raw.series?.slug}/events/${raw.slug}`
    if (type === 'menu')   return `/brands/${raw.event?.series?.brand?.slug}/series/${raw.event?.series?.slug}/events/${raw.event?.slug}/menus/${raw.slug}`
    if (type === 'item')   return `/brands/${raw.menu?.event?.series?.brand?.slug}/series/${raw.menu?.event?.series?.slug}/events/${raw.menu?.event?.slug}/menus/${raw.menu?.slug}`
    return '/'
  })()

  const title = type === 'item' ? raw.title : raw.name
  const subtitle = (() => {
    if (type === 'brand')  return 'Brand'
    if (type === 'series') return raw.brand?.name || 'Series'
    if (type === 'event')  return [raw.series?.brand?.name, raw.series?.name].filter(Boolean).join(' · ')
    if (type === 'menu')   return [raw.event?.series?.brand?.name, raw.event?.name].filter(Boolean).join(' · ')
    if (type === 'item')   return raw.menu?.name
      ? `${raw.menu.event?.series?.brand?.name || ''} · ${raw.menu.name}`
      : ''
    return ''
  })()

  return (
    <Link
      to={to}
      className="card flex items-center gap-3 px-3 py-2.5 hover:border-brand-200 hover:shadow-sm transition-all group"
    >
      {brand?.logo_url ? (
        <img src={brand.logo_url} alt="" className="w-9 h-9 rounded-lg object-contain bg-surface-50 border border-surface-200 flex-shrink-0" />
      ) : (
        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-semibold text-xs flex-shrink-0" style={{ backgroundColor: brand?.color || '#6366f1' }}>
          {(brand?.name?.[0] || title?.[0] || '?').toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-ink-900 group-hover:text-brand-600 truncate">{title}</div>
        {subtitle && <div className="text-xs text-ink-400 truncate">{subtitle}</div>}
      </div>
      <svg className="w-4 h-4 text-ink-300 group-hover:text-brand-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  )
}
