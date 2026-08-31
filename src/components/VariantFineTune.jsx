/**
 * VariantFineTune — quick per-size fit controls for a menu variant.
 *
 * Scales the whole content or individual sections (header / middle / footer)
 * and nudges the top and footer up/down. Writes to menu_variants.layout_adjust.
 * Changes preview live (via onLive) and auto-save is debounced. These are visual
 * transforms for a fast fit — they don't reflow the layout.
 */
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const DEFAULTS = {
  content_scale: 1, header_scale: 1, body_scale: 1, footer_scale: 1,
  header_offset: 0, footer_offset: 0,
}

const SCALES = [
  ['content_scale', 'Overall'],
  ['header_scale', 'Header'],
  ['body_scale', 'Middle'],
  ['footer_scale', 'Footer'],
]
const OFFSETS = [
  ['header_offset', 'Move top', -400, 400],
  ['footer_offset', 'Move footer', -400, 400],
]

function isDefault(a) {
  return SCALES.every(([k]) => (a[k] ?? 1) === 1) && OFFSETS.every(([k]) => (a[k] ?? 0) === 0)
}

export default function VariantFineTune({ variant, onLive, onSaved }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ ...DEFAULTS, ...(variant.layout_adjust || {}) })
  const [savedAt, setSavedAt] = useState(null)
  const timer = useRef(null)

  // Re-sync when switching to a different variant.
  useEffect(() => {
    setDraft({ ...DEFAULTS, ...(variant.layout_adjust || {}) })
  }, [variant.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function scheduleSave(next) {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const payload = isDefault(next) ? null : next
      const { error } = await supabase.from('menu_variants')
        .update({ layout_adjust: payload, updated_at: new Date().toISOString() })
        .eq('id', variant.id)
      if (!error) { setSavedAt(Date.now()); onSaved?.() }
    }, 500)
  }

  function set(key, value) {
    const next = { ...draft, [key]: value }
    setDraft(next)
    onLive?.(variant.size, next)
    scheduleSave(next)
  }

  function reset() {
    const next = { ...DEFAULTS }
    setDraft(next)
    onLive?.(variant.size, next)
    scheduleSave(next)
  }

  const dirty = !isDefault(draft)

  return (
    <div className="mb-4 rounded-lg border border-surface-200 bg-surface-50">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <span className="text-sm font-medium text-ink-800">
          Fine-tune this size
          {dirty && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-brand-700 bg-brand-50 rounded px-1.5 py-0.5">adjusted</span>}
        </span>
        <svg className={`w-4 h-4 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3">
          <p className="text-[11px] text-ink-400">
            Quick visual fit for this size only — scale sections and nudge the top/footer. Doesn’t change the primary size.
          </p>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {SCALES.map(([key, label]) => (
              <label key={key} className="block">
                <span className="flex items-center justify-between text-xs text-ink-600 mb-1">
                  {label}<span className="font-mono text-ink-400">{Math.round((draft[key] ?? 1) * 100)}%</span>
                </span>
                <input
                  type="range" min="0.5" max="1.2" step="0.01"
                  value={draft[key] ?? 1}
                  onChange={e => set(key, Number(e.target.value))}
                  className="w-full"
                />
              </label>
            ))}
            {OFFSETS.map(([key, label, min, max]) => (
              <label key={key} className="block">
                <span className="flex items-center justify-between text-xs text-ink-600 mb-1">
                  {label}<span className="font-mono text-ink-400">{draft[key] ?? 0}px</span>
                </span>
                <input
                  type="range" min={min} max={max} step="2"
                  value={draft[key] ?? 0}
                  onChange={e => set(key, Number(e.target.value))}
                  className="w-full"
                />
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-ink-300">{savedAt ? 'Saved' : 'Auto-saves as you adjust'}</span>
            <button
              type="button"
              onClick={reset}
              disabled={!dirty}
              className="btn-secondary btn-sm whitespace-nowrap disabled:opacity-40"
            >
              Reset to 100%
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
