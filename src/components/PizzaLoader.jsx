/**
 * PizzaLoader — animated mascot loading state.
 *
 * Shows the hand-drawn pizza walk-cycle as a transparent animated WebP
 * (/loader/pizza-walk.webp) via a plain <img>. WebP animation has true alpha
 * and is supported everywhere we run — desktop Chromium AND iOS Safari 14+ —
 * so the mascot sits cleanly on the (theme-aware) backdrop with no white frame
 * and no blend hacks. Under prefers-reduced-motion we swap in a static frame.
 *
 * Usage:
 *   <PizzaLoader />               full-screen overlay with a backdrop
 *   <PizzaLoader inline />        inline at the parent's natural size
 *   <PizzaLoader message="…" />   override the caption text
 *   <PizzaLoader size="sm" />     'sm' | 'md' | 'lg'
 */
export default function PizzaLoader({
  inline = false,
  message = 'Hang tight…',
  size = 'md',
}) {
  // Sizes bumped ~15% from the original 120/180/260 for a touch more
  // presence — at the old md size it read a little small in context.
  const dims = { sm: 138, md: 207, lg: 299 }[size] || 207

  const reduced = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const src = reduced ? '/loader/pizza-walk.png' : '/loader/pizza-walk.webp'

  const stage = (
    <div className="pizza-loader-stage" style={{ '--mascot-size': `${dims}px` }}>
      <style>{styles}</style>
      <img className="pizza-loader-img" src={src} alt="" aria-hidden />
      {message && <div className="pizza-loader-message">{message}</div>}
    </div>
  )

  if (inline) return stage
  return (
    <div className="pizza-loader-overlay" role="status" aria-live="polite">
      {stage}
    </div>
  )
}

const styles = /* css */`
  .pizza-loader-overlay {
    position: fixed; inset: 0; z-index: 50;
    display: flex; align-items: center; justify-content: center;
    /* Theme-aware: warm off-white in light, warm charcoal in dark. */
    background: rgb(var(--surface-50) / 0.92);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }
  .pizza-loader-stage {
    display: flex; flex-direction: column; align-items: center;
    gap: 16px;
  }
  .pizza-loader-img {
    width: var(--mascot-size);
    height: var(--mascot-size);
    object-fit: contain;
    pointer-events: none;
  }
  .pizza-loader-message {
    font-size: 13px; font-weight: 500;
    color: rgb(var(--ink-600));
    letter-spacing: 0.01em;
    text-align: center;
  }
`
