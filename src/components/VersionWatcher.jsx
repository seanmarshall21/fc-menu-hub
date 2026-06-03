import { useEffect, useState } from 'react'

// Build version baked in at compile time (see vite.config.js `define`).
// Falls back to 'dev' for local hot-reload sessions where it's not injected.
const BUILD_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

const POLL_INTERVAL_MS = 60_000

export default function VersionWatcher() {
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    if (BUILD_VERSION === 'dev') return // skip polling in local dev

    let cancelled = false

    async function check() {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const { version } = await res.json()
        if (!cancelled && version && version !== BUILD_VERSION) {
          setUpdateAvailable(true)
        }
      } catch {
        // network blip, ignore
      }
    }

    // Check on mount and on tab refocus
    check()
    const interval = setInterval(check, POLL_INTERVAL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!updateAvailable) return null

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 bg-ink-900 text-white text-sm rounded-full shadow-lg pl-4 pr-1.5 py-1.5"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom) + 80px)',
      }}
    >
      <span className="whitespace-nowrap">New version available</span>
      <button
        onClick={() => window.location.reload()}
        className="bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-full px-3 py-1 transition-colors"
      >
        Reload
      </button>
    </div>
  )
}
