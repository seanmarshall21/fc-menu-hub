import { useEffect, useState, useRef } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import Papa from 'papaparse'
import { supabase } from '@/lib/supabase'
import { openPreviewExportWindow } from '@/lib/openPreviewExportWindow'
import { menuPreviewSrc } from '@/lib/menuPreview'
import OrderFormModal from '@/components/OrderFormModal'
import QuantityField from '@/components/QuantityField'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import PageScreen, { PageBody } from '@/components/PageScreen'
import PizzaLoader from '@/components/PizzaLoader'
import { useDelayedLoader } from '@/hooks/useDelayedLoader'
import PhaseBadge from '@/components/PhaseBadge'
import ReviewChip from '@/components/ReviewChip'
import SizeChip from '@/components/SizeChip'
import SponsorFlag from '@/components/SponsorFlag'
import AiReviewFlag from '@/components/AiReviewFlag'
import ReviewRulesEditor from '@/components/ReviewRulesEditor'
import EventAiReviewPanel from '@/components/EventAiReviewPanel'
import ActivityDrawer from '@/components/ActivityDrawer'
import ActivityButton from '@/components/ActivityButton'
import ActivityTab from '@/components/ActivityTab'
import { reviewContentHash, reviewFindingKey } from '@/lib/menuReview'
import { resolveApprovers, canApprove } from '@/lib/approvers'
import SyncChip from '@/components/SyncChip'
import FilterDropdown from '@/components/FilterDropdown'
import Modal from '@/components/Modal'
import { format } from 'date-fns'
import TemplateCanvas, { SIZE_CONFIGS } from '@/components/TemplateCanvas'
import EventStylesTab from '@/components/EventStylesTab'
import FavoriteButton from '@/components/FavoriteButton'
import EntityIconPicker from '@/components/EntityIconPicker'
import ApproversPanel from '@/components/ApproversPanel'
import RosterEditor from '@/components/RosterEditor'
import EventReadiness from '@/components/EventReadiness'
import BulkAddItemModal from '@/components/BulkAddItemModal'
import OverflowMenu, { MENU_ROW } from '@/components/OverflowMenu'
import ReviewersPanel from '@/components/ReviewersPanel'
import NotifyForEditsEditor from '@/components/NotifyForEditsEditor'
import TargetPicker from '@/components/TargetPicker'
import { duplicateMenuTo } from '@/lib/duplicate'
import { formatPrice, resolveCurrencySpec } from '@/lib/formatPrice'
import FigmaLogo from '@/components/FigmaLogo'
import { openFigmaDesktopFirst } from '@/lib/figmaPlugin'
import EventSponsorsTab from '@/components/EventSponsorsTab'
import { useFocusRefresh } from '@/hooks/useFocusRefresh'

const CATEGORY_LABELS = {
  bar: 'Bar', food: 'Food', vip: 'VIP', happy_hour: 'Happy Hour', custom: 'Custom',
}
const CATEGORIES = Object.keys(CATEGORY_LABELS)
const EVENT_PHASES = ['build', 'proof', 'edits', 'approved', 'exported', 'complete', 'archived']
const MENU_PHASES  = ['build', 'proof', 'edits', 'approved', 'exported', 'complete', 'archived']
const PHASE_LABELS = {
  build: 'Build', proof: 'Proof', edits: 'Edits', approved: 'Approved',
  exported: 'Exported', complete: 'Complete', archived: 'Archived',
}
// Menu Hub gold/orange accent — shared by the Complete chips, Send-previews
// button, and the quick-select group chips.
const SHARE_GRADIENT = 'linear-gradient(135deg, #FFD54F 0%, #FFB300 50%, #FB8C00 100%)'

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// ── CSV parsing helpers ───────────────────────────────────────────────────────
function nameFromFilename(filename) {
  return filename
    .replace(/\.[^.]+$/, '')           // strip extension
    .replace(/[-_]+/g, ' ')            // hyphens/underscores → spaces
    .replace(/\b\w/g, c => c.toUpperCase()) // title case
    .trim()
}

// Mirror of the one in CsvImport.jsx — kept inline to avoid an import cycle
// with this page's local helpers. Accepts the resolved currency spec so
// numeric prices come in formatted (so the form shows the same string as
// the table/Figma do).
function parseCsvRow(row, currency) {
  const status = (row['Status'] || '').toString().trim().toLowerCase()
  const normalizePrice = (raw) => {
    const s = (raw || '').toString().trim()
    if (!s) return null
    if (/[A-Za-z€£¥₹]|^\$/u.test(s)) return s
    return formatPrice(s, currency)
  }
  return {
    section:     (row['Section'] || '').trim(),
    title:       (row['Title'] || '').trim(),
    description: (row['Description'] || '').trim() || null,
    vt:          (row['VT'] || '').toUpperCase() === 'TRUE',
    ve:          (row['VE'] || '').toUpperCase() === 'TRUE',
    gf:          (row['GF'] || '').toUpperCase() === 'TRUE',
    two_sizes:   (row['2 Sizes'] || '').toUpperCase() === 'TRUE',
    size1:       (row['Size'] || '').trim() || null,
    price1:      normalizePrice(row['Price']),
    size2:       (row['Size 2'] || '').trim() || null,
    price2:      normalizePrice(row['Price 2']),
    status:      (status === 'active' || status === 'added') ? 'active'
                 : (status === 'not added' || status === 'not_added') ? 'not_added'
                 : 'draft',
    notes:       (row['Notes'] || '').trim() || null,
  }
}

function parseCsvFile(file, currency) {
  return new Promise(resolve => {
    Papa.parse(file, {
      header: false,        // parse raw rows so we can find the real header row
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data
        // Find the row containing 'Section' AND 'Title' — skip any metadata rows above it
        const headerIdx = rows.findIndex(row =>
          row.some(c => c.trim() === 'Section') && row.some(c => c.trim() === 'Title')
        )
        if (headerIdx === -1) {
          resolve({ items: [], error: 'Could not find Section and Title columns. Check that your CSV uses the correct headers.' })
          return
        }
        const headers = rows[headerIdx].map(h => h.trim())
        const items = rows.slice(headerIdx + 1)
          .map(row => {
            const obj = {}
            headers.forEach((h, i) => { obj[h] = (row[i] || '') })
            return obj
          })
          .filter(r => r['Section'] && r['Title'])
          .map(row => parseCsvRow(row, currency))
        resolve({ items, error: null })
      },
      error: (err) => resolve({ items: [], error: err.message }),
    })
  })
}

