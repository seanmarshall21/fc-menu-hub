import { useEffect, useLayoutEffect, useState } from 'react'
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
 * Step-by-step onboarding overlay with a spotlight cutout around the
 * target element. Renders into a portal so it floats above everything.
 *
 *   <TourOverlay tourKey="event" onClose={…} />
 *
 * Step shape (see src/lib/tours.js):
 *   {
 *     title:  string
 *     body:   string
 *     target?: CSS selector — element to spotlight on the current page
 *     image?:  '/tour/…' path — shown inline in the card when there's
 *              no live target (e.g. illustrating a screen you haven't
 *              navigated to yet)
 *   }
 */
export default function TourOverlay({ tourKey, onClose }) {
  const tour = TOURS[tourKey]
  const { profile } = useAuth()
  const [stepIdx, setStepIdx]   = useState(0)
  const [box, setBox]           = useState(null) // { top, left, width, height }
  const [vp, setVp]             = useState(() => viewport())

  if (!tour) return null
  const step   = tour.steps[stepIdx]
  const isLast = stepIdx === tour.steps.length - 1

  // Re-measure the target on step change + window resize + scroll.
  useLayoutEffect(() => {
    // If the step opts into clickFirst, simulate a click on the target
    // before measuring so the spotlight can highlight content that's
    // initially hidden behind a tab / accordion / dropdown. Defer the
    // measurement one tick so React can re-render the click result.
    let measureTimeout = null
    function measure() {
      setVp(viewport())
      if (!step?.target) { setBox(null); return }
      const el = document.querySelector(step.target)
      if (!el) { setBox(null); return }
      if (step.clickFirst && typeof el.click === 'function') {
        el.click()
        // Wait one frame for the click's side effects to render, then
        // re-measure to catch the new bounding rect (e.g. a tab panel
        // that just opened may have shifted the layout).
        measureTimeout = setTimeout(measure2, 0)
        return
      }
      measure2(el)
    }
    function measure2(maybeEl) {
      const el = maybeEl || document.querySelector(step.target)
      if (!el) { setBox(null); return }
      const r = el.getBoundingClientRect()
      const pad = 8
      setBox({
        top:    r.top - pad,
        left:   r.left - pad,
        width:  r.width + pad * 2,
        height: r.height + pad * 2,
      })
      // Bring the target into view if it's off-screen
      if (r.top < 80 || r.bottom > window.innerHeight - 80) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (step?.target) {
      const el = document.querySelector(step.target)
      if (el) ro.observe(el)
    }
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      if (measureTimeout) clearTimeout(measureTimeout)
      ro.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [stepIdx, step?.target, step?.clickFirst])

  function next()  { if (isLast) close(); else setStepIdx(i => i + 1) }
  function back()  { if (stepIdx > 0) setStepIdx(i => i - 1) }
  function close() { setSeen(profile?.id, tourKey); onClose?.() }

  // Esc to close, arrow keys to navigate, Enter advances
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape')                            close()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next()
      else if (e.key === 'ArrowLeft')                    back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stepIdx])

  // Compute card placement based on the target box so we never cover it.
  const cardPos = placeCard(box, vp)

  return createPortal(
    <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true">
      <style>{styles}</style>

      {/* SVG mask cutout — dims everything except the target rectangle. */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {box && (
              <rect
                x={box.left}
                y={box.top}
                width={box.width}
                height={box.height}
                rx="12"
                fill="black"
                className="tour-mask-rect"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(15, 18, 28, 0.62)"
          mask="url(#tour-mask)"
          onClick={close}
          style={{ pointerEvents: 'auto' }}
        />
      </svg>

      {/* Pulsing ring around the cutout */}
      {box && (
        <div
          className="absolute pointer-events-none rounded-xl tour-ring"
          style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
        />
      )}

      {/* Step card */}
      <div
        className="absolute pointer-events-auto tour-card-pos"
        style={cardPos}
      >
        <div className="w-[min(420px,calc(100vw-32px))] bg-surface-0 rounded-xl shadow-2xl border border-surface-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-surface-100 flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-brand-600 whitespace-nowrap">
              {tour.title} · {stepIdx + 1} / {tour.steps.length}
            </div>
            <button onClick={close} className="text-ink-400 hover:text-ink-700 text-xs whitespace-nowrap flex-shrink-0">Skip ↘</button>
          </div>

          {step.image && (
            <div className="bg-surface-50 border-b border-surface-100 flex items-center justify-center p-2">
              <img
                src={step.image}
                alt=""
                className="max-h-48 w-auto rounded-md shadow-sm border border-surface-200"
              />
            </div>
          )}

          <div className="px-5 py-4">
            <h3 className="text-base font-semibold text-ink-900 mb-1">{step.title}</h3>
            <p className="text-sm text-ink-600 leading-relaxed">{step.body}</p>
          </div>

          <div className="px-5 py-3 border-t border-surface-100 flex items-center justify-between gap-2 bg-surface-50">
            <div className="flex gap-1">
              {tour.steps.map((_, i) => (
                <span
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    i === stepIdx ? 'bg-brand-500' : i < stepIdx ? 'bg-brand-300' : 'bg-surface-300'
                  }`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {stepIdx > 0 && (
                <button onClick={back} className="btn-secondary btn-sm whitespace-nowrap flex-shrink-0">Back</button>
              )}
              <button onClick={next} className="btn-primary btn-sm whitespace-nowrap flex-shrink-0">
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

/**
 * Pick the best place to put the step card relative to the highlighted box.
 * Prefers: bottom → top → right → left → center (if no target at all).
 */
function placeCard(box, vp) {
  const margin    = 16
  const cardW     = Math.min(420, vp.w - 32)
  const estCardH  = 280 // rough budget for height; clipping is fine since the card is short
  if (!box) {
    return {
      top:  Math.max(margin, (vp.h - estCardH) / 2),
      left: (vp.w - cardW) / 2,
    }
  }
  // Bottom of target
  const belowSpace = vp.h - (box.top + box.height) - margin
  if (belowSpace > estCardH) {
    return {
      top:  box.top + box.height + margin,
      left: clamp(box.left + box.width / 2 - cardW / 2, margin, vp.w - cardW - margin),
    }
  }
  // Above target
  const aboveSpace = box.top - margin
  if (aboveSpace > estCardH) {
    return {
      top:  box.top - estCardH - margin,
      left: clamp(box.left + box.width / 2 - cardW / 2, margin, vp.w - cardW - margin),
    }
  }
  // Right
  const rightSpace = vp.w - (box.left + box.width) - margin
  if (rightSpace > cardW + margin) {
    return {
      top:  clamp(box.top + box.height / 2 - estCardH / 2, margin, vp.h - estCardH - margin),
      left: box.left + box.width + margin,
    }
  }
  // Left
  const leftSpace = box.left - margin
  if (leftSpace > cardW + margin) {
    return {
      top:  clamp(box.top + box.height / 2 - estCardH / 2, margin, vp.h - estCardH - margin),
      left: box.left - cardW - margin,
    }
  }
  // Fallback: bottom of viewport
  return {
    top:  vp.h - estCardH - margin,
    left: (vp.w - cardW) / 2,
  }
}

function viewport() {
  return { w: window.innerWidth, h: window.innerHeight }
}
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)) }

const styles = /* css */`
  .tour-mask-rect {
    transition: x 250ms cubic-bezier(.4,0,.2,1),
                y 250ms cubic-bezier(.4,0,.2,1),
                width 250ms cubic-bezier(.4,0,.2,1),
                height 250ms cubic-bezier(.4,0,.2,1);
  }
  .tour-card-pos {
    transition: top 250ms cubic-bezier(.4,0,.2,1),
                left 250ms cubic-bezier(.4,0,.2,1);
  }
  .tour-ring {
    box-shadow:
      0 0 0 2px rgba(99, 102, 241, 0.95),
      0 0 0 7px rgba(99, 102, 241, 0.25),
      0 0 24px 4px rgba(99, 102, 241, 0.35);
    animation: tour-pulse 2s ease-in-out infinite;
    transition: top 250ms cubic-bezier(.4,0,.2,1),
                left 250ms cubic-bezier(.4,0,.2,1),
                width 250ms cubic-bezier(.4,0,.2,1),
                height 250ms cubic-bezier(.4,0,.2,1);
  }
  @keyframes tour-pulse {
    0%, 100% {
      box-shadow:
        0 0 0 2px rgba(99, 102, 241, 0.95),
        0 0 0 6px rgba(99, 102, 241, 0.18),
        0 0 22px 3px rgba(99, 102, 241, 0.28);
    }
    50% {
      box-shadow:
        0 0 0 2px rgba(99, 102, 241, 0.95),
        0 0 0 10px rgba(99, 102, 241, 0.32),
        0 0 32px 6px rgba(99, 102, 241, 0.5);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .tour-mask-rect, .tour-card-pos, .tour-ring { transition: none; animation: none; }
  }
`

// Hook returns { open, close, hasSeen, autoOpenIfNew }.
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
    show:  () => setOpen(true),
    close: () => setOpen(false),
    hasSeen,
    autoOpenIfNew,
  }
}
