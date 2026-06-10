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
  const dims = { sm: 120, md: 180, lg: 260 }[size] || 180

  const stage = (
    <div className="pizza-loader-stage" style={{ '--mascot-size': `${dims}px` }}>
      <style>{styles}</style>
      <video
        className="pizza-loader-video"
        src="/loader/pizza-walk.mp4"
        autoPlay
        loop
        muted
        playsInline
        aria-hidden
      />
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
    background: rgba(247, 246, 243, 0.92);
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
    /* The video's frame background is white. multiply lets the warm
       overlay color come through so the mascot looks integrated. */
    mix-blend-mode: multiply;
    pointer-events: none;
  }
  .pizza-loader-message {
    font-size: 13px; font-weight: 500;
    color: rgba(31, 35, 48, 0.7);
    letter-spacing: 0.01em;
    text-align: center;
  }
  @media (prefers-reduced-motion: reduce) {
    /* Pause the loop for users who've asked for reduced motion */
    .pizza-loader-video { animation-play-state: paused; }
  }
`
