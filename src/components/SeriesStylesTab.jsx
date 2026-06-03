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
const FONT_REFS  = ['primary', 'secondary']

const DEFAULT_ROLE = {
  size: 40, weight: 400, tracking: 0, transform: 'none', lineHeight: 1.2, font: 'primary',
}

const DEFAULT_GAPS = {
  logo_to_title: 80, title_to_items: 100, items_to_footer: 100, section_gap: 'auto', item_gap: 'auto',
}

function ensureSpec(spec) {
  const s = { ...(spec || {}) }
  for (const r of ROLES) s[r.key] = { ...DEFAULT_ROLE, ...(s[r.key] || {}) }
  s.gaps = { ...DEFAULT_GAPS, ...(s.gaps || {}) }
  if (s.dietary_icon_size == null) s.dietary_icon_size = 45
  if (s.logo_max_height == null)   s.logo_max_height = 100
  return s
}

export default function SeriesStylesTab({ series, canEdit, onSaved }) {
  const [fontPrimary,    setFontPrimary]    = useState(series.font_primary    || '')
  const [fontSecondary,  setFontSecondary]  = useState(series.font_secondary  || '')
  const [adobeFontsUrl,  setAdobeFontsUrl]  = useState(series.adobe_fonts_url || '')
  const [headerLogoUrl,  setHeaderLogoUrl]  = useState(series.header_logo_url || '')
  const [footerUrl,      setFooterUrl]      = useState(series.footer_url      || '')
  const [spec,           setSpec]           = useState(ensureSpec(series.style_spec))
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [error, setError] = useState(null)
  const [uploadBusy, setUploadBusy] = useState(null) // 'header' | 'footer' | null

  useEffect(() => {
    setFontPrimary(series.font_primary || '')
    setFontSecondary(series.font_secondary || '')
    setAdobeFontsUrl(series.adobe_fonts_url || '')
    setHeaderLogoUrl(series.header_logo_url || '')
    setFooterUrl(series.footer_url || '')
    setSpec(ensureSpec(series.style_spec))
  }, [series.id])

  function setRoleField(roleKey, field, value) {
    setSpec(prev => ({
      ...prev,
      [roleKey]: { ...prev[roleKey], [field]: value },
    }))
  }

  function setGapField(field, value) {
    setSpec(prev => ({ ...prev, gaps: { ...prev.gaps, [field]: value } }))
  }

  async function uploadAsset(file, kind) {
    if (!file) return
    setUploadBusy(kind); setError(null)
    const ext = (file.name.split('.').pop() || 'svg').toLowerCase()
    const path = `${series.id}/${kind}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('series-assets').upload(path, file, { upsert: false, contentType: file.type || 'image/svg+xml' })
    if (upErr) { setError(upErr.message); setUploadBusy(null); return }
    const { data: pub } = supabase.storage.from('series-assets').getPublicUrl(path)
    if (kind === 'header') setHeaderLogoUrl(pub.publicUrl)
    else setFooterUrl(pub.publicUrl)
    setUploadBusy(null)
  }

  async function handleSave() {
    setSaving(true); setError(null); setSavedAt(null)
    const { error: err } = await supabase.from('series')
      .update({
        font_primary:    fontPrimary    || null,
        font_secondary:  fontSecondary  || null,
        adobe_fonts_url: adobeFontsUrl  || null,
        header_logo_url: headerLogoUrl  || null,
        footer_url:      footerUrl      || null,
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
        <header>
          <h3 className="text-sm font-semibold text-ink-900">Fonts</h3>
          <p className="text-xs text-ink-400 mt-0.5">Used across every menu in this series.</p>
        </header>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Primary font family</label>
            <input className="input" value={fontPrimary} onChange={e => setFontPrimary(e.target.value)}
              placeholder="e.g. Acumin Pro Condensed" disabled={readOnly} />
          </div>
          <div>
            <label className="label">Secondary font family</label>
            <input className="input" value={fontSecondary} onChange={e => setFontSecondary(e.target.value)}
              placeholder="e.g. Inter" disabled={readOnly} />
          </div>
        </div>
        <div>
          <label className="label">Adobe Fonts stylesheet URL</label>
          <input className="input font-mono text-xs" value={adobeFontsUrl}
            onChange={e => setAdobeFontsUrl(e.target.value)}
            placeholder="https://use.typekit.net/xxxxx.css" disabled={readOnly} />
          <p className="text-[11px] text-ink-400 mt-1">Will be injected into the preview so the right fonts render.</p>
        </div>
      </section>

      {/* Brand assets */}
      <section className="card p-5 space-y-4">
        <header>
          <h3 className="text-sm font-semibold text-ink-900">Series Assets</h3>
          <p className="text-xs text-ink-400 mt-0.5">SVGs preferred — they scale and recolor cleanly.</p>
        </header>
        <AssetRow
          label="Header logo"
          url={headerLogoUrl}
          busy={uploadBusy === 'header'}
          readOnly={readOnly}
          onFile={f => uploadAsset(f, 'header')}
          onClear={() => setHeaderLogoUrl('')}
        />
        <AssetRow
          label="Footer / boiler graphic"
          url={footerUrl}
          busy={uploadBusy === 'footer'}
          readOnly={readOnly}
          onFile={f => uploadAsset(f, 'footer')}
          onClear={() => setFooterUrl('')}
        />
      </section>

      {/* Typography spec */}
      <section className="card p-5 space-y-5">
        <header>
          <h3 className="text-sm font-semibold text-ink-900">Typography</h3>
          <p className="text-xs text-ink-400 mt-0.5">Pixel sizes at the 1600-wide print canvas. Same across all menus in this series.</p>
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
                  <SelectField label="Font"      value={v.font}      onChange={s => setRoleField(role.key, 'font', s)}      options={FONT_REFS} disabled={readOnly} />
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

      {/* Spacing */}
      <section className="card p-5 space-y-4">
        <header>
          <h3 className="text-sm font-semibold text-ink-900">Spacing</h3>
          <p className="text-xs text-ink-400 mt-0.5">Use <code className="text-[11px] bg-surface-100 px-1 rounded">auto</code> for items/sections so they flow to fill the canvas. Numbers are pixels at 1600-wide.</p>
        </header>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <NumberField label="Logo → Title"   value={spec.gaps.logo_to_title}   onChange={n => setGapField('logo_to_title', n)}   suffix="px" disabled={readOnly} />
          <NumberField label="Title → Items"  value={spec.gaps.title_to_items}  onChange={n => setGapField('title_to_items', n)}  suffix="px" disabled={readOnly} />
          <NumberField label="Items → Footer" value={spec.gaps.items_to_footer} onChange={n => setGapField('items_to_footer', n)} suffix="px" disabled={readOnly} />
          <GapField label="Section gap" value={spec.gaps.section_gap} onChange={v => setGapField('section_gap', v)} disabled={readOnly} />
          <GapField label="Item gap"    value={spec.gaps.item_gap}    onChange={v => setGapField('item_gap', v)}    disabled={readOnly} />
          <NumberField label="Dietary icon size" value={spec.dietary_icon_size} onChange={n => setSpec(p => ({ ...p, dietary_icon_size: n }))} suffix="px" disabled={readOnly} />
          <NumberField label="Logo max height"   value={spec.logo_max_height}   onChange={n => setSpec(p => ({ ...p, logo_max_height: n }))}   suffix="px" disabled={readOnly} />
        </div>
      </section>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}

      {canEdit && (
        <div className="flex items-center justify-end gap-3">
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
              <input
                type="file" accept=".svg,image/svg+xml,image/png" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
                disabled={busy}
              />
            </label>
            {url && (
              <button onClick={onClear} className="text-xs text-red-500 hover:text-red-700">Remove</button>
            )}
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
        <input
          type="number"
          className="input input-sm pr-7"
          value={value ?? ''}
          step={step} min={min} max={max}
          onChange={e => onChange(float ? parseFloat(e.target.value) || 0 : parseInt(e.target.value, 10) || 0)}
          disabled={disabled}
        />
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
        <button
          type="button"
          onClick={() => onChange(isAuto ? 60 : 'auto')}
          disabled={disabled}
          className={`text-[10px] px-2 py-1 rounded font-medium ${isAuto ? 'bg-brand-100 text-brand-700' : 'bg-surface-100 text-ink-500'}`}
        >
          auto
        </button>
        {!isAuto && (
          <input type="number" className="input input-sm flex-1" value={value}
            onChange={e => onChange(parseInt(e.target.value, 10) || 0)} disabled={disabled} step={10} />
        )}
      </div>
    </div>
  )
}
