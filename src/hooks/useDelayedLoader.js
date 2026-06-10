import { useEffect, useRef, useState } from 'react'

/**
 * Hides loaders that flash in for an eyeblink, and prevents loaders that
 * DO show from disappearing too fast to register.
 *
 *   const showLoader = useDelayedLoader(loading)
 *   if (showLoader) return <PizzaLoader />
 *
 * Behavior:
 *   - When `loading` flips true, wait `delay` ms before mounting the
 *     loader. If the work finishes inside that window, the loader is
 *     never shown — no flash for instant page transitions.
 *   - Once the loader IS shown, keep it visible for at least
 *     `minDuration` ms total before unmounting, even if the work
 *     finishes sooner. Gives the animation enough time to play through
 *     a full walk cycle rather than a half-step.
 *
 *   delay        debounce window before the loader appears (default 150ms)
 *   minDuration  guaranteed visible time once shown (default 1500ms)
 */
export function useDelayedLoader(loading, { delay = 150, minDuration = 1500 } = {}) {
  const [show, setShow] = useState(false)
  const shownAtRef = useRef(0)
  const enterTimerRef = useRef(null)
  const exitTimerRef = useRef(null)

  useEffect(() => {
    // Always cancel any in-flight timers before deciding the next move,
    // otherwise rapid loading toggles leak timers.
    if (enterTimerRef.current) { clearTimeout(enterTimerRef.current); enterTimerRef.current = null }
    if (exitTimerRef.current)  { clearTimeout(exitTimerRef.current);  exitTimerRef.current = null }

    if (loading) {
      // Already showing? Nothing to do — the min-duration timer will
      // fire when loading flips false again.
      if (show) return
      // Otherwise, debounce: only mount the loader if loading is STILL
      // true after `delay` ms.
      enterTimerRef.current = setTimeout(() => {
        shownAtRef.current = Date.now()
        setShow(true)
        enterTimerRef.current = null
      }, delay)
    } else {
      // Loading just flipped off. If the loader never appeared (debounce
      // canceled it), nothing to do. If it did appear, hold it for the
      // remainder of minDuration.
      if (!show) return
      const heldFor   = Date.now() - shownAtRef.current
      const remaining = Math.max(0, minDuration - heldFor)
      if (remaining === 0) {
        setShow(false)
      } else {
        exitTimerRef.current = setTimeout(() => {
          setShow(false)
          exitTimerRef.current = null
        }, remaining)
      }
    }
    // Cleanup on unmount handled by the next effect run / unmount cleanup.
  }, [loading, show, delay, minDuration])

  // On unmount, clear any pending timers so they don't fire after the
  // component is gone.
  useEffect(() => () => {
    if (enterTimerRef.current) clearTimeout(enterTimerRef.current)
    if (exitTimerRef.current)  clearTimeout(exitTimerRef.current)
  }, [])

  return show
}
