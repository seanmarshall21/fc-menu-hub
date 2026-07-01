import clsx from 'clsx'
import { useTheme } from '@/contexts/ThemeContext'

function SunIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  )
}

function MoonIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  )
}

// Sliding sun↔moon switch. Slid left = light (sun), slid right = dark (moon).
// The knob carries the active icon; the opposite icon shows faintly on the
// track as the "tap to switch" affordance.
export default function ThemeToggle({ className }) {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={dark}
      aria-label="Toggle dark mode"
      title={dark ? 'Dark mode — switch to light' : 'Light mode — switch to dark'}
      className={clsx(
        'relative inline-flex items-center h-7 w-[52px] rounded-full flex-shrink-0 transition-colors',
        'bg-surface-100 border border-surface-200 hover:bg-surface-200',
        'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 focus:ring-offset-surface-0',
        className
      )}
    >
      {/* faint track icons */}
      <SunIcon className="pointer-events-none absolute left-[7px] w-3.5 h-3.5 text-ink-300" />
      <MoonIcon className="pointer-events-none absolute right-[7px] w-3.5 h-3.5 text-ink-300" />
      {/* sliding knob carrying the active icon */}
      <span
        className={clsx(
          'relative z-10 inline-flex items-center justify-center h-6 w-6 rounded-full bg-surface-0 shadow transition-transform duration-200',
          dark ? 'translate-x-[24px]' : 'translate-x-[2px]'
        )}
      >
        {dark
          ? <MoonIcon className="w-3.5 h-3.5 text-brand-500" />
          : <SunIcon className="w-3.5 h-3.5 text-amber-500" />}
      </span>
    </button>
  )
}
