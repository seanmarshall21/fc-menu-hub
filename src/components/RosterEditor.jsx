import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ROLES, effectiveRoster } from '@/lib/roster'

// Roster editor for approval roles. Works at two scopes:
//   <RosterEditor scope="series" scopeId={series.id} canEdit />
//   <RosterEditor scope="event"  scopeId={event.id} seriesId={series.id} canEdit />
// Event scope inherits the series default per role until overridden.
export default function RosterEditor({ scope, scopeId, seriesId, canEdit = false }) {
  const table = scope === 'series' ? 'series_approval_roles' : 'event_approval_roles'
  const idCol = scope === 'series' ? 'series_id' : 'event_id'

  const [rows, setRows] = useState([])           // this scope's rows
  const [seriesRows, setSeriesRows] = useState([]) // series default (event scope only)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [addingRole, setAddingRole] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [own, ser, u] = await Promise.all([
      supabase.from(table).select('*').eq(idCol, scopeId),
      scope === 'event' && seriesId
        ? supabase.from('series_approval_roles').select('*').eq('series_id', seriesId)
        : Promise.resolve({ data: [] }),
      supabase.rpc('list_taggable_users'),
    ])
    setRows(own.data || [])
    setSeriesRows(ser.data || [])
    setUsers(u.data || [])
    setLoading(false)
  }, [table, idCol, scopeId, scope, seriesId])

  useEffect(() => { load() }, [load])

  const nameOf = (id) => { const u = users.find(x => x.id === id); return u ? (u.full_name || u.email) : 'Unknown' }

  async function addApprover(role, userId) {
    const isFirst = !rows.some(r => r.role === role)
    await supabase.from(table).insert({ [idCol]: scopeId, role, user_id: userId, is_owner: isFirst })
    setAddingRole(null); load()
  }
  async function removeApprover(row) {
    await supabase.from(table).delete().eq('id', row.id)
    // If we removed the owner, promote the earliest remaining row in that role.
    const rest = rows.filter(r => r.role === row.role && r.id !== row.id)
    if (row.is_owner && rest.length) await supabase.from(table).update({ is_owner: true }).eq('id', rest[0].id)
    load()
  }
  async function setOwner(row) {
    await supabase.from(table).update({ is_owner: false }).eq(idCol, scopeId).eq('role', row.role)
    await supabase.from(table).update({ is_owner: true }).eq('id', row.id)
    load()
  }
  // Toggle whether a specific approver's sign-off is required. If a role has any
  // required approvers, all of them must sign; if none are required, any one is
  // enough.
  async function setRequired(row, val) {
    await supabase.from(table).update({ required: val }).eq('id', row.id)
    load()
  }
  // Event-scope: seed an override from the series default (or empty), or revert.
  async function overrideRole(role) {
    const seed = seriesRows.filter(r => r.role === role)
    if (seed.length) {
      await supabase.from(table).insert(seed.map(r => ({ [idCol]: scopeId, role, user_id: r.user_id, is_owner: r.is_owner, required: r.required !== false })))
    } else {
      // No series default — create an empty override marker by adding nothing;
      // the UI shows the editor once any row exists, so add the current user? No —
      // just open the add picker so they pick the owner.
      setAddingRole(role)
    }
    load()
  }
  async function revertRole(role) {
    await supabase.from(table).delete().eq(idCol, scopeId).eq('role', role)
    load()
  }

  if (loading) return <div className="text-sm text-ink-400">Loading roster…</div>

  return (
    <div className="space-y-5">
      {ROLES.map(roleDef => {
        const eff = effectiveRoster(rows, seriesRows, roleDef.key)
        const isOverride = scope === 'event' && !eff.inherited
        const ownRoleRows = rows.filter(r => r.role === roleDef.key)
        const used = new Set((isOverride || scope === 'series' ? ownRoleRows : eff.rows).map(r => r.user_id))
        const pickable = users.filter(u => !used.has(u.id))
        return (
          <div key={roleDef.key} className="card p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <h3 className="text-sm font-semibold text-ink-900">{roleDef.label} sign-off</h3>
                <p className="text-[11px] text-ink-400 mt-0.5">{roleDef.blurb}</p>
              </div>
              {scope === 'event' && (
                eff.inherited
                  ? canEdit && <button onClick={() => overrideRole(roleDef.key)} className="text-[11px] text-brand-600 hover:text-brand-800 whitespace-nowrap">Override for this event</button>
                  : canEdit && <button onClick={() => revertRole(roleDef.key)} className="text-[11px] text-ink-400 hover:text-ink-700 whitespace-nowrap">Revert to series default</button>
              )}
            </div>

            {scope === 'event' && eff.inherited && (
              <div className="text-[11px] text-ink-400 mb-2">Inherited from series default{eff.rows.length === 0 ? ' — none set' : ''}.</div>
            )}

            <ul className="space-y-1.5">
              {eff.rows.length === 0 && (
                <li className="text-xs text-ink-400 italic">No approvers set — this role's gate is open.</li>
              )}
              {eff.rows.map(r => (
                <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="text-ink-800">{nameOf(r.user_id)}</span>
                    {r.is_owner && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 font-semibold">OWNER</span>}
                  </span>
                  {canEdit && (isOverride || scope === 'series') && (
                    <span className="flex items-center gap-2 text-[11px]">
                      <label className="flex items-center gap-1 text-ink-500 cursor-pointer whitespace-nowrap" title="Their sign-off is required">
                        <input type="checkbox" checked={r.required !== false} onChange={e => setRequired(r, e.target.checked)} />
                        Required
                      </label>
                      {!r.is_owner && <button onClick={() => setOwner(r)} className="text-ink-400 hover:text-brand-600">Make owner</button>}
                      <button onClick={() => removeApprover(r)} className="text-ink-400 hover:text-red-600">Remove</button>
                    </span>
                  )}
                </li>
              ))}
            </ul>

            {canEdit && (isOverride || scope === 'series') && eff.rows.length > 0 && (
              <p className="mt-2 text-[11px] text-ink-400">
                {eff.rows.every(r => r.required === false)
                  ? 'No one is required — any one of these can approve.'
                  : 'Checked approvers must all sign. Uncheck everyone to let any one approve.'}
              </p>
            )}

            {canEdit && (isOverride || scope === 'series') && (
              <div className="mt-2">
                {addingRole === roleDef.key ? (
                  <select autoFocus className="input py-1 text-sm w-auto" defaultValue=""
                    onChange={e => { if (e.target.value) addApprover(roleDef.key, e.target.value) }}>
                    <option value="">Add approver…</option>
                    {pickable.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
                  </select>
                ) : (
                  <button onClick={() => setAddingRole(roleDef.key)} className="text-xs text-brand-600 hover:text-brand-800">+ Add approver</button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
