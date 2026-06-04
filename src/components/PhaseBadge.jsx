const PHASE_LABELS = {
  build:      'Build',
  proof:      'Proof',
  print_prep: 'Print Prep',
  approved:   'Approved',
  archived:   'Archived',
}

const PHASE_CLASSES = {
  build:      'phase-badge bg-blue-100 text-blue-800',
  proof:      'phase-badge bg-emerald-100 text-emerald-800',
  print_prep: 'phase-badge bg-amber-100 text-amber-800',
  approved:   'phase-badge bg-indigo-100 text-indigo-800',
  archived:   'phase-badge bg-surface-200 text-ink-500',
}

/**
 * Phase badge.
 *   <PhaseBadge phase="build" />
 *   <PhaseBadge phase="approved" hasPendingEdits />  // overrides to red 'Edits'
 */
export default function PhaseBadge({ phase, hasPendingEdits = false }) {
  if (!phase) return null
  if (hasPendingEdits) {
    return (
      <span className="phase-badge bg-red-100 text-red-700">
        Edits
      </span>
    )
  }
  return (
    <span className={PHASE_CLASSES[phase] || 'phase-badge bg-surface-100 text-ink-500'}>
      {PHASE_LABELS[phase] || phase}
    </span>
  )
}
