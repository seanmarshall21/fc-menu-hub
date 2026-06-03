import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const ROLES = [
  { key: 'menu_title',       label: 'Menu Title',       hasRotate: false },
  { key: 'section_label',    label: 'Section Label',    hasRotate: true  },
  { key: 'item_title',       label: 'Menu Item Title',  hasRotate: false },
  { key: 'item_description', label: 'Item Description', hasRotate: false },
  { key: 'item_size',        label: 'Item Size',        hasRotate: false },
  { key: 'item_price',       label: 'Item Price',       hasRotate: false },
]

const TRANSFORMS = ['none', 'uppercase', 'lowercase', 'capitalize']
const SIZES = [
  { key: 'sm', label: 'Small'  },
  { key: 'md', label: 'Medium' },
  { key: 'lg', label: 'Large'  },
]
const FONT_SOURCES = [
  { value: 'adobe',  label: 'Adobe Fonts URL' },
  { value: 'google', label: 'Google Fonts URL' },
  { value: 'upload', label: 'Upload file (WOFF/TTF/OTF)' },
  { value: 'system', label: 'System / installed' },
]

const DEFAULT_ROLE = {
  size: 40, weight: 400, tracking: 0, transform: 'none', lineHeight: 1.2, font: 'primary',
}
const DEFAULT_GAP_BLOCK = {
  logo_to_title: 80, title_to_items: 100, items_to_footer: 100, section_gap: 'auto', item_gap: 'auto',
}

function ensureSpec(spec) {
  const s = { ...(spec || {}) }
  for (const r of ROLES) s[r.key] = { ...DEFAULT_ROLE, ...(s[r.key] || {}) }

  // gaps: per-size; if a flat object is present (legacy), lift it to all 3 sizes
  const rawGaps = s.gaps || {}
  const isPerSize = rawGaps.sm || rawGaps.md || rawGaps.lg
  s.gaps = {
    sm: { ...DEFAULT_GAP_BLOCK, ...(isPerSize ? (rawGaps.sm || {}) : rawGaps) },
    md: { ...DEFAULT_GAP_BLOCK, ...(isPerSize ? (rawGaps.md || {}) : rawGaps) },
    lg: { ...DEFAULT_GAP_BLOCK, ...(isPerSize ? (rawGaps.lg || {}) : rawGaps) },
  }
  s.dietary_icons = s.dietary_icons || {
    vegetarian: { url: null, color: '#4a8054' },
    vegan:      { url: null, color: '#a05a3e' },
    gf:         { url: null, color: '#a05a3e' },
  }
  if (s.dietary_icon_size == null) s.dietary_icon_size = 45
  if (s.logo_max_height  == null) s.logo_max_height   = 100
  return s
}

function ensureFonts(fonts) {
  const arr = Array.isArray(fonts) ? [...fonts] : []
  // Ensure at minimum one "primary" slot exists
  if (arr.length === 0) {
    arr.push({ key: 'primary', family: '', source: 'system', url: '' })
  }
  return arr
}

