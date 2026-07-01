import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Lightweight bottom toast so auto-saving controls (dropdowns etc.) confirm
// they actually saved. Usage: const toast = useToast(); toast('Saved')
// or toast('Could not save', { type: 'error' }).
const ToastContext = createContext(() => {})
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const seq = useRef(0)

  const toast = useCallback((message, opts = {}) => {
    const id = ++seq.current
    setToasts(t => [...t.slice(-2), { id, message, type: opts.type || 'success' }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), opts.duration || 2000)
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {createPortal(
        <div className="fixed left-1/2 -translate-x-1/2 z-[110] flex flex-col items-center gap-2 pointer-events-none"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)' }}>
          {toasts.map(t => (
            <div key={t.id}
              className={`px-3.5 py-2 rounded-full shadow-lg text-sm font-medium flex items-center gap-2 animate-[fadeIn_.15s_ease-out] ${
                t.type === 'error' ? 'bg-red-600 text-white' : 'bg-ink-900 text-white'}`}>
              {t.type === 'error'
                ? <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                : <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
              {t.message}
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
}
