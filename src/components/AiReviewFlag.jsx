// Purple AI-review badge on menu cards. Shows when a menu hasn't been
// AI-reviewed at its current content, or has unresolved review flags.
export default function AiReviewFlag({ needsReview }) {
  if (!needsReview) return null
  return (
    <span
      className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-purple-100 text-purple-600 flex-shrink-0"
      title="AI review pending — open the menu to review, or resolve its flags"
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5L13 3z" />
      </svg>
    </span>
  )
}