export default function SeriesStylesTab({ series, canEdit, onSaved }) {
  const [fonts,         setFonts]         = useState(ensureFonts(series.fonts))
  const [headerLogoUrl, setHeaderLogoUrl] = useState(series.header_logo_url || '')
  const [footerUrl,     setFooterUrl]     = useState(series.footer_url      || '')
  const [spec,          setSpec]          = useState(ensureSpec(series.style_spec))
  const [activeSize,    setActiveSize]    = useState('md')
  const [saving, setSaving]               = useState(false)
  const [savedAt, setSavedAt]             = useState(null)
  const [error, setError]                 = useState(null)
  const [uploadBusy, setUploadBusy]       = useState(null) // free-form key e.g. 'header' | 'footer' | 'font:0' | 'icon:vegetarian'

  useEffect(() => {
    setFonts(ensureFonts(series.fonts))
    setHeaderLogoUrl(series.header_logo_url || '')
    setFooterUrl(series.footer_url || '')
    setSpec(ensureSpec(series.style_spec))
  }, [series.id])

  const fontKeys = fonts.filter(f => f.key).map(f => f.key)

  async function uploadToSeriesAssets(file, subpath) {
    const ext = (file.name.split('.').pop() || '').toLowerCase()
    const path = `${series.id}/${subpath}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('series-assets').upload(path, file, { upsert: false, contentType: file.type || undefined })
    if (upErr) throw upErr
    const { data: pub } = supabase.storage.from('series-assets').getPublicUrl(path)
    return pub.publicUrl
  }

  async function handleAssetUpload(file, kind) {
    if (!file) return
    setUploadBusy(kind); setError(null)
    try {
      const url = await uploadToSeriesAssets(file, kind)
      if (kind === 'header') setHeaderLogoUrl(url)
      else if (kind === 'footer') setFooterUrl(url)
    } catch (e) {
      setError(e.message)
    } finally {
      setUploadBusy(null)
    }
  }

  async function handleFontUpload(file, idx) {
    if (!file) return
    const key = `font:${idx}`
    setUploadBusy(key); setError(null)
    try {
      const url = await uploadToSeriesAssets(file, `font-${idx}`)
      setFonts(prev => prev.map((f, i) => i === idx ? { ...f, url, file_name: file.name } : f))
    } catch (e) { setError(e.message) }
    finally { setUploadBusy(null) }
  }

  async function handleIconUpload(file, dietKey) {
    if (!file) return
    const key = `icon:${dietKey}`
    setUploadBusy(key); setError(null)
    try {
      const url = await uploadToSeriesAssets(file, `diet-${dietKey}`)
      setSpec(prev => ({
        ...prev,
        dietary_icons: { ...prev.dietary_icons, [dietKey]: { ...prev.dietary_icons[dietKey], url } },
      }))
    } catch (e) { setError(e.message) }
    finally { setUploadBusy(null) }
  }

  function setRoleField(roleKey, field, value) {
    setSpec(prev => ({ ...prev, [roleKey]: { ...prev[roleKey], [field]: value } }))
  }

  function setGapField(sizeKey, field, value) {
    setSpec(prev => ({
      ...prev,
      gaps: { ...prev.gaps, [sizeKey]: { ...prev.gaps[sizeKey], [field]: value } },
    }))
  }

  function addFontSlot() {
    if (fonts.length >= 4) return
    setFonts(prev => [...prev, { key: `font${prev.length + 1}`, family: '', source: 'system', url: '' }])
  }
  function removeFontSlot(idx) {
    setFonts(prev => prev.filter((_, i) => i !== idx))
  }
  function setFontField(idx, field, value) {
    setFonts(prev => prev.map((f, i) => i === idx ? { ...f, [field]: value } : f))
  }

  function setDietColor(dietKey, color) {
    setSpec(prev => ({
      ...prev,
      dietary_icons: { ...prev.dietary_icons, [dietKey]: { ...prev.dietary_icons[dietKey], color } },
    }))
  }

  async function handleSave() {
    setSaving(true); setError(null); setSavedAt(null)
    const { error: err } = await supabase.from('series')
      .update({
        fonts:           fonts,
        header_logo_url: headerLogoUrl || null,
        footer_url:      footerUrl     || null,
        style_spec:      spec,
      })
      .eq('id', series.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    setSavedAt(Date.now())
    onSaved?.()
  }

  const readOnly = !canEdit

  return (
    <div className="space-y-6">
      {!canEdit && (
        <div className="text-xs text-ink-500 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Read-only. Sign in as Admin or Internal to edit.
        </div>
      )}

      {/* Fonts */}
      <section className="card p-5 space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">Fonts</h3>
            <p className="text-xs text-ink-400 mt-0.5">Up to 4 slots. Each slot is referenced by name from the typography section below.</p>
          </div>
          {!readOnly && fonts.length < 4 && (
            <button onClick={addFontSlot} className="btn-secondary btn-sm">+ Add font</button>
          )}
        </header>

        <div className="space-y-3">
          {fonts.map((f, i) => (
            <div key={i} className="border border-surface-200 rounded-lg p-3 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-ink-500 mb-1">Slot name</label>
                  <input className="input input-sm" value={f.key} onChange={e => setFontField(i, 'key', e.target.value)}
                    placeholder="primary" disabled={readOnly} />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-ink-500 mb-1">Family (CSS name)</label>
                  <input className="input input-sm" value={f.family} onChange={e => setFontField(i, 'family', e.target.value)}
                    placeholder="e.g. Acumin Pro Condensed" disabled={readOnly} />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-ink-500 mb-1">Source</label>
                  <select className="input input-sm" value={f.source || 'system'}
                    onChange={e => setFontField(i, 'source', e.target.value)} disabled={readOnly}>
                    {FONT_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              {(f.source === 'adobe' || f.source === 'google') && (
                <div>
                  <label className="block text-[11px] font-medium text-ink-500 mb-1">
                    {f.source === 'adobe' ? 'Adobe Fonts stylesheet URL' : 'Google Fonts stylesheet URL'}
                  </label>
                  <input className="input input-sm font-mono text-xs" value={f.url || ''}
                    onChange={e => setFontField(i, 'url', e.target.value)}
                    placeholder={f.source === 'adobe' ? 'https://use.typekit.net/xxxxx.css' : 'https://fonts.googleapis.com/css2?family=…'}
                    disabled={readOnly} />
                </div>
              )}

              {f.source === 'upload' && (
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <label className="block text-[11px] font-medium text-ink-500 mb-1">Uploaded font</label>
                    {f.url ? (
                      <div className="text-[11px] text-ink-500 font-mono truncate">{f.file_name || f.url.split('/').pop()}</div>
                    ) : (
                      <div className="text-[11px] text-ink-400">No file yet — upload a WOFF, WOFF2, TTF, or OTF.</div>
                    )}
                  </div>
                  {!readOnly && (
                    <label className={`btn-secondary btn-sm cursor-pointer ${uploadBusy === `font:${i}` ? 'opacity-50' : ''}`}>
                      {uploadBusy === `font:${i}` ? 'Uploading…' : f.url ? 'Replace' : 'Upload'}
                      <input type="file" accept=".woff,.woff2,.ttf,.otf,font/*" className="hidden"
                        onChange={e => { const x = e.target.files?.[0]; if (x) handleFontUpload(x, i); e.target.value = '' }} />
                    </label>
                  )}
                </div>
              )}

              {!readOnly && fonts.length > 1 && (
                <div className="flex justify-end">
                  <button onClick={() => removeFontSlot(i)} className="text-[11px] text-red-500 hover:text-red-700">Remove slot</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Brand assets */}
      <section className="card p-5 space-y-4">
        <header>
          <h3 className="text-sm font-semibold text-ink-900">Series Assets</h3>
          <p className="text-xs text-ink-400 mt-0.5">SVGs preferred — they scale and recolor cleanly.</p>
        </header>
        <AssetRow label="Header logo" url={headerLogoUrl} busy={uploadBusy === 'header'} readOnly={readOnly}
          onFile={f => handleAssetUpload(f, 'header')} onClear={() => setHeaderLogoUrl('')} />
        <AssetRow label="Footer / boiler graphic" url={footerUrl} busy={uploadBusy === 'footer'} readOnly={readOnly}
          onFile={f => handleAssetUpload(f, 'footer')} onClear={() => setFooterUrl('')} />
      </section>

      {/* Dietary icons */}
      <section className="card p-5 space-y-4">
        <header>
          <h3 className="text-sm font-semibold text-ink-900">Dietary Icons</h3>
          <p className="text-xs text-ink-400 mt-0.5">SVG per icon. Color overrides the fill — use the same hex as your Figma palette.</p>
        </header>
        {['vegetarian', 'vegan', 'gf'].map(diet => {
          const block = spec.dietary_icons[diet]
          const labelMap = { vegetarian: 'Vegetarian', vegan: 'Vegan', gf: 'Gluten Free' }
          return (
            <div key={diet} className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-lg border border-surface-200 bg-surface-50 flex items-center justify-center overflow-hidden flex-shrink-0" style={{ color: block.color }}>
                {block.url ? (
                  <img src={block.url} alt="" className="max-w-full max-h-full object-contain p-2" />
                ) : (
                  <span className="text-[10px] text-ink-300">empty</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-ink-700 mb-1">{labelMap[diet]}</div>
                <div className="flex items-center gap-2 flex-wrap">
                  {!readOnly && (
                    <label className={`btn-secondary btn-sm cursor-pointer ${uploadBusy === `icon:${diet}` ? 'opacity-50' : ''}`}>
                      {uploadBusy === `icon:${diet}` ? 'Uploading…' : block.url ? 'Replace SVG' : 'Upload SVG'}
                      <input type="file" accept=".svg,image/svg+xml" className="hidden"
                        onChange={e => { const x = e.target.files?.[0]; if (x) handleIconUpload(x, diet); e.target.value = '' }} />
                    </label>
                  )}
                  <label className="flex items-center gap-2">
                    <span className="text-[11px] text-ink-500">Color</span>
                    <input type="color" value={block.color || '#000000'}
                      onChange={e => setDietColor(diet, e.target.value)} disabled={readOnly}
                      className="w-7 h-7 rounded border border-surface-200 cursor-pointer" />
                    <input type="text" className="input input-sm w-24 font-mono text-xs" value={block.color || ''}
                      onChange={e => setDietColor(diet, e.target.value)} disabled={readOnly} />
                  </label>
                </div>
              </div>
            </div>
          )
        })}
      </section>

      {/* Typography spec */}
      <section className="card p-5 space-y-5">
        <header>
          <h3 className="text-sm font-semibold text-ink-900">Typography</h3>
          <p className="text-xs text-ink-400 mt-0.5">Same across every menu in this series. Pixel sizes at the 1600-wide print canvas.</p>
        </header>
        <div className="space-y-4">
          {ROLES.map(role => {
            const v = spec[role.key]
            return (
              <div key={role.key} className="border-t border-surface-100 pt-4 first:border-t-0 first:pt-0">
                <div className="text-xs font-semibold text-ink-700 mb-2">{role.label}</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  <NumberField label="Size"        value={v.size}       onChange={n => setRoleField(role.key, 'size', n)}       suffix="px" disabled={readOnly} />
                  <NumberField label="Weight"      value={v.weight}     onChange={n => setRoleField(role.key, 'weight', n)}     step={100} min={100} max={900} disabled={readOnly} />
                  <NumberField label="Tracking"    value={v.tracking}   onChange={n => setRoleField(role.key, 'tracking', n)}   step={0.005} float disabled={readOnly} suffix="em" />
                  <NumberField label="Line height" value={v.lineHeight} onChange={n => setRoleField(role.key, 'lineHeight', n)} step={0.05} float disabled={readOnly} />
                  <SelectField label="Font"      value={v.font}      onChange={s => setRoleField(role.key, 'font', s)}      options={fontKeys.length ? fontKeys : ['primary']} disabled={readOnly} />
                  <SelectField label="Transform" value={v.transform} onChange={s => setRoleField(role.key, 'transform', s)} options={TRANSFORMS} disabled={readOnly} />
                </div>
                {role.hasRotate && (
                  <div className="mt-2 max-w-[160px]">
                    <NumberField label="Rotate" value={v.rotate || 0} onChange={n => setRoleField(role.key, 'rotate', n)} step={15} suffix="°" disabled={readOnly} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Spacing — per size */}
      <section className="card p-5 space-y-4">
        <header>
          <h3 className="text-sm font-semibold text-ink-900">Spacing</h3>
          <p className="text-xs text-ink-400 mt-0.5">Dial in gaps separately for SM / MD / LG canvases. <code className="text-[11px] bg-surface-100 px-1 rounded">auto</code> means items flow to fill.</p>
        </header>
        <div className="flex items-center gap-1 border-b border-surface-200">
          {SIZES.map(s => (
            <button key={s.key} onClick={() => setActiveSize(s.key)}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                activeSize === s.key
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-ink-500 hover:text-ink-800'
              }`}>{s.label}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <NumberField label="Logo → Title"   value={spec.gaps[activeSize].logo_to_title}   onChange={n => setGapField(activeSize, 'logo_to_title', n)}   suffix="px" disabled={readOnly} />
          <NumberField label="Title → Items"  value={spec.gaps[activeSize].title_to_items}  onChange={n => setGapField(activeSize, 'title_to_items', n)}  suffix="px" disabled={readOnly} />
          <NumberField label="Items → Footer" value={spec.gaps[activeSize].items_to_footer} onChange={n => setGapField(activeSize, 'items_to_footer', n)} suffix="px" disabled={readOnly} />
          <GapField label="Section gap" value={spec.gaps[activeSize].section_gap} onChange={v => setGapField(activeSize, 'section_gap', v)} disabled={readOnly} />
          <GapField label="Item gap"    value={spec.gaps[activeSize].item_gap}    onChange={v => setGapField(activeSize, 'item_gap', v)}    disabled={readOnly} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-surface-100">
          <NumberField label="Dietary icon size" value={spec.dietary_icon_size} onChange={n => setSpec(p => ({ ...p, dietary_icon_size: n }))} suffix="px" disabled={readOnly} />
          <NumberField label="Logo max height"   value={spec.logo_max_height}   onChange={n => setSpec(p => ({ ...p, logo_max_height: n }))}   suffix="px" disabled={readOnly} />
        </div>
      </section>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}

      {canEdit && (
        <div className="flex items-center justify-end gap-3 sticky bottom-0 bg-surface-50/80 backdrop-blur py-3">
          {savedAt && <span className="text-xs text-emerald-600">Saved.</span>}
          <button onClick={handleSave} disabled={saving} className="btn-primary btn-sm">
            {saving ? 'Saving…' : 'Save Styles'}
          </button>
        </div>
      )}
    </div>
  )
}

