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
      className="fixed left-3 right-3 z-[100] flex items-center justify-between gap-3 rounded-2xl shadow-2xl px-5 py-4 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-[28rem]"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom) + 80px)',
        background: 'linear-gradient(135deg, #fde047 0%, #fb923c 100%)',
      }}
    >
      <div className="min-w-0">
        {/* Banner sits on a fixed gold gradient in both themes — keep text dark. */}
        <p className="text-xl font-extrabold text-gray-900 leading-none tracking-tight">NEW STUFF!</p>
        <p className="text-xs text-gray-700 leading-tight mt-1.5">Updated version available</p>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="bg-gray-900 hover:bg-gray-800 text-white text-sm font-bold tracking-wide rounded-xl px-5 py-3 transition-colors flex-shrink-0"
      >
        UPDATE
      </button>
    </div>
  )
}
