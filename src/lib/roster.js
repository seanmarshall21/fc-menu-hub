// Role-based approval rosters. Each event×role has a list of REQUIRED approvers
// with exactly one owner (department lead). An event inherits the series default
// for a role unless it has its own rows for that role (override). A role's gate
// clears only when EVERY required approver has signed that menu.

export const ROLES = [
  { key: 'proofing',    label: 'Proofing',    blurb: 'Menus correct — spelling, grammar, no typos (run the AI review).' },
  { key: 'sponsorship', label: 'Sponsorship', blurb: 'Sponsors are correct on every menu that needs them.' },
]

// Effective roster rows for a role: the event's own rows if it has any for that
// role (override); otherwise the series default rows. `mode` is the role's
// approval mode ('all' = every approver must sign, 'any' = one is enough),
// read from the rows (they share it).
export function effectiveRoster(eventRows, seriesRows, role) {
  const ev = (eventRows || []).filter(r => r.role === role)
  const rows = ev.length ? ev : (seriesRows || []).filter(r => r.role === role)
  const mode = rows[0]?.approval_mode === 'any' ? 'any' : 'all'
  return { rows, inherited: !ev.length, mode }
}

// Gate status for a role. Per-approver `required` flag drives it:
//   • some approvers required → ALL of those required ones must sign
//   • none required           → ANY one approver in the role is enough
// (Optional approvers may still sign; they just don't block.)
export function gateStatus(rosterRows, signoffRows, role) {
  const rows = (rosterRows || []).filter(r => r.role === role)
  const signed = new Set((signoffRows || []).filter(s => s.role === role).map(s => s.user_id))
  const requiredUsers = rows.filter(r => r.required !== false).map(r => r.user_id)
  const anyMode = requiredUsers.length === 0
  let signedCount, neededCount, complete
  if (anyMode) {
    signedCount = rows.filter(r => signed.has(r.user_id)).length
    neededCount = rows.length ? 1 : 0
    complete = rows.length > 0 && signedCount >= 1
  } else {
    const signedReq = requiredUsers.filter(u => signed.has(u))
    signedCount = signedReq.length
    neededCount = requiredUsers.length
    complete = signedReq.length === requiredUsers.length
  }
  return {
    required: requiredUsers,
    anyMode,
    signedCount,
    requiredCount: rows.length,
    neededCount,
    complete,
    hasRoster: rows.length > 0,
  }
}
