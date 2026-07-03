import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Editable per-menu print quantity, persisted via the set_menu_quantity RPC
// (admin/internal/production — no phase gate, works even when complete).
// onSaved(newQty) lets the parent mirror the value. Saves on blur / Enter.
export default function QuantityField({ menuId, value, onSaved, className = '', ariaLabel = 'Quantity' }) {
  const [val, setVal] = useState(value ?? '')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setVal(value ?? '') }, [value])

  async function save() {
    const q = val === '' ? null : Math.max(0, parseInt(val, 10) || 0)
    if (q === (value ?? null)) return
    setBusy(true)
    const { error } = await supabase.rpc('set_menu_quantity', { p_menu_id: menuId, p_quantity: q })
    setBusy(false)
    if (error) { setVal(value ?? ''); return }
    onSaved?.(q)
  }

  return (
    <input
      type="number" min="0" inputMode="numeric" aria-label={ariaLabel}
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={save}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      onClick={e => e.stopPropagation()}
      disabled={busy}
      placeholder="—"
      className={`input py-1 text-sm text-right ${className}`}
    />
  )
}
