import { useNavigate } from 'react-router-dom'

/**
 * Standard page chrome:
 *   - Tall sticky header (logo tile + title + subtitle + actions)
 *   - Header extends behind the iOS status bar via safe-area-inset-top
 *   - Optional back button on the left when breadcrumbs imply a parent
 *   - Optional second row below the header (e.g. tabs)
 *   - Scrollable body underneath, padded for the bottom nav
 *
 * Two ways to supply the title text:
 *   1. Pass `title` + `subtitle` directly
 *   2. Pass `breadcrumbs` and PageScreen derives title = last crumb,
 *      subtitle = the parent chain joined with " · "
 *
 *   <PageScreen
 *     breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'CRSSD' }, { label: 'CRSSD Spring 2026' }]}
 *     actions={<button>+ New</button>}
 *     below={<TabsRow />}
 *   >
 *     <PageBody>…</PageBody>
 *   </PageScreen>
 */
export default function PageScreen({
  title,
  subtitle,
  breadcrumbs = [],
  back = false,
  actions,
  below,
  hideLogo = false,
  children,
}) {
  const navigate = useNavigate()

  const last = breadcrumbs[breadcrumbs.length - 1]
  const parents = breadcrumbs.slice(0, -1)

  const effectiveTitle = title ?? last?.label ?? ''
  const effectiveSubtitle = subtitle ?? (parents.length
    ? parents.map(p => p.label).join(' · ')
    : null)
  const showBack = back || breadcrumbs.length > 1

  return (
    <div className="flex flex-col h-full min-h-0 overscroll-none">
      <header
        className="z-30 bg-white border-b border-surface-200 flex-shrink-0"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="px-4 sm:px-8 max-w-6xl mx-auto">
          <div className="flex items-center gap-3 pt-7 pb-3 sm:pt-8 sm:pb-4">
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
            {!hideLogo && (
              <img
                src="/logo-tile.svg"
                alt=""
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-base sm:text-lg font-semibold text-ink-900 tracking-tight truncate leading-tight">
                {effectiveTitle}
              </h1>
              {effectiveSubtitle && (
                <p className="text-xs sm:text-sm text-ink-500 truncate leading-tight mt-0.5">
                  {effectiveSubtitle}
                </p>
              )}
            </div>
            {actions && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {actions}
              </div>
            )}
          </div>
          {below && (
            <div className="pb-1 -mt-1">{below}</div>
          )}
        </div>
      </header>

      <div
        className="flex-1 overflow-y-auto min-h-0 overscroll-contain"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 80px)',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {children}
      </div>
    </div>
  )
}

/** Standard padded body container. */
export function PageBody({ children, className = '' }) {
  return (
    <div className={`px-4 sm:px-8 py-5 sm:py-7 max-w-6xl mx-auto ${className}`}>
      {children}
    </div>
  )
}
