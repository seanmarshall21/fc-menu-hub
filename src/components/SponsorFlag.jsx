// Small red flag shown on menu cards when sponsors need checking. Red because
// it's an actionable "needs attention" state (like Edits). Renders nothing when
// no check is due.
export default function SponsorFlag({ needsCheck }) {
  if (!needsCheck) return null
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 h-[18px] rounded-full bg-red-100 text-red-700 text-[10px] font-semibold flex-shrink-0"
      title="Sponsors changed since last checked — verify them"
    >
      ⚑ Sponsors
    </span>
  )
}
