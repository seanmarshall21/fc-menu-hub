import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Inline Lucide-style line icons (this project inlines SVGs; no icon package).
function Icon({ path, className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {path}
    </svg>
  )
}
const MoreVertical = (p) => <Icon {...p} path={<><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></>} />
const Plus   = (p) => <Icon {...p} path={<path d="M12 5v14M5 12h14" />} />
const Pencil = (p) => <Icon {...p} path={<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>} />
const Copy   = (p) => <Icon {...p} path={<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>} />
const ArrowUp   = (p) => <Icon {...p} path={<path d="M12 19V5M5 12l7-7 7 7" />} />
const ArrowDown = (p) => <Icon {...p} path={<path d="M12 5v14M19 12l-7 7-7-7" />} />
const Trash2 = (p) => <Icon {...p} path={<><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M10 11v6M14 11v6" /></>} />

/**
 * Three-dot actions menu for a menu section. Portal dropdown so the table's
 * overflow can't clip it. Actions: add item, rename, duplicate, move, delete.
 * Move up/down live here too, keeping the section header uncluttered.
 */
export default function SectionActionsMenu({
  onAddItem, onRename, onDuplicate, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown,
}) {
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

  const run = (fn) => { setOpen(false); fn?.() }
  const Item = ({ icon: Icon, label, onClick, disabled, danger }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => run(onClick)}
      className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs font-medium whitespace-nowrap disabled:opacity-30 disabled:cursor-default ${danger ? 'text-red-600 hover:bg-red-50' : 'text-ink-700 hover:bg-surface-50'}`}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" /> {label}
    </button>
  )

  return (
    <span className="inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => { if (!open) place(); setOpen(o => !o) }}
        className="text-ink-300 hover:text-ink-600 p-1 rounded hover:bg-surface-100 transition-colors"
        title="Section actions"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 60 }}
          className="bg-surface-0 border border-surface-200 rounded-lg shadow-lg overflow-hidden min-w-[160px] py-1 flex flex-col"
        >
          <Item icon={Plus}   label="Add item"  onClick={onAddItem} />
          <Item icon={Pencil} label="Rename"    onClick={onRename} />
          <Item icon={Copy}   label="Duplicate" onClick={onDuplicate} />
          <div className="my-1 border-t border-surface-100" />
          <Item icon={ArrowUp}   label="Move up"   onClick={onMoveUp}   disabled={!canMoveUp} />
          <Item icon={ArrowDown} label="Move down" onClick={onMoveDown} disabled={!canMoveDown} />
          <div className="my-1 border-t border-surface-100" />
          <Item icon={Trash2} label="Delete section" onClick={onDelete} danger />
        </div>,
        document.body
      )}
    </span>
  )
}
