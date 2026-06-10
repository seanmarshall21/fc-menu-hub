/**
 * PizzaLoader — animated mascot loading state.
 *
 * Composes three SVG layers from public/loader/:
 *   - pizza-boy-shadow.svg  (drop shadow on ground)
 *   - pizza-boy.svg         (the mascot, no built-in shadow)
 *   - pizza-boy-star.svg    (sparkle next to the mascot)
 *
 * The walking effect is pure CSS — no rigging of limbs needed. The
 * mascot bobs + tilts subtly while the shadow pulses inverse to the
 * bob (smaller while he's mid-bob, sells the "off the ground" beat).
 * The star twinkles at its own cadence so the composition feels
 * alive rather than mechanical.
 *
 * Usage:
 *   <PizzaLoader />               full-screen overlay with a backdrop
 *   <PizzaLoader inline />        inline at the parent's natural size
 *   <PizzaLoader message="…" />   override the caption text
 */
export default function PizzaLoader({
  inline = false,
  message = 'Hang tight…',
  size = 'md',           // 'sm' | 'md' | 'lg'
}) {
  const dims = { sm: 120, md: 180, lg: 260 }[size] || 180

  const stage = (
    <div className="pizza-loader-stage" style={{ '--mascot-size': `${dims}px` }}>
      <style>{styles}</style>
      <div className="pizza-loader-mascot-wrap">
        <img className="pizza-loader-star"    src="/loader/pizza-boy-star.svg"   alt="" aria-hidden />
        <img className="pizza-loader-mascot"  src="/loader/pizza-boy.svg"        alt="" aria-hidden />
        <img className="pizza-loader-shadow"  src="/loader/pizza-boy-shadow.svg" alt="" aria-hidden />
      </div>
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

// Scoped CSS as a string so the component is fully self-contained.
// All animation work is on transform/opacity → GPU-composited, no layout
// thrash. `prefers-reduced-motion` zeroes the motion out for accessibility.
const styles = /* css */`
  .pizza-loader-overlay {
    position: fixed; inset: 0; z-index: 50;
    display: flex; align-items: center; justify-content: center;
    background: rgba(247, 246, 243, 0.88);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }
  .pizza-loader-stage {
    display: flex; flex-direction: column; align-items: center;
    gap: 16px;
  }
  .pizza-loader-mascot-wrap {
    position: relative;
    width: var(--mascot-size);
    height: var(--mascot-size);
    display: grid; place-items: center;
  }
  .pizza-loader-mascot {
    position: relative;
    width: 100%; height: auto;
    z-index: 2;
    transform-origin: 50% 95%;
    animation: pizza-bob 720ms cubic-bezier(.45,.05,.55,.95) infinite;
    will-change: transform;
  }
  .pizza-loader-shadow {
    position: absolute;
    bottom: -2%;
    width: 70%;
    height: auto;
    opacity: 0.45;
    z-index: 1;
    transform-origin: 50% 50%;
    animation: pizza-shadow 720ms cubic-bezier(.45,.05,.55,.95) infinite;
    will-change: transform, opacity;
    filter: blur(0.5px);
  }
  .pizza-loader-star {
    position: absolute;
    top: 8%; right: 6%;
    width: 14%;
    height: auto;
    z-index: 3;
    transform-origin: center;
    animation: pizza-twinkle 1.6s ease-in-out infinite;
    will-change: transform, opacity;
  }
  .pizza-loader-message {
    font-size: 13px; font-weight: 500;
    color: rgba(31, 35, 48, 0.7);
    letter-spacing: 0.01em;
    text-align: center;
  }
  @keyframes pizza-bob {
    0%, 100% { transform: translateY(0)     rotate(-1.5deg); }
    25%      { transform: translateY(-7%)   rotate(0deg); }
    50%      { transform: translateY(0)     rotate(1.5deg); }
    75%      { transform: translateY(-7%)   rotate(0deg); }
  }
  @keyframes pizza-shadow {
    0%, 100% { transform: scaleX(1)    scaleY(1);    opacity: 0.45; }
    25%      { transform: scaleX(0.78) scaleY(0.6);  opacity: 0.25; }
    50%      { transform: scaleX(1)    scaleY(1);    opacity: 0.45; }
    75%      { transform: scaleX(0.78) scaleY(0.6);  opacity: 0.25; }
  }
  @keyframes pizza-twinkle {
    0%, 100% { transform: scale(0.85) rotate(-8deg); opacity: 0.55; }
    50%      { transform: scale(1.1)  rotate(12deg); opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .pizza-loader-mascot,
    .pizza-loader-shadow,
    .pizza-loader-star { animation: none; }
  }
`
