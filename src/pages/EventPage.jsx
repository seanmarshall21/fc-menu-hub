import { useEffect, useState, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import Papa from 'papaparse'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import PageScreen, { PageBody } from '@/components/PageScreen'
import PhaseBadge from '@/components/PhaseBadge'
import SyncChip from '@/components/SyncChip'
import Modal from '@/components/Modal'
import { format } from 'date-fns'
import { SIZE_CONFIGS } from '@/components/TemplateCanvas'
import EventStylesTab from '@/components/EventStylesTab'
import FavoriteButton from '@/components/FavoriteButton'
import EntityIconPicker from '@/components/EntityIconPicker'
import ApproversPanel from '@/components/ApproversPanel'
import NotifyForEditsEditor from '@/components/NotifyForEditsEditor'
import { formatPrice, resolveCurrencySpec } from '@/lib/formatPrice'
import FigmaLogo from '@/components/FigmaLogo'
import EventSponsorsTab from '@/components/EventSponsorsTab'
import { useFocusRefresh } from '@/hooks/useFocusRefresh'

const CATEGORY_LABELS = {
  bar: 'Bar', food: 'Food', vip: 'VIP', happy_hour: 'Happy Hour', custom: 'Custom',
}
const CATEGORIES = Object.keys(CATEGORY_LABELS)
const EVENT_PHASES = ['build', 'proof', 'print_prep', 'approved', 'archived']
const MENU_PHASES  = ['build', 'proof', 'print_prep', 'approved']
const PHASE_LABELS = {
  build: 'Build', proof: 'Proof', print_prep: 'Print Prep',
  approved: 'Approved', archived: 'Archived',
}

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
                { label: 'Section',    value: colorSection,   set: setColorSection   },
                { label: 'Title',      value: colorTitle,     set: setColorTitle     },
                { label: 'Desc',       value: colorDesc,      set: setColorDesc      },
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
                        : 'bg-white text-ink-600 border-surface-200 hover:border-brand-300'
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

// ── Main page ────────────────────────────────────────────────────────────────
export default function EventPage() {
  const { brandSlug, seriesSlug, eventSlug } = useParams()
  const { isAdmin, isInternal } = useAuth()
  const navigate = useNavigate()
  const canEdit = isAdmin || isInternal

  const [brand, setBrand]   = useState(null)
  const [series, setSeries] = useState(null)
  const [event, setEvent]   = useState(null)
  const [menus, setMenus]   = useState([])
  const [sponsors, setSponsors] = useState([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState('menus') // 'menus' | 'sponsors' | 'templates'
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
  const [editFigmaPage, setEditFigmaPage]   = useState('')
  const [editIconUrl, setEditIconUrl]       = useState(null)
  const [editIconName, setEditIconName]     = useState(null)
  const [editSaving, setEditSaving]         = useState(false)
  const [editError, setEditError]           = useState(null)

  // New menu modal
  const [showNewMenu, setShowNewMenu]     = useState(false)
  const [menuName, setMenuName]           = useState('')
  const [menuSlugField, setMenuSlugField] = useState('')
  const [menuCategory, setMenuCategory]   = useState('bar')
  const [menuPhase, setMenuPhase]         = useState('build')
  const [menuSize, setMenuSize]           = useState('lg')
  const [saving, setSaving]               = useState(false)
  const [saveError, setSaveError]         = useState(null)

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
    const { data: brandData } = await supabase.from('brands').select('id,name,slug,color,notify_user_ids').eq('slug', brandSlug).single()
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
        supabase.from('menus').select('*, menu_items(id, edit_status)').eq('event_id', eventData.id).order('category').order('name'),
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
    setEditFigmaPage(event.figma_page_name || '')
    setEditIconUrl(event.icon_url || null)
    setEditIconName(event.icon_name || null)
    setEditError(null)
    setShowEditEvent(true)
  }

  async function handleSaveEvent(e) {
    e.preventDefault()
    setEditSaving(true); setEditError(null)
    const patch = {
      name:            editName.trim(),
      slug:            slugify(editSlug),
      event_date:      editDate || null,
      venue:           editVenue.trim() || null,
      phase:           editPhase,
      figma_file_url:  editFigmaUrl.trim() || null,
      figma_page_name: editFigmaPage.trim() || null,
      icon_url:        editIconUrl,
      icon_name:       editIconName,
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

  if (loading) return <div className="px-8 py-8 text-sm text-ink-400">Loading…</div>
  if (!event) return <div className="px-8 py-8 text-sm text-red-500">Event not found.</div>

  const baseUrl = `/brands/${brandSlug}/series/${seriesSlug}/events/${eventSlug}`

  return (
    <PageScreen
      breadcrumbs={[
        { label: brand?.name, to: `/brands/${brandSlug}` },
        { label: series?.name, to: `/brands/${brandSlug}/series/${seriesSlug}` },
        { label: event.name },
      ]}
      actions={<>
        <FavoriteButton type="event" id={event.id} size="sm" />
        <PhaseBadge
          phase={event.phase}
          onChange={canEdit ? async (next) => { await supabase.from('events').update({ phase: next }).eq('id', event.id); loadData() } : null}
        />
      </>}
      secondaryActions={(<>
        {event.figma_file_url && (
          <a href={event.figma_file_url} target="_blank" rel="noreferrer" className="btn-secondary btn-sm gap-1.5">
            <FigmaLogo size={12} />
            Open Figma
          </a>
        )}
        {canEdit && (
          <button onClick={openEditEvent} className="btn-secondary btn-sm">Edit Event</button>
        )}
      </>)}
      below={(
        <div className="flex items-center gap-0 overflow-x-auto overflow-y-hidden touch-pan-x overscroll-x-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
          {[
            { id: 'menus',     label: `Menus (${menus.length})` },
            { id: 'preview',   label: 'Preview all' },
            { id: 'sponsors',  label: `Sponsors (${sponsors.length})` },
            // Templates + Styles are the design system / brand setup —
            // editors only need menus + previews. Hide unless admin.
            ...(isAdmin ? [
              { id: 'templates', label: 'Templates' },
              { id: 'styles',    label: 'Styles' },
            ] : []),
            { id: 'signoff', label: 'Approvals' },
          ].map(t => (
            <button
              key={t.id}
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-ink-700">Menus</h2>
            {canEdit && (
              <div className="flex items-center gap-2">
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv"
                  multiple
                  className="hidden"
                  onChange={handleCsvFilesSelected}
                />
                <button
                  onClick={() => csvInputRef.current?.click()}
                  className="btn-secondary btn-sm">
                  ↑ Import CSVs
                </button>
                <button
                  onClick={() => { setMenuName(''); setMenuSlugField(''); setMenuCategory('bar'); setMenuPhase('build'); setMenuSize('lg'); setSaveError(null); setShowNewMenu(true) }}
                  className="btn-secondary btn-sm gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  New Menu
                </button>
              </div>
            )}
          </div>

          {menus.length === 0 ? (
            <div className="card px-6 py-8 text-center">
              <p className="text-sm text-ink-400 mb-3">No menus yet for this event.</p>
              {canEdit && (
                <button onClick={() => setShowNewMenu(true)} className="btn-primary btn-sm">Add First Menu</button>
              )}
            </div>
          ) : (
            // Compact, scannable list of menu titles + meta. Visual previews
            // live on the "Preview all" tab to keep this view uncluttered.
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {menus.map(menu => {
                const items = menu.menu_items || []
                const pendingCount = items.filter(i => i.edit_status === 'pending_approval').length
                const everSynced  = !!menu.last_synced_at
                const syncNeeded  = everSynced && menu.updated_at && new Date(menu.updated_at) > new Date(menu.last_synced_at)
                return (
                  <Link
                    key={menu.id}
                    to={`${baseUrl}/menus/${menu.slug}`}
                    className="card p-5 hover:shadow-md hover:border-brand-100 transition-all group flex flex-col"
                  >
                    <div className="flex items-start justify-between mb-3 gap-2">
                      <h3 className="font-medium text-ink-900 group-hover:text-brand-600 transition-colors flex-1 min-w-0">{menu.name}</h3>
                      <PhaseBadge phase={menu.phase} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-ink-400">
                      <span className="capitalize">{CATEGORY_LABELS[menu.category] || menu.category}</span>
                      <span>·</span>
                      <span>{items.length} items</span>
                      <span className="ml-auto flex items-center gap-1.5">
                        {pendingCount > 0 && (
                          <span
                            className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold"
                            title={`${pendingCount} pending edit${pendingCount === 1 ? '' : 's'}`}
                          >
                            {pendingCount}
                          </span>
                        )}
                        <SyncChip everSynced={everSynced} syncNeeded={syncNeeded} lastSyncedAt={menu.last_synced_at} />
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── PREVIEW ALL TAB ── all menus in the event tiled at large scale. */}
      {tab === 'preview' && (
        <>
          {menus.length === 0 ? (
            <div className="card px-6 py-8 text-center">
              <p className="text-sm text-ink-400">No menus to preview yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {menus.map(menu => {
                const items = menu.menu_items || []
                const pendingCount = items.filter(i => i.edit_status === 'pending_approval').length
                const everSynced  = !!menu.last_synced_at
                const syncNeeded  = everSynced && menu.updated_at && new Date(menu.updated_at) > new Date(menu.last_synced_at)
                return (
                  <Link
                    key={menu.id}
                    to={`${baseUrl}/menus/${menu.slug}`}
                    className="card overflow-hidden hover:shadow-md hover:border-brand-100 transition-all group flex flex-col"
                  >
                    <div className="relative w-full aspect-[2/3] bg-surface-50 border-b border-surface-100 overflow-hidden">
                      {menu.preview_image_url ? (
                        <img
                          src={menu.preview_image_url}
                          alt={menu.name}
                          className="w-full h-full object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-ink-300 text-xs gap-1 p-4 text-center">
                          <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4-4 4 4 4-4 4 4M4 16V8a2 2 0 012-2h12a2 2 0 012 2v8M4 16h16" />
                          </svg>
                          <span>Sync this menu to see a preview</span>
                        </div>
                      )}
                      <div className="absolute top-2 right-2 flex items-center gap-1.5">
                        {pendingCount > 0 && (
                          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold shadow"
                                title={`${pendingCount} pending edit${pendingCount === 1 ? '' : 's'}`}>
                            {pendingCount}
                          </span>
                        )}
                        <SyncChip everSynced={everSynced} syncNeeded={syncNeeded} lastSyncedAt={menu.last_synced_at} />
                      </div>
                    </div>
                    <div className="px-4 py-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium text-ink-900 group-hover:text-brand-600 transition-colors truncate">{menu.name}</h3>
                        <div className="text-[11px] text-ink-400 capitalize">{CATEGORY_LABELS[menu.category] || menu.category} · {items.length} items</div>
                      </div>
                      <PhaseBadge phase={menu.phase} />
                    </div>
                  </Link>
                )
              })}
            </div>
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
      {tab === 'templates' && isAdmin && (
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
      {tab === 'styles' && isAdmin && (
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
          <ApproversPanel targetType="event" targetId={event.id} title="Event approvals" />
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
        </div>
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
              <label className="label">Figma Page Name <span className="text-ink-400 font-normal">(must match exactly)</span></label>
              <input className="input font-mono text-sm" value={editFigmaPage}
                onChange={e => setEditFigmaPage(e.target.value)}
                placeholder="e.g. CF Spring 26" />
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
                          <div className="bg-white border border-surface-200 rounded-lg px-3 py-2.5 text-xs space-y-1.5">
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
      </PageBody>
    </PageScreen>
  )
}
