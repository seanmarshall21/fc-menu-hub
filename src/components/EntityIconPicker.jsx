import { useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import EntityIcon from './EntityIcon'

const PRESET_ICONS = [
  // Food & drink
  'restaurant', 'local_bar', 'wine_bar', 'sports_bar', 'liquor',
  'local_cafe', 'coffee', 'emoji_food_beverage',
  'fastfood', 'lunch_dining', 'dinner_dining', 'brunch_dining', 'ramen_dining',
  'set_meal', 'kebab_dining', 'tapas', 'soup_kitchen', 'cake',
  'icecream', 'bakery_dining', 'cookie', 'breakfast_dining',
  'no_drinks', 'no_food',
  // Events / venues
  'event', 'festival', 'celebration', 'nightlife', 'music_note',
  'mic_external_on', 'theater_comedy', 'stadium', 'beach_access',
  'park', 'place', 'flag', 'calendar_today', 'today',
  // Generic
  'storefront', 'star', 'favorite', 'bookmark', 'collections_bookmark',
  'auto_awesome', 'palette', 'tag',
]

/**
 * Three-mode icon editor: Image / Symbol / None.
 *   <EntityIconPicker
 *     iconUrl={value.icon_url}
 *     iconName={value.icon_name}
 *     onChange={({ icon_url, icon_name }) => …}
 *     uploadBucket="series-assets"   // or 'brand-logos'
 *     uploadPathPrefix="series/abc"  // becomes "{prefix}/icon-{ts}.{ext}"
 *     fallbackText="CRSSD"
 *     fallbackColor="#6366f1"
 *   />
 */
export default function EntityIconPicker({
  iconUrl,
  iconName,
  onChange,
  uploadBucket = 'series-assets',
  uploadPathPrefix = 'misc',
  fallbackText,
  fallbackColor,
  disabled = false,
}) {
  const [mode, setMode] = useState(() => iconUrl ? 'image' : iconName ? 'symbol' : 'none')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [symbolQuery, setSymbolQuery] = useState('')
  const fileRef = useRef(null)

  function setImageUrl(url) {
    onChange?.({ icon_url: url || null, icon_name: null })
  }
  function setSymbol(name) {
    onChange?.({ icon_url: null, icon_name: name || null })
  }
  function clearIcon() {
    onChange?.({ icon_url: null, icon_name: null })
  }

  async function handleFile(file) {
    if (!file) return
    setUploading(true); setError(null)
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const path = `${uploadPathPrefix}/icon-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from(uploadBucket)
        .upload(path, file, { upsert: false, contentType: file.type || undefined })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from(uploadBucket).getPublicUrl(path)
      setImageUrl(pub.publicUrl)
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  function switchMode(next) {
    setMode(next)
    if (next === 'none') clearIcon()
    if (next === 'image' && !iconUrl) {/* wait for upload */ }
    if (next === 'symbol' && !iconName) {/* wait for selection */ }
  }

  const matching = symbolQuery.trim()
    ? PRESET_ICONS.filter(n => n.includes(symbolQuery.trim().toLowerCase()))
    : PRESET_ICONS

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <EntityIcon
          iconUrl={iconUrl}
          iconName={iconName}
          fallbackText={fallbackText}
          fallbackColor={fallbackColor}
          size={56}
        />
        <div className="flex-1">
          <div className="inline-flex items-center rounded-full border border-surface-300 bg-surface-100 p-0.5 text-[11px] font-medium">
            {[
              { value: 'image',  label: 'Image' },
              { value: 'symbol', label: 'Symbol' },
              { value: 'none',   label: 'None' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => switchMode(opt.value)}
                disabled={disabled}
                className={`px-2.5 py-1 rounded-full transition-colors ${
                  mode === opt.value
                    ? 'bg-surface-0 text-ink-900 shadow-sm border border-surface-200'
                    : 'text-ink-500 hover:text-ink-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {mode === 'image' && (
        <div className="space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
            disabled={disabled || uploading}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={disabled || uploading}
              className="btn-secondary btn-sm"
            >
              {uploading ? 'Uploading…' : iconUrl ? 'Replace image' : 'Upload image'}
            </button>
            {iconUrl && !uploading && (
              <button type="button" onClick={() => setImageUrl('')} className="text-xs text-red-500 hover:text-red-700" disabled={disabled}>
                Remove
              </button>
            )}
          </div>
          <p className="text-[11px] text-ink-400">PNG, JPG, SVG, or WebP. Square images work best.</p>
        </div>
      )}

      {mode === 'symbol' && (
        <div className="space-y-2">
          <input
            type="text"
            className="input input-sm"
            placeholder="Search icons (e.g. cocktail, festival)…"
            value={symbolQuery}
            onChange={e => setSymbolQuery(e.target.value)}
            disabled={disabled}
          />
          <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 max-h-48 overflow-y-auto p-1 -m-1">
            {matching.length === 0 ? (
              <p className="col-span-full text-xs text-ink-400 px-1 py-2">No icons match "{symbolQuery}".</p>
            ) : matching.map(name => (
              <button
                key={name}
                type="button"
                onClick={() => setSymbol(name)}
                disabled={disabled}
                title={name}
                className={`aspect-square rounded-lg border flex items-center justify-center transition-colors ${
                  iconName === name
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-surface-0 text-ink-600 border-surface-200 hover:border-brand-300'
                }`}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{name}</span>
              </button>
            ))}
          </div>
          {iconName && (
            <p className="text-[11px] text-ink-400">Selected: <code className="bg-surface-100 px-1 rounded">{iconName}</code></p>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}
    </div>
  )
}
