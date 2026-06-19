import React, { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatPrice } from '@/lib/formatPrice'
import MenuItemEditForm from './MenuItemEditForm'

const STATUS_LABELS  = { active: 'Active', not_added: 'Not Added', draft: 'Draft' }
const STATUS_CLASSES = {
  active:    'text-emerald-700 bg-emerald-50',
  not_added: 'text-ink-400 bg-surface-100',
  draft:     'text-amber-700 bg-amber-50',
}

// Default column registry for the menu items table. MenuPage may pass a
// reordered/resized subset via the `columns` prop.
export const DEFAULT_ITEM_COLUMNS = [
  { id: 'item',        label: 'Item',        defaultWidth: 220, minWidth: 140, frozen: true },
  { id: 'description', label: 'Description', defaultWidth: 280, minWidth: 100 },
  { id: 'diet',        label: 'Diet',        defaultWidth: 90,  minWidth: 60  },
  { id: 'sizeprice',   label: 'Size / Price',defaultWidth: 180, minWidth: 100 },
  { id: 'status',      label: 'Status',      defaultWidth: 160, minWidth: 110 },
]

export default function MenuItemRow({
  item, menu, canEdit, onUpdated, sections, onMoveUp, onMoveDown, isFirst, isLast, currency,
  columns = DEFAULT_ITEM_COLUMNS,
  defaultNotifyIds = [],
  // Batch selection (optional). When onToggleSelect is provided, a checkbox
  // renders in the frozen item cell.
  selected = false, onToggleSelect,
  // Optional drag-and-drop hooks supplied by a SortableContext parent
  dragRef, dragStyle, dragAttributes, dragListeners, isDragging,
}) {
  const { profile } = useAuth()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)

  async function approveItem() {
    if (!profile?.id) return
    setSaving(true)
    try {
      await supabase.from('menu_items').update({ edit_status: 'approved' }).eq('id', item.id)
      onUpdated()
    } finally {
      setSaving(false)
    }
  }

  const pendingFlag = item.edit_status === 'pending_approval'

  function cellByColumnId(colId, isFrozen) {
    const baseStyle = isFrozen
      ? { position: 'sticky', left: 0, background: pendingFlag ? '#fef2f2' : 'white', zIndex: 1 }
      : undefined
    switch (colId) {
      case 'item':
        return (
          <td className="px-4 py-3" style={baseStyle}>
            <div className="flex items-start gap-1.5">
              {canEdit && onToggleSelect && (
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleSelect(item.id)}
                  onClick={e => e.stopPropagation()}
                  className="mt-1 flex-shrink-0 rounded border-surface-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                  aria-label={`Select ${item.title}`}
                />
              )}
              {canEdit && dragListeners && (
                <button
                  {...dragListeners}
                  type="button"
                  className="text-ink-300 hover:text-ink-700 touch-none cursor-grab active:cursor-grabbing flex-shrink-0 mt-1 -ml-1"
                  aria-label="Drag to reorder"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <circle cx="5"  cy="4"  r="1.2" /><circle cx="11" cy="4"  r="1.2" />
                    <circle cx="5"  cy="8"  r="1.2" /><circle cx="11" cy="8"  r="1.2" />
                    <circle cx="5"  cy="12" r="1.2" /><circle cx="11" cy="12" r="1.2" />
                  </svg>
                </button>
              )}
              {canEdit && !dragListeners && (
                <div className="flex flex-col flex-shrink-0 mt-0.5 -ml-1">
                  <button onClick={onMoveUp} disabled={isFirst} className="text-ink-200 hover:text-brand-400 disabled:opacity-0 leading-none py-0.5 px-1 text-[10px]" title="Move up">▲</button>
                  <button onClick={onMoveDown} disabled={isLast} className="text-ink-200 hover:text-brand-400 disabled:opacity-0 leading-none py-0.5 px-1 text-[10px]" title="Move down">▼</button>
                </div>
              )}
              {pendingFlag && <span className="mt-0.5 w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="Pending approval" />}
              <div>
                <span className="font-medium text-ink-900">{item.title}</span>
                {item.layout === 'alt' && <span className="ml-1.5 text-xs text-ink-300 font-normal">alt</span>}
              </div>
            </div>
          </td>
        )
      case 'description':
        return (
          <td className="px-4 py-3 text-ink-500 align-top" style={baseStyle}>
            {item.layout === 'main' ? (
              item.description ? (
                <button
                  type="button"
                  onClick={() => setDescExpanded(v => !v)}
                  title={descExpanded ? 'Tap to collapse' : 'Tap to expand'}
                  style={
                    descExpanded
                      ? { textAlign: 'left', width: '100%', cursor: 'pointer' }
                      : {
                          textAlign: 'left', width: '100%', cursor: 'pointer',
                          display: '-webkit-box', WebkitBoxOrient: 'vertical',
                          WebkitLineClamp: 2, overflow: 'hidden', whiteSpace: 'normal',
                        }
                  }
                >
                  {item.description}
                </button>
              ) : '—'
            ) : <span className="text-ink-300 italic text-xs">alt layout</span>}
          </td>
        )
      case 'diet':
        return (
          <td className="px-4 py-3 text-center whitespace-nowrap" style={baseStyle}>
            {item.layout === 'main' && (
              <span className="text-xs text-ink-400 space-x-1">
                {item.vt && <span className="bg-emerald-100 text-emerald-700 rounded px-1">VT</span>}
                {item.ve && <span className="bg-emerald-100 text-emerald-700 rounded px-1">VE</span>}
                {item.gf && <span className="bg-amber-100 text-amber-700 rounded px-1">GF</span>}
              </span>
            )}
          </td>
        )
      case 'sizeprice':
        return (
          <td className="px-4 py-3 text-ink-700 text-xs whitespace-nowrap" style={baseStyle}>
            {item.two_sizes ? (
              <span>{item.size1} <b>{formatPrice(item.price1, currency)}</b> / {item.size2} <b>{formatPrice(item.price2, currency)}</b></span>
            ) : (
              <span>{item.size1} <b>{formatPrice(item.price1, currency)}</b></span>
            )}
          </td>
        )
      case 'status':
        return (
          <td className="px-4 py-3 whitespace-nowrap" style={baseStyle}>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLASSES[item.status] || ''}`}>
                {STATUS_LABELS[item.status] || item.status}
              </span>
              {canEdit && (
                <>
                  {pendingFlag && (
                    <button onClick={approveItem} disabled={saving} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium" title="Approve this edit">
                      {saving ? '…' : '✓'}
                    </button>
                  )}
                  <button onClick={() => setEditing(true)} className="w-7 h-7 inline-flex items-center justify-center rounded-md text-ink-400 hover:text-brand-600 hover:bg-brand-50" title="Edit item" aria-label="Edit item">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </td>
        )
      default:
        return null
    }
  }

  if (!editing) {
    return (
      <tr
        ref={dragRef}
        style={dragStyle}
        {...dragAttributes}
        className={`table-row-hover ${pendingFlag ? 'bg-red-50' : ''} ${isDragging ? 'opacity-50' : ''}`}
      >
        {columns.map(col => (
          <React.Fragment key={col.id}>
            {cellByColumnId(col.id, col.frozen)}
          </React.Fragment>
        ))}
      </tr>
    )
  }

  return (
    <tr className="bg-brand-50">
      <td colSpan={columns.length} className="px-4 py-4">
        <MenuItemEditForm
          item={item}
          menu={menu}
          sections={sections}
          defaultNotifyIds={defaultNotifyIds}
          onSaved={() => { setEditing(false); onUpdated() }}
          onCancel={() => setEditing(false)}
        />
      </td>
    </tr>
  )
}
