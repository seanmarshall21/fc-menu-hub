import { Link, useNavigate } from 'react-router-dom'
import EntityIcon from './EntityIcon'

/**
 * Page chrome:
 *   - Fixed top header with logo (or breadcrumb chain on nested pages)
 *   - Header is locked to the viewport top — content scrolls beneath it
 *   - Optional tabs row below the title block
 *   - Body scrolls with safe-area-inset-bottom + bottom-nav clearance
 *
 *   <PageScreen
 *     title="CRSSD Spring 2026"
 *     subtitle="Mar 20 · Waterfront Park"
 *     breadcrumbs={[{ label: 'CRSSD', to: '/brands/crssd' }, { label: 'CRSSD Festival', to: '/brands/crssd/series/crssd-festival' }, { label: 'CRSSD Spring 2026' }]}
 *     icon={brand.logo_url}          // overrides the default Menu Hub tile
 *     actions={<button>+ Menu</button>}
 *     below={<TabsRow />}
 *   >…</PageScreen>
 *
 * Behavior rules:
 *   - If breadcrumbs.length > 1, the header shows a tiny breadcrumb chain
 *     row at top, drops the logo tile, and shows back arrow.
 *   - If breadcrumbs.length <= 1 (top-level pages like Dashboard, Brand,
 *     Sponsors, Favorites, Admin), the header shows the logo tile (or the
 *     icon you pass in) next to the title.
 */
export default function PageScreen({
  title,
  subtitle,
  breadcrumbs = [],
  back = false,
  icon,
  iconName,
  iconColor,
  actions,
  below,
  children,
}) {
  const navigate = useNavigate()

  const last = breadcrumbs[breadcrumbs.length - 1]
  const parents = breadcrumbs.slice(0, -1)

  const effectiveTitle = title ?? last?.label ?? ''
  const effectiveSubtitle = subtitle ?? (parents.length === 1
    ? parents[0].label
    : null)
  const isNested = breadcrumbs.length > 1
  const showBack = back || isNested
  const showLogo = !isNested

  return (
    <div className="flex flex-col h-full min-h-0">
      <header
        className="z-30 bg-white border-b border-surface-200 flex-shrink-0"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="px-4 sm:px-8 max-w-6xl mx-auto">
          {/* Top breadcrumb chain on nested pages */}
          {isNested && parents.length > 0 && (
            <nav className="flex items-center gap-1.5 text-[11px] sm:text-xs text-ink-400 pt-3 -mb-0.5 overflow-x-auto whitespace-nowrap">
              {parents.map((crumb, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 flex-shrink-0">
                  {crumb.to
                    ? <Link to={crumb.to} className="hover:text-brand-600">{crumb.label}</Link>
                    : <span>{crumb.label}</span>}
                  {i < parents.length - 1 && <span className="text-ink-300">/</span>}
                </span>
              ))}
            </nav>
          )}

          {/* Title row */}
          <div className={`flex items-center gap-3 ${isNested ? 'pt-1' : 'pt-3 sm:pt-4'} pb-3 sm:pb-4`}>
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
            {showLogo && (
              icon || iconName ? (
                <EntityIcon
                  iconUrl={icon}
                  iconName={iconName}
                  fallbackText={effectiveTitle}
                  fallbackColor={iconColor || '#6366f1'}
                  size={44}
                />
              ) : (
                <img
                  src="/logo-tile.svg"
                  alt=""
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg flex-shrink-0 object-contain bg-surface-50 border border-surface-100"
                />
              )
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
