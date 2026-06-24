import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Quick-review chip for the Preview-all tab. Looks like a PhaseBadge but, for
// users who can approve, clicking it opens a small menu to approve / unapprove
// the menu inline, or add feedback (which opens a modal in the parent).
//
// The menu renders in a portal with fixed positioning so it isn't clipped by
// the preview card's overflow-hidden (needed for the rounded image).

const PHASE_CLASSES = {
  build:      'bg-surface-200 text-ink-600',
  proof:      'bg-blue-100 text-blue-800',
  print_prep: 'bg-amber-100 text-amber-800',
  approved:   'bg-emerald-100 text-emerald-800',
  archived:   'bg-surface-200 text-ink-500',
}
const PHASE_LABELS = {
  build: 'Build', proof: 'Proof', print_prep: 'Print Prep', approved: 'Approved', archived: 'Archived',
}

export default function ReviewChip({ phase, onApprove, onUnapprove, onFeedback }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null) // { top, right } in viewport coords
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  // Position the menu under the chip, right-aligned. Recompute on open.
  function place() {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 6, right: window.innerWidth - r.right })
  }

  useEffect(() => {
    if (!open) return
    function onDoc(e) {
      if (btnRef.current?.contains(e.target)) return
      if (menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    // Any scroll/resize invalidates the fixed position — just close.
    function onScrollResize() { setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('touchstart', onDoc)
    window.addEventListener('scroll', onScrollResize, true)
    window.addEventListener('resize', onScrollResize)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('touchstart', onDoc)
      window.removeEventListener('scroll', onScrollResize, true)
      window.removeEventListener('resize', onScrollResize)
    }
  }, [open])

  const cls = PHASE_CLASSES[phase] || 'bg-surface-100 text-ink-500'
  const label = PHASE_LABELS[phase] || phase
  // The chip lives inside a <Link> card — stop clicks from navigating.
  const stop = (e) => { e.preventDefault(); e.stopPropagation() }

  function toggle(e) {
    stop(e)
    if (!open) place()
    setOpen(o => !o)
  }

  return (
    <span className="inline-block" onClick={stop}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={`phase-badge ${cls} hover:opacity-80 cursor-pointer inline-flex items-center gap-1 pr-1.5`}
        title="Quick review"
      >
        {label}
        <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          onClick={stop}
          style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 60 }}
          className="bg-white border border-surface-200 rounded-lg shadow-lg overflow-hidden min-w-[160px] flex flex-col"
        >
          <button type="button" onClick={(e) => { stop(e); setOpen(false); onApprove() }}
            className="text-left px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 whitespace-nowrap">
            ✓ Mark approved
          </button>
          <button type="button" onClick={(e) => { stop(e); setOpen(false); onUnapprove() }}
            className="text-left px-3 py-2 text-xs font-medium text-ink-600 hover:bg-surface-50 whitespace-nowrap">
            Mark not approved
          </button>
          <div className="border-t border-surface-100" />
          <button type="button" onClick={(e) => { stop(e); setOpen(false); onFeedback() }}
            className="text-left px-3 py-2 text-xs font-medium text-brand-600 hover:bg-brand-50 whitespace-nowrap">
            💬 Add feedback…
          </button>
        </div>,
        document.body
      )}
    </span>
  )
}
