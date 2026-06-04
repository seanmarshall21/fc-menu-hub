import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import PageScreen, { PageBody } from '@/components/PageScreen'
import Modal from '@/components/Modal'
import FavoriteButton from '@/components/FavoriteButton'
import BrandLogoUploader from '@/components/BrandLogoUploader'

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

  // Edit-brand modal
  const [showEditBrand, setShowEditBrand] = useState(false)
  const [editBrandName, setEditBrandName] = useState('')
  const [editBrandColor, setEditBrandColor] = useState('#6366f1')
  const [editBrandLogoUrl, setEditBrandLogoUrl] = useState(null)
  const [editBrandSaving, setEditBrandSaving] = useState(false)
  const [editBrandError, setEditBrandError] = useState(null)

  // Edit-series modal
  const [editingSeries, setEditingSeries] = useState(null) // series object being edited
  const [editSeriesName, setEditSeriesName] = useState('')
  const [editSeriesSaving, setEditSeriesSaving] = useState(false)
  const [editSeriesError, setEditSeriesError] = useState(null)

  // Delete-series confirm
  const [deletingSeries, setDeletingSeries] = useState(null) // series object pending delete
  const [deleteSeriesBusy, setDeleteSeriesBusy] = useState(false)
  const [deleteSeriesError, setDeleteSeriesError] = useState(null)

  // Per-card action menu open state (one at a time)
  const [openMenuSeriesId, setOpenMenuSeriesId] = useState(null)

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

  function openEditBrand() {
    setEditBrandName(brand.name || '')
    setEditBrandColor(brand.color || '#6366f1')
    setEditBrandLogoUrl(brand.logo_url || null)
    setEditBrandError(null)
    setShowEditBrand(true)
  }

  async function handleSaveBrand(e) {
    e.preventDefault()
    setEditBrandSaving(true)
    setEditBrandError(null)
    const { error } = await supabase.from('brands')
      .update({
        name: editBrandName.trim(),
        color: editBrandColor,
        logo_url: editBrandLogoUrl,
      })
      .eq('id', brand.id)
    setEditBrandSaving(false)
    if (error) { setEditBrandError(error.message); return }
    setShowEditBrand(false)
    loadData()
  }

  function openEditSeries(s) {
    setEditingSeries(s)
    setEditSeriesName(s.name || '')
    setEditSeriesError(null)
    setOpenMenuSeriesId(null)
  }

  async function handleSaveSeries(e) {
    e.preventDefault()
    setEditSeriesSaving(true)
    setEditSeriesError(null)
    const { error } = await supabase.from('series')
      .update({ name: editSeriesName.trim() })
      .eq('id', editingSeries.id)
    setEditSeriesSaving(false)
    if (error) { setEditSeriesError(error.message); return }
    setEditingSeries(null)
    loadData()
  }

  function openDeleteSeries(s) {
    setDeletingSeries(s)
    setDeleteSeriesError(null)
    setOpenMenuSeriesId(null)
  }

  async function handleDeleteSeries() {
    if (!deletingSeries) return
    if ((deletingSeries.events?.length || 0) > 0) {
      setDeleteSeriesError('This series has events. Delete or move those first.')
      return
    }
    setDeleteSeriesBusy(true)
    setDeleteSeriesError(null)
    const { error } = await supabase.from('series').delete().eq('id', deletingSeries.id)
    setDeleteSeriesBusy(false)
    if (error) { setDeleteSeriesError(error.message); return }
    setDeletingSeries(null)
    loadData()
  }

  if (loading) return <div className="px-8 py-8 text-sm text-ink-400">Loading…</div>
  if (!brand) return <div className="px-8 py-8 text-sm text-red-500">Brand not found.</div>

  return (
    <PageScreen
      breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: brand.name }]}
      actions={<>
        <FavoriteButton type="brand" id={brand.id} />
        {isAdmin && (
          <button onClick={openEditBrand} className="btn-secondary btn-sm gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </button>
        )}
      </>}
    >
      <PageBody>
      <div className="flex items-center gap-3 mb-6">
        {brand.logo_url ? (
          <img src={brand.logo_url} alt="" className="w-12 h-12 rounded-lg object-contain bg-surface-50 border border-surface-200" />
        ) : (
          brand.color && <span className="w-3 h-3 rounded-full" style={{ backgroundColor: brand.color }} />
        )}
        <h1 className="text-xl sm:text-2xl font-semibold text-ink-900 tracking-tight">{brand.name}</h1>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {series.map(s => {
            const menuOpen = openMenuSeriesId === s.id
            return (
              <div key={s.id} className="relative">
                <Link
                  to={`/brands/${brandSlug}/series/${s.slug}`}
                  className="card block p-5 hover:shadow-md hover:border-brand-100 transition-all group"
                >
                  <h3 className="font-medium text-ink-900 group-hover:text-brand-600 transition-colors mb-1 pr-7">{s.name}</h3>
                  <p className="text-xs text-ink-400">{s.events?.length || 0} event{s.events?.length !== 1 ? 's' : ''}</p>
                </Link>
                {(isAdmin || isInternal) && (
                  <>
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setOpenMenuSeriesId(menuOpen ? null : s.id)
                      }}
                      className="absolute top-3 right-3 w-7 h-7 rounded-md text-ink-400 hover:text-ink-700 hover:bg-surface-100 flex items-center justify-center transition-colors"
                      aria-label="Series actions"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 4a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 7a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 7a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
                      </svg>
                    </button>
                    {menuOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setOpenMenuSeriesId(null)}
                        />
                        <div className="absolute top-10 right-3 z-20 bg-white border border-surface-200 rounded-lg shadow-lg overflow-hidden min-w-[120px]">
                          <button
                            onClick={(e) => { e.preventDefault(); openEditSeries(s) }}
                            className="block w-full text-left px-3 py-2 text-sm text-ink-700 hover:bg-surface-50 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={(e) => { e.preventDefault(); openDeleteSeries(s) }}
                            className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {editingSeries && (
        <Modal title="Edit Series" onClose={() => setEditingSeries(null)}>
          <form onSubmit={handleSaveSeries} className="space-y-4">
            <div>
              <label className="label">Series Name</label>
              <input
                className="input"
                value={editSeriesName}
                onChange={e => setEditSeriesName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label">Slug</label>
              <input className="input bg-surface-50 text-ink-400 font-mono text-sm" value={editingSeries.slug} disabled />
              <p className="text-xs text-ink-400 mt-1">Slug can't be changed — it's baked into bookmarks and the Figma plugin.</p>
            </div>
            {editSeriesError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{editSeriesError}</p>
            )}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button type="button" onClick={() => setEditingSeries(null)} className="btn-secondary btn-sm">Cancel</button>
              <button type="submit" className="btn-primary btn-sm" disabled={editSeriesSaving}>
                {editSeriesSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {deletingSeries && (
        <Modal title="Delete Series" onClose={() => setDeletingSeries(null)}>
          <p className="text-sm text-ink-600 mb-1">
            Are you sure you want to delete <span className="font-medium text-ink-900">{deletingSeries.name}</span>?
          </p>
          {(deletingSeries.events?.length || 0) > 0 ? (
            <p className="text-xs text-red-600 mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              This series has {deletingSeries.events.length} event{deletingSeries.events.length === 1 ? '' : 's'} attached. Delete or move them first.
            </p>
          ) : (
            <p className="text-xs text-ink-400 mb-6">This cannot be undone.</p>
          )}
          {deleteSeriesError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2">{deleteSeriesError}</p>
          )}
          <div className="flex items-center justify-end gap-3 pt-4">
            <button onClick={() => setDeletingSeries(null)} className="btn-secondary btn-sm">Cancel</button>
            <button
              onClick={handleDeleteSeries}
              disabled={deleteSeriesBusy || (deletingSeries.events?.length || 0) > 0}
              className="btn-sm bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleteSeriesBusy ? 'Deleting…' : 'Delete Series'}
            </button>
          </div>
        </Modal>
      )}

      {showEditBrand && (
        <Modal title="Edit Brand" onClose={() => setShowEditBrand(false)}>
          <form onSubmit={handleSaveBrand} className="space-y-4">
            <div>
              <label className="label">Brand Name</label>
              <input
                className="input"
                value={editBrandName}
                onChange={e => setEditBrandName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label">Brand Color</label>
              <div className="flex items-center gap-3">
                <input type="color" className="w-10 h-10 rounded-lg border border-surface-200 cursor-pointer" value={editBrandColor} onChange={e => setEditBrandColor(e.target.value)} />
                <span className="text-sm text-ink-500 font-mono">{editBrandColor}</span>
              </div>
            </div>
            <div>
              <label className="label">Logo</label>
              <BrandLogoUploader
                value={editBrandLogoUrl}
                onChange={setEditBrandLogoUrl}
                pathKey={brand.slug}
              />
            </div>
            {editBrandError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{editBrandError}</p>
            )}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button type="button" onClick={() => setShowEditBrand(false)} className="btn-secondary btn-sm">Cancel</button>
              <button type="submit" className="btn-primary btn-sm" disabled={editBrandSaving}>
                {editBrandSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
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
      </PageBody>
    </PageScreen>
  )
}
