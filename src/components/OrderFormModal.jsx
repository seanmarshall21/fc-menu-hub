import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal'
import { menuPreviewSrc } from '@/lib/menuPreview'

const SHARE_GRADIENT = 'linear-gradient(135deg, #FFD54F 0%, #FFB300 50%, #FB8C00 100%)'
const LAYOUTS = [
  { value: 'both', label: 'Both' },
  { value: 'gallery', label: 'Gallery' },
  { value: 'list', label: 'Simple list' },
]

// Build a printable order form from the chosen menus: a quantity per menu + a
// layout, snapshotted into a public /share/:id page (kind=order).
export default function OrderFormModal({ menus, event, busy, onCreate, onClose }) {
  const open = Array.isArray(menus) && menus.length > 0
  const [qty, setQty] = useState({})
  const [layout, setLayout] = useState('both')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [neededBy, setNeededBy] = useState('')

  useEffect(() => {
    if (!open) return
    // Mirror each menu's saved quantity as the starting value.
    setQty(Object.fromEntries(menus.map(m => [m.id, m.quantity != null ? String(m.quantity) : ''])))
    setLayout('both')
    setTitle(event?.name ? `${event.name} — Order` : 'Menu order')
    setNotes('')
    setNeededBy('')
  }, [open, menus, event])

  const eventDate = event?.event_date
    ? new Date(event.event_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  const total = useMemo(
    () => (menus || []).reduce((n, m) => n + (Number(qty[m.id]) || 0), 0),
    [menus, qty],
  )
  if (!open) return null

  return (
    <Modal title="Build order form" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} className="input w-full text-sm" />
          {(eventDate || event?.venue) && (
            <p className="mt-1 text-[11px] text-ink-400">{eventDate}{eventDate && event?.venue ? ' · ' : ''}{event?.venue || ''} — included on the order form.</p>
          )}
        </div>

        <div>
          <label className="label">Order needed by <span className="text-ink-300 font-normal">(optional)</span></label>
          <input type="date" value={neededBy} onChange={e => setNeededBy(e.target.value)} className="input w-full text-sm" />
        </div>

        <div>
          <label className="label">Layout</label>
          <div className="inline-flex rounded-lg border border-surface-300 overflow-hidden text-xs">
            {LAYOUTS.map((o, i) => (
              <button
                key={o.value}
                onClick={() => setLayout(o.value)}
                className={`px-3 py-1.5 font-medium ${i > 0 ? 'border-l border-surface-300 ' : ''}${layout === o.value ? 'bg-ink-900 text-surface-0' : 'text-ink-500 hover:bg-surface-50'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-ink-400">Gallery shows the menu images; simple list is just names + quantities.</p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="label mb-0">Quantities</label>
            <span className="text-[11px] text-ink-400">{menus.length} menu{menus.length === 1 ? '' : 's'} · {total} total</span>
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-surface-200 divide-y divide-surface-100">
            {menus.map(m => {
              const img = menuPreviewSrc(m)
              return (
                <div key={m.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="w-8 h-10 rounded bg-surface-100 overflow-hidden flex-shrink-0">
                    {img && <img src={img} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-ink-900 truncate">{m.name}</p>
                    <p className="text-[10px] text-ink-400 uppercase tracking-wide">{m.category || ''}{m.size ? ` · ${m.size}` : ''}</p>
                  </div>
                  <input
                    type="number" min="0" inputMode="numeric"
                    value={qty[m.id] ?? ''}
                    onChange={e => setQty(q => ({ ...q, [m.id]: e.target.value }))}
                    className="input w-20 text-sm text-right flex-shrink-0"
                  />
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <label className="label">Notes <span className="text-ink-300 font-normal">(optional)</span></label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="Delivery date, vendor, special instructions…" className="input w-full text-sm resize-none" />
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
          <button
            onClick={() => onCreate({ quantities: qty, layout, title, notes, neededBy })}
            disabled={busy}
            className="btn-sm whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-black text-xs font-semibold disabled:opacity-50 hover:brightness-105 transition"
            style={{ background: SHARE_GRADIENT }}
          >
            {busy ? 'Creating…' : 'Create order form'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
