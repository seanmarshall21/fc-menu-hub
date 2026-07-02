/**
 * PizzaLoader — animated mascot loading state.
 *
 * Plays the hand-drawn pizza walk-cycle video at /loader/pizza-walk.mp4
 * inline. The video uses mix-blend-mode: multiply so the white frame
 * background reads as transparent on the overlay, leaving only the
 * mascot visible.
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

  const stage = (
    <div className="pizza-loader-stage" style={{ '--mascot-size': `${dims}px` }}>
      <style>{styles}</style>
      <video
        className="pizza-loader-video"
        autoPlay
        loop
        muted
        playsInline
        aria-hidden
      >
        {/* WebM VP9 gives Chrome/Firefox/Edge real per-pixel alpha. Safari
            (desktop + iOS) can't read it and falls through to the H.264
            mp4. That fallback has a white frame background, which
            mix-blend-mode: multiply (in CSS below) erases visually. The
            blend is also harmless on WebM since its transparent pixels
            stay transparent. */}
        <source src="/loader/pizza-walk.webm" type='video/webm; codecs="vp9"' />
        <source src="/loader/pizza-walk.mp4"  type="video/mp4" />
      </video>
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
  .pizza-loader-video {
    width: var(--mascot-size);
    height: var(--mascot-size);
    object-fit: contain;
    pointer-events: none;
    /* The mp4 fallback (Safari/iOS) carries a white frame; multiply erases it
       against the light overlay. WebM (Chromium/Firefox — incl. the desktop
       app) has real alpha, so it's clean regardless. */
    mix-blend-mode: multiply;
  }
  /* In dark mode there's no light overlay for multiply to work against — it
     would crush the mascot. WebM's true transparency lets it sit cleanly on
     the dark backdrop with no blend and no light square. */
  .dark .pizza-loader-video {
    mix-blend-mode: normal;
  }
  .pizza-loader-message {
    font-size: 13px; font-weight: 500;
    color: rgb(var(--ink-600));
    letter-spacing: 0.01em;
    text-align: center;
  }
  @media (prefers-reduced-motion: reduce) {
    /* Pause the loop for users who've asked for reduced motion */
    .pizza-loader-video { animation-play-state: paused; }
  }
`
