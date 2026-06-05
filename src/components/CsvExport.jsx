import { useState } from 'react'
import { downloadMenuCsv } from '@/lib/downloadMenuCsv'

export default function CsvExport({ menu, items }) {
  const [open, setOpen] = useState(false)
  const [currency, setCurrency] = useState(true)

  function exportNow(useCurrency) {
    setOpen(false)
    downloadMenuCsv(menu, items, { useCurrency })
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
