// Role-based approval rosters. Each event×role has a list of REQUIRED approvers
// with exactly one owner (department lead). An event inherits the series default
// for a role unless it has its own rows for that role (override). A role's gate
// clears only when EVERY required approver has signed that menu.

export const ROLES = [
  { key: 'proofing',    label: 'Proofing',    blurb: 'Menus correct — spelling, grammar, no typos (run the AI review).' },
  { key: 'sponsorship', label: 'Sponsorship', blurb: 'Sponsors are correct on every menu that needs them.' },
]

// Effective roster rows for a role: the event's own rows if it has any for that
// role (override); otherwise the series default rows.
export function effectiveRoster(eventRows, seriesRows, role) {
  const ev = (eventRows || []).filter(r => r.role === role)
  if (ev.length) return { rows: ev, inherited: false }
  return { rows: (seriesRows || []).filter(r => r.role === role), inherited: true }
}

// Gate status for a role: who's required, who has signed, and whether complete.
export function gateStatus(rosterRows, signoffRows, role) {
  const required = (rosterRows || []).filter(r => r.role === role).map(r => r.user_id)
  const signed = new Set((signoffRows || []).filter(s => s.role === role).map(s => s.user_id))
  const signedReq = required.filter(u => signed.has(u))
  return {
    required,
    signedCount: signedReq.length,
    requiredCount: required.length,
    complete: required.length > 0 && signedReq.length === required.length,
    hasRoster: required.length > 0,
  }
}
