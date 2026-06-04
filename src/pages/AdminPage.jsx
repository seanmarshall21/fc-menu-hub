import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import Modal from '@/components/Modal'

const ROLES = ['admin', 'internal', 'external']
const ROLE_LABELS = { admin: 'Admin', internal: 'Internal', external: 'External', pending: 'Pending' }
const ROLE_CLASSES = {
  admin:    'text-violet-700 bg-violet-50',
  internal: 'text-brand-700 bg-brand-50',
  external: 'text-ink-600 bg-surface-100',
  pending:  'text-amber-700 bg-amber-50',
}

async function callAdminFn(action, params) {
  const { data: { session } } = await supabase.auth.getSession()
  const { data, error } = await supabase.functions.invoke('admin-user-ops', {
    body: { action, ...params },
    headers: { Authorization: `Bearer ${session?.access_token}` },
  })
  if (error) {
    // Extract the actual error body from the edge function response
    if (error.context) {
      try {
        const body = await error.context.json()
        throw new Error(body.error || error.message)
      } catch (parseErr) {
        if (parseErr?.message && parseErr.message !== error.message) throw parseErr
      }
    }
    throw new Error(error.message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export default function AdminPage() {
  const { isAdmin, profile } = useAuth()
  const navigate = useNavigate()

  const [users, setUsers] = useState([])
  const [brands, setBrands] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Invite modal
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteCompany, setInviteCompany] = useState('')
  const [inviteRole, setInviteRole] = useState('external')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState(null)
  const [inviteSuccess, setInviteSuccess] = useState(false)

  // Inline edit state
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editCompany, setEditCompany] = useState('')
  const [editBrandAccess, setEditBrandAccess] = useState([])
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState(null)

  // Approve pending user
  const [approvingId, setApprovingId] = useState(null) // user id being approved
  const [approveRole, setApproveRole] = useState('internal')
  const [approving, setApproving] = useState(false)

  // Delete confirm
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!isAdmin) { navigate('/'); return }
    loadUsers()
    loadBrands()
  }, [isAdmin])

  async function loadUsers() {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('user_profiles')
      .select('*')
      .order('full_name')
    if (err) setError(err.message)
    setUsers(data || [])
    setLoading(false)
  }

  async function loadBrands() {
    const { data, error: err } = await supabase
      .from('brands')
      .select('id, name')
      .order('name')
    if (!err) setBrands(data || [])
  }

  // ── Invite ──────────────────────────────────────────────
  function openInvite() {
    setInviteEmail(''); setInviteName(''); setInviteCompany(''); setInviteRole('external')
    setInviteError(null); setInviteSuccess(false)
    setShowInvite(true)
  }

  async function handleInvite(e) {
    e.preventDefault()
    setInviting(true); setInviteError(null)
    try {
      await callAdminFn('invite', {
        email: inviteEmail.trim(),
        full_name: inviteName.trim() || null,
        company: inviteCompany.trim() || null,
        role: inviteRole,
      })
      setInviteSuccess(true)
      loadUsers()
    } catch (err) {
      setInviteError(err.message)
    } finally {
      setInviting(false)
    }
  }

  // ── Inline edit ──────────────────────────────────────────
  function startEdit(user) {
    setEditingId(user.id)
    setEditName(user.full_name || '')
    setEditRole(user.role || 'external')
    setEditCompany(user.company || '')
    setEditBrandAccess(Array.isArray(user.brand_access) ? user.brand_access : [])
    setEditError(null)
  }

  function cancelEdit() {
    setEditingId(null); setEditError(null)
  }

  // Modal-side delete that closes the editor and opens the confirm dialog
  function requestDeleteFromEditor() {
    if (!editingId) return
    setConfirmDeleteId(editingId)
    setEditingId(null)
  }

  function toggleEditBrand(brandId) {
    setEditBrandAccess(prev =>
      prev.includes(brandId) ? prev.filter(id => id !== brandId) : [...prev, brandId]
    )
  }

  async function saveEdit(userId) {
    setEditSaving(true); setEditError(null)
    try {
      // brand_access is only meaningful for external users; clear it for admin/internal
      await callAdminFn('update', {
        userId,
        full_name: editName.trim(),
        role: editRole,
        company: editCompany.trim(),
        brand_access: editRole === 'external' ? editBrandAccess : null,
      })
      setEditingId(null)
      loadUsers()
    } catch (err) {
      setEditError(err.message)
    } finally {
      setEditSaving(false)
    }
  }

  // ── Approve ──────────────────────────────────────────────
  function startApprove(user) {
    setApprovingId(user.id)
    setApproveRole('internal')
  }

  async function handleApprove(userId) {
    setApproving(true)
    try {
      await callAdminFn('update', { userId, role: approveRole })
      setApprovingId(null)
      loadUsers()
    } catch (err) {
      setError(err.message)
    } finally {
      setApproving(false)
    }
  }

  // ── Delete ───────────────────────────────────────────────
  async function handleDelete(userId) {
    setDeleting(true)
    try {
      await callAdminFn('delete', { userId })
      setConfirmDeleteId(null)
      loadUsers()
    } catch (err) {
      setError(err.message)
      setConfirmDeleteId(null)
    } finally {
      setDeleting(false)
    }
  }

  if (!isAdmin) return null

  const confirmUser = users.find(u => u.id === confirmDeleteId)

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-4xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-ink-900 tracking-tight mb-1">User Management</h1>
          <p className="text-sm text-ink-400">Invite, edit, and manage access for all Menu Hub users.</p>
        </div>
        <button onClick={openInvite} className="btn-primary btn-sm gap-1.5 flex-shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add User
        </button>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}

      <div className="card overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-surface-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-900">All Users</h2>
          <div className="flex items-center gap-2">
            {users.filter(u => u.role === 'pending').length > 0 && (
              <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                {users.filter(u => u.role === 'pending').length} pending
              </span>
            )}
            <span className="text-xs text-ink-400">{users.length} total</span>
          </div>
        </div>

        {loading ? (
          <div className="px-6 py-8 text-sm text-ink-400">Loading…</div>
        ) : users.length === 0 ? (
          <div className="px-6 py-8 text-sm text-ink-400">No users found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-surface-100">
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-ink-400 uppercase tracking-wider">User</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-ink-400 uppercase tracking-wider hidden md:table-cell">Email</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-ink-400 uppercase tracking-wider">Company</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-ink-400 uppercase tracking-wider">Role</th>
                  <th className="px-4 sm:px-6 py-3 py-3 text-right text-xs font-medium text-ink-400 uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {/* Pending users first, then alphabetical */}
                {[...users]
                  .sort((a, b) => {
                    if (a.role === 'pending' && b.role !== 'pending') return -1
                    if (b.role === 'pending' && a.role !== 'pending') return 1
                    return (a.full_name || a.email || '').localeCompare(b.full_name || b.email || '')
                  })
                  .map(user => {
                    const isPendingUser = user.role === 'pending'
                    const isApprovingUser = approvingId === user.id
                    const isSelf = user.id === profile?.id

                    const externalBrandCount = Array.isArray(user.brand_access) ? user.brand_access.length : 0

                    return (
                      <tr key={user.id} className={
                        isPendingUser ? 'bg-amber-50' :
                        'table-row-hover'
                      }>
                        {/* Name */}
                        <td className="px-4 sm:px-6 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${isPendingUser ? 'bg-amber-100 text-amber-700' : 'bg-brand-100 text-brand-600'}`}>
                              {user.full_name?.[0] || user.email?.[0] || '?'}
                            </div>
                            <span className="font-medium text-ink-900 whitespace-nowrap">
                              {user.full_name || '—'}
                              {isSelf && <span className="ml-1.5 text-xs text-ink-300 font-normal">(you)</span>}
                            </span>
                          </div>
                        </td>

                        {/* Email (desktop+ only) */}
                        <td className="px-4 sm:px-6 py-3 text-ink-500 whitespace-nowrap hidden md:table-cell">{user.email}</td>

                        {/* Company */}
                        <td className="px-4 sm:px-6 py-3 text-ink-500 whitespace-nowrap">
                          {user.company || <span className="text-ink-300">—</span>}
                        </td>

                        {/* Role */}
                        <td className="px-4 sm:px-6 py-3">
                          {isApprovingUser ? (
                            <select className="input py-1.5 text-sm w-28" value={approveRole} onChange={e => setApproveRole(e.target.value)} autoFocus>
                              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                            </select>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium self-start ${ROLE_CLASSES[user.role] || 'text-ink-500 bg-surface-100'}`}>
                                {ROLE_LABELS[user.role] || user.role}
                              </span>
                              {user.role === 'external' && (
                                <span className="text-[10px] text-ink-400 leading-tight">
                                  {externalBrandCount === 0
                                    ? 'No brand access'
                                    : `${externalBrandCount} of ${brands.length} ${brands.length === 1 ? 'brand' : 'brands'}`}
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-3 sm:px-6 py-3 text-right">
                          {isApprovingUser ? (
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => handleApprove(user.id)} disabled={approving}
                                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded px-2 py-1 transition-colors disabled:opacity-50">
                                {approving ? '…' : 'Approve'}
                              </button>
                              <button onClick={() => setApprovingId(null)} className="text-xs text-ink-400 hover:text-ink-700">Cancel</button>
                            </div>
                          ) : isPendingUser ? (
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => startApprove(user)}
                                className="text-xs bg-amber-500 hover:bg-amber-600 text-white font-medium rounded px-2 py-1 transition-colors">
                                Approve
                              </button>
                              <button onClick={() => setConfirmDeleteId(user.id)} className="text-xs text-red-400 hover:text-red-600 font-medium">
                                Deny
                              </button>
                            </div>
                          ) : !isSelf && (
                            <button
                              onClick={() => startEdit(user)}
                              className="w-8 h-8 inline-flex items-center justify-center rounded-md text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                              aria-label="Edit user"
                              title="Edit user"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Role legend */}
      <div className="mt-6 card p-4">
        <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-3">Role Permissions</p>
        <div className="space-y-2">
          <div className="flex items-start gap-3">
            <span className="text-xs px-2 py-0.5 rounded-full font-medium text-violet-700 bg-violet-50 flex-shrink-0 mt-px">Admin</span>
            <span className="text-xs text-ink-500">Full access. Create brands, manage users, approve edits, and access all menus.</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-xs px-2 py-0.5 rounded-full font-medium text-brand-700 bg-brand-50 flex-shrink-0 mt-px">Internal</span>
            <span className="text-xs text-ink-500">Edit menu items, import/export CSVs, view edit logs. Cannot manage users or create brands.</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-xs px-2 py-0.5 rounded-full font-medium text-ink-600 bg-surface-100 flex-shrink-0 mt-px">External</span>
            <span className="text-xs text-ink-500">Read-only access to assigned menus and items.</span>
          </div>
        </div>
      </div>

      {/* ── Invite modal ── */}
      {showInvite && (
        <Modal title="Add User" onClose={() => setShowInvite(false)}>
          {inviteSuccess ? (
            <div className="text-center py-4">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium text-ink-900 mb-1">User added!</p>
              <p className="text-xs text-ink-500 mb-1"><span className="font-medium">{inviteEmail}</span> can now sign in at:</p>
              <p className="text-xs font-mono bg-surface-100 rounded px-2 py-1 text-ink-700 mb-3 inline-block">fcmenus.netlify.app</p>
              <p className="text-xs text-ink-400 mb-4">No email was sent — let them know directly. They can sign in with Google or via magic link.</p>
              <div className="flex gap-2 justify-center">
                <button onClick={() => { setInviteSuccess(false); setInviteEmail(''); setInviteName('') }} className="btn-secondary btn-sm">Add Another</button>
                <button onClick={() => setShowInvite(false)} className="btn-primary btn-sm">Done</button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="label">Email Address</label>
                <input
                  className="input"
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="user@example.com"
                  required autoFocus
                />
              </div>
              <div>
                <label className="label">Full Name <span className="text-ink-300 font-normal">(optional)</span></label>
                <input
                  className="input"
                  value={inviteName}
                  onChange={e => setInviteName(e.target.value)}
                  placeholder="Jane Smith"
                  spellCheck
                />
              </div>
              <div>
                <label className="label">Company <span className="text-ink-300 font-normal">(optional)</span></label>
                <input
                  className="input"
                  value={inviteCompany}
                  onChange={e => setInviteCompany(e.target.value)}
                  placeholder="e.g. CRSSD"
                  spellCheck
                />
              </div>
              <div>
                <label className="label">Role</label>
                <select className="input" value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
                  {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>
              {inviteError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{inviteError}</p>
              )}
              <div className="flex items-center justify-end gap-3 pt-1">
                <button type="button" onClick={() => setShowInvite(false)} className="btn-secondary btn-sm">Cancel</button>
                <button type="submit" className="btn-primary btn-sm" disabled={inviting}>
                  {inviting ? 'Adding…' : 'Add User'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {/* ── Edit User modal ── */}
      {editingId && (() => {
        const editingUser = users.find(u => u.id === editingId)
        return (
          <Modal title="Edit User" onClose={cancelEdit}>
            <form onSubmit={e => { e.preventDefault(); saveEdit(editingId) }} className="space-y-4">
              <div>
                <label className="label">Full Name</label>
                <input className="input" value={editName} onChange={e => setEditName(e.target.value)}
                  placeholder="Full name" spellCheck autoFocus />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input bg-surface-50 text-ink-400" value={editingUser?.email || ''} disabled />
              </div>
              <div>
                <label className="label">Company <span className="text-ink-300 font-normal">(optional)</span></label>
                <input className="input" value={editCompany} onChange={e => setEditCompany(e.target.value)}
                  placeholder="e.g. CRSSD" spellCheck />
              </div>
              <div>
                <label className="label">Role</label>
                <select className="input" value={editRole} onChange={e => setEditRole(e.target.value)}>
                  {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>

              {editRole === 'external' && (
                <div>
                  <label className="label">Brand Access</label>
                  {brands.length === 0 ? (
                    <p className="text-xs text-ink-400">No brands yet — create one first.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {brands.map(b => {
                        const checked = editBrandAccess.includes(b.id)
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => toggleEditBrand(b.id)}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                              checked
                                ? 'bg-brand-600 text-white border-brand-600 hover:bg-brand-700'
                                : 'bg-white text-ink-600 border-surface-200 hover:border-brand-300'
                            }`}
                          >
                            {b.name}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  <p className="text-[11px] text-ink-400 mt-2">
                    External users will only see menus under selected brands once read access is locked down.
                  </p>
                </div>
              )}

              {editError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{editError}</p>
              )}

              <div className="flex items-center justify-between gap-3 pt-2 border-t border-surface-100 mt-4">
                <button type="button" onClick={requestDeleteFromEditor}
                  className="text-xs text-red-500 hover:text-red-700 font-medium">
                  Delete User
                </button>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={cancelEdit} className="btn-secondary btn-sm">Cancel</button>
                  <button type="submit" disabled={editSaving} className="btn-primary btn-sm">
                    {editSaving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </form>
          </Modal>
        )
      })()}

      {/* ── Delete confirm modal ── */}
      {confirmDeleteId && (
        <Modal title="Delete User" onClose={() => setConfirmDeleteId(null)}>
          <p className="text-sm text-ink-600 mb-1">
            Are you sure you want to delete <span className="font-medium text-ink-900">{confirmUser?.full_name || confirmUser?.email}</span>?
          </p>
          <p className="text-xs text-ink-400 mb-6">This will revoke their access immediately. This action cannot be undone.</p>
          <div className="flex items-center justify-end gap-3">
            <button onClick={() => setConfirmDeleteId(null)} className="btn-secondary btn-sm">Cancel</button>
            <button
              onClick={() => handleDelete(confirmDeleteId)}
              disabled={deleting}
              className="btn-sm bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg px-3 py-1.5 text-sm transition-colors"
            >
              {deleting ? 'Deleting…' : 'Delete User'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
