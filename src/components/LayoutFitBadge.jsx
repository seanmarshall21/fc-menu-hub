import { useEffect, useState } from 'react'
import { measureFit, solveGaps, recommendSize, slotFor } from '@/lib/menuFit'

// In-app layout fit readout. Measures the rendered preview canvas, solves the
// gaps for the current size, and recommends the best size — so the team can
// pick the right size before ever opening Figma. Mirrors the plugin's auto-fit.
//
// Props: canvasRef (ref to the TemplateCanvas root), size ('sm'|'md'|'lg'),
//        sponsors (bool), depsKey (anything that changes when content changes)
export default function LayoutFitBadge({ canvasRef, size, sponsors, depsKey }) {
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

  const tone = overflow
    ? 'border-red-200 bg-red-50 text-red-800'
    : recDiffers
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800'

  return (
    <div className={`rounded-lg border px-3 py-2 text-xs flex items-center gap-x-4 gap-y-1 flex-wrap ${tone}`}>
      <span className="font-semibold whitespace-nowrap">
        {overflow ? '⚠ Overflows at' : '✓ Fits at'} {sizeUpper(size)}
        {sponsors ? ' (sponsors)' : ''}
      </span>
      <span className="whitespace-nowrap opacity-90">
        item {current.itemGap}px · section {current.sectionGap}px · ratio 1:{current.ratio}
      </span>
      {rec.size && (
        <span className="whitespace-nowrap font-medium ml-auto">
          {recDiffers
            ? `Best size: ${sizeUpper(rec.size)} (${rec.reason})`
            : `✓ ${sizeUpper(size)} is the best fit`}
        </span>
      )}
    </div>
  )
}
