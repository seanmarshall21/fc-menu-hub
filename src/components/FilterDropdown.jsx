import { useEffect, useRef, useState } from 'react'

/**
 * Compact multi-select dropdown for table/grid filters.
 *
 * Props:
 *   label    — shown when nothing is selected (e.g. "All types")
 *   options  — [{ value, label, count? }]
 *   selected — array of selected values ([] = "all", shows `label`)
 *   onChange — (nextArray) => void
 *
 * Selecting nothing means "all" (no filter). The trigger summarizes the
 * active selection; a checkmark list opens below. Closes on outside click.
 */
export default function FilterDropdown({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const sel = selected || []
  function toggle(value) {
    onChange(sel.includes(value) ? sel.filter(v => v !== value) : [...sel, value])
  }

  // Trigger summary: label when empty, the single label when one, else "N selected".
  let summary = label
  if (sel.length === 1) {
    const o = options.find(x => x.value === sel[0])
    summary = o ? o.label : label
  } else if (sel.length > 1) {
    summary = `${sel.length} selected`
  }
  const active = sel.length > 0

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap transition-colors ${
          active
            ? 'bg-brand-50 border-brand-300 text-brand-700'
            : 'bg-white border-surface-300 text-ink-600 hover:border-brand-300'
        }`}
      >
        {summary}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 min-w-[180px] bg-white border border-surface-200 rounded-lg shadow-lg py-1">
          {active && (
            <button
              type="button"
              onClick={() => { onChange([]); }}
              className="w-full text-left px-3 py-1.5 text-xs text-ink-400 hover:bg-surface-50 border-b border-surface-100"
            >
              Clear · show all
            </button>
          )}
          {options.map(o => {
            const on = sel.includes(o.value)
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-ink-700 hover:bg-surface-50"
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                  on ? 'bg-brand-500 border-brand-500 text-white' : 'border-surface-300'
                }`}>
                  {on && (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="flex-1 text-left">{o.label}</span>
                {o.count != null && <span className="text-ink-400">{o.count}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
