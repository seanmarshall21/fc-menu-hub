/**
 * Two-option segmented toggle. Active option is filled; inactive is muted.
 *   <SegmentedToggle value="inherit" options={[
 *     { value: 'inherit',  label: 'Inherit'  },
 *     { value: 'override', label: 'Override' },
 *   ]} onChange={…} />
 */
export default function SegmentedToggle({ value, options, onChange, disabled, size = 'sm' }) {
  const sizing = size === 'xs'
    ? 'text-[10px] px-2 py-0.5'
    : 'text-[11px] px-2.5 py-1'
  return (
    <div className={`inline-flex items-center rounded-full border border-surface-300 bg-surface-100 p-0.5 ${disabled ? 'opacity-50' : ''}`}>
      {options.map(opt => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => !disabled && !active && onChange(opt.value)}
            disabled={disabled}
            aria-pressed={active}
            className={`${sizing} font-medium rounded-full transition-colors ${
              active
                ? 'bg-surface-0 text-ink-900 shadow-sm border border-surface-200'
                : 'text-ink-500 hover:text-ink-800'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
