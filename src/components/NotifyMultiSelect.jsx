import { useEffect, useRef, useState } from 'react'

/**
 * Compact dropdown multi-select for "Notify for edits" — replaces the tall
 * wrap-around chip grid. Shows a summary line; opens a searchable checkbox
 * list. Self is shown disabled (can't notify yourself).
 *
 * Props: options [{id, full_name, email}], selectedIds (Set), onToggle(id),
 *        selfId, label.
 */
export default function NotifyMultiSelect({ options = [], selectedIds, onToggle, selfId, label = 'Notify for edits' }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const count = selectedIds?.size || 0
  const selectedNames = options.filter(u => selectedIds?.has(u.id)).map(u => u.full_name || u.email)
  const summary = count === 0 ? 'No one' : (count <= 2 ? selectedNames.join(', ') : `${count} people`)
  const needle = q.trim().toLowerCase()
  const filtered = needle
    ? options.filter(u => `${u.full_name || ''} ${u.email || ''}`.toLowerCase().includes(needle))
    : options

  return (
    <div className="mb-3" ref={ref}>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-semibold text-ink-700">{label}</label>
        <span className="text-[10px] text-ink-400">
          {count === 0 ? 'No one will be notified' : `${count} selected`}
        </span>
      </div>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="input w-full text-left text-xs flex items-center justify-between gap-2"
        >
          <span className={`truncate ${count ? 'text-ink-700' : 'text-ink-400'}`}>{summary}</span>
          <svg className={`w-3.5 h-3.5 text-ink-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {open && (
          <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-surface-0 border border-surface-200 rounded-lg shadow-lg overflow-hidden">
            <div className="p-1.5 border-b border-surface-100">
              <input
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search people…"
                className="input input-sm w-full text-xs"
              />
            </div>
            <div className="max-h-52 overflow-y-auto py-1">
              {filtered.length === 0 && <div className="px-3 py-2 text-xs text-ink-300">No matches</div>}
              {filtered.map(u => {
                const active = selectedIds?.has(u.id)
                const isSelf = u.id === selfId
                return (
                  <button
                    key={u.id}
                    type="button"
                    disabled={isSelf}
                    onClick={() => onToggle(u.id)}
                    title={isSelf ? "You can't notify yourself" : (u.email || '')}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left ${isSelf ? 'opacity-40 cursor-not-allowed' : 'hover:bg-surface-50'}`}
                  >
                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${active ? 'bg-brand-500 border-brand-500 text-white' : 'border-surface-300'}`}>
                      {active && (
                        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                      )}
                    </span>
                    <span className="truncate text-ink-700">{u.full_name || u.email}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
