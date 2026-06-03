import { useFavorites } from '@/hooks/useFavorites'

/**
 * Star toggle. Persists immediately via useFavorites.
 *   <FavoriteButton type="brand" id={brand.id} />
 */
export default function FavoriteButton({ type, id, size = 'md', className = '' }) {
  const { isFavorite, toggle } = useFavorites()
  const filled = isFavorite(type, id)
  const dim = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5'
  const box = size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-10 h-10' : 'w-8 h-8'

  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(type, id) }}
      aria-label={filled ? 'Remove from favorites' : 'Add to favorites'}
      title={filled ? 'Remove from favorites' : 'Add to favorites'}
      className={`${box} flex items-center justify-center rounded-full transition-colors ${
        filled
          ? 'text-amber-400 hover:text-amber-500'
          : 'text-ink-300 hover:text-amber-400'
      } ${className}`}
    >
      <svg className={dim} viewBox="0 0 24 24"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.86 5.706a1 1 0 00.95.69h6.001c.969 0 1.371 1.24.588 1.81l-4.857 3.527a1 1 0 00-.364 1.118l1.86 5.706c.3.921-.755 1.688-1.539 1.118l-4.857-3.527a1 1 0 00-1.176 0l-4.857 3.527c-.784.57-1.838-.197-1.539-1.118l1.86-5.706a1 1 0 00-.364-1.118L2.6 11.133c-.783-.57-.38-1.81.588-1.81h6.002a1 1 0 00.95-.69l1.86-5.706z" />
      </svg>
    </button>
  )
}
