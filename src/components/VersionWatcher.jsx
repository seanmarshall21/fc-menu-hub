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
      className="fixed left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-1.5rem)] max-w-md flex items-center justify-between gap-3 bg-ink-900 text-white rounded-2xl shadow-2xl px-5 py-4"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom) + 84px)',
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-full bg-brand-500/20 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-brand-300" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-base font-semibold leading-tight">New version available</p>
          <p className="text-xs text-ink-300 leading-tight mt-0.5">Tap reload to update Menu Hub.</p>
        </div>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl px-4 py-2.5 transition-colors flex-shrink-0"
      >
        Reload
      </button>
    </div>
  )
}
