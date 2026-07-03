import { useEffect, useState } from 'react'
import Modal from '@/components/Modal'
import { preloadDropbox, chooseFromDropbox, dropboxConfigured } from '@/lib/dropboxChooser'

// Connect a menu's print file without leaving Menu Hub: pick it straight from
// Dropbox (link fills in and saves itself), or paste a link. Props:
//   open, initialUrl, title, onSave(url|null), onClose
export default function PrintFileModal({ open, initialUrl = '', title = 'Print file', onSave, onClose }) {
  const [url, setUrl] = useState(initialUrl)
  useEffect(() => { if (open) { setUrl(initialUrl || ''); preloadDropbox() } }, [open, initialUrl])
  if (!open) return null

  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm text-ink-500 mb-4">
        {dropboxConfigured()
          ? 'Pick the PDF straight from Dropbox, or paste a link.'
          : 'Paste a link to the final print file.'}
      </p>

      {dropboxConfigured() && (
        <button
          onClick={() => chooseFromDropbox({ onSuccess: (link) => onSave(link) })}
          className="w-full mb-3 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-black text-sm font-semibold shadow-sm hover:brightness-105 transition"
          style={{ background: 'linear-gradient(135deg, #FFD54F 0%, #FFB300 50%, #FB8C00 100%)' }}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M6 2 0 6l6 4 6-4-6-4Zm12 0-6 4 6 4 6-4-6-4ZM0 14l6 4 6-4-6-4-6 4Zm18-4-6 4 6 4 6-4-6-4ZM6 19.5l6 4 6-4-6-4-6 4Z" />
          </svg>
          Choose from Dropbox
        </button>
      )}

      {dropboxConfigured() && (
        <div className="flex items-center gap-2 my-3 text-[11px] text-ink-300 uppercase tracking-wide">
          <span className="h-px bg-surface-200 flex-1" /> or paste a link <span className="h-px bg-surface-200 flex-1" />
        </div>
      )}

      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…link to the final print file"
        className="input w-full text-sm"
        autoFocus={!dropboxConfigured()}
      />

      <div className="flex items-center justify-end gap-2 mt-5">
        <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
        <button onClick={() => onSave(url.trim() || null)} className="btn-primary btn-sm">Save</button>
      </div>
    </Modal>
  )
}
