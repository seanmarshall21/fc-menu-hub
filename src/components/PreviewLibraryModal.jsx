import { useState } from 'react'
import Modal from '@/components/Modal'

const SHARE_GRADIENT = 'linear-gradient(135deg, #FFD54F 0%, #FFB300 50%, #FB8C00 100%)'

// Library of preview links already made for this event. View / copy / manage
// (recipients + options) / delete, or start a new one.
export default function PreviewLibraryModal({ open, loading, shares, onNew, onManage, onDelete, onClose }) {
  const [copiedId, setCopiedId] = useState(null)
  if (!open) return null
  const urlFor = (id) => `${window.location.origin}/share/${id}`
  const fmt = (d) => { try { return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) } catch { return '' } }

  return (
    <Modal title="Preview links" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-ink-500">{loading ? 'Loading…' : `${shares.length} preview link${shares.length === 1 ? '' : 's'} for this event.`}</p>
          <button onClick={onNew} className="btn-sm whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-black text-xs font-semibold hover:brightness-105 transition" style={{ background: SHARE_GRADIENT }}>
            + New preview link
          </button>
        </div>
        {!loading && shares.length === 0 && (
          <p className="text-sm text-ink-400 py-4 text-center">None yet — start one with “New preview link”.</p>
        )}
        <div className="divide-y divide-surface-100 max-h-80 overflow-y-auto">
          {shares.map(s => (
            <div key={s.id} className="py-2.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-900 truncate">{s.title || 'Menu previews'}</p>
                <p className="text-[11px] text-ink-400">{(Array.isArray(s.items) ? s.items.length : 0)} menus · {fmt(s.created_at)}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <a href={urlFor(s.id)} target="_blank" rel="noreferrer" className="btn-secondary btn-sm px-2" title="View" aria-label="View">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </a>
                <button onClick={() => { try { navigator.clipboard?.writeText(urlFor(s.id)) } catch (_) {} setCopiedId(s.id) }} className="btn-secondary btn-sm px-2" title={copiedId === s.id ? 'Copied' : 'Copy link'} aria-label="Copy link">
                  {copiedId === s.id
                    ? <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    : <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>}
                </button>
                <button onClick={() => onManage(s)} className="btn-secondary btn-sm px-2" title="Recipients + options" aria-label="Manage">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-1a4 4 0 00-4-4h-1m-6 5H2v-1a4 4 0 014-4h3m4-4a3 3 0 11-6 0 3 3 0 016 0zm7 1a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" /></svg>
                </button>
                <button onClick={() => { if (confirm('Delete this preview link? It will stop working.')) onDelete(s) }} className="btn-secondary btn-sm px-2 text-red-600 hover:bg-red-50" title="Delete" aria-label="Delete">
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
