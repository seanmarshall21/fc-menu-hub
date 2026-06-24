// Small red flag shown on menu cards (Menus + Preview all) when sponsors need
// checking. Just the flag — context makes clear it's sponsors. Renders nothing
// when no check is due.
export default function SponsorFlag({ needsCheck }) {
  if (!needsCheck) return null
  return (
    <span
      className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-red-100 text-red-600 text-[11px] flex-shrink-0"
      title="Sponsors changed since last checked — verify them"
    >
      ⚑
    </span>
  )
}
