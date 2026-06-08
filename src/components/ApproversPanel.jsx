import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import Modal from '@/components/Modal'

/**
 * Sign-off list for an event or a menu.
 *   <ApproversPanel targetType="event" targetId={event.id} title="Event sign-off" />
 *   <ApproversPanel targetType="menu"  targetId={menu.id}  title="Menu sign-off" />
 *
 * Anyone can see the list. Admin/internal can add or remove approvers.
 * The signed-in user can sign off their own row at any time.
 */
export default function ApproversPanel({ targetType, targetId, title = 'Approvals' }) {
  const { profile, isAdmin, isInternal } = useAuth()
  const canManage = isAdmin || isInternal

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error: err } = await supabase
      .from('approvers')
      .select('*')
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .order('created_at')
    if (err) setError(err.message)
    setRows(data || [])
    setLoading(false)
  }, [targetType, targetId])

  useEffect(() => { load() }, [load])

  // Hydrate user list once (admin/internal only — for the picker)
  useEffect(() => {
    if (!canManage) return
    supabase.from('user_profiles').select('id, email, full_name, role, company').order('full_name')
      .then(({ data }) => setUsers(data || []))
  }, [canManage])

  async function signOff(rowId, note) {
    setBusy(rowId); setError(null)
    const { error: err } = await supabase
      .from('approvers')
      .update({ signed_at: new Date().toISOString(), signed_note: note || null })
      .eq('id', rowId)
    if (err) setError(err.message)
    setBusy(null)
    load()
  }

  async function unsign(rowId) {
    setBusy(rowId)
    await supabase.from('approvers').update({ signed_at: null, signed_note: null }).eq('id', rowId)
    setBusy(null)
    load()
  }

  async function remove(rowId) {
    if (!confirm('Remove this approver?')) return
    setBusy(rowId)
    await supabase.from('approvers').delete().eq('id', rowId)
    setBusy(null)
    load()
  }

  async function addApprover({ userId, roleLabel }) {
    const user = users.find(u => u.id === userId)
    if (!user) return
    setError(null)
    const { error: err } = await supabase.from('approvers').insert({
      target_type: targetType,
      target_id: targetId,
      user_id: userId,
      email: user.email,
      display_name: user.full_name || null,
      role_label: roleLabel || null,
      created_by: profile?.id,
    })
    if (err) { setError(err.message); return }
    setShowAdd(false)
    load()
  }

  const totalCount = rows.length
  const signedCount = rows.filter(r => r.signed_at).length

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-100 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
          {totalCount > 0 && (
            <p className="text-[11px] text-ink-400 mt-0.5">{signedCount} of {totalCount} signed off</p>
          )}
        </div>
        {canManage && (
          <button onClick={() => setShowAdd(true)} className="btn-secondary btn-sm">+ Add approver</button>
        )}
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-red-600 bg-red-50 border-b border-red-200">{error}</div>
      )}

      {loading ? (
        <div className="px-4 py-6 text-sm text-ink-400">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-6 text-sm text-ink-400 text-center">No approvers assigned yet.</div>
      ) : (
        <ul className="divide-y divide-surface-100">
          {rows.map(row => {
            const isSelf = row.user_id === profile?.id
            const isSigned = !!row.signed_at
            return (
              <li key={row.id} className="px-4 py-3 flex items-start gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${isSigned ? 'bg-emerald-100 text-emerald-700' : 'bg-surface-100 text-ink-400'}`}>
                  {isSigned ? '✓' : (row.display_name?.[0] || row.email?.[0] || '?').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink-900 truncate">
                    {row.display_name || row.email}
                    {isSelf && <span className="ml-1.5 text-[10px] text-ink-400 font-normal">(you)</span>}
                  </div>
                  {row.role_label && <div className="text-[11px] text-ink-500 truncate">{row.role_label}</div>}
                  {isSigned ? (
                    <div className="text-[11px] text-emerald-700 mt-1">
                      Signed {new Date(row.signed_at).toLocaleString()}
                      {row.signed_note && <span className="italic text-ink-500"> — “{row.signed_note}”</span>}
                    </div>
                  ) : (
                    <div className="text-[11px] text-ink-400 mt-1">Awaiting approval</div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isSelf && !isSigned && (
                    <SignButton onConfirm={(note) => signOff(row.id, note)} disabled={busy === row.id} />
                  )}
                  {isSelf && isSigned && (
                    <button onClick={() => unsign(row.id)} disabled={busy === row.id} className="text-[11px] text-ink-400 hover:text-red-500">Unsign</button>
                  )}
                  {canManage && !isSelf && (
                    <button onClick={() => remove(row.id)} disabled={busy === row.id} className="text-[11px] text-ink-300 hover:text-red-500" title="Remove">✕</button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {showAdd && canManage && (
        <AddApproverModal
          users={users.filter(u => !rows.some(r => r.user_id === u.id))}
          onClose={() => setShowAdd(false)}
          onConfirm={addApprover}
        />
      )}
    </div>
  )
}

function SignButton({ onConfirm, disabled }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="text-xs px-2.5 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 font-medium"
      >
        Sign off
      </button>
      {open && (
        <Modal title="Sign off" onClose={() => setOpen(false)}>
          <p className="text-sm text-ink-600 mb-3">By signing off you confirm you've reviewed the contents of this and approve them.</p>
          <label className="label">Optional note</label>
          <textarea
            className="input"
            rows={3}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="e.g. Approved with revised pricing."
          />
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setOpen(false)} className="btn-secondary btn-sm">Cancel</button>
            <button onClick={async () => { await onConfirm(note.trim()); setOpen(false) }} className="btn-primary btn-sm">
              Sign off
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}

function AddApproverModal({ users, onClose, onConfirm }) {
  const [userId, setUserId] = useState('')
  const [roleLabel, setRoleLabel] = useState('')
  return (
    <Modal title="Add approver" onClose={onClose}>
      <p className="text-xs text-ink-500 mb-3">Pick an existing user. They'll see a sign-off button when they open this page.</p>
      <label className="label">User</label>
      <select className="input mb-3" value={userId} onChange={e => setUserId(e.target.value)}>
        <option value="">— Choose a user —</option>
        {users.map(u => (
          <option key={u.id} value={u.id}>
            {u.full_name || u.email} {u.company ? `· ${u.company}` : ''} ({u.role})
          </option>
        ))}
      </select>
      <label className="label">Role label <span className="text-ink-400 font-normal">(optional)</span></label>
      <input
        className="input"
        value={roleLabel}
        onChange={e => setRoleLabel(e.target.value)}
        placeholder="e.g. Sponsor rep, Vendor coordinator"
      />
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
        <button onClick={() => onConfirm({ userId, roleLabel })} disabled={!userId} className="btn-primary btn-sm">Add</button>
      </div>
    </Modal>
  )
}
