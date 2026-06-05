import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import SegmentedToggle from '@/components/SegmentedToggle'

const INHERIT_OPTS = [
  { value: 'inherit',  label: 'Inherit'  },
  { value: 'override', label: 'Override' },
]

const ROLES = [
  { key: 'menu_title',          label: 'Menu Title',          hasRotate: false, hasSectionLine: false },
  { key: 'section_label',       label: 'Section Label',       hasRotate: true,  hasSectionLine: true  },
  { key: 'item_title',          label: 'Menu Item Title',     hasRotate: false, hasSectionLine: false },
  { key: 'item_description',    label: 'Item Description',    hasRotate: false, hasSectionLine: false },
  { key: 'item_size',           label: 'Item Size',           hasRotate: false, hasSectionLine: false },
  { key: 'item_price',          label: 'Item Price',          hasRotate: false, hasSectionLine: false },
  { key: 'footer_dietary',      label: 'Footer Dietary Key',  hasRotate: false, hasSectionLine: false },
  { key: 'footer_price_details',label: 'Footer Price Details',hasRotate: false, hasSectionLine: false },
]
const TRANSFORMS = ['none', 'uppercase', 'lowercase', 'capitalize']
const ALIGNS = ['left', 'center', 'right', 'justify']
const LINE_POSITIONS = ['below', 'above', 'left', 'right', 'none']
const LINE_DIRECTIONS = ['vertical', 'horizontal']
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

const DEFAULT_ROLE = { size: 40, weight: 400, tracking: 0, transform: 'none', lineHeight: 1.2, font: 'primary' }
const DEFAULT_GAP_BLOCK = { logo_to_title: 80, title_to_items: 100, items_to_footer: 100, section_gap: 'auto', item_gap: 'auto' }

