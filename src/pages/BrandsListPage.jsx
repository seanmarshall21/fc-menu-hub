import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import PageScreen, { PageBody } from '@/components/PageScreen'
import FavoriteButton from '@/components/FavoriteButton'

export default function BrandsListPage() {
  const [brands, setBrands] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    supabase.from('brands').select('*').order('name').then(({ data }) => {
      setBrands(data || [])
      setLoading(false)
    })
  }, [])

  const filtered = query
    ? brands.filter(b => (b.name || '').toLowerCase().includes(query.toLowerCase()))
    : brands

  return (
    <PageScreen title="Brands" subtitle={`${brands.length} ${brands.length === 1 ? 'brand' : 'brands'}`} back>
      <PageBody>
        <input
          className="input mb-4"
          placeholder="Search brands…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {loading ? (
          <p className="text-sm text-ink-400">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-ink-400">{query ? 'No matches.' : 'No brands yet.'}</p>
        ) : (
          <div className="space-y-2">
            {filtered.map(b => (
              <Link
                key={b.id}
                to={`/brands/${b.slug}`}
                className="card flex items-center gap-3 px-4 py-3 hover:border-brand-200 hover:shadow-sm transition-all group"
              >
                {b.logo_url ? (
                  <img src={b.logo_url} alt="" className="w-10 h-10 rounded-lg object-contain bg-surface-50 border border-surface-200 flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-semibold text-sm flex-shrink-0" style={{ backgroundColor: b.color || '#6366f1' }}>
                    {b.name?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <span className="flex-1 font-semibold text-ink-900 group-hover:text-brand-600 transition-colors truncate">
                  {b.name}
                </span>
                <FavoriteButton type="brand" id={b.id} size="sm" />
                <svg className="w-4 h-4 text-ink-300 group-hover:text-brand-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        )}
      </PageBody>
    </PageScreen>
  )
}
