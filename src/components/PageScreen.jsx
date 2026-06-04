import { Link, useNavigate } from 'react-router-dom'

/**
 * Standard page chrome:
 *   - Sticky top header (white, extends behind iOS status bar)
 *   - Breadcrumbs + optional back button on the left, actions on the right
 *   - Optional second row below the breadcrumb row (e.g. tabs)
 *   - Scrollable body underneath, with safe-area-inset-bottom + bottom-nav padding
 *
 *   <PageScreen
 *     breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'CRSSD Festival' }]}
 *     actions={<button className="btn-primary btn-sm">+ Series</button>}
 *     below={<TabRow />}
 *   >
 *     <PageBody>...</PageBody>
 *   </PageScreen>
 *
 * Pass `noPad` to PageBody (or use raw children) when the page wants its own padding.
 */
export default function PageScreen({ breadcrumbs = [], actions, below, children }) {
  const navigate = useNavigate()
  const lastCrumb = breadcrumbs[breadcrumbs.length - 1]
  const showBack = breadcrumbs.length > 1

  return (
    <div className="flex flex-col h-full min-h-0">
      <header
        className="sticky top-0 z-30 bg-white border-b border-surface-200 flex-shrink-0"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="px-4 sm:px-8">
          <div className="flex items-center justify-between gap-3 py-3 max-w-6xl mx-auto">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {showBack && (
                <button
                  onClick={() => navigate(-1)}
                  className="text-ink-400 hover:text-ink-700 p-1 -ml-1 flex-shrink-0"
                  aria-label="Back"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}
              <nav className="flex items-center gap-1.5 text-xs sm:text-sm text-ink-500 min-w-0 flex-1">
                {breadcrumbs.length > 1 && (
                  <div className="hidden sm:flex items-center gap-1.5 min-w-0">
                    {breadcrumbs.slice(0, -1).map((crumb, i) => (
                      <span key={i} className="flex items-center gap-1.5 flex-shrink-0">
                        {crumb.to
                          ? <Link to={crumb.to} className="hover:text-brand-600 truncate">{crumb.label}</Link>
                          : <span className="truncate">{crumb.label}</span>}
                        <span className="text-ink-300">/</span>
                      </span>
                    ))}
                  </div>
                )}
                {lastCrumb && (
                  <span className="text-ink-900 font-semibold truncate">{lastCrumb.label}</span>
                )}
              </nav>
            </div>
            {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
          </div>
          {below && (
            <div className="max-w-6xl mx-auto pb-1">{below}</div>
          )}
        </div>
      </header>

      <div
        className="flex-1 overflow-y-auto min-h-0"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 80px)' }}
      >
        {children}
      </div>
    </div>
  )
}

/** Standard padded body container. Most pages should wrap their content in this. */
export function PageBody({ children, className = '' }) {
  return (
    <div className={`px-4 sm:px-8 py-5 sm:py-7 max-w-6xl mx-auto ${className}`}>
      {children}
    </div>
  )
}