function normalizeSeriesSpec(spec) {
  const s = { ...(spec || {}) }
  for (const r of ROLES) s[r.key] = { ...DEFAULT_ROLE, ...(s[r.key] || {}) }
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

export default function EventStylesTab({ event, series, canEdit, onSaved }) {
  const seriesSpec   = normalizeSeriesSpec(series?.style_spec)
  const seriesFonts  = Array.isArray(series?.fonts) && series.fonts.length ? series.fonts : [{ key: 'primary', family: '', source: 'system', url: '' }]
  const seriesHeader = series?.header_logo_url || ''
  const seriesFooter = series?.footer_url      || ''
  const eventSpec    = event.style_spec || {}

  // Override toggles
  const [overrideFonts,      setOverrideFonts]      = useState(Array.isArray(event.fonts))
  const [overrideHeader,     setOverrideHeader]     = useState(event.header_logo_url != null)
  const [overrideFooter,     setOverrideFooter]     = useState(event.footer_url != null)
  const [overrideIcons,      setOverrideIcons]      = useState(eventSpec.dietary_icons != null)
  const [overrideRole,       setOverrideRole]       = useState(() => {
    const o = {}
    for (const r of ROLES) o[r.key] = eventSpec[r.key] != null
    return o
  })
  const [overrideGap,        setOverrideGap]        = useState({
    sm: eventSpec.gaps?.sm != null,
    md: eventSpec.gaps?.md != null,
    lg: eventSpec.gaps?.lg != null,
  })
  const [overrideIconSize,   setOverrideIconSize]   = useState(eventSpec.dietary_icon_size != null)
  const [overrideLogoH,      setOverrideLogoH]      = useState(eventSpec.logo_max_height != null)

  // Override values (only meaningful when toggle on)
  const [fonts,         setFonts]         = useState(Array.isArray(event.fonts) && event.fonts.length ? event.fonts : seriesFonts)
  const [headerLogoUrl, setHeaderLogoUrl] = useState(event.header_logo_url ?? seriesHeader)
  const [footerUrl,     setFooterUrl]     = useState(event.footer_url     ?? seriesFooter)
  const [icons,         setIcons]         = useState(eventSpec.dietary_icons ?? seriesSpec.dietary_icons)
  const [roleSpecs,     setRoleSpecs]     = useState(() => {
    const out = {}
    for (const r of ROLES) out[r.key] = { ...seriesSpec[r.key], ...(eventSpec[r.key] || {}) }
    return out
  })
  const [gapSpecs,      setGapSpecs]      = useState(() => ({
    sm: { ...seriesSpec.gaps.sm, ...(eventSpec.gaps?.sm || {}) },
    md: { ...seriesSpec.gaps.md, ...(eventSpec.gaps?.md || {}) },
    lg: { ...seriesSpec.gaps.lg, ...(eventSpec.gaps?.lg || {}) },
  }))
  const [iconSize,      setIconSize]      = useState(eventSpec.dietary_icon_size ?? seriesSpec.dietary_icon_size)
  const [logoH,         setLogoH]         = useState(eventSpec.logo_max_height   ?? seriesSpec.logo_max_height)

  const [activeSize, setActiveSize] = useState('md')
  const [saving, setSaving]   = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [error, setError]     = useState(null)
  const [uploadBusy, setUploadBusy] = useState(null)

  useEffect(() => {
    // reset when event changes
    setOverrideFonts(Array.isArray(event.fonts))
    setOverrideHeader(event.header_logo_url != null)
    setOverrideFooter(event.footer_url != null)
    const es = event.style_spec || {}
    const ov = {}
    for (const r of ROLES) ov[r.key] = es[r.key] != null
    setOverrideRole(ov)
    setOverrideGap({ sm: es.gaps?.sm != null, md: es.gaps?.md != null, lg: es.gaps?.lg != null })
    setOverrideIcons(es.dietary_icons != null)
    setOverrideIconSize(es.dietary_icon_size != null)
    setOverrideLogoH(es.logo_max_height != null)
  }, [event.id])

  const fontKeys = (overrideFonts ? fonts : seriesFonts).filter(f => f.key).map(f => f.key)

  async function uploadToSeriesAssets(file, subpath) {
    const ext = (file.name.split('.').pop() || '').toLowerCase()
    const path = `${series.id}/event-${event.id}-${subpath}-${Date.now()}.${ext}`
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
    } catch (e) { setError(e.message) } finally { setUploadBusy(null) }
  }
  async function handleFontUpload(file, idx) {
    if (!file) return
    const key = `font:${idx}`
    setUploadBusy(key); setError(null)
    try {
      const url = await uploadToSeriesAssets(file, `font-${idx}`)
      setFonts(prev => prev.map((f, i) => i === idx ? { ...f, url, file_name: file.name } : f))
    } catch (e) { setError(e.message) } finally { setUploadBusy(null) }
  }
  async function handleIconUpload(file, dietKey) {
    if (!file) return
    setUploadBusy(`icon:${dietKey}`); setError(null)
    try {
      const url = await uploadToSeriesAssets(file, `diet-${dietKey}`)
      setIcons(prev => ({ ...prev, [dietKey]: { ...prev[dietKey], url } }))
    } catch (e) { setError(e.message) } finally { setUploadBusy(null) }
  }

  function addFontSlot()      { if (fonts.length < 4) setFonts(prev => [...prev, { key: `font${prev.length + 1}`, family: '', source: 'system', url: '' }]) }
  function removeFontSlot(i)  { setFonts(prev => prev.filter((_, idx) => idx !== i)) }
  function setFontField(i, field, value) { setFonts(prev => prev.map((f, idx) => idx === i ? { ...f, [field]: value } : f)) }

  function setRoleField(roleKey, field, value) {
    setRoleSpecs(prev => ({ ...prev, [roleKey]: { ...prev[roleKey], [field]: value } }))
  }
  function setGapField(sizeKey, field, value) {
    setGapSpecs(prev => ({ ...prev, [sizeKey]: { ...prev[sizeKey], [field]: value } }))
  }
  function setDietColor(dietKey, color) {
    setIcons(prev => ({ ...prev, [dietKey]: { ...prev[dietKey], color } }))
  }

  async function handleSave() {
    setSaving(true); setError(null); setSavedAt(null)
    // Assemble event.style_spec containing only overridden keys
    const newSpec = {}
    for (const r of ROLES) if (overrideRole[r.key]) newSpec[r.key] = roleSpecs[r.key]
    const gaps = {}
    for (const sk of ['sm','md','lg']) if (overrideGap[sk]) gaps[sk] = gapSpecs[sk]
    if (Object.keys(gaps).length) newSpec.gaps = gaps
    if (overrideIcons)    newSpec.dietary_icons    = icons
    if (overrideIconSize) newSpec.dietary_icon_size = iconSize
    if (overrideLogoH)    newSpec.logo_max_height   = logoH

    const payload = {
      fonts:           overrideFonts  ? fonts        : null,
      header_logo_url: overrideHeader ? (headerLogoUrl || null) : null,
      footer_url:      overrideFooter ? (footerUrl   || null) : null,
      style_spec:      Object.keys(newSpec).length ? newSpec : null,
    }

    const { error: err } = await supabase.from('events').update(payload).eq('id', event.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    setSavedAt(Date.now()); onSaved?.()
  }

  const readOnly = !canEdit

  return (
    <div className="space-y-6">
      <div className="text-xs text-ink-500 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2">
        Event-level styling overrides the series defaults. Sections without an override toggle stay inherited from <span className="font-semibold">{series?.name || 'the series'}</span>.
      </div>

      {/* Fonts */}
      <section className="card p-5 space-y-4">
        <SectionHeader title="Fonts"
          desc="Override the series' font set for this event only."
          overridden={overrideFonts}
          onToggle={() => setOverrideFonts(o => !o)}
          readOnly={readOnly}
        />
        {!overrideFonts ? (
          <InheritedPreview rows={seriesFonts.map(f => `${f.key} · ${f.family || '(no family)'} · ${f.source}`)} />
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              {!readOnly && fonts.length < 4 && (
                <button onClick={addFontSlot} className="btn-secondary btn-sm">+ Add font</button>
              )}
            </div>
            {fonts.map((f, i) => (
              <div key={i} className="border border-surface-200 rounded-lg p-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-ink-500 mb-1">Slot name</label>
                    <input className="input input-sm" value={f.key} onChange={e => setFontField(i, 'key', e.target.value)} disabled={readOnly} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-ink-500 mb-1">Family</label>
                    <input className="input input-sm" value={f.family} onChange={e => setFontField(i, 'family', e.target.value)} disabled={readOnly} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-ink-500 mb-1">Source</label>
                    <select className="input input-sm" value={f.source || 'system'} onChange={e => setFontField(i, 'source', e.target.value)} disabled={readOnly}>
                      {FONT_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                </div>
                {(f.source === 'adobe' || f.source === 'google') && (
                  <input className="input input-sm font-mono text-xs" value={f.url || ''}
                    onChange={e => setFontField(i, 'url', e.target.value)}
                    placeholder={f.source === 'adobe' ? 'https://use.typekit.net/xxxxx.css' : 'https://fonts.googleapis.com/css2?…'}
                    disabled={readOnly} />
                )}
                {f.source === 'upload' && (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      {f.url
                        ? <div className="text-[11px] text-ink-500 font-mono truncate">{f.file_name || f.url.split('/').pop()}</div>
                        : <div className="text-[11px] text-ink-400">Upload a WOFF, WOFF2, TTF, or OTF.</div>}
                    </div>
                    {!readOnly && (
                      <label className={`btn-primary btn-sm cursor-pointer gap-1.5 ${uploadBusy === `font:${i}` ? 'opacity-50' : ''}`}>
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
        )}
      </section>

      {/* Header logo */}
      <section className="card p-5 space-y-3">
        <SectionHeader title="Header Logo"
          desc="Replace just the menu header logo for this event."
          overridden={overrideHeader} onToggle={() => setOverrideHeader(o => !o)} readOnly={readOnly} />
        {!overrideHeader ? (
          <InheritedAsset url={seriesHeader} />
        ) : (
          <AssetRow label="Header logo" url={headerLogoUrl} busy={uploadBusy === 'header'} readOnly={readOnly}
            onFile={f => handleAssetUpload(f, 'header')} onClear={() => setHeaderLogoUrl('')} />
        )}
      </section>

      {/* Footer */}
      <section className="card p-5 space-y-3">
        <SectionHeader title="Footer Graphic"
          desc="Override the footer/boiler graphic for this event."
          overridden={overrideFooter} onToggle={() => setOverrideFooter(o => !o)} readOnly={readOnly} />
        {!overrideFooter ? (
          <InheritedAsset url={seriesFooter} />
        ) : (
          <AssetRow label="Footer" url={footerUrl} busy={uploadBusy === 'footer'} readOnly={readOnly}
            onFile={f => handleAssetUpload(f, 'footer')} onClear={() => setFooterUrl('')} />
        )}
      </section>

      {/* Dietary icons */}
      <section className="card p-5 space-y-3">
        <SectionHeader title="Dietary Icons"
          desc="Replace all three icons and/or colors for this event."
          overridden={overrideIcons} onToggle={() => setOverrideIcons(o => !o)} readOnly={readOnly} />
        {!overrideIcons ? (
          <InheritedPreview rows={['vegetarian', 'vegan', 'gf'].map(k => {
            const v = seriesSpec.dietary_icons[k]
            return `${k}${v?.url ? ' · ✓ icon' : ' · no icon'}${v?.color ? ` · ${v.color}` : ''}`
          })} />
        ) : (
          <div className="space-y-3">
            {['vegetarian', 'vegan', 'gf'].map(diet => {
              const block = icons[diet] || {}
              const labelMap = { vegetarian: 'Vegetarian', vegan: 'Vegan', gf: 'Gluten Free' }
              return (
                <div key={diet} className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-lg border border-surface-200 bg-surface-50 flex items-center justify-center overflow-hidden flex-shrink-0" style={{ color: block.color }}>
                    {block.url
                      ? <img src={block.url} alt="" className="max-w-full max-h-full object-contain p-2" />
                      : <span className="text-[10px] text-ink-300">empty</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-ink-700 mb-1">{labelMap[diet]}</div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {!readOnly && (
                        <label className={`btn-primary btn-sm cursor-pointer gap-1.5 ${uploadBusy === `icon:${diet}` ? 'opacity-50' : ''}`}>
                          {uploadBusy === `icon:${diet}` ? 'Uploading…' : block.url ? 'Replace SVG' : 'Upload SVG'}
                          <input type="file" accept=".svg,image/svg+xml" className="hidden"
                            onChange={e => { const x = e.target.files?.[0]; if (x) handleIconUpload(x, diet); e.target.value = '' }} />
                        </label>
                      )}
                      <label className="flex items-center gap-2">
                        <span className="text-[11px] text-ink-500">Color</span>
                        <input type="color" value={block.color || '#000000'} onChange={e => setDietColor(diet, e.target.value)} disabled={readOnly}
                          className="w-7 h-7 rounded border border-surface-200 cursor-pointer" />
                        <input type="text" className="input input-sm w-24 font-mono text-xs" value={block.color || ''}
                          onChange={e => setDietColor(diet, e.target.value)} disabled={readOnly} />
                      </label>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Typography per-role */}
      <section className="card p-5 space-y-4">
        <header>
          <h3 className="text-sm font-semibold text-ink-900">Typography</h3>
          <p className="text-xs text-ink-400 mt-0.5">Toggle each role individually. Off = inherit from series.</p>
        </header>
        <div className="space-y-4">
          {ROLES.map(role => {
            const isOverride = overrideRole[role.key]
            const v = isOverride ? roleSpecs[role.key] : seriesSpec[role.key]
            return (
              <div key={role.key} className="border-t border-surface-100 pt-4 first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-ink-700">{role.label}</div>
                  <OverrideToggle on={isOverride} onChange={() => setOverrideRole(o => ({ ...o, [role.key]: !o[role.key] }))} readOnly={readOnly} />
                </div>
                <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 ${!isOverride ? 'opacity-50 pointer-events-none' : ''}`}>
                  <NumberField label="Size"        value={v.size}       onChange={n => setRoleField(role.key, 'size', n)}       suffix="px" disabled={readOnly || !isOverride} />
                  <NumberField label="Weight"      value={v.weight}     onChange={n => setRoleField(role.key, 'weight', n)}     step={100} min={100} max={900} disabled={readOnly || !isOverride} />
                  <NumberField label="Tracking"    value={v.tracking}   onChange={n => setRoleField(role.key, 'tracking', n)}   step={0.005} float disabled={readOnly || !isOverride} suffix="em" />
                  <NumberField label="Line height" value={v.lineHeight} onChange={n => setRoleField(role.key, 'lineHeight', n)} step={0.05} float disabled={readOnly || !isOverride} />
                  <SelectField label="Font"        value={v.font}       onChange={s => setRoleField(role.key, 'font', s)}       options={fontKeys.length ? fontKeys : ['primary']} disabled={readOnly || !isOverride} />
                  <SelectField label="Transform"   value={v.transform}  onChange={s => setRoleField(role.key, 'transform', s)}  options={TRANSFORMS} disabled={readOnly || !isOverride} />
                </div>
                <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mt-2 ${!isOverride ? 'opacity-50 pointer-events-none' : ''}`}>
                  <SelectField label="Align"        value={v.align || 'left'} onChange={s => setRoleField(role.key, 'align', s)} options={ALIGNS} disabled={readOnly || !isOverride} />
                  <NumberField label="Width (wdth)" value={v.width} onChange={n => setRoleField(role.key, 'width', n)} step={1} min={25} max={200} allowEmpty disabled={readOnly || !isOverride} />
                  <NumberField label="Slant (slnt)" value={v.slant} onChange={n => setRoleField(role.key, 'slant', n)} step={1} min={-15} max={15} allowEmpty disabled={readOnly || !isOverride} />
                  {role.hasRotate && (
                    <NumberField label="Rotate" value={v.rotate || 0} onChange={n => setRoleField(role.key, 'rotate', n)} step={15} suffix="°" disabled={readOnly || !isOverride} />
                  )}
                </div>
                {role.hasSectionLine && (
                  <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 pt-2 border-t border-surface-100 ${!isOverride ? 'opacity-50 pointer-events-none' : ''}`}>
                    <SelectField label="Line position"  value={v.line_position  || 'below'}    onChange={s => setRoleField(role.key, 'line_position',  s)} options={LINE_POSITIONS}  disabled={readOnly || !isOverride} />
                    <SelectField label="Line direction" value={v.line_direction || 'vertical'} onChange={s => setRoleField(role.key, 'line_direction', s)} options={LINE_DIRECTIONS} disabled={readOnly || !isOverride} />
                    <NumberField label="Line gap" value={v.line_gap ?? 24} onChange={n => setRoleField(role.key, 'line_gap', n)} suffix="px" disabled={readOnly || !isOverride} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Spacing per size */}
      <section className="card p-5 space-y-4">
        <header>
          <h3 className="text-sm font-semibold text-ink-900">Spacing</h3>
          <p className="text-xs text-ink-400 mt-0.5">Each size can override independently.</p>
        </header>
        <div className="flex items-center gap-1 border-b border-surface-200">
          {SIZES.map(s => (
            <button key={s.key} onClick={() => setActiveSize(s.key)}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                activeSize === s.key ? 'border-brand-500 text-brand-600' : 'border-transparent text-ink-500 hover:text-ink-800'
              }`}>{s.label}</button>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-500">{SIZES.find(s => s.key === activeSize)?.label} canvas gaps</span>
          <OverrideToggle on={overrideGap[activeSize]} onChange={() => setOverrideGap(o => ({ ...o, [activeSize]: !o[activeSize] }))} readOnly={readOnly} />
        </div>
        <div className={`grid grid-cols-2 sm:grid-cols-3 gap-3 ${!overrideGap[activeSize] ? 'opacity-50 pointer-events-none' : ''}`}>
          {(() => {
            const v = overrideGap[activeSize] ? gapSpecs[activeSize] : seriesSpec.gaps[activeSize]
            return (
              <>
                <NumberField label="Logo → Title"   value={v.logo_to_title}   onChange={n => setGapField(activeSize, 'logo_to_title', n)}   suffix="px" disabled={readOnly || !overrideGap[activeSize]} />
                <NumberField label="Title → Items"  value={v.title_to_items}  onChange={n => setGapField(activeSize, 'title_to_items', n)}  suffix="px" disabled={readOnly || !overrideGap[activeSize]} />
                <NumberField label="Items → Footer" value={v.items_to_footer} onChange={n => setGapField(activeSize, 'items_to_footer', n)} suffix="px" disabled={readOnly || !overrideGap[activeSize]} />
                <GapField    label="Section gap"    value={v.section_gap}     onChange={x => setGapField(activeSize, 'section_gap', x)}     disabled={readOnly || !overrideGap[activeSize]} />
                <GapField    label="Item gap"       value={v.item_gap}        onChange={x => setGapField(activeSize, 'item_gap',    x)}     disabled={readOnly || !overrideGap[activeSize]} />
              </>
            )
          })()}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-surface-100">
          <OverridableNumber label="Dietary icon size" override={overrideIconSize} value={iconSize} onChange={setIconSize}
            seriesValue={seriesSpec.dietary_icon_size} onToggleOverride={() => setOverrideIconSize(o => !o)} suffix="px" readOnly={readOnly} />
          <OverridableNumber label="Logo max height"   override={overrideLogoH}   value={logoH}    onChange={setLogoH}
            seriesValue={seriesSpec.logo_max_height} onToggleOverride={() => setOverrideLogoH(o => !o)} suffix="px" readOnly={readOnly} />
        </div>
      </section>

      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

      {canEdit && (
        <div className="flex items-center justify-end gap-3 sticky bottom-0 bg-surface-50/80 backdrop-blur py-3">
          {savedAt && <span className="text-xs text-emerald-600">Saved.</span>}
          <button onClick={handleSave} disabled={saving} className="btn-primary btn-sm">
            {saving ? 'Saving…' : 'Save Overrides'}
          </button>
        </div>
      )}
    </div>
  )
}

function SectionHeader({ title, desc, overridden, onToggle, readOnly }) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div>
        <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
        <p className="text-xs text-ink-400 mt-0.5">{desc}</p>
      </div>
      <OverrideToggle on={overridden} onChange={onToggle} readOnly={readOnly} />
    </header>
  )
}

function OverrideToggle({ on, onChange, readOnly }) {
  return (
    <SegmentedToggle
      value={on ? 'override' : 'inherit'}
      options={INHERIT_OPTS}
      onChange={v => { if ((v === 'override') !== on) onChange() }}
      disabled={readOnly}
    />
  )
}

function InheritedPreview({ rows }) {
  return (
    <div className="text-[11px] text-ink-500 bg-surface-50 border border-surface-200 rounded-lg p-3 space-y-1 font-mono">
      <div className="text-ink-400 text-[10px] uppercase tracking-wider mb-1">Inherited from series</div>
      {rows.map((r, i) => <div key={i}>{r}</div>)}
    </div>
  )
}

function InheritedAsset({ url }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-16 h-16 rounded-lg border border-surface-200 bg-surface-50 flex items-center justify-center overflow-hidden flex-shrink-0">
        {url
          ? <img src={url} alt="" className="max-w-full max-h-full object-contain p-2" />
          : <span className="text-[10px] text-ink-300">empty</span>}
      </div>
      <div className="text-[11px] text-ink-500">Inherited from series</div>
    </div>
  )
}

function AssetRow({ label, url, onFile, onClear, busy, readOnly }) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-20 h-20 rounded-lg border border-surface-200 bg-surface-50 flex items-center justify-center overflow-hidden flex-shrink-0">
        {url
          ? <img src={url} alt="" className="max-w-full max-h-full object-contain p-2" />
          : <span className="text-[10px] text-ink-300">empty</span>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-ink-700 mb-1">{label}</div>
        {url && <div className="text-[11px] text-ink-400 font-mono truncate">{url.split('/').pop()}</div>}
        {!readOnly && (
          <div className="flex items-center gap-2 mt-2">
            <label className={`btn-primary btn-sm cursor-pointer gap-1.5 ${busy ? 'opacity-50' : ''}`}>
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

function OverridableNumber({ label, override, value, onChange, seriesValue, onToggleOverride, suffix, readOnly }) {
  return (
    <div className="border border-surface-200 rounded-lg p-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-medium text-ink-500">{label}</span>
        <OverrideToggle on={override} onChange={onToggleOverride} readOnly={readOnly} />
      </div>
      <div className={!override ? 'opacity-50 pointer-events-none' : ''}>
        <NumberField label="" value={override ? value : seriesValue} onChange={onChange} suffix={suffix} disabled={readOnly || !override} />
      </div>
    </div>
  )
}

function NumberField({ label, value, onChange, suffix, step = 1, min, max, float, allowEmpty, disabled }) {
  return (
    <div>
      {label && <label className="block text-[11px] font-medium text-ink-500 mb-1">{label}</label>}
      <div className="relative">
        <input type="number" className="input input-sm pr-7" value={value ?? ''} step={step} min={min} max={max}
          placeholder={allowEmpty ? 'auto' : undefined}
          onChange={e => {
            const v = e.target.value
            if (v === '' && allowEmpty) return onChange(null)
            onChange(float ? parseFloat(v) || 0 : parseInt(v, 10) || 0)
          }}
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
          <input type="number" className="input input-sm flex-1" value={value} onChange={e => onChange(parseInt(e.target.value, 10) || 0)} disabled={disabled} step={10} />
        )}
      </div>
    </div>
  )
}
