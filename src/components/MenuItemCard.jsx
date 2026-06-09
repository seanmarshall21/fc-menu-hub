import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatPrice } from '@/lib/formatPrice'
import Modal from './Modal'
import MenuItemEditForm from './MenuItemEditForm'

const STATUS_LABELS = { active: 'Active', not_added: 'Not Added', draft: 'Draft' }
const STATUS_CLASSES = {
  active:    'text-emerald-700 bg-emerald-50',
  not_added: 'text-ink-400 bg-surface-100',
  draft:     'text-amber-700 bg-amber-50',
}

/**
 * Mobile-friendly card for a single menu item — used in place of the table
 * row on screens below the md breakpoint. Tap to open an edit modal that
 * reuses MenuItemEditForm.
 */
export default function MenuItemCard({ item, menu, canEdit, currency, sections, onUpdated, defaultNotifyIds = [] }) {
  const { profile } = useAuth()
  const [editing, setEditing] = useState(false)
  const [approving, setApproving] = useState(false)

  const pending = item.edit_status === 'pending_approval'

  async function approve(e) {
    e.stopPropagation()
    if (!profile?.id) return
    setApproving(true)
    try {
      await supabase.from('menu_items').update({ edit_status: 'approved' }).eq('id', item.id)
      onUpdated()
    } finally {
      setApproving(false)
    }
  }

  return (
    <>
      <div
        onClick={() => canEdit && setEditing(true)}
        className={`border rounded-lg p-3 ${pending ? 'border-red-200 bg-red-50' : 'border-surface-200 bg-white'} ${canEdit ? 'active:bg-surface-50 cursor-pointer' : ''}`}
      >
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            {pending && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="Pending approval" />}
            <span className="font-semibold text-ink-900 text-sm truncate">{item.title}</span>
            {item.layout === 'alt' && <span className="text-[10px] text-ink-400 flex-shrink-0">alt</span>}
          </div>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_CLASSES[item.status] || ''}`}>
            {STATUS_LABELS[item.status] || item.status}
          </span>
        </div>

        {item.layout === 'main' && item.description && (
          <p className="text-xs text-ink-500 line-clamp-2 mb-1.5">{item.description}</p>
        )}

        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="text-ink-700">
            {item.two_sizes ? (
              <span>{item.size1} <b>{formatPrice(item.price1, currency)}</b> · {item.size2} <b>{formatPrice(item.price2, currency)}</b></span>
            ) : (
              <span>{item.size1 ? `${item.size1} ` : ''}<b>{formatPrice(item.price1, currency)}</b></span>
            )}
          </div>
          {item.layout === 'main' && (item.vt || item.ve || item.gf) && (
            <div className="flex items-center gap-1 text-[10px] flex-shrink-0">
              {item.vt && <span className="bg-emerald-100 text-emerald-700 rounded px-1">VT</span>}
              {item.ve && <span className="bg-emerald-100 text-emerald-700 rounded px-1">VE</span>}
              {item.gf && <span className="bg-amber-100 text-amber-700 rounded px-1">GF</span>}
            </div>
          )}
        </div>

        {canEdit && pending && (
          <div className="flex justify-end mt-2 -mb-1">
            <button
              onClick={approve}
              disabled={approving}
              className="text-xs text-emerald-700 font-medium"
            >
              {approving ? '…' : '✓ Approve'}
            </button>
          </div>
        )}
      </div>

      {editing && (
        <Modal title="Edit item" onClose={() => setEditing(false)}>
          <MenuItemEditForm
            item={item}
            menu={menu}
            sections={sections}
            defaultNotifyIds={defaultNotifyIds}
            onSaved={() => { setEditing(false); onUpdated() }}
            onCancel={() => setEditing(false)}
          />
        </Modal>
      )}
    </>
  )
}
