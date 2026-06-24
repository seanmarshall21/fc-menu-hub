import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Small menu-size chip (SM/MD/LG). When onChange is provided, clicking opens a
// portal dropdown to switch the size quickly. The portal avoids clipping by a
// card's overflow-hidden. Read-only (no dropdown) when onChange is omitted.

const SIZES = [
  { value: 'sm', short: 'SM', label: 'Small' },
  { value: 'md', short: 'MD', label: 'Medium' },
  { value: 'lg', short: 'LG', label: 'Large' },
]

export default function SizeChip({ size, onChange }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  const current = SIZES.find(s => s.value === size)
  const short = current?.short || (size ? String(size).toUpperCase() : '—')

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

  const stop = (e) => { e.preventDefault(); e.stopPropagation() }
  const cls = 'inline-flex items-center rounded-full bg-surface-100 text-ink-600 text-[10px] font-semibold px-1.5 h-[18px] whitespace-nowrap'

  if (!onChange) return <span className={cls} title="Menu size">{short}</span>

  return (
    <span className="inline-block" onClick={stop}>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { stop(e); if (!open) place(); setOpen(o => !o) }}
        className={`${cls} gap-0.5 hover:bg-surface-200 cursor-pointer`}
        title="Change menu size"
      >
        {short}
        <svg className="w-2.5 h-2.5 opacity-60" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          onClick={stop}
          style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 60 }}
          className="bg-white border border-surface-200 rounded-lg shadow-lg overflow-hidden min-w-[120px] flex flex-col"
        >
          {SIZES.map(s => (
            <button
              key={s.value}
              type="button"
              onClick={(e) => { stop(e); setOpen(false); if (s.value !== size) onChange(s.value) }}
              className={`text-left px-3 py-1.5 text-xs font-medium hover:bg-surface-50 whitespace-nowrap ${s.value === size ? 'bg-surface-50 text-brand-700' : 'text-ink-700'}`}
            >
              <span className="inline-block w-7 text-[10px] font-semibold text-ink-400">{s.short}</span>
              {s.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </span>
  )
}
