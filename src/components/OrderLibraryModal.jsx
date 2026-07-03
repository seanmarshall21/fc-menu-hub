import { useState } from 'react'
import Modal from '@/components/Modal'

const SHARE_GRADIENT = 'linear-gradient(135deg, #FFD54F 0%, #FFB300 50%, #FB8C00 100%)'

// Library of order forms already made for this event (by anyone). View/send an
// existing one, edit it, or start a new one.
export default function OrderLibraryModal({ open, loading, orders, onNew, onEdit, onClose }) {
  const [copiedId, setCopiedId] = useState(null)
  if (!open) return null

  const urlFor = (id) => `${window.location.origin}/share/${id}`
  const totalOf = (o) => (Array.isArray(o.items) ? o.items : []).reduce((n, it) => n + (Number(it.quantity) || 0), 0)
  const fmt = (d) => { try { return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) } catch { return '' } }

  return (
    <Modal title="Order forms" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-ink-500">{loading ? 'Loading…' : `${orders.length} order form${orders.length === 1 ? '' : 's'} for this event.`}</p>
          <button onClick={onNew} className="btn-sm whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-black text-xs font-semibold hover:brightness-105 transition" style={{ background: SHARE_GRADIENT }}>
            + New order form
          </button>
        </div>

        {!loading && orders.length === 0 && (
          <p className="text-sm text-ink-400 py-4 text-center">None yet — start one with “New order form”.</p>
        )}

        <div className="divide-y divide-surface-100 max-h-80 overflow-y-auto">
          {orders.map(o => (
            <div key={o.id} className="py-2.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-900 truncate">{o.title || 'Menu order'}</p>
                <p className="text-[11px] text-ink-400">
                  {(Array.isArray(o.items) ? o.items.length : 0)} menus · {totalOf(o)} to print · {fmt(o.created_at)}
                  {o.is_live && <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold">LIVE</span>}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0 text-xs">
                <a href={urlFor(o.id)} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">View</a>
                <button
                  onClick={() => { try { navigator.clipboard?.writeText(urlFor(o.id)) } catch (_) {} setCopiedId(o.id) }}
                  className="btn-secondary btn-sm whitespace-nowrap"
                >{copiedId === o.id ? 'Copied' : 'Copy link'}</button>
                <button onClick={() => onEdit(o)} className="btn-secondary btn-sm">Edit</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
