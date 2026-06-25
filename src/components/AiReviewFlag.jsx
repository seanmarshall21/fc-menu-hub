// AI-review badge on menu cards.
//   state 'pending' → grey outline circle with the AI icon (not reviewed yet,
//                     or has unresolved flags for the current content)
//   state 'done'    → filled purple circle + a check (reviewed & all handled)
//   state null      → nothing (no reviewable items)
const SPARKLE = 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5L13 3z'

export default function AiReviewFlag({ state }) {
  if (!state) return null
  const done = state === 'done'
  return (
    <span
      className="inline-flex items-center gap-0.5 flex-shrink-0"
      title={done ? 'AI review complete' : 'AI review pending — open the menu to review, or resolve its flags'}
    >
      <span className={`w-[18px] h-[18px] rounded-full inline-flex items-center justify-center ${
        done ? 'bg-purple-600 text-white' : 'border border-surface-300 text-ink-300'
      }`}>
        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d={SPARKLE} />
        </svg>
      </span>
      {done && (
        <svg className="w-3 h-3 text-purple-600" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </span>
  )
}