function AssetRow({ label, url, onFile, onClear, busy, readOnly }) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-20 h-20 rounded-lg border border-surface-200 bg-surface-50 flex items-center justify-center overflow-hidden flex-shrink-0">
        {url ? (
          <img src={url} alt="" className="max-w-full max-h-full object-contain p-2" />
        ) : (
          <span className="text-[10px] text-ink-300">empty</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-ink-700 mb-1">{label}</div>
        {url && <div className="text-[11px] text-ink-400 font-mono truncate">{url.split('/').pop()}</div>}
        {!readOnly && (
          <div className="flex items-center gap-2 mt-2">
            <label className={`btn-secondary btn-sm cursor-pointer ${busy ? 'opacity-50' : ''}`}>
              {busy ? 'Uploading…' : url ? 'Replace' : 'Upload SVG'}
              <input type="file" accept=".svg,image/svg+xml,image/png" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} disabled={busy} />
            </label>
            {url && <button onClick={onClear} className="text-xs text-red-500 hover:text-red-700">Remove</button>}
          </div>
        )}
      </div>
    </div>
  )
}

function NumberField({ label, value, onChange, suffix, step = 1, min, max, float, disabled }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-ink-500 mb-1">{label}</label>
      <div className="relative">
        <input type="number" className="input input-sm pr-7" value={value ?? ''} step={step} min={min} max={max}
          onChange={e => onChange(float ? parseFloat(e.target.value) || 0 : parseInt(e.target.value, 10) || 0)}
          disabled={disabled} />
        {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-ink-400 pointer-events-none">{suffix}</span>}
      </div>
    </div>
  )
}

function SelectField({ label, value, onChange, options, disabled }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-ink-500 mb-1">{label}</label>
      <select className="input input-sm" value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function GapField({ label, value, onChange, disabled }) {
  const isAuto = value === 'auto'
  return (
    <div>
      <label className="block text-[11px] font-medium text-ink-500 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onChange(isAuto ? 60 : 'auto')} disabled={disabled}
          className={`text-[10px] px-2 py-1 rounded font-medium ${isAuto ? 'bg-brand-100 text-brand-700' : 'bg-surface-100 text-ink-500'}`}>auto</button>
        {!isAuto && (
          <input type="number" className="input input-sm flex-1" value={value}
            onChange={e => onChange(parseInt(e.target.value, 10) || 0)} disabled={disabled} step={10} />
        )}
      </div>
    </div>
  )
}
