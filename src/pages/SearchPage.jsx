import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import PageScreen, { PageBody } from '@/components/PageScreen'
import EntityIcon from '@/components/EntityIcon'

const TYPE_ORDER = ['brand', 'series', 'event', 'menu', 'item']
const TYPE_LABELS = {
  brand:  'Brands',
  series: 'Series',
  event:  'Events',
  menu:   'Menus',
  item:   'Items',
}

const FILTERS = [
  { value: 'all',    label: 'All' },
  { value: 'brand',  label: 'Brands' },
  { value: 'series', label: 'Series' },
  { value: 'event',  label: 'Events' },
  { value: 'menu',   label: 'Menus' },
  { value: 'item',   label: 'Items' },
]

const SORTS = [
  { value: 'recent', label: 'Most recent' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'az',     label: 'A → Z' },
  { value: 'za',     label: 'Z → A' },
]

const LIMITS = {
  all:    { brand: 8,  series: 8,  event: 10, menu: 12, item: 14 },
  brand:  { brand: 60 },
  series: { series: 60 },
  event:  { event: 80 },
  menu:   { menu: 80 },
  item:   { item: 100 },
}

const SELECT = {
  brand:  'id, name, slug, color, logo_url, icon_name, created_at',
  series: 'id, name, slug, created_at, icon_url, icon_name, brand:brands(name, slug, color, logo_url, icon_name)',
  event:  'id, name, slug, event_date, venue, created_at, icon_url, icon_name, series:series(slug, brand:brands(slug, name, color, logo_url, icon_name))',
  menu:   'id, name, slug, category, size, created_at, icon_url, icon_name, event:events(slug, series:series(slug, brand:brands(slug, name, color, logo_url, icon_name)))',
  item:   'id, title, description, created_at, menu:menus(name, slug, icon_url, icon_name, event:events(slug, series:series(slug, brand:brands(slug, name, color, logo_url, icon_name))))',
}

const NAME_KEY = { brand: 'name', series: 'name', event: 'name', menu: 'name', item: 'title' }

function applySort(rows, type, sort) {
  const nameField = NAME_KEY[type]
  const copy = [...rows]
  switch (sort) {
    case 'recent': return copy.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    case 'oldest': return copy.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
    case 'az':     return copy.sort((a, b) => (a[nameField] || '').localeCompare(b[nameField] || ''))
    case 'za':     return copy.sort((a, b) => (b[nameField] || '').localeCompare(a[nameField] || ''))
    default:       return copy
  }
}

function orderFor(type, sort) {
  // Hint Postgres to do the heavy lifting; client re-sort handles ties + nested
  if (sort === 'recent') return { col: 'created_at', asc: false }
  if (sort === 'oldest') return { col: 'created_at', asc: true }
  if (sort === 'az')     return { col: NAME_KEY[type], asc: true }
  if (sort === 'za')     return { col: NAME_KEY[type], asc: false }
  return { col: 'created_at', asc: false }
}

function filterFor(type, term) {
  if (!term) return null
  const like = `%${term}%`
  if (type === 'event') return `name.ilike.${like},venue.ilike.${like}`
  if (type === 'item')  return `title.ilike.${like},description.ilike.${like}`
  return null // single-field types use .ilike()
}

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('recent')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const requestSeq = useRef(0)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const term = query.trim()
    const seq = ++requestSeq.current
    setLoading(true)

    const t = setTimeout(async () => {
      const limits = LIMITS[filter] || LIMITS.all
      const types = filter === 'all' ? TYPE_ORDER : [filter]

      const queries = types.map(type => {
        const order = orderFor(type, sort)
        let q = supabase
          .from(typeTable(type))
          .select(SELECT[type])
          .order(order.col, { ascending: order.asc })
          .limit(limits[type] || 20)

        if (term) {
          const orExpr = filterFor(type, term)
          if (orExpr) {
            q = q.or(orExpr)
          } else {
            q = q.ilike(NAME_KEY[type], `%${term}%`)
          }
        }
        return q.then(r => [type, r.data || []])
      })

      const settled = await Promise.all(queries)
      if (seq !== requestSeq.current) return

      const grouped = {}
      for (const [type, rows] of settled) {
        grouped[type] = applySort(rows, type, sort).map(raw => ({ type, raw }))
      }
      setResults(grouped)
      setLoading(false)
    }, query ? 200 : 0)

    return () => clearTimeout(t)
  }, [query, filter, sort])

  const totalHits = results
    ? TYPE_ORDER.reduce((sum, k) => sum + (results[k]?.length || 0), 0)
    : 0

  return (
    <PageScreen
      title="Search"
      subtitle="Brands, series, events, menus, items"
      back
    >
      <PageBody>
        <div className="relative mb-3">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-300 pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            ref={inputRef}
            className="input pl-9 pr-9"
            placeholder="Search anything…"
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

        {/* Filter chips + sort */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-1.5 overflow-x-auto flex-1 -mx-1 px-1">
            {FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap transition-colors border ${
                  filter === f.value
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-surface-0 text-ink-600 border-surface-200 hover:border-brand-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="input input-sm w-auto flex-shrink-0"
            aria-label="Sort by"
          >
            {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        {!query.trim() && !loading && totalHits === 0 && (
          <p className="text-sm text-ink-400 px-1">Loading suggestions…</p>
        )}

        {loading && !results && (
          <p className="text-sm text-ink-400 px-1">Searching…</p>
        )}

        {results && totalHits === 0 && !loading && (
          <div className="card p-6 text-center">
            <p className="text-sm text-ink-500">
              {query ? `No matches for "${query}".` : 'No items found.'}
            </p>
          </div>
        )}

        {results && totalHits > 0 && (
          <div className="space-y-5">
            {(filter === 'all' ? TYPE_ORDER : [filter]).map(group => {
              const items = results[group]
              if (!items?.length) return null
              return (
                <section key={group}>
                  <div className="flex items-baseline justify-between mb-2 px-1">
                    <h2 className="text-xs font-semibold text-ink-500 uppercase tracking-wider">{TYPE_LABELS[group]}</h2>
                    <span className="text-[11px] text-ink-400">{items.length}</span>
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

function typeTable(type) {
  return type === 'brand'  ? 'brands'
       : type === 'series' ? 'series'
       : type === 'event'  ? 'events'
       : type === 'menu'   ? 'menus'
       : 'menu_items'
}

function ResultRow({ hit }) {
  const { type, raw } = hit
  const brand = (() => {
    if (type === 'brand')  return raw
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
      <EntityIcon
        iconUrl={
          type === 'brand' ? raw.logo_url :
          raw.icon_url || brand?.logo_url
        }
        iconName={
          type === 'brand' ? raw.icon_name :
          raw.icon_name || brand?.icon_name
        }
        fallbackText={title || brand?.name}
        fallbackColor={brand?.color}
        size={36}
      />
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
