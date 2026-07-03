import { useState } from 'react'
import Modal from '@/components/Modal'

const SHARE_GRADIENT = 'linear-gradient(135deg, #FFD54F 0%, #FFB300 50%, #FB8C00 100%)'

// Library of order forms already made for this event (by anyone). View/send an
// existing one, edit it, or start a new one.
export default function OrderLibraryModal({ open, loading, orders, onNew, onEdit, onDelete, onClose }) {
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
              <div className="flex items-center gap-1 flex-shrink-0">
                <a href={urlFor(o.id)} target="_blank" rel="noreferrer" className="btn-secondary btn-sm px-2" title="View" aria-label="View order form">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </a>
                <button
                  onClick={() => { try { navigator.clipboard?.writeText(urlFor(o.id)) } catch (_) {} setCopiedId(o.id) }}
                  className="btn-secondary btn-sm px-2" title={copiedId === o.id ? 'Copied' : 'Copy link'} aria-label="Copy link"
                >
                  {copiedId === o.id
                    ? <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    : <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>}
                </button>
                <button onClick={() => onEdit(o)} className="btn-secondary btn-sm px-2" title="Edit" aria-label="Edit order form">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                <button
                  onClick={() => { if (confirm('Delete this order form? The link will stop working.')) onDelete(o) }}
                  className="btn-secondary btn-sm px-2 text-red-600 hover:bg-red-50"
                  title="Delete" aria-label="Delete order form"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m1 0-.5 12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6.5 7" /></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
