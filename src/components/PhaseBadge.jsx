const PHASE_LABELS = {
  build:      'Build',
  proof:      'Proof',
  print_prep: 'Print Prep',
  approved:   'Approved',
  archived:   'Archived',
}

const PHASE_CLASSES = {
  build:      'phase-build',
  proof:      'phase-proof',
  print_prep: 'phase-print_prep',
  approved:   'phase-approved',
  archived:   'bg-surface-200 text-ink-500',
}

export default function PhaseBadge({ phase }) {
  if (!phase) return null
  return (
    <span className={PHASE_CLASSES[phase] || 'phase-badge bg-surface-100 text-ink-500'}>
      {PHASE_LABELS[phase] || phase}
    </span>
  )
}
