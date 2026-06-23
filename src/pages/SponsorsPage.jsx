import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import PageScreen, { PageBody } from '@/components/PageScreen'
import Modal from '@/components/Modal'
import FilterDropdown from '@/components/FilterDropdown'
import { makeZip, downloadBlob } from '@/lib/zip'

function slugify(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// Replace currentColor (and the literal "currentcolor") with a chosen hex so
// the exported SVG renders in that color. SVGs that kept hard-coded colors are
// returned unchanged.
function recolorSvg(text, color) {
  if (!color) return text
  return text.replace(/currentColor/gi, color)
}

export default function SponsorsPage() {
  const { isAdmin, isInternal } = useAuth()
  const canEdit = isAdmin || isInternal

  const [sponsors, setSponsors] = useState([])
  const [series, setSeries]     = useState([])   // { id, name, brand_id }
  const [brands, setBrands]     = useState([])   // { id, name }
  const [links, setLinks]       = useState([])   // series_sponsors { id, series_id, sponsor_id }
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  // Search + filters
  const [search, setSearch]           = useState('')
  const [brandFilter, setBrandFilter] = useState([])
  const [seriesFilter, setSeriesFilter] = useState([])

  // Add/Edit modal
  const [showModal, setShowModal]   = useState(false)
  const [editingId, setEditingId]   = useState(null)
  const [name, setName]             = useState('')
  const [slug, setSlug]             = useState('')
  const [figmaLayer, setFigmaLayer] = useState('')
  const [svgUrl, setSvgUrl]         = useState('')
  const [scale, setScale]           = useState(1)
  const [maxWidth, setMaxWidth]     = useState('')
  const [uploading, setUploading]   = useState(false)
  const [saving, setSaving]         = useState(false)
  const [modalError, setModalError] = useState(null)
  const fileRef = useRef(null)

  // Series-membership editor
  const [seriesEditor, setSeriesEditor] = useState(null) // sponsor being edited

  // Export modal
  const [showExport, setShowExport] = useState(false)

  // Delete confirm
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    setLoading(true); setError(null)
    const [spRes, serRes, brRes, lkRes] = await Promise.all([
      supabase.from('sponsors').select('*').order('name'),
      supabase.from('series').select('id, name, brand_id').order('name'),
      supabase.from('brands').select('id, name').order('name'),
      supabase.from('series_sponsors').select('id, series_id, sponsor_id'),
    ])
    if (spRes.error) setError(spRes.error.message)
    setSponsors(spRes.data || [])
    setSeries(serRes.data || [])
    setBrands(brRes.data || [])
    setLinks(lkRes.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // sponsor_id → Set(series_id) and → Set(brand_id) for filtering + chips.
  const seriesBySponsor = useMemo(() => {
    const m = new Map()
    for (const l of links) {
      if (!m.has(l.sponsor_id)) m.set(l.sponsor_id, new Set())
      m.get(l.sponsor_id).add(l.series_id)
    }
    return m
  }, [links])
  const seriesById = useMemo(() => new Map(series.map(s => [s.id, s])), [series])
  const brandById  = useMemo(() => new Map(brands.map(b => [b.id, b])), [brands])

  function sponsorBrandIds(sponsorId) {
    const set = new Set()
    for (const sid of (seriesBySponsor.get(sponsorId) || [])) {
      const s = seriesById.get(sid)
      if (s?.brand_id) set.add(s.brand_id)
    }
    return set
  }

  const filtered = sponsors.filter(sp => {
    if (search && !sp.name.toLowerCase().includes(search.toLowerCase())) return false
    if (seriesFilter.length) {
      const sset = seriesBySponsor.get(sp.id) || new Set()
      if (!seriesFilter.some(sid => sset.has(sid))) return false
    }
    if (brandFilter.length) {
      const bset = sponsorBrandIds(sp.id)
      if (!brandFilter.some(bid => bset.has(bid))) return false
    }
    return true
  })

  const brandOpts  = brands.map(b => ({ value: b.id, label: b.name }))
  const seriesOpts = series.map(s => ({
    value: s.id,
    label: brandById.get(s.brand_id) ? `${brandById.get(s.brand_id).name} · ${s.name}` : s.name,
  }))
  const anyFilter = search || brandFilter.length || seriesFilter.length

  // ── Add / Edit ────────────────────────────────────────────────────────────
  function openNew() {
    setEditingId(null); setName(''); setSlug(''); setFigmaLayer(''); setSvgUrl(''); setScale(1); setMaxWidth('')
    setModalError(null); setShowModal(true)
  }
  function openEdit(s) {
    setEditingId(s.id)
    setName(s.name || ''); setSlug(s.slug || '')
    setFigmaLayer(s.figma_layer_name || s.slug || '')
    setSvgUrl(s.svg_url || ''); setScale(s.scale ?? 1)
    setMaxWidth(s.max_width != null ? String(s.max_width) : '')
    setModalError(null); setShowModal(true)
  }
  function handleNameChange(val) {
    setName(val)
    if (!editingId) {
      const sl = slugify(val); setSlug(sl)
      if (!figmaLayer) setFigmaLayer(sl)
    }
  }

  async function handleFileSelect(file) {
    if (!file) return
    setUploading(true); setModalError(null)
    try {
      const ext = (file.name.split('.').pop() || 'svg').toLowerCase()
      const path = `${slug || `tmp-${Date.now()}`}/logo-${Date.now()}.${ext}`
      let uploadBody = file
      let uploadType = file.type || 'image/svg+xml'
      if (ext === 'svg' || (file.type || '').includes('svg')) {
        try {
          const raw = await file.text()
          uploadBody = new Blob([normalizeSponsorSvg(raw)], { type: 'image/svg+xml' })
          uploadType = 'image/svg+xml'
        } catch (_) { /* fall through with the original */ }
      }
      const { error: upErr } = await supabase.storage
        .from('sponsor-logos').upload(path, uploadBody, { upsert: false, contentType: uploadType })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('sponsor-logos').getPublicUrl(path)
      setSvgUrl(pub.publicUrl)
    } catch (e) {
      setModalError(e.message)
    } finally {
      setUploading(false)
    }
  }

  function normalizeSponsorSvg(svg) {
    let out = svg
    out = out.replace(/(\s)(fill|stroke)\s*=\s*"([^"]*)"/gi, (m, sp, attr, val) => {
      const v = val.trim().toLowerCase()
      if (v === 'none' || v === 'currentcolor' || v === '') return m
      return `${sp}${attr}="currentColor"`
    })
    out = out.replace(/style\s*=\s*"([^"]*)"/gi, (m, body) => {
      const replaced = body.replace(/(fill|stroke)\s*:\s*([^;"]+)/gi, (mm, prop, val) => {
        const v = val.trim().toLowerCase()
        if (v === 'none' || v === 'currentcolor' || v === '') return mm
        return `${prop}:currentColor`
      })
      return `style="${replaced}"`
    })
    out = out.replace(/<svg\b([^>]*)>/i, (m, attrs) => {
      let a = attrs
      a = a.replace(/\s(width|height)\s*=\s*"[^"]*"/gi, '')
      a = a.replace(/\sstyle\s*=\s*"[^"]*"/gi, '')
      if (!/preserveAspectRatio/i.test(a)) a += ' preserveAspectRatio="xMidYMid meet"'
      return `<svg${a}>`
    })
    return out
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true); setModalError(null)
    try {
      const payload = {
        name: name.trim(), slug: slug.trim(),
        figma_layer_name: figmaLayer.trim() || slug.trim(),
        svg_url: svgUrl || null,
        scale: Number(scale) || 1,
        max_width: maxWidth ? parseInt(maxWidth, 10) : null,
      }
      const result = editingId
        ? await supabase.from('sponsors').update(payload).eq('id', editingId)
        : await supabase.from('sponsors').insert(payload)
      if (result.error) throw result.error
      setShowModal(false); load()
    } catch (e) {
      setModalError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    setDeleting(true); setError(null)
    const { error: err } = await supabase.from('sponsors').delete().eq('id', id)
    setDeleting(false)
    if (err) { setError(err.message); return }
    setConfirmDeleteId(null); load()
  }

  const confirmSponsor = sponsors.find(s => s.id === confirmDeleteId)

  return (
    <PageScreen
      breadcrumbs={[{ label: 'Sponsors' }]}
      actions={canEdit && (
        <div className="flex items-center gap-2">
          <button onClick={() => setShowExport(true)} className="btn-secondary btn-sm gap-1.5 whitespace-nowrap"
            title="Download selected logos as SVGs in a color of your choice">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
            </svg>
            Export logos
          </button>
          <button onClick={openNew} className="btn-primary btn-sm gap-1.5 whitespace-nowrap">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Sponsor
          </button>
        </div>
      )}
    >
      <PageBody>
      <p className="text-sm text-ink-400 mb-4">App-wide library. Toggle which series each sponsor shows on, and set tints at the series level.</p>

      {/* Search + filters */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search sponsors…"
            className="input pl-9 py-1.5 text-sm w-full"
          />
        </div>
        {brandOpts.length > 1 && (
          <FilterDropdown label="All brands" options={brandOpts} selected={brandFilter} onChange={setBrandFilter} />
        )}
        {seriesOpts.length > 1 && (
          <FilterDropdown label="All series" options={seriesOpts} selected={seriesFilter} onChange={setSeriesFilter} />
        )}
        {anyFilter ? (
          <button onClick={() => { setSearch(''); setBrandFilter([]); setSeriesFilter([]) }}
            className="text-xs text-ink-400 hover:text-ink-600 underline underline-offset-2">
            Clear · {filtered.length} of {sponsors.length}
          </button>
        ) : null}
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}

      {loading ? (
        <div className="card px-6 py-8 text-sm text-ink-400">Loading…</div>
      ) : sponsors.length === 0 ? (
        <div className="card px-6 py-10 text-center">
          <p className="text-sm text-ink-500 mb-3">No sponsors yet.</p>
          {canEdit && <button onClick={openNew} className="btn-primary btn-sm">Add First Sponsor</button>}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card px-6 py-10 text-center text-sm text-ink-400">No sponsors match your search/filters.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(sp => {
            const sset = seriesBySponsor.get(sp.id) || new Set()
            const seriesCount = sset.size
            return (
              <div key={sp.id} className="card p-4 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-lg bg-surface-50 border border-surface-200 flex items-center justify-center overflow-hidden flex-shrink-0 text-ink-700">
                    {sp.svg_url ? (
                      <img src={sp.svg_url} alt="" className="max-w-full max-h-full object-contain p-1" />
                    ) : (
                      <span className="text-[10px] text-ink-300">no svg</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-ink-900 truncate">{sp.name}</div>
                    <div className="text-[11px] text-ink-400 font-mono truncate">sponsor--{sp.figma_layer_name || sp.slug}</div>
                  </div>
                  {canEdit && (
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <button onClick={() => openEdit(sp)} className="text-[11px] text-ink-400 hover:text-brand-600 font-medium">Edit</button>
                      <button onClick={() => setConfirmDeleteId(sp.id)} className="text-[11px] text-red-400 hover:text-red-600 font-medium">Delete</button>
                    </div>
                  )}
                </div>
                {/* Series membership */}
                <div className="flex items-center justify-between gap-2 border-t border-surface-100 pt-2">
                  <span className="text-[11px] text-ink-400 truncate">
                    {seriesCount === 0 ? 'On no series yet' : `On ${seriesCount} series`}
                  </span>
                  {canEdit && (
                    <button onClick={() => setSeriesEditor(sp)}
                      className="text-[11px] text-brand-600 hover:text-brand-700 font-medium whitespace-nowrap flex-shrink-0">
                      Manage series
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add/Edit modal */}
      {showModal && (
        <Modal title={editingId ? 'Edit Sponsor' : 'New Sponsor'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="label">Display Name</label>
              <input className="input" value={name} onChange={e => handleNameChange(e.target.value)}
                placeholder="e.g. Stella Artois" required autoFocus />
            </div>
            <div>
              <label className="label">Slug</label>
              <input className="input font-mono text-sm" value={slug}
                onChange={e => setSlug(slugify(e.target.value))} placeholder="stella-artois" required />
              <p className="mt-1 text-[11px] text-ink-400">Lowercase, hyphen-separated. Used internally to identify the sponsor.</p>
            </div>
            <div>
              <label className="label">Figma Layer Name</label>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-ink-400 select-none">sponsor--</span>
                <input className="input font-mono text-sm flex-1" value={figmaLayer}
                  onChange={e => setFigmaLayer(slugify(e.target.value))} placeholder={slug || 'stella-artois'} />
              </div>
              <p className="mt-1 text-[11px] text-ink-400">Match the Figma layer name suffix. The plugin uses this to find and toggle the sponsor layer.</p>
            </div>
            <div>
              <label className="label">SVG Logo</label>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-lg border border-surface-200 bg-surface-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {svgUrl ? <img src={svgUrl} alt="" className="max-w-full max-h-full object-contain p-1" /> : <span className="text-[10px] text-ink-300">empty</span>}
                </div>
                <input ref={fileRef} type="file" accept=".svg,image/svg+xml" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = '' }} />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-secondary btn-sm">
                  {uploading ? 'Uploading…' : svgUrl ? 'Replace' : 'Upload SVG'}
                </button>
                {svgUrl && <button type="button" onClick={() => setSvgUrl('')} className="text-xs text-red-500 hover:text-red-700">Remove</button>}
              </div>
              <p className="mt-1 text-[11px] text-ink-400">Use <code>currentColor</code> fills so the series tint can recolor the logo.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Size scale</label>
                <input type="number" step="0.05" min="0.25" max="3" className="input" value={scale} onChange={e => setScale(e.target.value)} />
                <p className="mt-1 text-[11px] text-ink-400">Multiplier on the series sponsor height. <code>1.0</code> = match; <code>1.3</code> = 30% taller.</p>
              </div>
              <div>
                <label className="label">Max width <span className="text-ink-300 font-normal">(optional)</span></label>
                <div className="relative">
                  <input type="number" className="input pr-9" value={maxWidth}
                    onChange={e => setMaxWidth(e.target.value.replace(/[^\d]/g, ''))} placeholder="auto" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-ink-400 pointer-events-none">px</span>
                </div>
                <p className="mt-1 text-[11px] text-ink-400">Cap an unusually wide logo. Width = auto by default.</p>
              </div>
            </div>
            {modalError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{modalError}</p>}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button type="button" onClick={() => setShowModal(false)} className="btn-secondary btn-sm">Cancel</button>
              <button type="submit" className="btn-primary btn-sm" disabled={saving}>
                {saving ? 'Saving…' : (editingId ? 'Save Changes' : 'Create Sponsor')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Series membership editor */}
      {seriesEditor && (
        <SeriesMembershipModal
          sponsor={seriesEditor}
          series={series}
          brandById={brandById}
          memberSeriesIds={seriesBySponsor.get(seriesEditor.id) || new Set()}
          onClose={() => setSeriesEditor(null)}
          onChanged={load}
        />
      )}

      {/* Export logos */}
      {showExport && (
        <ExportLogosModal sponsors={sponsors} onClose={() => setShowExport(false)} />
      )}

      {confirmDeleteId && (
        <Modal title="Delete Sponsor" onClose={() => setConfirmDeleteId(null)}>
          <p className="text-sm text-ink-600 mb-1">Delete <span className="font-medium text-ink-900">{confirmSponsor?.name}</span>?</p>
          <p className="text-xs text-ink-400 mb-6">Any series and events that reference this sponsor will lose the link. This can't be undone.</p>
          <div className="flex items-center justify-end gap-3">
            <button onClick={() => setConfirmDeleteId(null)} className="btn-secondary btn-sm">Cancel</button>
            <button onClick={() => handleDelete(confirmDeleteId)} disabled={deleting}
              className="btn-sm bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg px-3 py-1.5 transition-colors">
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
      </PageBody>
    </PageScreen>
  )
}

// ── Series membership modal ───────────────────────────────────────────────
// Lists every series (grouped by brand) with a checkbox. Toggling inserts or
// deletes a series_sponsors row immediately so the change reflects in that
// series' Sponsors tab right away.
function SeriesMembershipModal({ sponsor, series, brandById, memberSeriesIds, onClose, onChanged }) {
  const [member, setMember] = useState(() => new Set(memberSeriesIds))
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState(null)

  // Group series under their brand for a tidy list.
  const groups = useMemo(() => {
    const byBrand = new Map()
    for (const s of series) {
      const key = s.brand_id || '—'
      if (!byBrand.has(key)) byBrand.set(key, [])
      byBrand.get(key).push(s)
    }
    return [...byBrand.entries()].map(([brandId, list]) => ({
      brandId, brandName: brandById.get(brandId)?.name || 'Other', list,
    }))
  }, [series, brandById])

  async function toggle(seriesId) {
    setBusy(seriesId); setErr(null)
    const isOn = member.has(seriesId)
    try {
      if (isOn) {
        const { error } = await supabase.from('series_sponsors')
          .delete().eq('series_id', seriesId).eq('sponsor_id', sponsor.id)
        if (error) throw error
        setMember(prev => { const n = new Set(prev); n.delete(seriesId); return n })
      } else {
        // Append to the end of that series' sponsor order.
        const { count } = await supabase.from('series_sponsors')
          .select('id', { count: 'exact', head: true }).eq('series_id', seriesId)
        const { error } = await supabase.from('series_sponsors')
          .insert({ series_id: seriesId, sponsor_id: sponsor.id, sort_order: count || 0 })
        if (error) throw error
        setMember(prev => new Set(prev).add(seriesId))
      }
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal title={`Series for ${sponsor.name}`} onClose={() => { onChanged?.(); onClose() }}>
      <p className="text-sm text-ink-500 mb-4">Toggle which series this sponsor appears on. Changes apply immediately and show up in each series' Sponsors tab.</p>
      {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{err}</p>}
      <div className="space-y-4 max-h-[55vh] overflow-y-auto">
        {groups.map(g => (
          <div key={g.brandId}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-1.5">{g.brandName}</div>
            <div className="space-y-1">
              {g.list.map(s => {
                const on = member.has(s.id)
                return (
                  <button key={s.id} type="button" onClick={() => toggle(s.id)} disabled={busy === s.id}
                    className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-50 text-left">
                    <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                      on ? 'bg-brand-500 border-brand-500 text-white' : 'border-surface-300'
                    }`}>
                      {on && <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </span>
                    <span className="text-sm text-ink-700 flex-1">{s.name}</span>
                    {busy === s.id && <span className="text-[11px] text-ink-400">…</span>}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        {series.length === 0 && <p className="text-sm text-ink-400">No series yet.</p>}
      </div>
      <div className="flex justify-end pt-4">
        <button onClick={() => { onChanged?.(); onClose() }} className="btn-primary btn-sm">Done</button>
      </div>
    </Modal>
  )
}

// ── Export logos modal ──────────────────────────────────────────────────────
// Pick sponsors + a color, then download recolored SVGs (zipped when >1).
function ExportLogosModal({ sponsors, onClose }) {
  const withSvg = sponsors.filter(s => s.svg_url)
  const [selected, setSelected] = useState(() => new Set(withSvg.map(s => s.id)))
  const [color, setColor] = useState('#1a1a1a')
  const [useOriginal, setUseOriginal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  function toggle(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  const allOn = selected.size === withSvg.length && withSvg.length > 0

  async function doExport() {
    setBusy(true); setErr(null)
    try {
      const chosen = withSvg.filter(s => selected.has(s.id))
      if (chosen.length === 0) { setErr('Select at least one logo.'); setBusy(false); return }
      const files = []
      for (const s of chosen) {
        const res = await fetch(s.svg_url)
        if (!res.ok) throw new Error(`Couldn't fetch ${s.name}`)
        let text = await res.text()
        if (!useOriginal) text = recolorSvg(text, color)
        files.push({ name: `${s.slug || s.id}.svg`, text })
      }
      if (files.length === 1) {
        downloadBlob(new Blob([files[0].text], { type: 'image/svg+xml' }), files[0].name)
      } else {
        downloadBlob(makeZip(files), 'sponsor-logos.zip')
      }
      onClose()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Export sponsor logos" onClose={onClose}>
      {withSvg.length === 0 ? (
        <p className="text-sm text-ink-500">No sponsors have an SVG logo to export yet.</p>
      ) : (
        <div className="space-y-4">
          {/* Color */}
          <div>
            <label className="label">Logo color</label>
            <div className="flex items-center gap-3">
              <input type="color" value={color} onChange={e => setColor(e.target.value)} disabled={useOriginal}
                className="w-10 h-10 rounded border border-surface-300 bg-white cursor-pointer disabled:opacity-40" />
              <input value={color} onChange={e => setColor(e.target.value)} disabled={useOriginal}
                className="input font-mono text-sm w-32 disabled:opacity-40" />
              <label className="inline-flex items-center gap-1.5 text-xs text-ink-600 cursor-pointer">
                <input type="checkbox" checked={useOriginal} onChange={e => setUseOriginal(e.target.checked)}
                  className="rounded border-surface-300 text-brand-600" />
                Keep original (currentColor)
              </label>
            </div>
            <p className="mt-1 text-[11px] text-ink-400">Recolors any <code>currentColor</code> fills. Logos with baked-in colors export as-is.</p>
          </div>

          {/* Sponsor picker */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0">Logos ({selected.size}/{withSvg.length})</label>
              <button type="button" onClick={() => setSelected(allOn ? new Set() : new Set(withSvg.map(s => s.id)))}
                className="text-[11px] text-brand-600 hover:text-brand-700 font-medium">
                {allOn ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <div className="border border-surface-200 rounded-lg max-h-56 overflow-y-auto divide-y divide-surface-100">
              {withSvg.map(s => {
                const on = selected.has(s.id)
                return (
                  <button key={s.id} type="button" onClick={() => toggle(s.id)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-50 text-left">
                    <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${on ? 'bg-brand-500 border-brand-500 text-white' : 'border-surface-300'}`}>
                      {on && <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </span>
                    <div className="w-8 h-8 rounded bg-surface-50 border border-surface-200 flex items-center justify-center overflow-hidden flex-shrink-0" style={{ color }}>
                      <img src={s.svg_url} alt="" className="max-w-full max-h-full object-contain p-0.5" />
                    </div>
                    <span className="text-sm text-ink-700 flex-1 truncate">{s.name}</span>
                    <span className="text-[11px] text-ink-300 font-mono truncate">{s.slug}.svg</span>
                  </button>
                )
              })}
            </div>
          </div>

          {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
          <div className="flex items-center justify-end gap-3">
            <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
            <button onClick={doExport} disabled={busy || selected.size === 0} className="btn-primary btn-sm">
              {busy ? 'Preparing…' : `Export ${selected.size} ${selected.size === 1 ? 'logo' : 'logos'}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
