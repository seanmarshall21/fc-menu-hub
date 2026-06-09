import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import PageScreen, { PageBody } from '@/components/PageScreen'
import Modal from '@/components/Modal'

function slugify(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export default function SponsorsPage() {
  const { isAdmin, isInternal } = useAuth()
  const canEdit = isAdmin || isInternal

  const [sponsors, setSponsors] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  // Modal state
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

  // Delete confirm
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    setLoading(true); setError(null)
    const { data, error: err } = await supabase.from('sponsors').select('*').order('name')
    if (err) setError(err.message)
    setSponsors(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openNew() {
    setEditingId(null); setName(''); setSlug(''); setFigmaLayer(''); setSvgUrl(''); setScale(1); setMaxWidth('')
    setModalError(null)
    setShowModal(true)
  }

  function openEdit(s) {
    setEditingId(s.id)
    setName(s.name || '')
    setSlug(s.slug || '')
    setFigmaLayer(s.figma_layer_name || s.slug || '')
    setSvgUrl(s.svg_url || '')
    setScale(s.scale ?? 1)
    setMaxWidth(s.max_width != null ? String(s.max_width) : '')
    setModalError(null)
    setShowModal(true)
  }

  function handleNameChange(val) {
    setName(val)
    if (!editingId) {
      const sl = slugify(val)
      setSlug(sl)
      if (!figmaLayer) setFigmaLayer(sl)
    }
  }

  async function handleFileSelect(file) {
    if (!file) return
    setUploading(true); setModalError(null)
    try {
      const ext = (file.name.split('.').pop() || 'svg').toLowerCase()
      const path = `${slug || `tmp-${Date.now()}`}/logo-${Date.now()}.${ext}`

      // SVG normalization: replace hard-coded colors with currentColor so the
      // logo inherits the menu's color tokens at render time. Strip width/
      // height attrs from the root <svg> so it scales freely. Skip for
      // non-SVG files (PNG/JPG go up as-is). Best-effort — leaves the
      // original file alone if anything goes wrong.
      let uploadBody = file
      let uploadType = file.type || 'image/svg+xml'
      if (ext === 'svg' || (file.type || '').includes('svg')) {
        try {
          const raw = await file.text()
          const normalized = normalizeSponsorSvg(raw)
          uploadBody = new Blob([normalized], { type: 'image/svg+xml' })
          uploadType = 'image/svg+xml'
        } catch (_) { /* fall through with the original */ }
      }

      const { error: upErr } = await supabase.storage
        .from('sponsor-logos')
        .upload(path, uploadBody, { upsert: false, contentType: uploadType })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('sponsor-logos').getPublicUrl(path)
      setSvgUrl(pub.publicUrl)
    } catch (e) {
      setModalError(e.message)
    } finally {
      setUploading(false)
    }
  }

  // Rewrite fill/stroke colors → "currentColor" so the logo recolors with the
  // surrounding text color in Menu Hub / Figma. Skip explicit "none" values
  // (those mean "no fill" and shouldn't become a color). Also strip width/
  // height + style="…" off the root <svg> so it scales to its container.
  function normalizeSponsorSvg(svg) {
    let out = svg
    // Strip fill/stroke colors that aren't "none" (keep "none" as-is)
    out = out.replace(/(\s)(fill|stroke)\s*=\s*"([^"]*)"/gi, (m, sp, attr, val) => {
      const v = val.trim().toLowerCase()
      if (v === 'none' || v === 'currentcolor' || v === '') return m
      return `${sp}${attr}="currentColor"`
    })
    // Same for style="fill:#xxx; stroke:#yyy" inside style attributes
    out = out.replace(/style\s*=\s*"([^"]*)"/gi, (m, body) => {
      const replaced = body.replace(/(fill|stroke)\s*:\s*([^;"]+)/gi, (mm, prop, val) => {
        const v = val.trim().toLowerCase()
        if (v === 'none' || v === 'currentcolor' || v === '') return mm
        return `${prop}:currentColor`
      })
      return `style="${replaced}"`
    })
    // Strip width/height and inline style on the root <svg> so it fills its
    // container in the preview canvas. Only touch the FIRST <svg> tag.
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
        name: name.trim(),
        slug: slug.trim(),
        figma_layer_name: figmaLayer.trim() || slug.trim(),
        svg_url: svgUrl || null,
        scale: Number(scale) || 1,
        max_width: maxWidth ? parseInt(maxWidth, 10) : null,
      }
      let result
      if (editingId) {
        result = await supabase.from('sponsors').update(payload).eq('id', editingId)
      } else {
        result = await supabase.from('sponsors').insert(payload)
      }
      if (result.error) throw result.error
      setShowModal(false)
      load()
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
    setConfirmDeleteId(null)
    load()
  }

  const confirmSponsor = sponsors.find(s => s.id === confirmDeleteId)

  return (
    <PageScreen
      breadcrumbs={[{ label: 'Sponsors' }]}
      actions={canEdit && (
        <button onClick={openNew} className="btn-primary btn-sm gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Sponsor
        </button>
      )}
    >
      <PageBody>
      <p className="text-sm text-ink-400 mb-6">App-wide library. Pick which sponsors apply at the series level and set their tint there.</p>

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
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sponsors.map(sp => (
            <div key={sp.id} className="card p-4 flex items-center gap-3">
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
                <div className="flex flex-col items-end gap-1">
                  <button onClick={() => openEdit(sp)} className="text-[11px] text-ink-400 hover:text-brand-600 font-medium">Edit</button>
                  <button onClick={() => setConfirmDeleteId(sp.id)} className="text-[11px] text-red-400 hover:text-red-600 font-medium">Delete</button>
                </div>
              )}
            </div>
          ))}
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
                onChange={e => setSlug(slugify(e.target.value))}
                placeholder="stella-artois" required />
              <p className="mt-1 text-[11px] text-ink-400">Lowercase, hyphen-separated. Used internally to identify the sponsor.</p>
            </div>
            <div>
              <label className="label">Figma Layer Name</label>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-ink-400 select-none">sponsor--</span>
                <input className="input font-mono text-sm flex-1" value={figmaLayer}
                  onChange={e => setFigmaLayer(slugify(e.target.value))}
                  placeholder={slug || 'stella-artois'} />
              </div>
              <p className="mt-1 text-[11px] text-ink-400">Match the Figma layer name suffix. The plugin uses this to find and toggle the sponsor layer.</p>
            </div>
            <div>
              <label className="label">SVG Logo</label>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-lg border border-surface-200 bg-surface-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {svgUrl ? (
                    <img src={svgUrl} alt="" className="max-w-full max-h-full object-contain p-1" />
                  ) : (
                    <span className="text-[10px] text-ink-300">empty</span>
                  )}
                </div>
                <input ref={fileRef} type="file" accept=".svg,image/svg+xml" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = '' }} />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="btn-secondary btn-sm">
                  {uploading ? 'Uploading…' : svgUrl ? 'Replace' : 'Upload SVG'}
                </button>
                {svgUrl && (
                  <button type="button" onClick={() => setSvgUrl('')} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                )}
              </div>
              <p className="mt-1 text-[11px] text-ink-400">Use <code>currentColor</code> fills so the series tint can recolor the logo.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Size scale</label>
                <input
                  type="number"
                  step="0.05"
                  min="0.25"
                  max="3"
                  className="input"
                  value={scale}
                  onChange={e => setScale(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-ink-400">Multiplier on the series sponsor height. <code>1.0</code> = match the rest; <code>1.3</code> = 30% taller.</p>
              </div>
              <div>
                <label className="label">Max width <span className="text-ink-300 font-normal">(optional)</span></label>
                <div className="relative">
                  <input
                    type="number"
                    className="input pr-9"
                    value={maxWidth}
                    onChange={e => setMaxWidth(e.target.value.replace(/[^\d]/g, ''))}
                    placeholder="auto"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-ink-400 pointer-events-none">px</span>
                </div>
                <p className="mt-1 text-[11px] text-ink-400">Cap an unusually wide logo. Width = auto by default (preserves aspect ratio).</p>
              </div>
            </div>
            {modalError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{modalError}</p>
            )}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button type="button" onClick={() => setShowModal(false)} className="btn-secondary btn-sm">Cancel</button>
              <button type="submit" className="btn-primary btn-sm" disabled={saving}>
                {saving ? 'Saving…' : (editingId ? 'Save Changes' : 'Create Sponsor')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {confirmDeleteId && (
        <Modal title="Delete Sponsor" onClose={() => setConfirmDeleteId(null)}>
          <p className="text-sm text-ink-600 mb-1">
            Delete <span className="font-medium text-ink-900">{confirmSponsor?.name}</span>?
          </p>
          <p className="text-xs text-ink-400 mb-6">
            Any series and events that reference this sponsor will lose the link — their event_sponsor rows stay but will show as unlinked. This action can't be undone.
          </p>
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
