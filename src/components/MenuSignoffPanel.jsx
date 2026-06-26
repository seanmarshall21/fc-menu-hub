import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { ROLES } from '@/lib/roster'
import { format } from 'date-fns'

// Per-menu sign-off. Shows each role's gate (required approvers + who's signed),
// lets a required approver sign their own row, and auto-advances the menu to
// Approved when the proofing gate completes (and back to Edits if a proofing
// sign-off is withdrawn while approved). Sponsorship is tracked but doesn't move
// the phase — it feeds the "ready" calculation.
//
// Props: menu, gates (from useMenuGates), needsSponsors (bool), onChanged
export default function MenuSignoffPanel({ menu, gates, needsSponsors, onChanged }) {
  const { profile, isAdmin, isInternal } = useAuth()
  const uid = profile?.id
  const canOverride = isAdmin || isInternal
  const [busy, setBusy] = useState(null)
  const [ackAi, setAckAi] = useState(false)

  if (!gates) return null
  const { byRole, signoffs, users } = gates
  const nameOf = (id) => { const u = users.find(x => x.id === id); return u ? (u.full_name || u.email) : 'Unknown' }

  // Force a menu to Approved despite incomplete proofing (someone holding it
  // up), recording who overrode it.
  async function overrideApprove() {
    const g = byRole.proofing.gate
    if (!confirm(`Proofing sign-off is ${g.signedCount}/${g.requiredCount}. Approve anyway and record an override?`)) return
    setBusy('override')
    try {
      await supabase.from('menus').update({
        phase: 'approved',
        approval_overridden_by: uid,
        approval_overridden_at: new Date().toISOString(),
      }).eq('id', menu.id)
      await gates.reload(); onChanged?.()
    } finally { setBusy(null) }
  }
  const signoffFor = (role, userId) => signoffs.find(s => s.role === role && s.user_id === userId)

  async function sign(role) {
    setBusy(role)
    try {
      await supabase.from('menu_signoffs').insert({
        menu_id: menu.id, role, user_id: uid,
        ai_reviewed: role === 'proofing' ? ackAi : false,
      })
      // Auto-advance: if proofing is now fully signed and the menu is still
      // pre-approval, mark it Approved.
      if (role === 'proofing') {
        const g = byRole.proofing.gate
        const willComplete = g.requiredCount > 0 && g.signedCount + 1 >= g.requiredCount
        if (willComplete && ['build', 'proof', 'edits'].includes(menu.phase)) {
          // Clean (fully-signed) approval — clear any prior override stamp.
          await supabase.from('menus').update({ phase: 'approved', approval_overridden_by: null, approval_overridden_at: null }).eq('id', menu.id)
        }
      }
      setAckAi(false)
      await gates.reload(); onChanged?.()
    } finally { setBusy(null) }
  }

  async function unsign(role) {
    setBusy(role)
    try {
      await supabase.from('menu_signoffs').delete().match({ menu_id: menu.id, role, user_id: uid })
      // Withdrawing a proofing sign-off un-approves the menu (back to Edits) so
      // it can't ship unverified — unless it's already past approval.
      if (role === 'proofing' && menu.phase === 'approved') {
        await supabase.from('menus').update({ phase: 'edits' }).eq('id', menu.id)
      }
      await gates.reload(); onChanged?.()
    } finally { setBusy(null) }
  }

  function GateSection({ roleDef }) {
    const { roster, inherited, gate } = byRole[roleDef.key]
    const mySignoff = uid && signoffFor(roleDef.key, uid)
    const amRequired = roster.some(r => r.user_id === uid)
    const sponsorGate = roleDef.key === 'sponsorship'
    // Sponsorship only matters when the menu needs sponsors.
    const dimmed = sponsorGate && !needsSponsors

    return (
      <div className={`card p-4 ${dimmed ? 'opacity-60' : ''}`}>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <h3 className="text-sm font-semibold text-ink-900">{roleDef.label} sign-off</h3>
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${gate.complete ? 'bg-emerald-50 text-emerald-700' : gate.hasRoster ? 'bg-amber-50 text-amber-700' : 'bg-surface-100 text-ink-400'}`}>
            {gate.hasRoster ? `${gate.signedCount}/${gate.requiredCount} signed` : 'no roster'}
          </span>
        </div>
        {sponsorGate && !needsSponsors && <p className="text-[11px] text-ink-400 mb-1.5">This menu isn't flagged for sponsors — no sign-off needed.</p>}
        {roster.length === 0 ? (
          <p className="text-xs text-ink-400 italic">No approvers set {inherited ? '(series default)' : ''} — gate is open.</p>
        ) : (
          <ul className="space-y-1.5">
            {roster.map(r => {
              const so = signoffFor(roleDef.key, r.user_id)
              return (
                <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className={so ? 'text-emerald-600' : 'text-ink-300'}>{so ? '✓' : '○'}</span>
                    <span className="text-ink-800">{nameOf(r.user_id)}</span>
                    {r.is_owner && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 font-semibold">OWNER</span>}
                  </span>
                  {so
                    ? <span className="text-[11px] text-ink-400">{format(new Date(so.signed_at), 'MMM d, h:mma')}</span>
                    : <span className="text-[11px] text-ink-300">awaiting</span>}
                </li>
              )
            })}
          </ul>
        )}

        {/* Sign / withdraw for the current user when they're a required approver */}
        {amRequired && (
          <div className="mt-3 pt-3 border-t border-surface-100">
            {mySignoff ? (
              <button onClick={() => unsign(roleDef.key)} disabled={busy === roleDef.key}
                className="text-xs text-ink-500 hover:text-red-600">Withdraw my sign-off</button>
            ) : (
              <div className="space-y-2">
                {roleDef.key === 'proofing' && (
                  <label className="flex items-start gap-2 text-xs text-ink-600 cursor-pointer">
                    <input type="checkbox" checked={ackAi} onChange={e => setAckAi(e.target.checked)} className="mt-0.5" />
                    <span>I reviewed this menu and ran/checked the AI review — no typos or errors.</span>
                  </label>
                )}
                <button onClick={() => sign(roleDef.key)}
                  disabled={busy === roleDef.key || (roleDef.key === 'proofing' && !ackAi)}
                  className="btn-primary btn-sm disabled:opacity-50">
                  {busy === roleDef.key ? 'Signing…' : `Sign off ${roleDef.label.toLowerCase()}`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const proofGate = byRole.proofing.gate
  const overridden = !!menu.approval_overridden_at
  const showOverride = canOverride && proofGate.hasRoster && !proofGate.complete && ['build', 'proof', 'edits'].includes(menu.phase)

  return (
    <div className="space-y-3">
      {overridden && menu.phase === 'approved' && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">
          ⚠ Approved by override — proofing sign-off was incomplete. Overridden by {nameOf(menu.approval_overridden_by)}.
        </div>
      )}
      {ROLES.map(rd => <GateSection key={rd.key} roleDef={rd} />)}
      {showOverride && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-ink-200 px-3 py-2">
          <span className="text-xs text-ink-500">Held up waiting on a sign-off? Your team can push it through.</span>
          <button onClick={overrideApprove} disabled={busy === 'override'}
            className="btn-secondary btn-sm whitespace-nowrap flex-shrink-0">
            {busy === 'override' ? 'Approving…' : 'Override & approve'}
          </button>
        </div>
      )}
    </div>
  )
}
