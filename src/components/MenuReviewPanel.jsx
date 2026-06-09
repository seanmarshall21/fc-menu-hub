import { useMemo, useState } from 'react'
import { reviewMenuItems } from '@/lib/menuReview'

/**
 * Inline review banner for a menu's items. Runs the deterministic checks
 * from menuReview.js and shows a collapsible list of findings. Click a
 * finding to scroll/highlight the item (if it has a known id).
 *
 * Used on MenuPage above the items table when there are any findings.
 */
export default function MenuReviewPanel({ items, onJumpToItem }) {
  const findings = useMemo(() => reviewMenuItems(items), [items])
  const [open, setOpen] = useState(false)

  if (!findings.length) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 mb-4 flex items-center gap-2 text-sm text-emerald-800">
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <span className="font-medium">Looks clean</span>
        <span className="text-emerald-700">— no spelling or consistency issues caught.</span>
      </div>
    )
  }

  const counts = findings.reduce((acc, f) => {
    acc[f.kind] = (acc[f.kind] || 0) + 1
    return acc
  }, {})
  const total = findings.length

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 mb-4 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-2.5 flex items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2 text-sm text-amber-900">
          <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-semibold">{total} review {total === 1 ? 'flag' : 'flags'}</span>
          <span className="text-amber-700">
            {Object.entries(counts).map(([k, v]) => `${v} ${kindLabel(k)}`).join(' · ')}
          </span>
        </div>
        <span className="text-[11px] text-amber-700">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <ul className="divide-y divide-amber-100 bg-white">
          {findings.map((f, i) => (
            <li key={i} className="px-4 py-2.5 text-sm">
              <div className="flex items-start gap-3">
                <span className={`flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold uppercase ${kindBadgeClass(f.kind)}`}>
                  {kindShort(f.kind)}
                </span>
                <div className="flex-1 min-w-0">
                  {f.itemTitle ? (
                    <button
                      type="button"
                      onClick={() => f.itemId && onJumpToItem?.(f.itemId)}
                      className="text-ink-900 font-medium hover:text-brand-600"
                    >
                      {f.itemTitle}
                    </button>
                  ) : f.affectedItemIds ? (
                    <span className="text-ink-700 font-medium">{f.affectedItemIds.length} items</span>
                  ) : (
                    <span className="text-ink-700 font-medium">Across menu</span>
                  )}
                  {f.field && f.field !== 'multiple' && (
                    <span className="text-[11px] text-ink-400 ml-2">({f.field})</span>
                  )}
                  <div className="text-xs text-ink-600 mt-0.5">{f.message}</div>
                  {f.suggestion && (
                    <div className="mt-1 text-[11px] text-ink-500 italic truncate">
                      Suggested: <span className="text-ink-700 not-italic">{f.suggestion}</span>
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function kindLabel(k) {
  if (k === 'typo') return 'typo'
  if (k === 'spacing') return 'spacing'
  if (k === 'duplicate-word') return 'repeat'
  if (k === 'consistency') return 'consistency'
  if (k === 'punctuation') return 'punctuation'
  return k
}
function kindShort(k) {
  if (k === 'typo') return 'sp'
  if (k === 'spacing') return 'sp'
  if (k === 'duplicate-word') return '2x'
  if (k === 'consistency') return '!='
  if (k === 'punctuation') return 'pn'
  return '?'
}
function kindBadgeClass(k) {
  if (k === 'consistency') return 'bg-blue-100 text-blue-700'
  if (k === 'typo')        return 'bg-red-100 text-red-700'
  return 'bg-amber-100 text-amber-700'
}
