/**
 * Small chip showing the Figma sync status of a menu.
 *
 *   <SyncChip everSynced={true|false} syncNeeded={true|false} lastSyncedAt={iso} />
 *
 * - Never synced  → muted grey "Not synced"
 * - Up to date    → green Figma + "Synced"
 * - Needs resync  → amber Figma + "Sync"
 *
 * Hover for the human-friendly last-synced timestamp.
 */
function formatWhen(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch { return '' }
}

function FigmaGlyph({ className = 'w-2.5 h-2.5' }) {
  // Compact Figma mark — three colored circles + the "F" stack. We use a
  // single-color silhouette here to keep the chip readable at any background.
  return (
    <svg viewBox="0 0 38 57" className={className} fill="currentColor" aria-hidden="true">
      <path d="M19 0H9.5C4.25 0 0 4.25 0 9.5S4.25 19 9.5 19H19V0zM19 19H9.5C4.25 19 0 23.25 0 28.5S4.25 38 9.5 38H19V19zM19 38H9.5C4.25 38 0 42.25 0 47.5S4.25 57 9.5 57s9.5-4.25 9.5-9.5V38zM19 0h9.5C33.75 0 38 4.25 38 9.5S33.75 19 28.5 19H19V0zM38 28.5c0 5.25-4.25 9.5-9.5 9.5S19 33.75 19 28.5 23.25 19 28.5 19 38 23.25 38 28.5z"/>
    </svg>
  )
}

export default function SyncChip({ everSynced, syncNeeded, lastSyncedAt, size = 'sm' }) {
  const when = formatWhen(lastSyncedAt)
  const sizeCls = size === 'md'
    ? 'text-[11px] px-2 py-1 gap-1.5'
    : 'text-[10px] px-1.5 py-0.5 gap-1'

  if (!everSynced) {
    return (
      <span
        className={`inline-flex items-center whitespace-nowrap flex-shrink-0 font-medium rounded-full bg-surface-100 text-ink-400 border border-surface-200 ${sizeCls}`}
        title="This menu has never been synced to Figma."
      >
        <FigmaGlyph />
        <span>Not synced</span>
      </span>
    )
  }
  if (syncNeeded) {
    return (
      <span
        className={`inline-flex items-center whitespace-nowrap flex-shrink-0 font-medium rounded-full bg-amber-100 text-amber-800 border border-amber-200 ${sizeCls}`}
        title={`Menu has edits since last sync${when ? ` (last synced ${when})` : ''}. Re-run Menu Sync in Figma.`}
      >
        <FigmaGlyph />
        <span>Sync</span>
      </span>
    )
  }
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap flex-shrink-0 font-medium rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 ${sizeCls}`}
      title={`Up to date with Figma${when ? ` (synced ${when})` : ''}.`}
    >
      <FigmaGlyph />
      <span>Synced</span>
    </span>
  )
}
