import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Quick-status chip for the Preview-all tab. Shows the menu's phase; for users
// who can approve, clicking opens a menu to set any phase, flag/clear a sponsor
// check, or add feedback. Portaled so the card's overflow-hidden doesn't clip it.

const PHASE_CLASSES = {
  build:    'bg-surface-200 text-ink-600',
  proof:    'bg-blue-100 text-blue-800',
  edits:    'bg-red-100 text-red-700',
  approved: 'bg-emerald-100 text-emerald-800',
  exported: 'bg-indigo-100 text-indigo-800',
  complete: 'bg-teal-100 text-teal-800',
  archived: 'bg-surface-200 text-ink-500',
}
const PHASE_LABELS = {
  build: 'Build', proof: 'Proof', edits: 'Edits', approved: 'Approved',
  exported: 'Exported', complete: 'Complete', archived: 'Archived',
}
// The quick-set phases offered on the chip.
const PHASES = ['build', 'proof', 'edits', 'approved', 'exported', 'complete', 'archived']

export default function ReviewChip({ phase, needsSponsorCheck, approveBlockedReason, onSetPhase, onFlagSponsors, onMarkSponsorsChecked, onFeedback }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)

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
  const stop = (e) => { e.preventDefault(); e.stopPropagation() }
  const choose = (e, fn) => { stop(e); setOpen(false); fn && fn() }

  return (
    <span className="inline-block" onClick={stop}>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { stop(e); if (!open) place(); setOpen(o => !o) }}
        className={`phase-badge ${cls} hover:opacity-80 cursor-pointer inline-flex items-center gap-1 pr-1.5`}
        title="Set status"
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
          className="bg-surface-0 border border-surface-200 rounded-lg shadow-lg overflow-hidden min-w-[170px] flex flex-col py-1"
        >
          <div className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">Status</div>
          {PHASES.map(p => {
            const blocked = p === 'approved' && approveBlockedReason
            return (
              <button key={p} type="button" disabled={!!blocked}
                onClick={(e) => choose(e, () => { if (!blocked && p !== phase) onSetPhase(p) })}
                title={blocked ? `Can't approve — ${approveBlockedReason}` : ''}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs text-left ${blocked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-surface-50'} ${p === phase ? 'font-semibold text-ink-900' : 'text-ink-700'}`}>
                <span className={`phase-badge ${PHASE_CLASSES[p]} text-[10px]`}>{PHASE_LABELS[p]}</span>
                {blocked && <span className="ml-auto text-[9px] text-red-500 normal-case">{approveBlockedReason}</span>}
                {p === phase && !blocked && <span className="ml-auto text-brand-500">✓</span>}
              </button>
            )
          })}
          <div className="border-t border-surface-100 my-1" />
          {needsSponsorCheck ? (
            <button type="button" onClick={(e) => choose(e, onMarkSponsorsChecked)}
              className="text-left px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 whitespace-nowrap">
              ✓ Mark sponsors checked
            </button>
          ) : (
            <button type="button" onClick={(e) => choose(e, onFlagSponsors)}
              className="text-left px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 whitespace-nowrap">
              ⚑ Check sponsors
            </button>
          )}
          <div className="border-t border-surface-100 my-1" />
          <button type="button" onClick={(e) => choose(e, onFeedback)}
            className="text-left px-3 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 whitespace-nowrap">
            💬 Add feedback…
          </button>
        </div>,
        document.body
      )}
    </span>
  )
}
