/**
 * Renders an entity's visual identifier — uploaded image, Material
 * Symbol, or a colored letter tile as a fallback.
 *
 *   <EntityIcon
 *     iconUrl={brand.logo_url}
 *     iconName={brand.icon_name}
 *     fallbackText={brand.name}
 *     fallbackColor={brand.color}
 *     size={40}
 *   />
 *
 * Sizes are nominal — pass any pixel number.
 */
export default function EntityIcon({
  iconUrl,
  iconName,
  fallbackText = '?',
  fallbackColor = '#6366f1',
  size = 40,
  className = '',
  rounded = 'lg', // 'lg' (rounded-lg) | 'full' | 'md'
}) {
  const radius = rounded === 'full' ? 'rounded-full'
              : rounded === 'md'   ? 'rounded-md'
              : 'rounded-lg'
  const styleBox = { width: size, height: size }

  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt=""
        className={`${radius} object-contain bg-surface-50 border border-surface-200 flex-shrink-0 ${className}`}
        style={styleBox}
      />
    )
  }

  if (iconName) {
    return (
      <div
        className={`${radius} flex items-center justify-center flex-shrink-0 text-white ${className}`}
        style={{ ...styleBox, backgroundColor: fallbackColor }}
      >
        <span
          className="material-symbols-outlined leading-none"
          style={{ fontSize: Math.round(size * 0.55) }}
        >
          {iconName}
        </span>
      </div>
    )
  }

  return (
    <div
      className={`${radius} flex items-center justify-center text-white font-semibold flex-shrink-0 ${className}`}
      style={{ ...styleBox, backgroundColor: fallbackColor, fontSize: Math.round(size * 0.45) }}
    >
      {(fallbackText?.[0] || '?').toUpperCase()}
    </div>
  )
}
