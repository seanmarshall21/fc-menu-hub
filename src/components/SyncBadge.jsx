import { useEffect, useRef, useState } from 'react'
import FigmaLogo from '@/components/FigmaLogo'

// Sync status as an editable dropdown (mirrors PhaseBadge). Shows the computed
// state (Synced / Sync needed) but lets an editor override it — handy when a
// stray save flips the flag or the auto-detection misfires. The override isn't
// sticky: a later content edit re-flips it to "Sync needed", and you can set it
// back again. The menu also holds the Figma/plugin/disconnect links so there's
// no extra button cluster.
export default function SyncBadge({
  syncNeeded, everSynced, lastSyncedAt, figmaUrl, openFigma, pluginUrl,
  canEdit, onMarkSynced, onForceNeeded, onDisconnect,
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('touchstart', onDoc)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('touchstart', onDoc) }
  }, [open])

  const synced = !syncNeeded
  const pill = synced ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'
  const label = synced ? 'Synced' : 'Sync needed'
  const title = lastSyncedAt ? `Last synced ${new Date(lastSyncedAt).toLocaleString()}` : 'Never synced to Figma'

  if (!canEdit) {
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium ${pill}`} title={title}>
        <FigmaLogo variant="line" size={12} />{label}
      </span>
    )
  }

  return (
    <span className="relative inline-block" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} title={title}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium hover:opacity-80 whitespace-nowrap ${pill}`}
        aria-haspopup="menu" aria-expanded={open}>
        <FigmaLogo variant="line" size={12} />
        {label}
        <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <span className="absolute left-0 top-full mt-1 z-30 bg-white border border-surface-200 rounded-lg shadow-lg overflow-hidden min-w-[200px] text-left">
          <button type="button" onClick={() => { setOpen(false); if (syncNeeded) onMarkSynced() }}
            className={`flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-surface-50 ${synced ? 'bg-surface-50' : ''}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Synced {synced && <span className="ml-auto text-emerald-600">✓</span>}
          </button>
          <button type="button" onClick={() => { setOpen(false); if (!syncNeeded) onForceNeeded() }}
            className={`flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-surface-50 ${!synced ? 'bg-surface-50' : ''}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Sync needed {!synced && <span className="ml-auto text-amber-600">✓</span>}
          </button>
          <span className="block border-t border-surface-100" />
          {figmaUrl && (
            <a href={figmaUrl} onClick={(e) => { setOpen(false); openFigma && openFigma(e, figmaUrl) }} target="_blank" rel="noreferrer"
              className="block px-3 py-2 text-xs text-ink-600 hover:bg-surface-50">Open frame in Figma ↗</a>
          )}
          {pluginUrl && (
            <a href={pluginUrl} target="_blank" rel="noreferrer" className="block px-3 py-2 text-xs text-ink-600 hover:bg-surface-50">Get the plugin ↗</a>
          )}
          {everSynced && onDisconnect && (
            <button type="button" onClick={() => { setOpen(false); onDisconnect() }} className="block w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50">Disconnect from Figma</button>
          )}
        </span>
      )}
    </span>
  )
}
