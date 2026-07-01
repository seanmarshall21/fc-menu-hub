import { useEffect, useRef, useState } from 'react'

const PHASE_LABELS = {
  build:    'Build',
  proof:    'Proof',
  edits:    'Edits',
  approved: 'Ready to export',   // approval is a setting (the ✓ Approved button); the resulting status reads "Ready to export"
  exported: 'Exported',
  complete: 'Complete',
  archived: 'Archived',
}

// Status journey: Build (neutral) → Proof (blue, in review) → Edits (red, needs
// action) → Approved (green) → Exported (indigo, prepped/in print folder) →
// Complete (teal, printed & shipped) → Archived (gray).
const PHASE_CLASSES = {
  build:    'phase-badge bg-surface-200 text-ink-600',
  proof:    'phase-badge bg-blue-100 text-blue-800',
  edits:    'phase-badge bg-red-100 text-red-700',
  approved: 'phase-badge bg-emerald-100 text-emerald-800',
  exported: 'phase-badge bg-indigo-100 text-indigo-800',
  complete: 'phase-badge bg-teal-100 text-teal-800',
  archived: 'phase-badge bg-surface-200 text-ink-500',
}

const ALL_PHASES = ['build', 'proof', 'edits', 'approved', 'exported', 'complete', 'archived']

/**
 * Phase badge.
 *   <PhaseBadge phase="build" />
 *   <PhaseBadge phase="approved" hasPendingEdits />
 *   <PhaseBadge phase="build" onChange={(next) => save(next)} />  // clickable; opens dropdown
 */
export default function PhaseBadge({ phase, hasPendingEdits = false, onChange, options = ALL_PHASES }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('touchstart', onDoc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('touchstart', onDoc)
    }
  }, [open])

  if (!phase) return null

  const baseClass = hasPendingEdits
    ? 'phase-badge bg-red-100 text-red-700'
    : (PHASE_CLASSES[phase] || 'phase-badge bg-surface-100 text-ink-500')
  const label = hasPendingEdits ? 'Edits' : (PHASE_LABELS[phase] || phase)

  if (!onChange) {
    return <span className={baseClass}>{label}</span>
  }

  return (
    <span className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`${baseClass} hover:opacity-80 cursor-pointer inline-flex items-center gap-1 pr-1.5`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {label}
        <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <span className="absolute left-0 top-full mt-1 z-30 bg-white border border-surface-200 rounded-lg shadow-lg overflow-hidden min-w-[120px]">
          {options.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => { setOpen(false); if (p !== phase) onChange(p) }}
              className={`block w-full text-left px-3 py-1.5 text-xs font-medium hover:bg-surface-50 ${p === phase ? 'bg-surface-50' : ''}`}
            >
              <span className={`${PHASE_CLASSES[p]} mr-2`}>{PHASE_LABELS[p]}</span>
            </button>
          ))}
        </span>
      )}
    </span>
  )
}
