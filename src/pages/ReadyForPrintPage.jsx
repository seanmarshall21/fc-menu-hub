import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PageScreen, { PageBody } from '@/components/PageScreen'
import { useReadyMenus, readyMenuLink } from '@/hooks/useReadyMenus'

// Full list of every menu ready for print prep. Searchable, filterable by
// brand/size, sortable, and groupable — for festivals with lots of menus.
export default function ReadyForPrintPage() {
  const { ready, awaiting, loaded } = useReadyMenus()
  const [q, setQ] = useState('')
  const [brand, setBrand] = useState('all')
  const [size, setSize] = useState('all')
  const [sort, setSort] = useState('name')
  const [group, setGroup] = useState('event')

  const brands = useMemo(() => [...new Set(ready.map(m => m.events?.series?.brand?.name).filter(Boolean))].sort(), [ready])
  const sizes = useMemo(() => [...new Set(ready.map(m => m.size).filter(Boolean))], [ready])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let rows = ready.filter(m => {
      if (brand !== 'all' && m.events?.series?.brand?.name !== brand) return false
      if (size !== 'all' && m.size !== size) return false
      if (needle) {
        const hay = `${m.name} ${m.events?.name || ''} ${m.events?.series?.name || ''} ${m.events?.series?.brand?.name || ''}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
    rows = [...rows].sort((a, b) => {
      if (sort === 'size') return String(a.size || '').localeCompare(String(b.size || '')) || a.name.localeCompare(b.name)
      if (sort === 'brand') return String(a.events?.series?.brand?.name || '').localeCompare(String(b.events?.series?.brand?.name || '')) || a.name.localeCompare(b.name)
      if (sort === 'event') return String(a.events?.name || '').localeCompare(String(b.events?.name || '')) || a.name.localeCompare(b.name)
      return a.name.localeCompare(b.name)
    })
    return rows
  }, [ready, q, brand, size, sort])

  const grouped = useMemo(() => {
    if (group === 'none') return [{ key: '', label: '', rows: filtered }]
    const map = new Map()
    for (const m of filtered) {
      const label = group === 'brand'
        ? (m.events?.series?.brand?.name || 'Unknown')
        : `${m.events?.series?.brand?.name || ''} · ${m.events?.name || m.events?.slug || 'Event'}`
      if (!map.has(label)) map.set(label, [])
      map.get(label).push(m)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, rows]) => ({ key: label, label, rows }))
  }, [filtered, group])

  return (
    <PageScreen back breadcrumbs={[{ label: 'Ready for print prep' }]}>
      <PageBody>
        <div className="flex items-center justify-between gap-2 mb-4">
          <p className="text-sm text-ink-500">
            {ready.length} menu{ready.length === 1 ? '' : 's'} ready{awaiting > 0 ? ` · ${awaiting} still awaiting sponsors` : ''}.
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-2 mb-4">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search ready menus…"
            className="input py-1.5 text-sm flex-1 min-w-[160px]" />
          <select value={brand} onChange={e => setBrand(e.target.value)} className="input py-1.5 text-sm w-auto">
            <option value="all">All brands</option>
            {brands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          {sizes.length > 1 && (
            <select value={size} onChange={e => setSize(e.target.value)} className="input py-1.5 text-sm w-auto">
              <option value="all">All sizes</option>
              {sizes.map(s => <option key={s} value={s}>{String(s).toUpperCase()}</option>)}
            </select>
          )}
          <select value={sort} onChange={e => setSort(e.target.value)} className="input py-1.5 text-sm w-auto">
            <option value="name">Sort: Name</option>
            <option value="brand">Sort: Brand</option>
            <option value="event">Sort: Event</option>
            <option value="size">Sort: Size</option>
          </select>
          <select value={group} onChange={e => setGroup(e.target.value)} className="input py-1.5 text-sm w-auto">
            <option value="event">Group: Event</option>
            <option value="brand">Group: Brand</option>
            <option value="none">Group: None</option>
          </select>
        </div>

        {!loaded ? (
          <div className="text-sm text-ink-400">Loading…</div>
        ) : ready.length === 0 ? (
          <div className="card p-8 text-center text-sm text-ink-500">Nothing ready for print prep yet.</div>
        ) : filtered.length === 0 ? (
          <div className="card p-8 text-center text-sm text-ink-500">No ready menus match your filters.</div>
        ) : (
          <div className="space-y-5">
            {grouped.map(g => (
              <div key={g.key}>
                {g.label && (
                  <div className="flex items-center justify-between px-1 mb-2">
                    <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider truncate">{g.label}</p>
                    <span className="text-xs text-ink-400">{g.rows.length}</span>
                  </div>
                )}
                <div className="card overflow-hidden">
                  <ul className="divide-y divide-surface-100">
                    {g.rows.map(m => {
                      const to = readyMenuLink(m)
                      const row = (
                        <span className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
                          <span className="min-w-0">
                            <span className="font-medium text-ink-900">{m.name}</span>
                            {m.size && <span className="text-[10px] uppercase ml-2 px-1.5 py-0.5 rounded bg-surface-100 text-ink-500">{m.size}</span>}
                            <span className="block text-xs text-ink-400 truncate">{m.events?.series?.brand?.name} · {m.events?.name || m.events?.slug}</span>
                          </span>
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex-shrink-0">Ready to export</span>
                        </span>
                      )
                      return <li key={m.id}>{to ? <Link to={to} className="block table-row-hover">{row}</Link> : row}</li>
                    })}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageBody>
    </PageScreen>
  )
}