// ── Sponsor row ───────────────────────────────────────────────────────────────
function SponsorRow({ sponsor, canEdit, onSave, onDelete, onMoveUp, onMoveDown, isFirst, isLast }) {
  const [editing, setEditing]     = useState(false)
  const [name, setName]           = useState(sponsor.name)
  const [slug, setSlug]           = useState(sponsor.slug)
  const [logoUrl, setLogoUrl]     = useState(sponsor.logo_url || '')
  const [active, setActive]       = useState(sponsor.active)
  const [sortOrder, setSortOrder] = useState(sponsor.sort_order)
  const [saving, setSaving]       = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  async function handleSave() {
    setSaving(true)
    await onSave(sponsor.id, { name: name.trim(), slug: slug.trim(), logo_url: logoUrl.trim() || null, active, sort_order: Number(sortOrder) })
    setSaving(false)
    setEditing(false)
  }

  async function handleToggleActive() {
    const next = !active
    setActive(next)
    await onSave(sponsor.id, { active: next })
  }

  if (editing) {
    return (
      <tr className="bg-brand-50/40">
        <td className="px-4 py-3">
          <input className="input input-sm w-full" value={name}
            onChange={e => { setName(e.target.value); setSlug(slugify(e.target.value)) }} autoFocus />
        </td>
        <td className="px-4 py-3">
          <input className="input input-sm font-mono text-xs w-full" value={slug}
            onChange={e => setSlug(slugify(e.target.value))} />
        </td>
        <td className="px-4 py-3">
          <input className="input input-sm w-full" value={logoUrl}
            onChange={e => setLogoUrl(e.target.value)} placeholder="https://…" />
        </td>
        <td className="px-4 py-3">
          <input type="number" className="input input-sm w-20" value={sortOrder}
            onChange={e => setSortOrder(e.target.value)} />
        </td>
        <td className="px-4 py-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)}
              className="w-4 h-4 rounded accent-brand-500" />
            <span className="text-xs text-ink-500">{active ? 'Active' : 'Inactive'}</span>
          </label>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button onClick={handleSave} disabled={saving} className="btn-primary btn-sm">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => { setEditing(false); setName(sponsor.name); setSlug(sponsor.slug); setLogoUrl(sponsor.logo_url || ''); setActive(sponsor.active); setSortOrder(sponsor.sort_order) }}
              className="btn-secondary btn-sm">Cancel</button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="hover:bg-surface-50 group">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {sponsor.logo_url ? (
            <img src={sponsor.logo_url} alt={sponsor.name} className="w-6 h-6 object-contain rounded" />
          ) : (
            <div className="w-6 h-6 rounded bg-surface-200 flex items-center justify-center">
              <span className="text-xs text-ink-400 font-medium">{sponsor.name[0]}</span>
            </div>
          )}
          <span className="text-sm font-medium text-ink-800">{sponsor.name}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs font-mono text-ink-400">sponsor--{sponsor.slug}</span>
      </td>
      <td className="px-4 py-3">
        {sponsor.logo_url ? (
          <a href={sponsor.logo_url} target="_blank" rel="noreferrer"
            className="text-xs text-brand-600 hover:underline truncate max-w-[160px] block">
            {sponsor.logo_url.replace(/^https?:\/\//, '')}
          </a>
        ) : (
          <span className="text-xs text-ink-300">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-ink-400">{sponsor.sort_order}</span>
      </td>
      <td className="px-4 py-3">
        {canEdit ? (
          <button onClick={handleToggleActive}
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full transition-colors ${
              active ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-surface-100 text-ink-400 hover:bg-surface-200'
            }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-ink-300'}`} />
            {active ? 'Active' : 'Inactive'}
          </button>
        ) : (
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
            active ? 'bg-emerald-50 text-emerald-700' : 'bg-surface-100 text-ink-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-ink-300'}`} />
            {active ? 'Active' : 'Inactive'}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              onClick={onMoveUp} disabled={isFirst}
              className="text-ink-300 hover:text-brand-500 disabled:opacity-20 disabled:cursor-default text-xs px-1"
              title="Move up"
            >↑</button>
            <button
              onClick={onMoveDown} disabled={isLast}
              className="text-ink-300 hover:text-brand-500 disabled:opacity-20 disabled:cursor-default text-xs px-1"
              title="Move down"
            >↓</button>
            {confirmDel ? (
              <>
                <span className="text-xs text-red-600">Delete?</span>
                <button onClick={() => onDelete(sponsor.id)} className="text-xs text-red-600 font-medium hover:underline">Yes</button>
                <button onClick={() => setConfirmDel(false)} className="text-xs text-ink-400 hover:underline">No</button>
              </>
            ) : (
              <>
                <button onClick={() => setEditing(true)} className="text-xs text-ink-500 hover:text-brand-600 font-medium">Edit</button>
                <button onClick={() => setConfirmDel(true)} className="text-xs text-ink-500 hover:text-red-600 font-medium">Delete</button>
              </>
            )}
          </div>
        )}
      </td>
    </tr>
  )
}

// ── Templates Tab ─────────────────────────────────────────────────────────────
function TemplatesTab({ event, templates, canEdit, onSaved }) {
  // Shared style config (read from first existing template, or defaults)
  const existing = Object.values(templates)[0] || {}
  const [colorSection,   setColorSection]   = useState(existing.color_section   || '#1a1a1a')
  const [colorTitle,     setColorTitle]     = useState(existing.color_title     || '#1a1a1a')
  // Item title falls back to the menu title color when not explicitly set,
  // so existing templates keep their current look until this is changed.
  const [colorItemTitle, setColorItemTitle] = useState(existing.color_item_title || existing.color_title || '#1a1a1a')
  const [colorDesc,      setColorDesc]      = useState(existing.color_description || '#555555')
  const [colorPrice,     setColorPrice]     = useState(existing.color_price     || '#1a1a1a')
  const [colorSizeLabel, setColorSizeLabel] = useState(existing.color_size_label || '#888888')
  const [colorDivider,   setColorDivider]   = useState(existing.color_divider   || 'rgba(0,0,0,0.15)')
  const [columns,        setColumns]        = useState(existing.columns         ?? 1)
  const [padTop,         setPadTop]         = useState(existing.padding_top     ?? 160)
  const [padRight,       setPadRight]       = useState(existing.padding_right   ?? 100)
  const [padBottom,      setPadBottom]      = useState(existing.padding_bottom  ?? 160)
  const [padLeft,        setPadLeft]        = useState(existing.padding_left    ?? 100)
  const [styleSaving,    setStyleSaving]    = useState(false)
  const [styleError,     setStyleError]     = useState(null)
  const [styleSuccess,   setStyleSuccess]   = useState(false)

  // Per-size upload state
  const [uploading, setUploading] = useState({}) // { sm: bool, md: bool, lg: bool }
  const [uploadError, setUploadError] = useState({})
  const fileRefs = { sm: useRef(null), md: useRef(null), lg: useRef(null) }

  async function handleUpload(size, file) {
    if (!file) return
    setUploading(prev => ({ ...prev, [size]: true }))
    setUploadError(prev => ({ ...prev, [size]: null }))
    try {
      const path = `${event.id}/${size}-${Date.now()}.${file.name.split('.').pop()}`
      const { error: storageErr } = await supabase.storage
        .from('menu-backgrounds')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (storageErr) throw storageErr

      const { data: { publicUrl } } = supabase.storage
        .from('menu-backgrounds')
        .getPublicUrl(path)

      // Upsert template record for this size
      const current = templates[size] || {}
      const payload = {
        event_id: event.id,
        size,
        background_url: publicUrl,
        color_section:     colorSection   || current.color_section,
        color_title:       colorTitle     || current.color_title,
        color_item_title:  colorItemTitle || current.color_item_title,
        color_description: colorDesc      || current.color_description,
        color_price:       colorPrice     || current.color_price,
        color_size_label:  colorSizeLabel || current.color_size_label,
        color_divider:     colorDivider   || current.color_divider,
        columns:           Number(columns) || current.columns || 1,
        padding_top:       Number(padTop)    || current.padding_top,
        padding_right:     Number(padRight)  || current.padding_right,
        padding_bottom:    Number(padBottom) || current.padding_bottom,
        padding_left:      Number(padLeft)   || current.padding_left,
      }
      const { data: saved, error: dbErr } = await supabase
        .from('event_templates')
        .upsert(payload, { onConflict: 'event_id,size' })
        .select()
        .single()
      if (dbErr) throw dbErr
      onSaved(saved)
    } catch (err) {
      setUploadError(prev => ({ ...prev, [size]: err.message }))
    } finally {
      setUploading(prev => ({ ...prev, [size]: false }))
    }
  }

  async function handleSaveStyle(e) {
    e.preventDefault()
    setStyleSaving(true); setStyleError(null); setStyleSuccess(false)
    try {
      const payload = {
        color_section:     colorSection,
        color_title:       colorTitle,
        color_item_title:  colorItemTitle,
        color_description: colorDesc,
        color_price:       colorPrice,
        color_size_label:  colorSizeLabel,
        color_divider:     colorDivider,
        columns:           Number(columns),
        padding_top:       Number(padTop),
        padding_right:     Number(padRight),
        padding_bottom:    Number(padBottom),
        padding_left:      Number(padLeft),
      }
      // Apply to all existing template sizes + create for any missing sizes
      const sizes = ['sm', 'md', 'lg']
      await Promise.all(sizes.map(async size => {
        const row = { event_id: event.id, size, ...payload }
        if (templates[size]?.background_url) {
          row.background_url = templates[size].background_url
        }
        const { data: saved, error } = await supabase
          .from('event_templates')
          .upsert(row, { onConflict: 'event_id,size' })
          .select()
          .single()
        if (error) throw error
        onSaved(saved)
      }))
      setStyleSuccess(true)
    } catch (err) {
      setStyleError(err.message)
    } finally {
      setStyleSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Background uploads — one card per size */}
      <div>
        <h3 className="text-sm font-semibold text-ink-700 mb-1">Background Images</h3>
        <p className="text-xs text-ink-400 mb-4">
          Upload a proof-quality JPEG or PNG for each size. These are used in the in-app preview.
          SM = 23.5"×23.5", MD = 23.5"×35.25", LG = 23.5"×47.5" (all with 0.25" bleed).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Object.entries(SIZE_CONFIGS).map(([size, cfg]) => {
            const tmpl = templates[size]
            const isUploading = uploading[size]
            const err = uploadError[size]
            return (
              <div key={size} className="card p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-ink-900">{cfg.label}</span>
                    <span className="text-xs text-ink-400 ml-2">{cfg.print}</span>
                  </div>
                  {tmpl?.background_url && (
                    <span className="text-xs text-emerald-600 font-medium">✓ Uploaded</span>
                  )}
                </div>

                {/* Preview thumbnail */}
                {tmpl?.background_url ? (
                  <div className="rounded-lg overflow-hidden bg-surface-100 flex items-center justify-center"
                    style={{ aspectRatio: `${cfg.w}/${cfg.h}` }}>
                    <img
                      src={tmpl.background_url}
                      alt={`${size} background`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="rounded-lg border-2 border-dashed border-surface-200 bg-surface-50
                    flex items-center justify-center text-xs text-ink-300 italic"
                    style={{ aspectRatio: `${cfg.w}/${cfg.h}` }}>
                    No background yet
                  </div>
                )}

                {canEdit && (
                  <>
                    <input
                      ref={fileRefs[size]}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={e => handleUpload(size, e.target.files?.[0])}
                    />
                    <button
                      onClick={() => fileRefs[size].current?.click()}
                      disabled={isUploading}
                      className="btn-primary w-full gap-2 justify-center"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0-12l-4 4m4-4l4 4" />
                      </svg>
                      {isUploading ? 'Uploading…' : tmpl?.background_url ? 'Replace Image' : 'Upload Image'}
                    </button>
                    {err && <p className="text-xs text-red-600">{err}</p>}
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Color + Layout config */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-ink-700 mb-1">Colors & Layout</h3>
        <p className="text-xs text-ink-400 mb-5">
          Applied to all three sizes for this event. Fonts, typography, and per-size gaps live on <strong>Series → Styles</strong>.
        </p>
        <form onSubmit={handleSaveStyle} className="space-y-5">
          {/* Colors */}
          <div>
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-3">Colors</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'Section',     value: colorSection,   set: setColorSection   },
                { label: 'Menu Title',  value: colorTitle,     set: setColorTitle     },
                { label: 'Item Title',  value: colorItemTitle, set: setColorItemTitle },
                { label: 'Desc',        value: colorDesc,      set: setColorDesc      },
                { label: 'Price',      value: colorPrice,     set: setColorPrice     },
                { label: 'Size Label', value: colorSizeLabel, set: setColorSizeLabel },
                { label: 'Divider',    value: colorDivider,   set: setColorDivider   },
              ].map(({ label, value, set }) => (
                <div key={label}>
                  <label className="label">{label}</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={value.startsWith('rgba') ? '#888888' : value}
                      onChange={e => set(e.target.value)}
                      className="w-9 h-9 rounded border border-surface-200 cursor-pointer flex-shrink-0" />
                    <input className="input input-sm font-mono flex-1 text-xs" value={value}
                      onChange={e => set(e.target.value)} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Layout */}
          <div>
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-3">Padding (px at 1600px canvas)</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Pad Top',    value: padTop,      set: setPadTop      },
                { label: 'Pad Right',  value: padRight,    set: setPadRight    },
                { label: 'Pad Bottom', value: padBottom,   set: setPadBottom   },
                { label: 'Pad Left',   value: padLeft,     set: setPadLeft     },
              ].map(({ label, value, set }) => (
                <div key={label}>
                  <label className="label text-xs">{label}</label>
                  <input type="number" className="input input-sm w-full" value={value}
                    onChange={e => set(e.target.value)} min={0} />
                </div>
              ))}
            </div>
            <div className="mt-3">
              <label className="label text-xs">Columns</label>
              <div className="flex items-center gap-2 mt-1">
                {[1, 2].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setColumns(n)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      Number(columns) === n
                        ? 'bg-brand-500 text-white border-brand-500'
                        : 'bg-surface-0 text-ink-600 border-surface-200 hover:border-brand-300'
                    }`}
                  >
                    {n} col
                  </button>
                ))}
                <span className="text-xs text-ink-400">Splits sections into two columns side by side</span>
              </div>
            </div>
          </div>

          {styleError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{styleError}</p>}
          {styleSuccess && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">Configuration saved to all sizes.</p>}

          {canEdit && (
            <div className="flex justify-end">
              <button type="submit" className="btn-primary btn-sm" disabled={styleSaving}>
                {styleSaving ? 'Saving…' : 'Save Configuration'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}

// ── Menu card action menu (⋯) ────────────────────────────────────────────────
// Lives inside the menu card <Link>. Clicks stopPropagation so the dropdown
// doesn't navigate.
// Renders its children only once it scrolls near the viewport. Keeps the
// Preview-all grid responsive on big events by capping how many live
// TemplateCanvas instances mount at once — distant cards stay a cheap
// skeleton until you scroll to them, and stay mounted afterward.
function LazyMount({ children, className, rootMargin = '600px' }) {
  const ref = useRef(null)
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (show || !ref.current) return
    if (typeof IntersectionObserver === 'undefined') { setShow(true); return }
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) { setShow(true); io.disconnect() }
    }, { rootMargin })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [show, rootMargin])
  return (
    <div ref={ref} className={className}>
      {show ? children : (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-50">
          <div className="w-6 h-6 rounded-full border-2 border-surface-200 border-t-brand-400 animate-spin" />
        </div>
      )}
    </div>
  )
}

// Pill-style filter for the Menus tab category filter.
function CategoryChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${
        active
          ? 'bg-brand-500 text-white border-brand-500'
          : 'bg-surface-0 text-ink-600 border-surface-200 hover:border-brand-300 hover:text-brand-600'
      }`}
    >
      {children}
    </button>
  )
}

function MenuCardActionMenu({ menu, canDelete, onDuplicate, onDelete }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    function onAway(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onAway)
    return () => document.removeEventListener('mousedown', onAway)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o) }}
        className="w-7 h-7 inline-flex items-center justify-center rounded-md text-ink-400 hover:text-ink-700 hover:bg-surface-100"
        aria-label="Menu actions"
        title="Menu actions"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <circle cx="4" cy="10" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="16" cy="10" r="1.5" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-10 min-w-[160px] bg-surface-0 border border-surface-200 rounded-lg shadow-lg py-1"
          onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
        >
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); onDuplicate?.() }}
            className="w-full text-left px-3 py-1.5 text-sm text-ink-700 hover:bg-surface-50 flex items-center gap-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
            </svg>
            Duplicate menu
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); onDelete?.() }}
              className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
              </svg>
              Delete menu
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Duplicate menu modal ─────────────────────────────────────────────────────
// Clones a menu (and its items + sponsor toggles) under a new name and into
// any brand → series → event the user can reach — including a brand/series/
// event that doesn't exist yet (TargetPicker has inline "+ Add new" for each
// level). Sync metadata is intentionally NOT copied — the new menu starts
// unlinked from any Figma frame.
function DuplicateMenuModal({ sourceMenu, currentEventId, currentSeriesId, currentBrandId, onClose, onDuplicated }) {
  const [name, setName] = useState(`${sourceMenu.name} (copy)`)
  const [target, setTarget] = useState({ brandId: currentBrandId || '', seriesId: currentSeriesId || '', eventId: currentEventId || '' })
  const [setAllDraft, setSetAllDraft] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [counts, setCounts] = useState({ items: null, sponsors: null })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [{ count: ic }, { count: sc }] = await Promise.all([
        supabase.from('menu_items').select('id', { count: 'exact', head: true }).eq('menu_id', sourceMenu.id),
        supabase.from('menu_sponsors').select('id', { count: 'exact', head: true }).eq('menu_id', sourceMenu.id),
      ])
      if (!cancelled) setCounts({ items: ic || 0, sponsors: sc || 0 })
    })()
    return () => { cancelled = true }
  }, [sourceMenu.id])

  async function handleDuplicate(e) {
    e.preventDefault()
    if (!name.trim())        { setError('Give the new menu a name.'); return }
    if (!target.eventId)     { setError('Pick a target event.'); return }
    setBusy(true); setError(null)
    try {
      const created = await duplicateMenuTo(sourceMenu.id, {
        name: name.trim(),
        targetEventId: target.eventId,
        setAllDraft,
      })
      onDuplicated?.(created)
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const crossEvent = target.eventId && target.eventId !== sourceMenu.event_id

  return (
    <Modal title="Duplicate menu" onClose={onClose}>
      <form onSubmit={handleDuplicate} className="space-y-4">
        <div className="text-xs text-ink-500">
          Cloning <strong className="text-ink-900">{sourceMenu.name}</strong>
          {counts.items != null && (
            <span> · {counts.items} item{counts.items === 1 ? '' : 's'}{counts.sponsors > 0 ? ` · ${counts.sponsors} sponsor${counts.sponsors === 1 ? '' : 's'}` : ''}</span>
          )}
        </div>

        <div>
          <label className="label">New menu name</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} required autoFocus />
        </div>

        <TargetPicker
          levels={['brand', 'series', 'event']}
          defaults={{ brandId: currentBrandId, seriesId: currentSeriesId, eventId: currentEventId }}
          onChange={setTarget}
        />

        {crossEvent && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            Sponsor toggles won't carry over — they're scoped to the source event. You'll add them on the new menu.
          </p>
        )}

        <label className="inline-flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={setAllDraft}
            onChange={e => setSetAllDraft(e.target.checked)}
            className="rounded border-surface-300 text-brand-600 focus:ring-brand-500"
          />
          Set all copied items to <strong>Draft</strong> (hidden everywhere)
        </label>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-surface-100">
          <button type="button" onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
          <button type="submit" disabled={busy} className="btn-primary btn-sm">{busy ? 'Duplicating…' : 'Duplicate'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function EventPage() {
  const { brandSlug, seriesSlug, eventSlug } = useParams()
  const { isAdmin, isInternal, isProduction, canEditStyles, profile } = useAuth()
  const navigate = useNavigate()
  const canEdit = isAdmin || isInternal

  const [brand, setBrand]   = useState(null)
  const [series, setSeries] = useState(null)
  const [event, setEvent]   = useState(null)
  // Preview all → Export Previews state. When selectMode is on, each
  // preview card grows a checkbox + the toolbar shows Selected count
  // and Export.
  const [selectMode, setSelectMode] = useState(false)
  // Select-mode purpose drives which toolbar shows:
  //   'share'  → Quick select + Select all + Send previews
  //   'order'  → Quick select + Select all + Create order form
  //   'export' → the full bulk toolbar (status / sponsors / unsync / export)
  const [selectPurpose, setSelectPurpose] = useState('share')
  const [selectedPreviewIds, setSelectedPreviewIds] = useState(() => new Set())
  // Order-form builder modal: null = closed, else array of chosen menu objects.
  const [orderModal, setOrderModal] = useState(null)
  // "Send previews" → public gallery share link.
  const [shareInfo, setShareInfo] = useState(null)   // { id, url } once created
  const [shareBusy, setShareBusy] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

  // Menus tab bulk-select (approve / not approved / unsync).
  const [menuSelectMode, setMenuSelectMode] = useState(false)
  const [selectedMenuIds, setSelectedMenuIds] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  // Quick-review feedback modal (Preview tab).
  const [feedbackMenu, setFeedbackMenu] = useState(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackBusy, setFeedbackBusy] = useState(false)

  const [showActivity, setShowActivity] = useState(false)

  // AI-review state for the purple "needs review" badge on cards.
  const [aiReviewMap, setAiReviewMap] = useState(() => new Map())
  const [reviewDecisionSigs, setReviewDecisionSigs] = useState(() => new Map())
  const [duplicatingMenu, setDuplicatingMenu] = useState(null)
  const [deletingMenu, setDeletingMenu]       = useState(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deletingBusy, setDeletingBusy]       = useState(false)
  const [deleteError, setDeleteError]         = useState(null)

  async function handleDeleteMenu() {
    if (!deletingMenu) return
    setDeletingBusy(true); setDeleteError(null)
    try {
      const { error } = await supabase.from('menus').delete().eq('id', deletingMenu.id)
      if (error) throw error
      setDeletingMenu(null); setDeleteConfirmText('')
      await loadData()
    } catch (e) {
      setDeleteError(e.message || String(e))
    } finally {
      setDeletingBusy(false)
    }
  }
  const toast = useToast()
  const [menus, setMenus]   = useState([])
  const [sponsors, setSponsors] = useState([])
  const [loading, setLoading]   = useState(true)
  const showPageLoader = useDelayedLoader(loading)
  // Initial tab can be deep-linked via ?tab= (e.g. from a menu's "Event
  // sponsors" shortcut). Falls back to Menus for unknown values.
  const [tab, setTab]           = useState(() => {
    // Production only ever sees completed menus + send actions.
    if (isProduction) return 'preview'
    const t = new URLSearchParams(window.location.search).get('tab')
    return ['menus', 'preview', 'sponsors', 'aireview', 'signoff', 'rules', 'templates', 'styles'].includes(t) ? t : 'menus'
  })
  // Once the event is exported/complete, land on the Preview gallery (finished
  // menus shown with their Figma synced photos) instead of the Menus table —
  // unless the URL explicitly asked for a tab. Runs once, on first load.
  const autoTabbed = useRef(false)
  useEffect(() => {
    if (!event || autoTabbed.current) return
    autoTabbed.current = true
    const hasParam = new URLSearchParams(window.location.search).get('tab')
    if (!hasParam && (event.phase === 'exported' || event.phase === 'complete')) setTab('preview')
  }, [event])
  const [templates, setTemplates] = useState({}) // keyed by size

  // Figma page name — inline edit
  const [figmaPageName, setFigmaPageName]       = useState('')
  const [editingFigmaPage, setEditingFigmaPage] = useState(false)
  const [savingFigmaPage, setSavingFigmaPage]   = useState(false)

  // Edit event modal
  const [showEditEvent, setShowEditEvent]   = useState(false)
  const [editName, setEditName]             = useState('')
  const [editSlug, setEditSlug]             = useState('')
  const [editDate, setEditDate]             = useState('')
  const [editVenue, setEditVenue]           = useState('')
  const [editPhase, setEditPhase]           = useState('')
  const [editFigmaUrl, setEditFigmaUrl]     = useState('')
  const [editPrintFolderUrl, setEditPrintFolderUrl] = useState('')
  const [editPrepFolderUrl, setEditPrepFolderUrl] = useState('')
  const [editFreezeAt, setEditFreezeAt] = useState('')  // datetime-local string
  const [editFigmaPage, setEditFigmaPage]   = useState('')
  const [editIconUrl, setEditIconUrl]       = useState(null)
  const [editIconName, setEditIconName]     = useState(null)
  const [editFigmaPrefix, setEditFigmaPrefix] = useState('')
  const [editSaving, setEditSaving]         = useState(false)
  const [editError, setEditError]           = useState(null)

  // New menu modal
  const [showNewMenu, setShowNewMenu]     = useState(false)
  const [showBulkAdd, setShowBulkAdd]     = useState(false)
  const [menuName, setMenuName]           = useState('')
  const [menuSlugField, setMenuSlugField] = useState('')
  const [menuCategory, setMenuCategory]   = useState('bar')
  const [menuPhase, setMenuPhase]         = useState('build')
  const [menuSize, setMenuSize]           = useState('lg')
  const [saving, setSaving]               = useState(false)
  const [saveError, setSaveError]         = useState(null)

  // Menus tab filters — multi-select dropdowns. Empty array = no filter (all).
  const [typeFilter, setTypeFilter]     = useState([]) // categories
  const [statusFilter, setStatusFilter] = useState([]) // phases
  const [syncFilter, setSyncFilter]     = useState([]) // synced | needs_update | not_synced
  const [filtersOpen, setFiltersOpen]   = useState(false)
  const [menuSearch, setMenuSearch]     = useState('')
  // Preview-all tab filters — same multi-select dropdowns as the Menus tab.
  const [previewTypeFilter, setPreviewTypeFilter]     = useState([]) // categories
  const [previewStatusFilter, setPreviewStatusFilter] = useState([]) // phases
  const [previewSyncFilter, setPreviewSyncFilter]     = useState([]) // synced | needs_update | not_synced
  const [previewFiltersOpen, setPreviewFiltersOpen]   = useState(false)
  // "Completed only" toggles — collapse each tab to just the finished menus.
  const [menusCompletedOnly, setMenusCompletedOnly]     = useState(false)
  const [previewCompletedOnly, setPreviewCompletedOnly] = useState(false)

  // Multi-CSV import
  const csvInputRef                             = useRef(null)
  const [showImportCsvs, setShowImportCsvs]   = useState(false)
  const [csvBatch, setCsvBatch]               = useState([]) // [{name, slug, category, items, error}]
  const [csvImporting, setCsvImporting]       = useState(false)
  const [csvImportError, setCsvImportError]   = useState(null)
  const [csvImportDone, setCsvImportDone]     = useState(false)

  // New sponsor modal
  const [showNewSponsor, setShowNewSponsor]   = useState(false)
  const [spName, setSpName]                   = useState('')
  const [spSlug, setSpSlug]                   = useState('')
  const [spLogoUrl, setSpLogoUrl]             = useState('')
  const [spSortOrder, setSpSortOrder]         = useState(0)
  const [spSaving, setSpSaving]               = useState(false)
  const [spError, setSpError]                 = useState(null)

  async function loadData() {
    const { data: brandData } = await supabase.from('brands').select('id,name,slug,color,notify_user_ids,figma_component_prefix,menu_approver_ids,edit_approver_ids').eq('slug', brandSlug).single()
    setBrand(brandData)
    const { data: seriesData } = await supabase.from('series').select('*').eq('brand_id', brandData?.id).eq('slug', seriesSlug).single()
    // Attach brand to series so the Approvals tab can resolve cascading
    // notify_user_ids without re-fetching the brand row.
    if (seriesData && brandData) seriesData.brand = brandData
    setSeries(seriesData)
    const { data: eventData } = await supabase.from('events').select('*').eq('series_id', seriesData?.id).eq('slug', eventSlug).single()
    setEvent(eventData)

    if (eventData) setFigmaPageName(eventData.figma_page_name || '')
    if (eventData) {
      const [{ data: menusData }, { data: sponsorsData }, { data: templateRows }] = await Promise.all([
        // Full item fields so the Preview-all tab can render the live in-app
        // canvas for menus that haven't been synced to Figma yet.
        supabase.from('menus').select('*, menu_items(*)').eq('event_id', eventData.id).order('category').order('name'),
        supabase.from('event_sponsors').select('*').eq('event_id', eventData.id).order('sort_order').order('name'),
        supabase.from('event_templates').select('*').eq('event_id', eventData.id),
      ])
      setMenus(menusData || [])
      setSponsors(sponsorsData || [])
      const tmplMap = {}
      ;(templateRows || []).forEach(t => { tmplMap[t.size] = t })
      setTemplates(tmplMap)
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [brandSlug, seriesSlug, eventSlug])
  useFocusRefresh(loadData)

  // Load cached AI reviews + review decisions for the event's menus (drives
  // the purple "needs review" badge on cards).
  useEffect(() => {
    if (!menus.length) return
    let cancelled = false
    ;(async () => {
      const ids = menus.map(m => m.id)
      const [r1, r2] = await Promise.all([
        supabase.from('menu_ai_reviews').select('menu_id, content_hash, findings').in('menu_id', ids),
        supabase.from('menu_review_decisions').select('menu_id, signature').in('menu_id', ids),
      ])
      if (cancelled) return
      setAiReviewMap(new Map((r1.data || []).map(x => [x.menu_id, x])))
      const dm = new Map()
      for (const d of (r2.data || [])) {
        if (!dm.has(d.menu_id)) dm.set(d.menu_id, new Set())
        dm.get(d.menu_id).add(d.signature)
      }
      setReviewDecisionSigs(dm)
    })()
    return () => { cancelled = true }
  }, [menus])

  // AI-review state for a menu's badge:
  //   null    — no reviewable items
  //   'pending' — not reviewed at current content, or has unresolved flags
  //   'done'  — reviewed at current content AND every flag handled
  function aiReviewState(menu) {
    const reviewable = (menu.menu_items || []).filter(i => i && (i.status === 'active' || i.status === 'pending_approval'))
    if (!reviewable.length) return null
    const review = aiReviewMap.get(menu.id)
    // The cache stores the still-unresolved AI findings at the reviewed
    // content; empty + matching hash = reviewed and fully handled.
    if (!review || review.content_hash !== reviewContentHash(menu.menu_items || [])) return 'pending'
    return (review.findings || []).length === 0 ? 'done' : 'pending'
  }

  // If we arrived here from a SeriesPage 'Edit' action, the URL carries
  // ?edit=1 — open the Edit Event modal as soon as the event loads, then
  // strip the param so refresh doesn't re-open it.
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    if (searchParams.get('edit') === '1' && event) {
      openEditEvent()
      const next = new URLSearchParams(searchParams)
      next.delete('edit')
      setSearchParams(next, { replace: true })
    }
    // openEditEvent is stable enough — re-run only when event/searchParams change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, searchParams])

  // ── Menu create ──
  async function handleCreateMenu(e) {
    e.preventDefault()
    setSaving(true); setSaveError(null)
    const { error } = await supabase.from('menus').insert({
      name: menuName.trim(), slug: menuSlugField.trim(),
      event_id: event.id, category: menuCategory, phase: menuPhase, size: menuSize,
    })
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    setShowNewMenu(false)
    loadData()
  }

  // ── Sponsor create ──
  async function handleCreateSponsor(e) {
    e.preventDefault()
    setSpSaving(true); setSpError(null)
    const { error } = await supabase.from('event_sponsors').insert({
      event_id: event.id,
      name: spName.trim(),
      slug: spSlug.trim(),
      logo_url: spLogoUrl.trim() || null,
      sort_order: Number(spSortOrder),
      active: true,
    })
    setSpSaving(false)
    if (error) { setSpError(error.message); return }
    setShowNewSponsor(false)
    setSpName(''); setSpSlug(''); setSpLogoUrl(''); setSpSortOrder(0)
    loadData()
  }

  // ── Sponsor update ──
  async function handleSaveSponsor(id, patch) {
    await supabase.from('event_sponsors').update(patch).eq('id', id)
    setSponsors(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
  }

  // ── Sponsor delete ──
  async function handleDeleteSponsor(id) {
    await supabase.from('event_sponsors').delete().eq('id', id)
    setSponsors(prev => prev.filter(s => s.id !== id))
  }

  // ── Sponsor reorder ──
  async function moveSponsor(id, direction) {
    const idx = sponsors.findIndex(s => s.id === id)
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= sponsors.length) return
    const a = sponsors[idx]
    const b = sponsors[targetIdx]
    // Swap sort_orders
    const sortA = a.sort_order
    const sortB = b.sort_order
    const newSortA = sortA === sortB ? (direction === 'up' ? sortA - 1 : sortA + 1) : sortB
    await Promise.all([
      supabase.from('event_sponsors').update({ sort_order: newSortA }).eq('id', a.id),
      supabase.from('event_sponsors').update({ sort_order: sortA }).eq('id', b.id),
    ])
    loadData()
  }

  // ── Edit event ──
  function openEditEvent() {
    setEditName(event.name)
    setEditSlug(event.slug)
    setEditDate(event.event_date ? event.event_date.slice(0, 10) : '')
    setEditVenue(event.venue || '')
    setEditPhase(event.phase || 'build')
    setEditFigmaUrl(event.figma_file_url || '')
    setEditPrintFolderUrl(event.print_folder_url || '')
    setEditPrepFolderUrl(event.prep_folder_url || '')
    setEditFreezeAt(event.menus_freeze_at
      ? (() => { const d = new Date(event.menus_freeze_at), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` })()
      : '')
    setEditFigmaPage(event.figma_page_name || '')
    setEditIconUrl(event.icon_url || null)
    setEditIconName(event.icon_name || null)
    setEditFigmaPrefix(event.figma_component_prefix || '')
    setEditError(null)
    setShowEditEvent(true)
  }

  async function handleSaveEvent(e) {
    e.preventDefault()
    setEditSaving(true); setEditError(null)
    const patch = {
      name:                  editName.trim(),
      slug:                  slugify(editSlug),
      event_date:            editDate || null,
      venue:                 editVenue.trim() || null,
      phase:                 editPhase,
      figma_file_url:        editFigmaUrl.trim() || null,
      print_folder_url:      editPrintFolderUrl.trim() || null,
      prep_folder_url:       editPrepFolderUrl.trim() || null,
      menus_freeze_at:       editFreezeAt ? new Date(editFreezeAt).toISOString() : null,
      figma_page_name:       editFigmaPage.trim() || null,
      icon_url:              editIconUrl,
      icon_name:             editIconName,
      figma_component_prefix: (editFigmaPrefix || '').trim() || null,
    }
    const { error } = await supabase.from('events').update(patch).eq('id', event.id)
    setEditSaving(false)
    if (error) { setEditError(error.message); return }
    setShowEditEvent(false)
    setFigmaPageName(patch.figma_page_name || '')
    // If slug changed, navigate to new URL
    if (patch.slug !== eventSlug) {
      navigate(`/brands/${brandSlug}/series/${seriesSlug}/events/${patch.slug}`, { replace: true })
    } else {
      loadData()
    }
  }

  // ── Figma page name save ──
  async function handleSaveFigmaPage() {
    setSavingFigmaPage(true)
    await supabase.from('events').update({ figma_page_name: figmaPageName.trim() || null }).eq('id', event.id)
    setSavingFigmaPage(false)
    setEditingFigmaPage(false)
  }

  // ── Multi-CSV import ──
  async function handleCsvFilesSelected(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    // Resolve the event's currency spec so imported numeric prices are
    // formatted in the same style as the table/Figma will display them.
    const currency = resolveCurrencySpec(series, event, null)
    const results = await Promise.all(files.map(async file => {
      const name = nameFromFilename(file.name)
      const { items, error } = await parseCsvFile(file, currency)
      return { name, slug: slugify(name), category: 'bar', items, error }
    }))
    setCsvBatch(results)
    setShowImportCsvs(true)
    setCsvImportDone(false)
    setCsvImportError(null)
    if (csvInputRef.current) csvInputRef.current.value = ''
  }

  async function handleImportAll() {
    setCsvImporting(true)
    setCsvImportError(null)
    try {
      for (const entry of csvBatch) {
        if (!entry.items.length || entry.error) continue
        const { data: newMenu, error: menuErr } = await supabase
          .from('menus')
          .insert({ name: entry.name.trim(), slug: entry.slug.trim(), event_id: event.id, category: entry.category, phase: 'build' })
          .select('id')
          .single()
        if (menuErr) throw new Error(`Failed to create "${entry.name}": ${menuErr.message}`)
        const insertRows = entry.items.map((row, i) => ({ menu_id: newMenu.id, sort_order: i, ...row }))
        const { error: itemsErr } = await supabase.from('menu_items').insert(insertRows)
        if (itemsErr) throw new Error(`Failed to import items for "${entry.name}": ${itemsErr.message}`)
      }
      setCsvImportDone(true)
      loadData()
    } catch (err) {
      setCsvImportError(err.message)
    } finally {
      setCsvImporting(false)
    }
  }

  if (showPageLoader) return <PizzaLoader />
  if (loading) return null
  if (!event) return <div className="px-8 py-8 text-sm text-red-500">Event not found.</div>

  const baseUrl = `/brands/${brandSlug}/series/${seriesSlug}/events/${eventSlug}`

  // ── Quick review (Preview tab) ───────────────────────────────────────────
  // Can the current user approve a given menu? Resolves the cascading approver
  // union (brand → series → event → menu) for menu_approver_ids.
  function canApproveMenu(menu) {
    const resolved = resolveApprovers([brand, series, event, menu], 'menu_approver_ids')
    return canApprove(profile?.role, profile?.id, resolved)
  }
  // A menu can't be approved while it has unreviewed edits or an open sponsor
  // check. Returns a reason string, or null when approval is allowed.
  function menuApprovalBlocked(menu) {
    const its = menu?.menu_items || []
    const pending = its.filter(i => i.edit_status === 'pending_approval').length
    const needsSp = !!menu?.sponsors_updated_at &&
      (!menu.sponsors_checked_at || new Date(menu.sponsors_updated_at) > new Date(menu.sponsors_checked_at))
    if (pending > 0) return `${pending} edit${pending === 1 ? '' : 's'} pending review`
    if (needsSp) return 'sponsors need checking'
    return null
  }
  async function quickSetPhase(menu, phase) {
    if (phase === 'approved') { const r = menuApprovalBlocked(menu); if (r) { alert(`Can't approve — ${r}.`); return } }
    const { error } = await supabase.from('menus').update({ phase }).eq('id', menu.id)
    if (error) { toast('Could not save', { type: 'error' }); alert('Could not update: ' + error.message); return }
    toast('Saved'); loadData()
  }
  // Flag / clear the "check sponsors" status on a single menu.
  async function flagSponsorsCheck(menu) {
    const { error } = await supabase.from('menus').update({ sponsors_updated_at: new Date().toISOString() }).eq('id', menu.id)
    if (error) { alert('Could not flag: ' + error.message); return }
    loadData()
  }
  async function markSponsorsChecked(menu) {
    const { error } = await supabase.from('menus')
      .update({ sponsors_checked_at: new Date().toISOString(), sponsors_checked_by: profile?.id || null })
      .eq('id', menu.id)
    if (error) { toast('Could not save', { type: 'error' }); alert('Could not mark checked: ' + error.message); return }
    toast('Marked checked'); loadData()
  }
  // Quick size change from the card chips. Updates menu.size — the next Figma
  // sync rebuilds it on the new-size template (see the plugin's resize logic).
  async function quickSetSize(menu, size) {
    const { error } = await supabase.from('menus').update({ size }).eq('id', menu.id)
    if (error) { toast('Could not save', { type: 'error' }); alert('Could not change size: ' + error.message); return }
    toast('Saved'); loadData()
  }

  // ── Bulk actions (shared by Menus + Preview tabs) ────────────────────────
  // "Not approved" sends the menu back to the working 'build' phase.
  async function bulkSetPhase(idsSet, phase) {
    let ids = [...idsSet]
    if (!ids.length) return
    let skipped = 0
    if (phase === 'approved') {
      // Skip menus that can't be approved yet (pending edits / sponsor check).
      const all = ids.length
      ids = ids.filter(id => !menuApprovalBlocked(menus.find(m => m.id === id)))
      skipped = all - ids.length
      if (!ids.length) { alert("None of the selected menus can be approved yet — they have pending edits or open sponsor checks."); return }
    }
    setBulkBusy(true)
    const { error } = await supabase.from('menus').update({ phase }).in('id', ids)
    setBulkBusy(false)
    if (error) { alert('Could not update status: ' + error.message); return }
    if (skipped > 0) alert(`Approved ${ids.length}. Skipped ${skipped} that still have pending edits or sponsor checks.`)
    await loadData()
  }
  async function bulkUnsync(idsSet) {
    const ids = [...idsSet]
    if (!ids.length) return
    if (!confirm(`Unsync ${ids.length} menu${ids.length === 1 ? '' : 's'} from Figma? They'll show as "Not synced". This doesn't change the Figma file — if a frame still exists, unlink it in the plugin too.`)) return
    setBulkBusy(true)
    const { error } = await supabase.from('menus')
      .update({ last_synced_at: null, last_synced_frame_id: null, last_sync_digest: null })
      .in('id', ids)
    setBulkBusy(false)
    if (error) { alert('Could not unsync: ' + error.message); return }
    await loadData()
  }
  async function bulkFlagSponsors(idsSet) {
    const ids = [...idsSet]
    if (!ids.length) return
    setBulkBusy(true)
    const { error } = await supabase.from('menus').update({ sponsors_updated_at: new Date().toISOString() }).in('id', ids)
    setBulkBusy(false)
    if (error) { alert('Could not flag: ' + error.message); return }
    await loadData()
  }

  // One menu card for the Menus tab — extracted so we can render it inside
  // category groups or a filtered grid without duplicating the markup.
  function renderMenuCard(menu) {
    const items = menu.menu_items || []
    const pendingCount = items.filter(i => i.edit_status === 'pending_approval').length
    const everSynced  = !!menu.last_synced_at
    const syncNeeded  = everSynced && menu.updated_at && new Date(menu.updated_at) > new Date(menu.last_synced_at)
    const needsSponsorCheck = !!menu.sponsors_updated_at &&
      (!menu.sponsors_checked_at || new Date(menu.sponsors_updated_at) > new Date(menu.sponsors_checked_at))
    const isSelected  = selectedMenuIds.has(menu.id)
    const CardTag = menuSelectMode ? 'div' : Link
    // Completed menus get a bold gold ring so the finished tiles jump out.
    const completeCls = menu.phase === 'complete' ? ' ring-2 ring-[#FFB300] border-[#FFB300]' : ''
    const cardProps = menuSelectMode
      ? {
          onClick: () => setSelectedMenuIds(prev => {
            const next = new Set(prev)
            if (next.has(menu.id)) next.delete(menu.id); else next.add(menu.id)
            return next
          }),
          className: `card p-5 transition-all flex flex-col relative cursor-pointer ${
            isSelected ? 'ring-2 ring-brand-500 border-brand-500' : `hover:shadow-md hover:border-brand-100${completeCls}`
          }`,
        }
      : {
          to: `${baseUrl}/menus/${menu.slug}`,
          className: `card p-5 hover:shadow-md hover:border-brand-100 transition-all group flex flex-col relative${completeCls}`,
        }
    return (
      <CardTag key={menu.id} {...cardProps}>
        {menuSelectMode && (
          <div className="absolute top-2 left-2 z-10">
            <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center text-white text-sm shadow ${
              isSelected ? 'bg-brand-500 border-brand-500' : 'bg-surface-0 border-surface-300'
            }`}>
              {isSelected && '✓'}
            </div>
          </div>
        )}
        <div className="flex items-start justify-between mb-3 gap-2">
          <h3 className={`font-medium text-ink-900 transition-colors flex-1 min-w-0 ${menuSelectMode ? 'pl-7' : 'group-hover:text-brand-600'}`}>{menu.name}</h3>
          <div className="flex items-center gap-1 flex-shrink-0">
            {!menuSelectMode && canApproveMenu(menu) ? (
              <ReviewChip
                phase={menu.phase}
                needsSponsorCheck={needsSponsorCheck}
                approveBlockedReason={menuApprovalBlocked(menu)}
                onSetPhase={(p) => quickSetPhase(menu, p)}
                onFlagSponsors={() => flagSponsorsCheck(menu)}
                onMarkSponsorsChecked={() => markSponsorsChecked(menu)}
                onFeedback={() => { setFeedbackMenu(menu); setFeedbackText('') }}
              />
            ) : (
              <PhaseBadge phase={menu.phase} />
            )}
            {canEdit && !menuSelectMode && (
              <MenuCardActionMenu
                menu={menu}
                canDelete={isAdmin}
                onDuplicate={() => setDuplicatingMenu(menu)}
                onDelete={() => setDeletingMenu(menu)}
              />
            )}
          </div>
        </div>
        {/* Meta + sync chip. flex-wrap lets the chip group drop to its own
            line when the card is narrow (3-col view) instead of crushing or
            wrapping the chip text. Each unit is nowrap so nothing breaks. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-400">
          <span className="capitalize whitespace-nowrap">{CATEGORY_LABELS[menu.category] || menu.category}</span>
          <span>·</span>
          <span className="whitespace-nowrap">{items.length} items</span>
          {!menuSelectMode && <SizeChip size={menu.size} onChange={canEdit ? (s) => quickSetSize(menu, s) : undefined} />}
          <span className="ml-auto flex items-center gap-1.5 flex-shrink-0">
            <AiReviewFlag state={aiReviewState(menu)} />
            <SponsorFlag needsCheck={needsSponsorCheck} />
            {pendingCount > 0 && (
              <span
                className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex-shrink-0"
                title={`${pendingCount} pending edit${pendingCount === 1 ? '' : 's'}`}
              >
                {pendingCount}
              </span>
            )}
            <SyncChip everSynced={everSynced} syncNeeded={syncNeeded} lastSyncedAt={menu.last_synced_at} />
          </span>
        </div>
      </CardTag>
    )
  }

  // Preview-all card. Extracted so it can render inside category groups or a
  // flat/filtered grid without duplicating the (large) markup.
  function renderPreviewCard(menu) {
    const items = menu.menu_items || []
    const activeCount = items.filter(i => i.status === 'active').length
    const pendingCount = items.filter(i => i.edit_status === 'pending_approval').length
    const everSynced  = !!menu.last_synced_at
    const syncNeeded  = everSynced && menu.updated_at && new Date(menu.updated_at) > new Date(menu.last_synced_at)
    const needsSponsorCheck = !!menu.sponsors_updated_at &&
      (!menu.sponsors_checked_at || new Date(menu.sponsors_updated_at) > new Date(menu.sponsors_checked_at))
    // Production can only pick completed menus to send; everyone else, any menu.
    const isSelectable = selectMode && canSendMenu(menu)
    const isSelected = selectedPreviewIds.has(menu.id)
    const CardTag = selectMode ? 'div' : Link
    // Completed menus get a bold gold ring so the finished tiles jump out.
    const completeCls = menu.phase === 'complete' ? ' ring-2 ring-[#FFB300] border-[#FFB300]' : ''
    const cardProps = selectMode
      ? {
          onClick: () => {
            if (!isSelectable) return
            setSelectedPreviewIds(prev => {
              const next = new Set(prev)
              if (next.has(menu.id)) next.delete(menu.id); else next.add(menu.id)
              return next
            })
          },
          className: `card overflow-hidden transition-all flex flex-col cursor-pointer ${
            isSelected ? 'ring-2 ring-brand-500 border-brand-500' :
            isSelectable ? `hover:shadow-md hover:border-brand-100${completeCls}` :
            'opacity-50 cursor-not-allowed'
          }`,
        }
      : {
          to: `${baseUrl}/menus/${menu.slug}`,
          className: `card overflow-hidden hover:shadow-md hover:border-brand-100 transition-all group flex flex-col${completeCls}`,
        }
    return (
      <CardTag key={menu.id} {...cardProps}>
        <div className="relative w-full aspect-[2/3] bg-surface-50 border-b border-surface-100 overflow-hidden">
          {menuPreviewSrc(menu) ? (
            <img src={menuPreviewSrc(menu)} alt={menu.name} className="w-full h-full object-contain" loading="lazy" />
          ) : activeCount > 0 ? (
            <LazyMount className="absolute inset-0 overflow-hidden pointer-events-none bg-surface-0">
              <TemplateCanvas
                template={templates[menu.size] || templates.lg || templates.md}
                series={series}
                event={event}
                size={menu.size || 'lg'}
                menu={menu}
                items={items}
              />
            </LazyMount>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-ink-300 text-xs gap-1 p-4 text-center">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4-4 4 4 4-4 4 4M4 16V8a2 2 0 012-2h12a2 2 0 012 2v8M4 16h16" />
              </svg>
              <span>Add active items to preview</span>
            </div>
          )}
          {selectMode && isSelectable && (
            <div className="absolute top-2 left-2 z-10">
              <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center text-white text-sm shadow ${
                isSelected ? 'bg-brand-500 border-brand-500' : 'bg-white/80 border-white'
              }`}>
                {isSelected && '✓'}
              </div>
            </div>
          )}
          {/* Internal workflow flags — hidden for production (they can't act on
              AI review / sponsors / edits / sync; the phase badge below is
              their progress indicator). */}
          {!isProduction && (
            <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-white/70 backdrop-blur-sm rounded-full px-1.5 py-1">
              <AiReviewFlag state={aiReviewState(menu)} />
              <SponsorFlag needsCheck={needsSponsorCheck} />
              {pendingCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold shadow"
                      title={`${pendingCount} pending edit${pendingCount === 1 ? '' : 's'}`}>
                  {pendingCount}
                </span>
              )}
              <SyncChip everSynced={everSynced} syncNeeded={syncNeeded} lastSyncedAt={menu.last_synced_at} />
            </div>
          )}
        </div>
        <div className="px-4 py-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-ink-900 truncate">{menu.name}</h3>
            <div className="text-[11px] text-ink-400 capitalize flex items-center gap-1.5">
              <span>{CATEGORY_LABELS[menu.category] || menu.category} · {items.length} items</span>
              {!selectMode && <SizeChip size={menu.size} onChange={canEdit ? (s) => quickSetSize(menu, s) : undefined} />}
            </div>
            {!selectMode && canSetQuantity && (
              <div className="mt-1.5 flex items-center gap-1.5" onClick={e => { e.preventDefault(); e.stopPropagation() }}>
                <span className="text-[11px] font-semibold text-ink-400">Qty</span>
                <QuantityField
                  menuId={menu.id}
                  value={menu.quantity}
                  onSaved={(q) => setMenus(prev => prev.map(m => m.id === menu.id ? { ...m, quantity: q } : m))}
                  className="w-16 !py-0.5 !text-xs"
                />
              </div>
            )}
          </div>
          {/* Quick review: approvers get an inline approve/feedback chip;
              everyone else sees the static badge. Hidden in bulk-select mode. */}
          {!selectMode && canApproveMenu(menu) ? (
            <ReviewChip
              phase={menu.phase}
              needsSponsorCheck={!!menu.sponsors_updated_at && (!menu.sponsors_checked_at || new Date(menu.sponsors_updated_at) > new Date(menu.sponsors_checked_at))}
              approveBlockedReason={menuApprovalBlocked(menu)}
              onSetPhase={(p) => quickSetPhase(menu, p)}
              onFlagSponsors={() => flagSponsorsCheck(menu)}
              onMarkSponsorsChecked={() => markSponsorsChecked(menu)}
              onFeedback={() => { setFeedbackMenu(menu); setFeedbackText('') }}
            />
          ) : (
            <PhaseBadge phase={menu.phase} />
          )}
        </div>
      </CardTag>
    )
  }


  // Category order present in this event (known categories first, then any custom).
  const menuCategoriesPresent = [
    ...CATEGORIES.filter(c => menus.some(m => m.category === c)),
    ...[...new Set(menus.map(m => m.category))].filter(c => c && !CATEGORIES.includes(c)),
  ]

  // ── Menus tab: filter options + filtering ────────────────────────────────
  const syncStateOf = (m) =>
    !m.last_synced_at ? 'not_synced'
    : (m.updated_at && new Date(m.updated_at) > new Date(m.last_synced_at)) ? 'needs_update'
    : 'synced'

  const PHASE_FILTER_OPTS = MENU_PHASES
    .map(value => ({ value, label: PHASE_LABELS[value] }))
    .filter(o => menus.some(m => m.phase === o.value))
   .map(o => ({ ...o, count: menus.filter(m => m.phase === o.value).length }))

  const SYNC_FILTER_OPTS = [
    { value: 'synced', label: 'Synced' },
    { value: 'needs_update', label: 'Needs update' },
    { value: 'not_synced', label: 'Not synced' },
  ].map(o => ({ ...o, count: menus.filter(m => syncStateOf(m) === o.value).length }))

  const TYPE_FILTER_OPTS = menuCategoriesPresent.map(c => ({
    value: c, label: CATEGORY_LABELS[c] || c, count: menus.filter(m => m.category === c).length,
  }))

  const menusFiltered = menus.filter(m => {
    if (menuSearch.trim() && !m.name.toLowerCase().includes(menuSearch.trim().toLowerCase())) return false
    if (typeFilter.length   && !typeFilter.includes(m.category)) return false
    if (statusFilter.length && !statusFilter.includes(m.phase))  return false
    if (syncFilter.length   && !syncFilter.includes(syncStateOf(m))) return false
    return true
  })
  const anyMenuFilter = typeFilter.length || statusFilter.length || syncFilter.length
  // Group by category when the filtered result spans more than one category.
  const filteredCatsPresent = menuCategoriesPresent.filter(c => menusFiltered.some(m => m.category === c))

  // Preview-all tab — same three dropdown filters, independent state.
  const previewFiltered = menus.filter(m => {
    if (previewTypeFilter.length   && !previewTypeFilter.includes(m.category)) return false
    if (previewStatusFilter.length && !previewStatusFilter.includes(m.phase))  return false
    if (previewSyncFilter.length   && !previewSyncFilter.includes(syncStateOf(m))) return false
    return true
  })
  const anyPreviewFilter = previewTypeFilter.length || previewStatusFilter.length || previewSyncFilter.length
  const previewCatsPresent = menuCategoriesPresent.filter(c => previewFiltered.some(m => m.category === c))

  // Production can view every menu (see what's in progress) but may only send
  // out completed ones. Everyone else can send anything they select.
  const canSendMenu = (m) => !isProduction || m?.phase === 'complete'
  const canSetQuantity = isAdmin || isInternal || isProduction

  // Quick-select for select mode (Send previews / Order / Export): tap a status
  // or type to add/remove that whole group at once instead of ticking tiles.
  // Scoped to the filtered preview set; for production, only sendable
  // (completed) menus are grouped.
  const quickStatusOpts = MENU_PHASES
    .filter(p => (!isProduction || p === 'complete') && previewFiltered.some(m => m.phase === p))
    .map(p => ({ key: 'status:' + p, label: PHASE_LABELS[p], ids: previewFiltered.filter(m => m.phase === p && canSendMenu(m)).map(m => m.id) }))
  const quickTypeOpts = previewCatsPresent
    .map(c => ({ key: 'type:' + c, label: CATEGORY_LABELS[c] || c, ids: previewFiltered.filter(m => m.category === c && canSendMenu(m)).map(m => m.id) }))
    .filter(o => o.ids.length > 0)
  const groupFullySelected = (ids) => ids.length > 0 && ids.every(id => selectedPreviewIds.has(id))
  function toggleQuickGroup(ids) {
    setSelectedPreviewIds(prev => {
      const next = new Set(prev)
      if (ids.every(id => next.has(id))) ids.forEach(id => next.delete(id))
      else ids.forEach(id => next.add(id))
      return next
    })
  }

  // "Send previews" — snapshot the chosen menus into a public share row and
  // hand back a standalone /share/:id gallery link (no login, no app nav).
  async function createPreviewShare(idsSet) {
    const chosen = menus.filter(m => idsSet.has(m.id) && menuPreviewSrc(m) && canSendMenu(m))
    if (!chosen.length) { alert(isProduction ? 'Only completed menus can be sent.' : 'Select at least one menu that has a preview image.'); return }
    setShareBusy(true)
    const items = chosen.map(m => ({
      name: m.name, category: m.category, size: m.size,
      image: menuPreviewSrc(m), printFile: m.print_file_url || null,
    }))
    const { data, error } = await supabase.from('menu_preview_shares')
      .insert({ title: event?.name || 'Menu previews', items, created_by: profile?.id })
      .select('id, is_public, show_print_files, allow_comments').single()
    setShareBusy(false)
    if (error) { alert('Could not create the share link: ' + error.message); return }
    setShareInfo({ id: data.id, url: `${window.location.origin}/share/${data.id}`, kind: 'preview', is_public: data.is_public, show_print_files: data.show_print_files, allow_comments: data.allow_comments })
    setShareCopied(false)
    setSelectMode(false); setSelectedPreviewIds(new Set())
  }

  // "Send order form" — production sets a quantity per menu and a layout, then
  // this snapshots a printable order into the same /share/:id page (kind=order).
  async function createOrderShare(chosenRaw, { quantities, layout, title, notes, neededBy }) {
    const chosen = (chosenRaw || []).filter(canSendMenu)
    if (!chosen.length) { alert(isProduction ? 'Only completed menus can be sent.' : 'Select at least one menu.'); return }
    setShareBusy(true)
    const qtyOf = (m) => Number(quantities[m.id]) || 0
    const items = chosen.map(m => ({
      menuId: m.id,
      name: m.name, category: m.category, size: m.size,
      image: menuPreviewSrc(m), printFile: m.print_file_url || null,
      quantity: qtyOf(m),
    }))
    // Mirror the entered quantities back onto each menu (source of truth).
    await Promise.all(chosen
      .filter(m => qtyOf(m) !== (m.quantity ?? 0))
      .map(m => supabase.rpc('set_menu_quantity', { p_menu_id: m.id, p_quantity: qtyOf(m) })))
    setMenus(prev => prev.map(m => quantities[m.id] != null ? { ...m, quantity: qtyOf(m) } : m))
    const meta = {
      eventId: event?.id || null,
      eventDate: event?.event_date || null,
      eventLocation: event?.venue || null,
      neededBy: neededBy || null,
      eventIcon: { iconName: event?.icon_name || null, color: brand?.color || null, name: event?.name || null },
    }
    const { data, error } = await supabase.from('menu_preview_shares')
      .insert({ kind: 'order', layout, notes: notes?.trim() || null, meta, title: title?.trim() || (event?.name ? `${event.name} — Order` : 'Menu order'), items, show_print_files: true, created_by: profile?.id })
      .select('id, is_public, show_print_files, allow_comments, is_live').single()
    setShareBusy(false)
    if (error) { alert('Could not create the order form: ' + error.message); return }
    setShareInfo({ id: data.id, url: `${window.location.origin}/share/${data.id}`, kind: 'order', is_public: data.is_public, show_print_files: data.show_print_files, allow_comments: data.allow_comments, is_live: data.is_live })
    setShareCopied(false)
    setOrderModal(null); setSelectMode(false); setSelectedPreviewIds(new Set())
  }
  async function updateShare(patch) {
    if (!shareInfo) return
    setShareInfo(s => ({ ...s, ...patch }))
    await supabase.from('menu_preview_shares').update(patch).eq('id', shareInfo.id)
  }

  // Render a menu grid with COMPLETED menus surfaced first under a gold/orange
  // "Completed" header (regardless of category), then the rest grouped by
  // category. A gradient toggle collapses to just the finished ones.
  const COMPLETE_GRADIENT = 'linear-gradient(135deg, #FFD54F 0%, #FFB300 50%, #FB8C00 100%)'
  function renderMenuGroups({ list, catsPresent, renderCard, gridClass, completedOnly, onToggleCompleted }) {
    const completed = list.filter(m => m.phase === 'complete')
    const rest = list.filter(m => m.phase !== 'complete')
    const restCats = catsPresent.filter(c => rest.some(m => m.category === c))
    const completedCats = catsPresent.filter(c => completed.some(m => m.category === c))
    return (
      <>
        {completed.length > 0 && (
          <div className="mb-4">
            <button
              onClick={onToggleCompleted}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap flex-shrink-0 text-black shadow-sm hover:brightness-105 transition"
              style={{ background: COMPLETE_GRADIENT }}
              title={completedOnly ? 'Showing only completed menus — click to show all' : 'Show only the completed, finalized menus'}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              {completedOnly ? 'Showing completed' : 'View completed'} · {completed.length}
              {completedOnly && <span className="font-normal opacity-80">— show all</span>}
            </button>
          </div>
        )}
        <div className="space-y-8">
          {completed.length > 0 && (
            <div>
              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold text-black mb-3" style={{ background: COMPLETE_GRADIENT }}>
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                Completed<span className="opacity-70 ml-1">· {completed.length}</span>
              </span>
              {completedCats.length > 1 ? (
                <div className="space-y-6">
                  {completedCats.map(c => (
                    <div key={c}>
                      <h4 className="text-[11px] font-semibold text-ink-400 uppercase tracking-wider mb-2">
                        {CATEGORY_LABELS[c] || c}<span className="ml-1.5 opacity-60">· {completed.filter(m => m.category === c).length}</span>
                      </h4>
                      <div className={gridClass}>{completed.filter(m => m.category === c).map(renderCard)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={gridClass}>{completed.map(renderCard)}</div>
              )}
            </div>
          )}
          {!completedOnly && (restCats.length > 1
            ? restCats.map(c => (
                <div key={c}>
                  <h3 className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-3">
                    {CATEGORY_LABELS[c] || c}<span className="ml-1.5 opacity-60">· {rest.filter(m => m.category === c).length}</span>
                  </h3>
                  <div className={gridClass}>{rest.filter(m => m.category === c).map(renderCard)}</div>
                </div>
              ))
            : rest.length > 0
              ? <div className={gridClass}>{rest.map(renderCard)}</div>
              : null)}
          {completedOnly && completed.length === 0 && (
            <div className="text-center text-sm text-ink-400 py-12">No completed menus yet.</div>
          )}
        </div>
      </>
    )
  }

  return (
    <PageScreen
      tourKey="event"
      breadcrumbs={[
        { label: brand?.name, to: `/brands/${brandSlug}` },
        { label: series?.name, to: `/brands/${brandSlug}/series/${seriesSlug}` },
        { label: event.name },
      ]}
      actions={<>
        <FavoriteButton type="event" id={event.id} size="sm" />
        <PhaseBadge
          phase={event.phase}
          onChange={canEdit ? async (next) => {
            const patch = { phase: next }
            // Exported → prep folder; Complete → final print folder.
            if (next === 'exported' && !event.prep_folder_url) {
              const link = window.prompt('Exported. Paste the Dropbox/Drive link to this event’s PREP folder (leave blank to add later):', '')
              if (link && link.trim()) patch.prep_folder_url = link.trim()
            }
            if (next === 'complete' && !event.print_folder_url) {
              const link = window.prompt('Complete. Paste the Dropbox/Drive link to this event’s final PRINT folder (leave blank to add later):', '')
              if (link && link.trim()) patch.print_folder_url = link.trim()
            }
            await supabase.from('events').update(patch).eq('id', event.id); loadData()
          } : null}
        />
      </>}
      secondaryActions={(<>
        {!isProduction && event.figma_file_url && (
          <a href={event.figma_file_url} onClick={(e) => openFigmaDesktopFirst(e, event.figma_file_url)} target="_blank" rel="noreferrer" className="btn-secondary btn-sm gap-1.5" title="Open in the Figma desktop app (falls back to browser)">
            <FigmaLogo size={12} />
            Open Figma
          </a>
        )}
        {canEdit && (
          <button onClick={openEditEvent} className="btn-secondary btn-sm whitespace-nowrap">Edit Event</button>
        )}
        {(event.print_folder_url || canEdit) && (
          <span className="inline-flex items-center gap-1 flex-shrink-0">
            <button
              onClick={async () => {
                let url = event.print_folder_url
                if (!url) {
                  if (!canEdit) return
                  const link = window.prompt('Paste the Dropbox/Drive link to this event’s PRINT / completed folder:', '')
                  if (!link || !link.trim()) return
                  url = link.trim()
                  await supabase.from('events').update({ print_folder_url: url }).eq('id', event.id)
                  loadData()
                }
                window.open(url, '_blank', 'noopener')
              }}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold transition ${event.print_folder_url ? 'text-black shadow-sm hover:brightness-105' : 'border border-[#FFB300] text-[#FFB300] hover:bg-[#FFB300]/10'}`}
              style={event.print_folder_url ? { background: 'linear-gradient(135deg, #FFD54F 0%, #FFB300 50%, #FB8C00 100%)' } : undefined}
              title={event.print_folder_url ? 'Open the print / completed folder' : 'Add the print / completed folder link'}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
              {event.print_folder_url ? 'Print Files' : 'Add Print Files'}
            </button>
            {canEdit && event.print_folder_url && (
              <button
                onClick={async () => {
                  const link = window.prompt('Edit the print / completed folder link (clear it to remove):', event.print_folder_url || '')
                  if (link === null) return // cancelled
                  await supabase.from('events').update({ print_folder_url: link.trim() || null }).eq('id', event.id)
                  loadData()
                }}
                title="Edit the print folder link"
                aria-label="Edit print folder link"
                className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-black shadow-sm hover:brightness-105 transition"
                style={{ background: 'linear-gradient(135deg, #FFD54F 0%, #FFB300 50%, #FB8C00 100%)' }}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
          </span>
        )}
        {!isProduction && event.prep_folder_url && (
          <OverflowMenu label="Folders">
            <a href={event.prep_folder_url} target="_blank" rel="noreferrer" className={MENU_ROW}>Prep folder ↗</a>
            {event.print_folder_url && <a href={event.print_folder_url} target="_blank" rel="noreferrer" className={MENU_ROW}>Print folder ↗</a>}
          </OverflowMenu>
        )}
      </>)}
      below={(
        <div className="flex items-center gap-0 overflow-x-auto overflow-y-hidden touch-pan-x overscroll-x-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
          {(isProduction ? [
            { id: 'preview', label: 'Menus' },
          ] : [
            { id: 'menus',     label: `Menus (${menus.length})` },
            { id: 'preview',   label: 'Preview all' },
            { id: 'sponsors',  label: `Sponsors (${sponsors.length})` },
            // Templates + Styles are the design system / brand setup —
            // editors only need menus + previews. Hide unless the user has
            // can_edit_styles set (admins always do).
            ...(canEditStyles ? [
              { id: 'templates', label: 'Templates' },
              { id: 'styles',    label: 'Styles' },
            ] : []),
            { id: 'aireview', label: (
              <span className="inline-flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-purple-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5L13 3z" />
                </svg>
                AI Review
              </span>
            ) },
            { id: 'signoff', label: 'Approvals' },
            { id: 'rules', label: (
              <span className="inline-flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-purple-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5L13 3z" />
                </svg>
                Review Rules
              </span>
            ) },
          ]).map(t => (
            <button
              key={t.id}
              data-tour={`event-tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
                tab === t.id
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-ink-500 hover:text-ink-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    >
      <PageBody>
      {/* Event meta row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-500 mb-4">
        {event.event_date && (
          <span className="whitespace-nowrap">{format(new Date(event.event_date), 'MMMM d, yyyy')}</span>
        )}
        {event.event_date && event.venue && <span className="text-surface-300">·</span>}
        {event.venue && <span className="whitespace-nowrap">{event.venue}</span>}
      </div>

      {/* Figma page name — admin only */}
      {canEdit && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className="text-xs text-ink-400 font-medium">Figma Page</span>
          {editingFigmaPage ? (
            <>
              <input
                className="input input-sm font-mono text-xs w-56"
                value={figmaPageName}
                onChange={e => setFigmaPageName(e.target.value)}
                placeholder="e.g. CF Spring 26"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleSaveFigmaPage(); if (e.key === 'Escape') setEditingFigmaPage(false) }}
              />
              <button onClick={handleSaveFigmaPage} disabled={savingFigmaPage} className="btn-primary btn-sm">
                {savingFigmaPage ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => { setEditingFigmaPage(false); setFigmaPageName(event.figma_page_name || '') }} className="btn-secondary btn-sm">
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditingFigmaPage(true)}
              className="text-xs font-mono text-ink-500 hover:text-brand-600 transition-colors"
            >
              {figmaPageName || <span className="text-ink-300 italic">not set</span>}
              <span className="ml-1.5 text-ink-300 font-sans not-italic">✎</span>
            </button>
          )}
        </div>
      )}

      {/* ── MENUS TAB ── */}
      {tab === 'menus' && (
        <>
          <EventReadiness menus={menus} eventId={event.id} seriesId={series?.id} onSelect={(state) => {
            if (state === 'ready') { navigate('/ready'); return }
            const phaseMap = { in_progress: ['build', 'proof', 'edits'], awaiting_sponsors: ['approved'], exported: ['exported'], complete: ['complete'], archived: ['archived'] }
            if (phaseMap[state]) { setStatusFilter(phaseMap[state]); setFiltersOpen(true) }
          }} />
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-ink-700">Menus</h2>
            {/* Toolbar — Filter · Select · Add, grouped together */}
            <div className="flex items-center gap-1.5">
              {menus.length > 0 && (
                <button onClick={() => setFiltersOpen(o => !o)} title="Filter & search"
                  className={`btn-secondary btn-sm px-2 inline-flex items-center gap-1 ${(anyMenuFilter || menuSearch) ? 'text-brand-600 border-brand-300' : ''}`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" /></svg>
                  {anyMenuFilter ? <span className="text-[11px] font-semibold">{[typeFilter, statusFilter, syncFilter].reduce((n, f) => n + (f.length ? 1 : 0), 0)}</span> : null}
                </button>
              )}
              {canEdit && menus.length > 0 && !menuSelectMode && (
                <button onClick={() => setMenuSelectMode(true)} title="Select menus"
                  className="btn-secondary btn-sm px-2 inline-flex items-center">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 12l2 2 4-4" /></svg>
                </button>
              )}
              {canEdit && (
                <>
                  <input ref={csvInputRef} type="file" accept=".csv" multiple className="hidden" onChange={handleCsvFilesSelected} />
                  <OverflowMenu triggerLabel="+" hideChevron align="right" label="Add">
                    <button onClick={() => { setMenuName(''); setMenuSlugField(''); setMenuCategory('bar'); setMenuPhase('build'); setMenuSize('lg'); setSaveError(null); setShowNewMenu(true) }} className={MENU_ROW}>+ New menu</button>
                    <button onClick={() => setShowBulkAdd(true)} className={MENU_ROW}>+ Add item to menus</button>
                    <button onClick={() => csvInputRef.current?.click()} className={MENU_ROW}>↑ Import CSVs</button>
                  </OverflowMenu>
                </>
              )}
            </div>
          </div>

          {menus.length === 0 ? (
            <div className="card px-6 py-8 text-center">
              <p className="text-sm text-ink-400 mb-3">No menus yet for this event.</p>
              {canEdit && (
                <button onClick={() => setShowNewMenu(true)} className="btn-primary btn-sm">Add First Menu</button>
              )}
            </div>
          ) : (
            <>
              {/* Filter + search reveal (toggled by the funnel above) */}
              {filtersOpen && (
                <div className="flex items-center gap-2 mb-5 flex-wrap">
                  <input value={menuSearch} onChange={e => setMenuSearch(e.target.value)} placeholder="Search menus…"
                    className="input py-1.5 text-sm w-44" autoFocus />
                  {TYPE_FILTER_OPTS.length > 1 && (
                    <FilterDropdown label="All types" options={TYPE_FILTER_OPTS} selected={typeFilter} onChange={setTypeFilter} />
                  )}
                  {PHASE_FILTER_OPTS.length > 1 && (
                    <FilterDropdown label="All status" options={PHASE_FILTER_OPTS} selected={statusFilter} onChange={setStatusFilter} />
                  )}
                  <FilterDropdown label="All sync" options={SYNC_FILTER_OPTS} selected={syncFilter} onChange={setSyncFilter} />
                  {(anyMenuFilter || menuSearch) ? (
                    <button onClick={() => { setTypeFilter([]); setStatusFilter([]); setSyncFilter([]); setMenuSearch('') }}
                      className="text-xs text-ink-400 hover:text-ink-600 underline underline-offset-2 ml-1">
                      Clear · {menusFiltered.length} of {menus.length}
                    </button>
                  ) : null}
                </div>
              )}

              {/* Bulk action bar — approve / not approved / unsync */}
              {menuSelectMode && (
                <div className="sticky top-0 z-20 -mx-1 mb-4 px-3 py-2.5 rounded-lg bg-brand-50 border border-brand-200 flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-brand-800 whitespace-nowrap">{selectedMenuIds.size} selected</span>
                  <button onClick={() => setSelectedMenuIds(new Set(menusFiltered.map(m => m.id)))}
                    className="text-xs text-brand-600 hover:text-brand-700 underline underline-offset-2 whitespace-nowrap">Select all ({menusFiltered.length})</button>
                  <div className="flex items-center gap-2 ml-auto flex-wrap">
                    <select
                      value=""
                      disabled={!selectedMenuIds.size || bulkBusy}
                      onChange={e => { if (e.target.value) bulkSetPhase(selectedMenuIds, e.target.value); e.target.value = '' }}
                      className="input py-1.5 text-sm w-auto disabled:opacity-40"
                    >
                      <option value="">Set status…</option>
                      {MENU_PHASES.map(p => <option key={p} value={p}>{PHASE_LABELS[p]}</option>)}
                    </select>
                    <button disabled={!selectedMenuIds.size || bulkBusy} onClick={() => bulkFlagSponsors(selectedMenuIds)}
                      className="btn-secondary btn-sm whitespace-nowrap flex-shrink-0 disabled:opacity-40">⚑ Check sponsors</button>
                    <button disabled={!selectedMenuIds.size || bulkBusy} onClick={() => bulkUnsync(selectedMenuIds)}
                      className="btn-secondary btn-sm whitespace-nowrap flex-shrink-0 disabled:opacity-40">Unsync</button>
                    <button onClick={() => { setMenuSelectMode(false); setSelectedMenuIds(new Set()) }}
                      className="btn-secondary btn-sm whitespace-nowrap flex-shrink-0">Done</button>
                  </div>
                </div>
              )}

              {menusFiltered.length === 0 ? (
                <div className="text-center text-sm text-ink-400 py-12">No menus match these filters.</div>
              ) : renderMenuGroups({
                list: menusFiltered,
                catsPresent: menuCategoriesPresent,
                renderCard: renderMenuCard,
                gridClass: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4',
                completedOnly: menusCompletedOnly,
                onToggleCompleted: () => setMenusCompletedOnly(v => !v),
              })}
            </>
          )}
        </>
      )}

      {/* Delete menu confirm modal */}
      {deletingMenu && (
        <Modal title="Delete this menu?" onClose={() => { if (!deletingBusy) { setDeletingMenu(null); setDeleteConfirmText(''); setDeleteError(null) } }}>
          <div className="space-y-4">
            <p className="text-sm text-ink-700">
              <strong>{deletingMenu.name}</strong> and all of its items, edit log,
              and sponsor toggles will be permanently removed. This can't be undone.
            </p>
            <div>
              <label className="block text-xs font-semibold text-ink-700 mb-1">
                Type <code className="bg-surface-100 px-1 rounded text-red-600">DELETE</code> to confirm
              </label>
              <input
                type="text"
                className="input"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                autoFocus
              />
            </div>
            {deleteError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{deleteError}</p>
            )}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                onClick={() => { setDeletingMenu(null); setDeleteConfirmText(''); setDeleteError(null) }}
                disabled={deletingBusy}
                className="btn-secondary btn-sm"
              >Cancel</button>
              <button
                onClick={handleDeleteMenu}
                disabled={deletingBusy || deleteConfirmText !== 'DELETE'}
                className="btn-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >{deletingBusy ? 'Deleting…' : 'Delete menu'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Duplicate menu modal */}
      {duplicatingMenu && (
        <DuplicateMenuModal
          sourceMenu={duplicatingMenu}
          currentEventId={event.id}
          currentSeriesId={series?.id}
          currentBrandId={brand?.id}
          onClose={() => setDuplicatingMenu(null)}
          onDuplicated={(newMenu) => {
            setDuplicatingMenu(null)
            loadData()
            // If duplicated into the same event, jump to the new menu;
            // otherwise stay put (the user's targeting a different event).
            if (newMenu?.event_id === event.id && newMenu?.slug) {
              navigate(`${baseUrl}/menus/${newMenu.slug}`)
            }
          }}
        />
      )}

      {/* ── PREVIEW ALL TAB ── all menus in the event tiled at large scale. */}
      {tab === 'preview' && (
        <>
          {menus.length === 0 ? (
            <div className="card px-6 py-8 text-center">
              <p className="text-sm text-ink-400">No menus to preview yet.</p>
            </div>
          ) : (
            <>
              {/* Export toolbar — toggles selection mode, surfaces count
                  + Export. Non-modal so it stays out of your way when
                  you just want to scan previews. */}
              <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <div className="text-xs text-ink-500">
                  {selectMode
                    ? `${selectedPreviewIds.size} of ${previewFiltered.filter(canSendMenu).length} selected${isProduction ? ' · only completed menus can be sent' : ''}`
                    : `${menus.length} menu${menus.length === 1 ? '' : 's'} · ${menus.filter(m => menuPreviewSrc(m)).length} with preview images`}
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {selectMode ? (
                    <>
                      <button
                        onClick={() => {
                          const allIds = previewFiltered.filter(canSendMenu).map(m => m.id)
                          setSelectedPreviewIds(prev => prev.size === allIds.length ? new Set() : new Set(allIds))
                        }}
                        className="btn-secondary btn-sm whitespace-nowrap flex-shrink-0"
                      >
                        {selectedPreviewIds.size > 0 && selectedPreviewIds.size === previewFiltered.filter(canSendMenu).length ? 'Clear' : 'Select all'}
                      </button>
                      {selectPurpose === 'share' && (
                        <button
                          onClick={() => createPreviewShare(selectedPreviewIds)}
                          disabled={selectedPreviewIds.size === 0 || shareBusy}
                          className="btn-sm whitespace-nowrap flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-black text-xs font-semibold disabled:opacity-50 hover:brightness-105 transition"
                          style={{ background: SHARE_GRADIENT }}
                          title="Create a public gallery link for the selected menus"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
                          {shareBusy ? 'Creating…' : `Send previews ${selectedPreviewIds.size > 0 ? selectedPreviewIds.size : ''}`}
                        </button>
                      )}
                      {selectPurpose === 'order' && (
                        <button
                          onClick={() => setOrderModal(menus.filter(m => selectedPreviewIds.has(m.id)))}
                          disabled={selectedPreviewIds.size === 0}
                          className="btn-sm whitespace-nowrap flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-black text-xs font-semibold disabled:opacity-50 hover:brightness-105 transition"
                          style={{ background: SHARE_GRADIENT }}
                          title="Set quantities and build a printable order form"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                          {`Order form ${selectedPreviewIds.size > 0 ? selectedPreviewIds.size : ''}`}
                        </button>
                      )}
                      {selectPurpose === 'export' && (
                        <>
                          {canEdit && (
                            <>
                              <select
                                value=""
                                disabled={!selectedPreviewIds.size || bulkBusy}
                                onChange={e => { if (e.target.value) bulkSetPhase(selectedPreviewIds, e.target.value); e.target.value = '' }}
                                className="input py-1.5 text-sm w-auto disabled:opacity-40"
                              >
                                <option value="">Set status…</option>
                                {MENU_PHASES.map(p => <option key={p} value={p}>{PHASE_LABELS[p]}</option>)}
                              </select>
                              <button disabled={!selectedPreviewIds.size || bulkBusy} onClick={() => bulkFlagSponsors(selectedPreviewIds)}
                                className="btn-secondary btn-sm whitespace-nowrap flex-shrink-0 disabled:opacity-40">⚑ Check sponsors</button>
                              <button disabled={!selectedPreviewIds.size || bulkBusy} onClick={() => bulkUnsync(selectedPreviewIds)}
                                className="btn-secondary btn-sm whitespace-nowrap flex-shrink-0 disabled:opacity-40">Unsync</button>
                            </>
                          )}
                          <button
                            onClick={() => openPreviewExportWindow(
                              menus.filter(m => selectedPreviewIds.has(m.id) && menuPreviewSrc(m)),
                              event?.name || 'Menus',
                            )}
                            disabled={selectedPreviewIds.size === 0}
                            className="btn-primary btn-sm whitespace-nowrap flex-shrink-0 disabled:opacity-50"
                            title="Exports the selected menus that have preview images"
                          >
                            Export {selectedPreviewIds.size > 0 ? selectedPreviewIds.size : ''}
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => { setSelectMode(false); setSelectedPreviewIds(new Set()) }}
                        className="btn-secondary btn-sm whitespace-nowrap flex-shrink-0"
                      >
                        Done
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => { setSelectMode(true); setSelectPurpose('share') }}
                        className="btn-sm whitespace-nowrap flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-black text-xs font-semibold shadow-sm hover:brightness-105 transition"
                        style={{ background: SHARE_GRADIENT }}
                        title="Pick menus and send a shareable preview-gallery link"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
                        Send previews
                      </button>
                      <button
                        onClick={() => { setSelectMode(true); setSelectPurpose('order') }}
                        className="btn-secondary btn-sm whitespace-nowrap flex-shrink-0 gap-1.5 inline-flex items-center"
                        title="Pick menus, set quantities, and build a printable order form"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                        Order form
                      </button>
                      {canEdit && (
                        <button
                          onClick={() => { setSelectMode(true); setSelectPurpose('export') }}
                          className="btn-secondary btn-sm whitespace-nowrap flex-shrink-0 gap-1.5 inline-flex items-center"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h2m8-4v2a2 2 0 01-2 2h-2m-8-12V6a2 2 0 012-2h2m8 4V6a2 2 0 00-2-2h-2" />
                          </svg>
                          Select / Export
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {/* Quick-select: tap a status/type to grab that whole group. */}
              {selectMode && (quickStatusOpts.length > 0 || quickTypeOpts.length > 1) && (
                <div className="flex items-center gap-x-3 gap-y-2 mb-4 flex-wrap">
                  <span className="text-[11px] uppercase tracking-wide text-ink-400 font-semibold">Quick select</span>
                  {quickStatusOpts.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {quickStatusOpts.map(o => {
                        const on = groupFullySelected(o.ids)
                        return (
                          <button key={o.key} onClick={() => toggleQuickGroup(o.ids)}
                            className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0 border transition ${on ? 'text-black border-transparent shadow-sm' : 'border-ink-200 text-ink-500 hover:border-ink-300'}`}
                            style={on ? { background: SHARE_GRADIENT } : undefined}>
                            {o.label} · {o.ids.length}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {quickTypeOpts.length > 1 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {quickStatusOpts.length > 0 && <span className="text-ink-300">·</span>}
                      {quickTypeOpts.map(o => {
                        const on = groupFullySelected(o.ids)
                        return (
                          <button key={o.key} onClick={() => toggleQuickGroup(o.ids)}
                            className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0 border transition ${on ? 'text-black border-transparent shadow-sm' : 'border-ink-200 text-ink-500 hover:border-ink-300'}`}
                            style={on ? { background: SHARE_GRADIENT } : undefined}>
                            {o.label} · {o.ids.length}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
              {/* Filters behind a funnel — same pattern as the Menus tab */}
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <button onClick={() => setPreviewFiltersOpen(o => !o)} title="Filters"
                  className={`btn-secondary btn-sm px-2 inline-flex items-center gap-1 ${anyPreviewFilter ? 'text-brand-600 border-brand-300' : ''}`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" /></svg>
                  {anyPreviewFilter ? <span className="text-[11px] font-semibold">{[previewTypeFilter, previewStatusFilter, previewSyncFilter].reduce((n, f) => n + (f.length ? 1 : 0), 0)}</span> : null}
                </button>
                {previewFiltersOpen && <>
                  {TYPE_FILTER_OPTS.length > 1 && (
                    <FilterDropdown label="All types" options={TYPE_FILTER_OPTS} selected={previewTypeFilter} onChange={setPreviewTypeFilter} />
                  )}
                  {PHASE_FILTER_OPTS.length > 1 && (
                    <FilterDropdown label="All status" options={PHASE_FILTER_OPTS} selected={previewStatusFilter} onChange={setPreviewStatusFilter} />
                  )}
                  <FilterDropdown label="All sync" options={SYNC_FILTER_OPTS} selected={previewSyncFilter} onChange={setPreviewSyncFilter} />
                </>}
                {anyPreviewFilter ? (
                  <button
                    onClick={() => { setPreviewTypeFilter([]); setPreviewStatusFilter([]); setPreviewSyncFilter([]) }}
                    className="text-xs text-ink-400 hover:text-ink-600 underline underline-offset-2 ml-1"
                  >
                    Clear · {previewFiltered.length} of {menus.length}
                  </button>
                ) : null}
              </div>

              {previewFiltered.length === 0 ? (
                <div className="text-center text-sm text-ink-400 py-12">No menus match these filters.</div>
              ) : renderMenuGroups({
                list: previewFiltered,
                catsPresent: menuCategoriesPresent,
                renderCard: renderPreviewCard,
                gridClass: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4',
                completedOnly: previewCompletedOnly,
                onToggleCompleted: () => setPreviewCompletedOnly(v => !v),
              })}
            </>
          )}
        </>
      )}

      {/* ── SPONSORS TAB ── */}
      {tab === 'sponsors' && (
        <EventSponsorsTab
          event={event}
          series={series}
          canEdit={canEdit}
          onChange={loadData}
        />
      )}

      {/* ── TEMPLATES TAB ── admin only (matches the tab-bar gate above) */}
      {tab === 'templates' && canEditStyles && (
        <TemplatesTab
          event={event}
          templates={templates}
          canEdit={canEdit}
          onSaved={tmpl => {
            setTemplates(prev => ({ ...prev, [tmpl.size]: tmpl }))
          }}
        />
      )}

      {/* ── STYLES TAB ── admin only */}
      {tab === 'styles' && canEditStyles && (
        <EventStylesTab
          event={event}
          series={series}
          canEdit={canEdit}
          onSaved={loadData}
        />
      )}

      {/* ── APPROVALS TAB ── existing sign-off list + new notify editor */}
      {tab === 'signoff' && (
        <div className="space-y-4 max-w-2xl">
          <div>
            <h2 className="text-sm font-semibold text-ink-900 mb-1">Approval roster</h2>
            <p className="text-xs text-ink-500 mb-3">
              Who must sign off each menu, by role. One owner per role (the lead), plus any
              additional required approvers — every listed person signs each menu before its gate clears.
              Inherits the series default unless overridden.
            </p>
            <RosterEditor scope="event" scopeId={event.id} seriesId={series?.id} canEdit={isAdmin || isInternal} />
          </div>
          <ApproversPanel targetType="event" targetId={event.id} title="Event approvals (legacy)" />
          <ReviewersPanel resourceType="event" resourceId={event.id} canEdit={isAdmin || isInternal} />
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-ink-900 mb-1">Notify for edits</h2>
            <p className="text-xs text-ink-500 mb-4">
              People notified for every edit on any menu under this event.
              Brand + series picks above stay on automatically.
            </p>
            <NotifyForEditsEditor
              table="events"
              entityId={event.id}
              current={event.notify_user_ids || []}
              inheritedIds={Array.from(new Set([
                ...((series?.brand?.notify_user_ids) || []),
                ...((series?.notify_user_ids) || []),
              ]))}
              inheritedFromLabel="brand + series"
              canEdit={isAdmin || isInternal}
              onSaved={loadData}
            />
          </div>
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-ink-900 mb-1">Who can approve menus</h2>
            <p className="text-xs text-ink-500 mb-4">
              People who may flip menus under this event to Approved. Inherited from brand + series; menus can add more. Empty = any internal user.
            </p>
            <NotifyForEditsEditor
              table="events" entityId={event.id} column="menu_approver_ids"
              addLabel="Add or remove menu approvers at the event level:"
              current={event.menu_approver_ids || []}
              inheritedIds={Array.from(new Set([
                ...((series?.brand?.menu_approver_ids) || []),
                ...((series?.menu_approver_ids) || []),
              ]))}
              inheritedFromLabel="brand + series"
              canEdit={isAdmin} onSaved={loadData}
            />
          </div>
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-ink-900 mb-1">Who can approve edits</h2>
            <p className="text-xs text-ink-500 mb-4">
              People who may approve/reject pending item edits under this event. Empty = any internal user.
            </p>
            <NotifyForEditsEditor
              table="events" entityId={event.id} column="edit_approver_ids"
              addLabel="Add or remove edit approvers at the event level:"
              current={event.edit_approver_ids || []}
              inheritedIds={Array.from(new Set([
                ...((series?.brand?.edit_approver_ids) || []),
                ...((series?.edit_approver_ids) || []),
              ]))}
              inheritedFromLabel="brand + series"
              canEdit={isAdmin} onSaved={loadData}
            />
          </div>
        </div>
      )}

      {/* Event activity drawer — discussion across the event */}
      <ActivityTab scopeType="event" scopeId={event.id} open={showActivity} onOpen={() => setShowActivity(true)} />
      <ActivityDrawer scopeType="event" scopeId={event.id} title={event.name} open={showActivity} onClose={() => setShowActivity(false)} />

      {/* ── AI REVIEW TAB ── aggregate flags across all menus ── */}
      {tab === 'aireview' && (
        <EventAiReviewPanel menus={menus} brand={brand} series={series} event={event} onChanged={loadData} />
      )}

      {/* ── REVIEW RULES TAB ── */}
      {tab === 'rules' && (
        <div className="space-y-4 max-w-2xl">
          <ReviewRulesEditor scopeType="event" scopeId={event.id} scopeLabel="this event" canEdit={isAdmin || isInternal} />
          <p className="text-xs text-ink-400 px-1">
            Tip: rules added on the brand or series apply to every event under them too. Per-menu rules can be added from a menu's own page (coming alongside this). The AI review on each menu checks these on top of spelling, grammar, and consistency.
          </p>
        </div>
      )}

      {/* ── Order-form builder modal ── */}
      <OrderFormModal
        menus={orderModal}
        event={event}
        busy={shareBusy}
        onCreate={(opts) => createOrderShare(orderModal, opts)}
        onClose={() => setOrderModal(null)}
      />

      {/* ── Share/order link modal ── */}
      {shareInfo && (
        <Modal title={shareInfo.kind === 'order' ? 'Order form link' : 'Preview gallery link'} onClose={() => setShareInfo(null)}>
          <div className="space-y-4">
            <p className="text-sm text-ink-600">
              {shareInfo.kind === 'order'
                ? 'A standalone, printable order form of the selected menus with quantities — no Menu Hub login. Anyone with this link can view and print it.'
                : 'A standalone gallery of the selected menus — no Menu Hub login, nothing else from the app. Anyone with this link can flip through the previews and download the PNGs.'}
              {!shareInfo.is_public && ' (Private: a Menu Hub account is required to open it.)'}
            </p>
            <div className="flex items-center gap-2">
              <input readOnly value={shareInfo.url} onFocus={e => e.target.select()} className="input text-xs flex-1" />
              <button
                onClick={() => { try { navigator.clipboard?.writeText(shareInfo.url) } catch (_) {} setShareCopied(true) }}
                className="btn-primary btn-sm whitespace-nowrap flex-shrink-0"
              >{shareCopied ? 'Copied' : 'Copy'}</button>
            </div>
            <div className="space-y-2.5 border-t border-surface-100 pt-3">
              <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide">Turn on for this link</p>
              <label className="flex items-start gap-2 text-sm text-ink-700 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={shareInfo.show_print_files} onChange={e => updateShare({ show_print_files: e.target.checked })} />
                <span>Show a <strong>Print file</strong> link on each menu (where one is set)</span>
              </label>
              {shareInfo.kind !== 'order' && (
                <label className="flex items-start gap-2 text-sm text-ink-700 cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={shareInfo.allow_comments} onChange={e => updateShare({ allow_comments: e.target.checked })} />
                  <span>Let viewers leave <strong>feedback</strong> (comments) — turns it into a review link</span>
                </label>
              )}
              {shareInfo.kind === 'order' && (
                <label className="flex items-start gap-2 text-sm text-ink-700 cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={!!shareInfo.is_live} onChange={e => updateShare({ is_live: e.target.checked })} />
                  <span><strong>Keep live</strong> — always show the menus’ current quantities. Off = frozen snapshot of what you sent.</span>
                </label>
              )}
              <label className="flex items-start gap-2 text-sm text-ink-700 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={!shareInfo.is_public} onChange={e => updateShare({ is_public: !e.target.checked })} />
                <span><strong>Private</strong> — require a Menu Hub account to view</span>
              </label>
              <p className="text-[11px] text-ink-400">Changes apply instantly to the same link.</p>
            </div>
            <div className="flex items-center justify-between pt-1">
              <a href={shareInfo.url} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline">{shareInfo.kind === 'order' ? 'Open order form ↗' : 'Open gallery ↗'}</a>
              <button onClick={() => setShareInfo(null)} className="btn-secondary btn-sm">Done</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Edit Event Modal ── */}
      {showEditEvent && (
        <Modal title="Edit Event" onClose={() => setShowEditEvent(false)}>
          <form onSubmit={handleSaveEvent} className="space-y-4">
            <div>
              <label className="label">Event Name</label>
              <input className="input" value={editName}
                onChange={e => { setEditName(e.target.value); setEditSlug(slugify(e.target.value)) }}
                required autoFocus />
            </div>
            <div>
              <label className="label">Slug</label>
              <input className="input font-mono text-sm" value={editSlug}
                onChange={e => setEditSlug(slugify(e.target.value))} required />
              <p className="text-xs text-ink-400 mt-1">Changing the slug will update the URL.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Date</label>
                <input type="date" className="input" value={editDate}
                  onChange={e => setEditDate(e.target.value)} />
              </div>
              <div>
                <label className="label">Phase</label>
                <select className="input" value={editPhase} onChange={e => setEditPhase(e.target.value)}>
                  {EVENT_PHASES.map(p => <option key={p} value={p}>{PHASE_LABELS[p]}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Venue</label>
              <input className="input" value={editVenue}
                onChange={e => setEditVenue(e.target.value)}
                placeholder="e.g. Waterfront Park" />
            </div>
            <div>
              <label className="label">Figma File URL <span className="text-ink-400 font-normal">(optional)</span></label>
              <input className="input" value={editFigmaUrl}
                onChange={e => setEditFigmaUrl(e.target.value)}
                placeholder="https://figma.com/design/…" />
            </div>
            <div>
              <label className="label">Prep files folder <span className="text-ink-400 font-normal">(optional)</span></label>
              <input className="input" type="url" value={editPrepFolderUrl}
                onChange={e => setEditPrepFolderUrl(e.target.value)}
                placeholder="https://… link to the prep-files folder" />
              <p className="mt-1 text-[11px] text-ink-400">Set at the Exported stage — a “Prep folder” button appears on the event.</p>
            </div>
            <div>
              <label className="label">Print files folder <span className="text-ink-400 font-normal">(optional)</span></label>
              <input className="input" type="url" value={editPrintFolderUrl}
                onChange={e => setEditPrintFolderUrl(e.target.value)}
                placeholder="https://… link to the print-files folder" />
              <p className="mt-1 text-[11px] text-ink-400">Set at the Complete stage — a “Print folder” button appears on the event.</p>
            </div>
            <div>
              <label className="label">Menus freeze date <span className="text-ink-400 font-normal">(optional)</span></label>
              <input className="input" type="datetime-local" value={editFreezeAt}
                onChange={e => setEditFreezeAt(e.target.value)} />
              <p className="mt-1 text-[11px] text-ink-400">After this, any menu edited gets a “Late” flag so you can see who changed things past the deadline.</p>
            </div>
            <div>
              <label className="label">Figma Page Name <span className="text-ink-400 font-normal">(must match exactly)</span></label>
              <input className="input font-mono text-sm" value={editFigmaPage}
                onChange={e => setEditFigmaPage(e.target.value)}
                placeholder="e.g. CF Spring 26" />
            </div>
            <div>
              <label className="label">Figma component prefix <span className="text-ink-400 font-normal">(optional override)</span></label>
              <input
                type="text"
                className="input font-mono"
                value={editFigmaPrefix}
                onChange={e => setEditFigmaPrefix(e.target.value)}
                placeholder={`Inherits from series / brand${series?.figma_component_prefix ? `: ${series.figma_component_prefix}` : (brand?.figma_component_prefix ? `: ${brand.figma_component_prefix}` : '')}`}
                spellCheck={false}
              />
              <p className="text-[11px] text-ink-400 mt-1 leading-relaxed">
                Leave blank to inherit. Override only when this event uses a different master-component set than the rest of the series (e.g. a one-off festival with bespoke templates).
              </p>
            </div>
            <div>
              <label className="label">Icon</label>
              <EntityIconPicker
                iconUrl={editIconUrl}
                iconName={editIconName}
                onChange={({ icon_url, icon_name }) => { setEditIconUrl(icon_url); setEditIconName(icon_name) }}
                uploadBucket="series-assets"
                uploadPathPrefix={`${event.id}/icons`}
                fallbackText={editName}
                fallbackColor={brand?.color}
              />
            </div>
            {editError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{editError}</p>}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button type="button" onClick={() => setShowEditEvent(false)} className="btn-secondary btn-sm">Cancel</button>
              <button type="submit" className="btn-primary btn-sm" disabled={editSaving}>{editSaving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── New Menu Modal ── */}
      {showBulkAdd && (
        <BulkAddItemModal menus={menus} onClose={() => setShowBulkAdd(false)} onDone={loadData} />
      )}
      {showNewMenu && (
        <Modal title="New Menu" onClose={() => setShowNewMenu(false)}>
          <form onSubmit={handleCreateMenu} className="space-y-4">
            <div>
              <label className="label">Menu Name</label>
              <input className="input" value={menuName}
                onChange={e => { setMenuName(e.target.value); setMenuSlugField(slugify(e.target.value)) }}
                placeholder="e.g. Craft Cocktails" required autoFocus />
            </div>
            <div>
              <label className="label">Slug</label>
              <input className="input font-mono text-sm" value={menuSlugField}
                onChange={e => setMenuSlugField(slugify(e.target.value))} placeholder="craft-cocktails" required />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">Size</label>
                <select className="input" value={menuSize} onChange={e => setMenuSize(e.target.value)}>
                  <option value="lg">LG — 23.5" × 47.5"</option>
                  <option value="md">MD — 23.5" × 35.25"</option>
                  <option value="sm">SM — 23.5" × 23.5"</option>
                </select>
              </div>
              <div>
                <label className="label">Category</label>
                <select className="input" value={menuCategory} onChange={e => setMenuCategory(e.target.value)}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Phase</label>
                <select className="input" value={menuPhase} onChange={e => setMenuPhase(e.target.value)}>
                  {MENU_PHASES.map(p => <option key={p} value={p}>{PHASE_LABELS[p]}</option>)}
                </select>
              </div>
            </div>
            {saveError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</p>}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button type="button" onClick={() => setShowNewMenu(false)} className="btn-secondary btn-sm">Cancel</button>
              <button type="submit" className="btn-primary btn-sm" disabled={saving}>{saving ? 'Creating…' : 'Create Menu'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Import CSVs Modal ── */}
      {showImportCsvs && (
        <Modal
          title="Import Menus from CSV"
          onClose={() => { setShowImportCsvs(false); setCsvBatch([]); setCsvImportDone(false); setCsvImportError(null) }}
        >
          <div className="space-y-4">
            {csvImportDone ? (
              <div className="text-center py-4">
                <p className="text-sm text-emerald-700 font-medium mb-1">✓ Import complete</p>
                <p className="text-xs text-ink-400">
                  {csvBatch.filter(e => e.items.length > 0 && !e.error).length} menu(s) created successfully.
                </p>
                <button
                  className="btn-primary btn-sm mt-4"
                  onClick={() => { setShowImportCsvs(false); setCsvBatch([]); setCsvImportDone(false) }}
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <p className="text-xs text-ink-500">
                  Each file becomes one menu. Edit the name, slug, or category before importing.
                </p>
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                  {csvBatch.map((entry, i) => {
                    // Compute section summary for validation display
                    const sectionMap = {}
                    entry.items.forEach(it => {
                      const s = it.section || '(no section)'
                      sectionMap[s] = (sectionMap[s] || 0) + 1
                    })
                    const missingTitle = entry.items.filter(it => !it.title).length
                    return (
                    <div key={i} className="border border-surface-200 rounded-lg p-4 bg-surface-50">
                      {entry.error ? (
                        <p className="text-xs text-red-600">⚠ Parse error: {entry.error}</p>
                      ) : (
                        <>
                          <div className="flex items-center gap-3 mb-2.5">
                            <span className="text-xs text-ink-400 w-16 shrink-0">Name</span>
                            <input
                              className="input input-sm flex-1"
                              value={entry.name}
                              onChange={e => {
                                const name = e.target.value
                                setCsvBatch(prev => prev.map((b, j) =>
                                  j === i ? { ...b, name, slug: slugify(name) } : b
                                ))
                              }}
                            />
                          </div>
                          <div className="flex items-center gap-3 mb-2.5">
                            <span className="text-xs text-ink-400 w-16 shrink-0">Slug</span>
                            <input
                              className="input input-sm font-mono text-xs flex-1"
                              value={entry.slug}
                              onChange={e => {
                                const slug = slugify(e.target.value)
                                setCsvBatch(prev => prev.map((b, j) =>
                                  j === i ? { ...b, slug } : b
                                ))
                              }}
                            />
                          </div>
                          <div className="flex items-center gap-3 mb-3">
                            <span className="text-xs text-ink-400 w-16 shrink-0">Category</span>
                            <select
                              className="input input-sm flex-1"
                              value={entry.category}
                              onChange={e => {
                                const category = e.target.value
                                setCsvBatch(prev => prev.map((b, j) =>
                                  j === i ? { ...b, category } : b
                                ))
                              }}
                            >
                              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                            </select>
                          </div>
                          {/* Validation summary */}
                          <div className="bg-surface-0 border border-surface-200 rounded-lg px-3 py-2.5 text-xs space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-ink-400">Total items</span>
                              <span className="font-medium text-ink-700">{entry.items.length}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-ink-400">Sections found</span>
                              <span className="font-medium text-ink-700">{Object.keys(sectionMap).length}</span>
                            </div>
                            {Object.entries(sectionMap).map(([sec, count]) => (
                              <div key={sec} className="flex items-center justify-between pl-3 text-ink-300">
                                <span className="truncate max-w-[200px]">{sec}</span>
                                <span>{count} items</span>
                              </div>
                            ))}
                            {missingTitle > 0 && (
                              <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1">
                                <span>⚠</span>
                                <span>{missingTitle} row(s) missing a title — will be skipped</span>
                              </div>
                            )}
                            {entry.items.length === 0 && (
                              <div className="text-red-600">No valid rows found — check that Section and Title columns have data.</div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )})}
                </div>
                {csvImportError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{csvImportError}</p>
                )}
                <div className="flex items-center justify-end gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => { setShowImportCsvs(false); setCsvBatch([]); setCsvImportError(null) }}
                    className="btn-secondary btn-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleImportAll}
                    disabled={csvImporting || csvBatch.every(e => !e.items.length || e.error)}
                    className="btn-primary btn-sm"
                  >
                    {csvImporting
                      ? 'Importing…'
                      : `Import ${csvBatch.filter(e => e.items.length > 0 && !e.error).length} menu(s)`}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {/* ── New Sponsor Modal ── */}
      {showNewSponsor && (
        <Modal title="Add Sponsor" onClose={() => setShowNewSponsor(false)}>
          <form onSubmit={handleCreateSponsor} className="space-y-4">
            <div>
              <label className="label">Sponsor Name</label>
              <input className="input" value={spName}
                onChange={e => { setSpName(e.target.value); setSpSlug(slugify(e.target.value)) }}
                placeholder="e.g. Patron Tequila" required autoFocus />
            </div>
            <div>
              <label className="label">Slug</label>
              <input className="input font-mono text-sm" value={spSlug}
                onChange={e => setSpSlug(slugify(e.target.value))} placeholder="patron-tequila" required />
              {spSlug && (
                <p className="text-xs text-ink-400 mt-1">
                  Figma layer name: <span className="font-mono text-ink-600">sponsor--{spSlug}</span>
                </p>
              )}
            </div>
            <div>
              <label className="label">Logo URL <span className="text-ink-400 font-normal">(optional)</span></label>
              <input className="input" value={spLogoUrl}
                onChange={e => setSpLogoUrl(e.target.value)}
                placeholder="https://cdn.example.com/logo.png" />
            </div>
            <div>
              <label className="label">Sort Order</label>
              <input type="number" className="input w-24" value={spSortOrder}
                onChange={e => setSpSortOrder(e.target.value)} min={0} />
            </div>
            {spError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{spError}</p>}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button type="button" onClick={() => setShowNewSponsor(false)} className="btn-secondary btn-sm">Cancel</button>
              <button type="submit" className="btn-primary btn-sm" disabled={spSaving}>{spSaving ? 'Adding…' : 'Add Sponsor'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Quick-review feedback modal */}
      {feedbackMenu && (
        <Modal title={`Feedback — ${feedbackMenu.name}`} onClose={() => setFeedbackMenu(null)}>
          <p className="text-sm text-ink-500 mb-3">Leave a note on this menu. It posts to the menu's comments thread for the team to see.</p>
          <textarea
            className="input w-full min-h-[120px]"
            value={feedbackText}
            onChange={e => setFeedbackText(e.target.value)}
            placeholder="What needs changing? Be specific…"
            autoFocus
          />
          <div className="flex items-center justify-end gap-2 pt-3">
            <button className="btn-secondary btn-sm" onClick={() => setFeedbackMenu(null)} disabled={feedbackBusy}>Cancel</button>
            <button
              className="btn-primary btn-sm"
              disabled={feedbackBusy || !feedbackText.trim()}
              onClick={async () => {
                setFeedbackBusy(true)
                const { error } = await supabase.from('activity_messages')
                  .insert({ scope_type: 'menu', scope_id: feedbackMenu.id, user_id: profile?.id, body: feedbackText.trim() })
                setFeedbackBusy(false)
                if (error) { alert('Could not post feedback: ' + error.message); return }
                setFeedbackMenu(null)
              }}
            >
              {feedbackBusy ? 'Posting…' : 'Post feedback'}
            </button>
          </div>
        </Modal>
      )}
      </PageBody>
    </PageScreen>
  )
}
