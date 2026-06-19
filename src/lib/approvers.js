// ─────────────────────────────────────────────────────────────────────────────
// Cascading approver permissions. Like notify_user_ids, the effective list is
// the UNION of the column across brand → series → event → menu. Two kinds:
//   menu_approver_ids → who may flip a menu to Approved
//   edit_approver_ids → who may approve/reject pending item edits
//
// Resolution + gating rules:
//   - Admins can always approve (super-users).
//   - If the resolved list is NON-empty, only users in it (plus admins) can
//     approve — even internal users not on the list are blocked.
//   - If the resolved list is EMPTY (nobody configured anywhere), fall back
//     to the default: any internal user can approve.
// ─────────────────────────────────────────────────────────────────────────────

// Union the same column across the provided level rows (any may be null).
export function resolveApprovers(levels, column) {
  const out = new Set()
  for (const lvl of levels) {
    const arr = lvl && lvl[column]
    if (Array.isArray(arr)) for (const id of arr) if (id) out.add(id)
  }
  return [...out]
}

// Can this user approve, given the resolved approver list?
//   role      — 'admin' | 'internal' | 'external' | …
//   userId    — current user's id
//   resolved  — array of approver user ids (from resolveApprovers)
export function canApprove(role, userId, resolved) {
  if (role === 'admin') return true
  if (resolved && resolved.length > 0) return resolved.includes(userId)
  return role === 'internal'   // empty list → internal default
}
