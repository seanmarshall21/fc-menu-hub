import { effectiveRoster, gateStatus } from '@/lib/roster'

// Computed readiness state for a menu, from its phase + sponsorship gate.
// Proofing is already encoded in phase (a menu only reaches 'approved' when
// proofing is signed or overridden). The remaining question is sponsors.
//
//   in_progress      — build / proof / edits (not yet approved)
//   awaiting_sponsors— approved, needs sponsors, sponsorship gate incomplete
//   ready            — approved + sponsors resolved → ready for print prep
//   exported / complete / archived — past ready
export function menuReadiness({ menu, eventRoles, seriesRoles, signoffs }) {
  const phase = menu.phase
  if (phase === 'exported') return 'exported'
  if (phase === 'complete') return 'complete'
  if (phase === 'archived') return 'archived'
  if (phase !== 'approved') return 'in_progress'

  const needsSponsors = !!menu.requires_sponsor_approval
  if (!needsSponsors) return 'ready'

  const eff = effectiveRoster(eventRoles, seriesRoles, 'sponsorship')
  const g = gateStatus(eff.rows, signoffs, 'sponsorship', eff.mode)
  // If sponsors are needed and someone's required to sign, they must — else
  // (no roster configured) don't block on missing setup.
  return (!g.hasRoster || g.complete) ? 'ready' : 'awaiting_sponsors'
}

export const READINESS_META = {
  in_progress:       { label: 'In progress',       cls: 'bg-surface-100 text-ink-500' },
  awaiting_sponsors: { label: 'Awaiting sponsors',  cls: 'bg-amber-100 text-amber-800' },
  ready:             { label: 'Ready to export',    cls: 'bg-emerald-100 text-emerald-800' },
  exported:          { label: 'Exported',           cls: 'bg-indigo-100 text-indigo-800' },
  // Complete uses the Menu Hub gold→orange gradient (via inline style) so it
  // reads clearly apart from the green "Ready"/Approved states.
  complete:          { label: 'Complete',           cls: 'text-black', style: { background: 'linear-gradient(135deg, #FFD54F 0%, #FFB300 50%, #FB8C00 100%)' } },
  archived:          { label: 'Archived',           cls: 'bg-surface-200 text-ink-500' },
}
