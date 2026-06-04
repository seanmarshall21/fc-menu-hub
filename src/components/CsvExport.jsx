import { useState } from 'react'
import Papa from 'papaparse'

/**
 * Format a numeric price as currency ($14, $14.50, etc.) when possible.
 * If the source value is non-numeric (e.g. "Market Price"), pass it through.
 */
function formatPrice(raw) {
  if (raw == null || raw === '') return ''
  const s = String(raw).trim()
  // If it already includes a currency symbol or letter, treat as text.
  if (/[a-zA-Z$€£¥]/.test(s)) return s
  const num = parseFloat(s.replace(/[^0-9.\-]/g, ''))
  if (Number.isNaN(num)) return s
  // Show $14 for whole dollars, $14.50 for decimals
  return num % 1 === 0 ? `$${num}` : `$${num.toFixed(2)}`
}

export default function CsvExport({ menu, items }) {
  const [open, setOpen] = useState(false)
  const [currency, setCurrency] = useState(true)

  function exportNow(useCurrency) {
    setOpen(false)
    const rows = items.map(item => ({
      Section:     item.section,
      Title:       item.title,
      VT:          item.vt ? 'TRUE' : 'FALSE',
      VE:          item.ve ? 'TRUE' : 'FALSE',
      GF:          item.gf ? 'TRUE' : 'FALSE',
      Description: item.description || '',
      '2 Sizes':   item.two_sizes ? 'TRUE' : 'FALSE',
      Size:        item.size1 || '',
      Price:       useCurrency ? formatPrice(item.price1) : (item.price1 || ''),
      'Size 2':    item.size2 || '',
      'Price 2':   useCurrency ? formatPrice(item.price2) : (item.price2 || ''),
      Status:      item.status === 'active' ? 'Added' : item.status === 'not_added' ? 'Not Added' : 'Draft',
      Notes:       item.notes || '',
    }))

    const csv = Papa.unparse(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${menu.name.replace(/\s+/g, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className="btn-secondary btn-sm">
        Export CSV
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-20 bg-white border border-surface-200 rounded-lg shadow-lg w-56 p-2 text-sm">
            <p className="text-xs text-ink-400 px-2 py-1">Price format:</p>
            <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-surface-50 rounded cursor-pointer">
              <input type="radio" name="csv-currency" checked={currency} onChange={() => setCurrency(true)} />
              <span>Currency <span className="text-ink-400 text-xs">($14)</span></span>
            </label>
            <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-surface-50 rounded cursor-pointer">
              <input type="radio" name="csv-currency" checked={!currency} onChange={() => setCurrency(false)} />
              <span>Plain number <span className="text-ink-400 text-xs">(14)</span></span>
            </label>
            <div className="border-t border-surface-100 my-1" />
            <button onClick={() => exportNow(currency)} className="w-full btn-primary btn-sm">Download</button>
          </div>
        </>
      )}
    </div>
  )
}
