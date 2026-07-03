import { useEffect, useRef, useState } from 'react'

// A "⋯ More" button that opens a dropdown of actions. Pass menu rows as
// children (links/buttons); style them with `className="menu-row"` or the
// shared class below. Render nothing when there are no children.
export default function OverflowMenu({ children, label = 'More', align = 'right', triggerLabel, hideChevron = false, triggerClassName, triggerStyle, triggerIcon }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  if (!children || (Array.isArray(children) && children.filter(Boolean).length === 0)) return null

  return (
    <span className="relative inline-block" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} title={label} aria-haspopup="menu" aria-expanded={open}
        style={triggerStyle}
        className={triggerClassName || `btn-secondary btn-sm inline-flex items-center ${triggerLabel ? 'gap-1' : 'px-2'}`}>
        {triggerLabel
          ? <>{triggerIcon}{triggerLabel}{!hideChevron && <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>}</>
          : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>}
      </button>
      {open && (
        <span onClick={() => setOpen(false)}
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-1 z-30 bg-surface-0 border border-surface-200 rounded-lg shadow-lg overflow-hidden min-w-[180px] py-1`}>
          {children}
        </span>
      )}
    </span>
  )
}

// Shared style for menu rows inside an OverflowMenu.
export const MENU_ROW = 'flex w-full items-center gap-2 px-3 py-2 text-xs text-ink-700 hover:bg-surface-50 text-left whitespace-nowrap'
