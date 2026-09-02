import { useEffect } from 'react'
import { createPortal } from 'react-dom'

// Width presets. Full literals so Tailwind keeps them. On mobile every modal is
// full-width (w-full) up to its cap, so these only widen on larger screens.
const SIZES = {
  sm: 'max-w-md',    // confirms, short forms (default)
  md: 'max-w-lg',
  lg: 'max-w-2xl',   // multi-field forms
  xl: 'max-w-4xl',   // long / two-column forms (Edit Event, Import)
  '2xl': 'max-w-6xl',
}

export default function Modal({ title, onClose, children, size = 'sm' }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Render directly into document.body so we escape any parent that has
  // position:fixed / overflow:hidden / stacking-context interference.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 24px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
      }}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={`relative bg-surface-0 rounded-xl shadow-xl w-full ${SIZES[size] || SIZES.sm} max-h-full overflow-y-auto z-10`}>
        <div className="sticky top-0 bg-surface-0 px-6 pt-5 pb-3 border-b border-surface-100 flex items-center justify-between z-10">
          <h2 className="text-base font-semibold text-ink-900">{title}</h2>
          <button onClick={onClose} className="btn-ghost btn-sm p-1.5 -mr-1" aria-label="Close">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5">
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
