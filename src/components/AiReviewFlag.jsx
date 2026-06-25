// AI-review badge on menu cards. Shows ONLY when the review is complete
// (filled purple circle + check). Pending / not-reviewed shows nothing — so a
// missing icon just means "not done yet", never a false alarm.
const SPARKLE = 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5L13 3z'

export default function AiReviewFlag({ state }) {
  if (state !== 'done') return null
  return (
    <span
      className="w-[18px] h-[18px] rounded-full inline-flex items-center justify-center bg-purple-100 text-purple-600 flex-shrink-0"
      title="AI review complete"
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d={SPARKLE} />
      </svg>
    </span>
  )
}
