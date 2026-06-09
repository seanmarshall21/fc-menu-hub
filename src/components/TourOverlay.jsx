import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { TOURS, tourSeenKey } from '@/lib/tours'
import { useAuth } from '@/contexts/AuthContext'

// Shared seen-state helpers — both <TourOverlay> and useTour use them.
function getSeen(userId) {
  try {
    const raw = localStorage.getItem(tourSeenKey(userId))
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}
function setSeen(userId, key, value = true) {
  try {
    const next = { ...getSeen(userId), [key]: value }
    localStorage.setItem(tourSeenKey(userId), JSON.stringify(next))
  } catch {}
}

/**
 * Step-by-step onboarding overlay. Renders into a portal so it floats above
 * everything. Highlights the step's target element with a soft outline when
 * a CSS selector is supplied.
 *
 *   <TourOverlay tourKey="event" onClose={…} />
 *
 * Use the useTour() hook below to wire up auto-open on first visit + the
 * manual ? launcher in the page header.
 */
export default function TourOverlay({ tourKey, onClose }) {
  const tour = TOURS[tourKey]
  const { profile } = useAuth()
  const [stepIdx, setStepIdx] = useState(0)
  const [highlight, setHighlight] = useState(null) // { top, left, width, height } | null

  if (!tour) return null
  const step  = tour.steps[stepIdx]
  const isLast = stepIdx === tour.steps.length - 1

  // Compute the target highlight box each step
  useEffect(() => {
    if (!step?.target) { setHighlight(null); return }
    const el = document.querySelector(step.target)
    if (!el) { setHighlight(null); return }
    const r = el.getBoundingClientRect()
    // Add a small padding so the outline doesn't hug the element
    const pad = 6
    setHighlight({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 })
    // Try to scroll into view if off-screen
    if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [stepIdx, step?.target])

  function next() {
    if (isLast) { close(); return }
    setStepIdx(i => i + 1)
  }
  function back() { if (stepIdx > 0) setStepIdx(i => i - 1) }
  function close() {
    setSeen(profile?.id, tourKey)
    onClose?.()
  }

  // Esc to close, arrow keys to navigate
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next()
      else if (e.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stepIdx])

  return createPortal(
    <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={close}
      />
      {/* Highlight outline (rendered above backdrop, below card) */}
      {highlight && (
        <div
          className="absolute pointer-events-none border-2 border-brand-400 rounded-lg transition-all duration-200"
          style={{
            top: highlight.top, left: highlight.left,
            width: highlight.width, height: highlight.height,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)',
          }}
        />
      )}
      {/* Step card — centered, doesn't overlap highlight */}
      <div className="absolute inset-x-0 bottom-8 md:bottom-12 px-4 flex justify-center pointer-events-none">
        <div className="pointer-events-auto w-full max-w-md bg-white rounded-xl shadow-2xl border border-surface-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-surface-100 flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-brand-600">
              {tour.title} · {stepIdx + 1} / {tour.steps.length}
            </div>
            <button onClick={close} className="text-ink-400 hover:text-ink-700 text-xs">Skip ↘</button>
          </div>
          <div className="px-5 py-4">
            <h3 className="text-base font-semibold text-ink-900 mb-1">{step.title}</h3>
            <p className="text-sm text-ink-600 leading-relaxed">{step.body}</p>
          </div>
          <div className="px-5 py-3 border-t border-surface-100 flex items-center justify-between gap-2 bg-surface-50">
            <div className="flex gap-1">
              {tour.steps.map((_, i) => (
                <span
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full ${i === stepIdx ? 'bg-brand-500' : i < stepIdx ? 'bg-brand-300' : 'bg-surface-300'}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {stepIdx > 0 && (
                <button onClick={back} className="btn-secondary btn-sm">Back</button>
              )}
              <button onClick={next} className="btn-primary btn-sm">
                {isLast ? 'Got it' : 'Next →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// Hook returns { open, close, hasSeen, autoOpenIfNew }. Call autoOpenIfNew()
// from a useEffect on page mount; it'll open the tour the first time a given
// user visits that page.
export function useTour(tourKey) {
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)

  function hasSeen() {
    if (!profile?.id) return false
    return !!getSeen(profile.id)[tourKey]
  }

  function autoOpenIfNew() {
    if (!profile?.id) return
    if (!hasSeen()) setOpen(true)
  }

  return {
    open,
    show: () => setOpen(true),
    close: () => setOpen(false),
    hasSeen,
    autoOpenIfNew,
  }
}
