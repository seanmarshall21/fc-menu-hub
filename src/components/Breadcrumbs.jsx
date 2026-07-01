import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export default function Breadcrumbs({ crumbs }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // crumbs = [{ label, to? }, ...]
  const first = crumbs[0]
  const last = crumbs[crumbs.length - 1]
  const middle = crumbs.slice(1, -1)
  const hasMiddle = middle.length > 0
  const parentCrumb = crumbs[crumbs.length - 2] // one level up

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <nav className="flex items-center gap-1 text-sm text-ink-400 mb-6">
      {/* Back caret */}
      {parentCrumb?.to && (
        <button
          onClick={() => navigate(parentCrumb.to)}
          className="p-1 -ml-1 mr-0.5 text-ink-400 hover:text-ink-700 transition-colors rounded"
          title={`Back to ${parentCrumb.label}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* First crumb (always Dashboard) */}
      {first.to ? (
        <Link to={first.to} className="hover:text-ink-700 transition-colors whitespace-nowrap">{first.label}</Link>
      ) : (
        <span className="whitespace-nowrap">{first.label}</span>
      )}

      {/* Ellipsis for middle crumbs */}
      {hasMiddle && (
        <>
          <span className="text-surface-300 mx-0.5">/</span>
          <div className="relative" ref={ref}>
            <button
              onClick={() => setOpen(o => !o)}
              className="px-1.5 py-0.5 rounded hover:bg-surface-100 text-ink-400 hover:text-ink-700 transition-colors font-medium"
              title="Show full path"
            >
              …
            </button>
            {open && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-surface-0 rounded-lg shadow-lg border border-surface-200 py-1 min-w-40">
                {crumbs.map((crumb, i) => (
                  <div key={i}>
                    {crumb.to ? (
                      <Link
                        to={crumb.to}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-ink-600 hover:bg-surface-50 hover:text-ink-900 transition-colors"
                      >
                        {i === crumbs.length - 1 && (
                          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />
                        )}
                        {i < crumbs.length - 1 && <span className="w-1.5 h-1.5 flex-shrink-0" />}
                        <span className={i === crumbs.length - 1 ? 'font-medium text-ink-900' : ''}>
                          {crumb.label}
                        </span>
                      </Link>
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-ink-900">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />
                        {crumb.label}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Separator before last */}
      {crumbs.length > 1 && (
        <span className="text-surface-300 mx-0.5">/</span>
      )}

      {/* Last crumb (current page) */}
      {crumbs.length > 1 && (
        <span className="text-ink-700 font-medium whitespace-nowrap truncate max-w-[160px] sm:max-w-none">
          {last.label}
        </span>
      )}
    </nav>
  )
}
