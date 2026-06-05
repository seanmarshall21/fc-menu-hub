import { useEffect, useRef } from 'react'

/**
 * Re-fetch on window/tab focus.
 *
 * When the user switches back to the tab (or pulls the PWA from the
 * background on mobile), invoke `callback`. Throttled so brief switches
 * don't cause request storms.
 *
 *   useFocusRefresh(loadMenu)
 *
 * Pass `minInterval` (ms) if you want a different throttle window.
 * Pass `enabled=false` to disable temporarily (e.g. inside a modal).
 */
export function useFocusRefresh(callback, { minInterval = 4000, enabled = true } = {}) {
  const lastRunRef = useRef(0)
  const cbRef = useRef(callback)
  cbRef.current = callback

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return

    const maybeRun = () => {
      const now = Date.now()
      if (now - lastRunRef.current < minInterval) return
      lastRunRef.current = now
      try { cbRef.current?.() } catch {}
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') maybeRun()
    }

    window.addEventListener('focus', maybeRun)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', maybeRun)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, minInterval])
}
