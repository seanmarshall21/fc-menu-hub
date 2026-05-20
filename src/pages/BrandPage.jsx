import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import Breadcrumbs from '@/components/Breadcrumbs'
import Modal from '@/components/Modal'

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export default function BrandPage() {
  const { brandSlug } = useParams()
  const { isAdmin, isInternal } = useAuth()
  const [brand, setBrand] = useState(null)
  const [series, setSeries] = useState([])
  const [loading, setLoading] = useState(true)

  const [showNewSeries, setShowNewSeries] = useState(false)
  const [seriesName, setSeriesName] = useState('')
  const [seriesSlugField, setSeriesSlugField] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  async function loadData() {
    const { data: brandData } = await supabase
      .from('brands')
      .select('*')
      .eq('slug', brandSlug)
      .single()
    setBrand(brandData)

    if (brandData) {
      const { data: seriesData } = await supabase
        .from('series')
        .select('*, events(id)')
        .eq('brand_id', brandData.id)
        .order('name')
      setSeries(seriesData || [])
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [brandSlug])

  function openNewSeries() {
    setSeriesName('')
    setSeriesSlugField('')
    setSaveError(null)
    setShowNewSeries(true)
  }

  function handleSeriesNameChange(val) {
    setSeriesName(val)
    setSeriesSlugField(slugify(val))
  }

  async function handleCreateSeries(e) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    const { error } = await supabase.from('series').insert({
      name: seriesName.trim(),
      slug: seriesSlugField.trim(),
      brand_id: brand.id,
    })
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    setShowNewSeries(false)
    loadData()
  }

  if (loading) return <div className="px-8 py-8 text-sm text-ink-400">Loading…</div>
  if (!brand) return <div className="px-8 py-8 text-sm text-red-500">Brand not found.</div>

  return (
    <div className="px-8 py-8 max-w-5xl">
      <Breadcrumbs crumbs={[{ label: 'Dashboard', to: '/' }, { label: brand.name }]} />

      <div className="flex items-center gap-3 mb-8">
        {brand.color && <span className="w-3 h-3 rounded-full" style={{ backgroundColor: brand.color }} />}
        <h1 className="text-2xl font-semibold text-ink-900 tracking-tight">{brand.name}</h1>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-700">Series</h2>
        {(isAdmin || isInternal) && (
          <button onClick={openNewSeries} className="btn-secondary btn-sm gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Series
          </button>
        )}
      </div>

      {series.length === 0 ? (
        <div className="card px-6 py-8 text-sm text-ink-400">No series yet.</div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {series.map(s => (
            <Link
              key={s.id}
              to={`/brands/${brandSlug}/series/${s.slug}`}
              className="card p-5 hover:shadow-md hover:border-brand-100 transition-all group"
            >
              <h3 className="font-medium text-ink-900 group-hover:text-brand-600 transition-colors mb-1">{s.name}</h3>
              <p className="text-xs text-ink-400">{s.events?.length || 0} event{s.events?.length !== 1 ? 's' : ''}</p>
            </Link>
          ))}
        </div>
      )}

      {showNewSeries && (
        <Modal title="New Series" onClose={() => setShowNewSeries(false)}>
          <form onSubmit={handleCreateSeries} className="space-y-4">
            <div>
              <label className="label">Series Name</label>
              <input
                className="input"
                value={seriesName}
                onChange={e => handleSeriesNameChange(e.target.value)}
                placeholder="e.g. CRSSD Festival"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label">Slug</label>
              <input
                className="input font-mono text-sm"
                value={seriesSlugField}
                onChange={e => setSeriesSlugField(slugify(e.target.value))}
                placeholder="crssd-festival"
                required
              />
            </div>
            {saveError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</p>
            )}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button type="button" onClick={() => setShowNewSeries(false)} className="btn-secondary btn-sm">Cancel</button>
              <button type="submit" className="btn-primary btn-sm" disabled={saving}>
                {saving ? 'Creating…' : 'Create Series'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
