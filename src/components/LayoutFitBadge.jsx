import { useEffect, useState } from 'react'
import { measureFit, solveGaps, recommendSize, slotFor } from '@/lib/menuFit'

// In-app layout fit readout. Measures the rendered preview canvas, solves the
// gaps for the current size, and recommends the best size — so the team can
// pick the right size before ever opening Figma. Mirrors the plugin's auto-fit.
//
// Props: canvasRef (ref to the TemplateCanvas root), size ('sm'|'md'|'lg'),
//        sponsors (bool), depsKey (anything that changes when content changes)
export default function LayoutFitBadge({ canvasRef, size, sponsors, depsKey, primarySize, onApplySize, canEdit }) {
  const [fit, setFit] = useState(null)

  useEffect(() => {
    let raf1, raf2, ro
    const run = () => {
      const root = canvasRef?.current
      const m = measureFit(root)
      if (!m) { setFit(null); return }
      const A = slotFor(size, sponsors)
      const current = A ? solveGaps(A, m) : null
      const rec = recommendSize(m, sponsors)
      setFit({ current, rec, size })
    }
    // Measure after two frames so fonts + layout have settled.
    raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(run) })
    if (canvasRef?.current) { ro = new ResizeObserver(run); ro.observe(canvasRef.current) }
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); if (ro) ro.disconnect() }
  }, [canvasRef, size, sponsors, depsKey])

  if (!fit || !fit.current) return null

  const { current, rec } = fit
  const sizeUpper = (s) => (s || '').toUpperCase()
  const overflow = current.status === 'overflow'
  const recDiffers = rec.size && rec.size !== size
  // Can we offer a one-click primary-size change? Only when the best size
  // differs from the menu's actual (primary) size and the user can edit.
  const primary = primarySize || size
  const canApply = canEdit && typeof onApplySize === 'function' && rec.size && rec.size !== primary

  const tone = overflow
    ? 'border-red-200 bg-red-50 text-red-800'
    : recDiffers
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800'

  return (
    <div className={`rounded-lg border px-3 py-2 text-xs flex items-center gap-x-4 gap-y-1.5 flex-wrap ${tone}`}>
      <span className="font-semibold whitespace-nowrap">
        {overflow ? '⚠ Overflows at' : '✓ Fits at'} {sizeUpper(size)}
        {sponsors ? ' (sponsors)' : ''}
      </span>
      <span className="whitespace-nowrap opacity-90">
        item {current.itemGap}px · section {current.sectionGap}px · ratio 1:{current.ratio}
      </span>
      {rec.size && (
        <span className="whitespace-nowrap font-medium ml-auto flex items-center gap-2">
          {recDiffers
            ? `Best size: ${sizeUpper(rec.size)} (${rec.reason})`
            : `✓ ${sizeUpper(size)} is the best fit`}
          {canApply && (
            <button
              type="button"
              onClick={() => onApplySize(rec.size)}
              className="btn-sm whitespace-nowrap flex-shrink-0 px-2.5 py-1 rounded-md bg-ink-900 text-surface-0 font-semibold hover:bg-ink-700"
            >
              Set size to {sizeUpper(rec.size)}
            </button>
          )}
        </span>
      )}
    </div>
  )
}
