import { useState, useRef } from 'react'
import Papa from 'papaparse'
import { supabase } from '@/lib/supabase'
import { formatPrice } from '@/lib/formatPrice'

// CSV column map — matches the Master Menu Template format and the Google
// Sheets script vocabulary. Accepts both legacy ("added") and canonical
// ("active") status text, plus "pending approval" → draft (drafts in the
// app don't sync to Figma, mirroring how the Sheet treats Pending).
function mapStatus(raw) {
  const s = (raw || '').toString().trim().toLowerCase()
  if (s === 'active' || s === 'added')        return 'active'
  if (s === 'not added' || s === 'not_added') return 'not_added'
  // Pending Approval, Draft, blank, anything unknown → draft (won't sync)
  return 'draft'
}

// Normalize an imported price using the menu's currency spec so the form
// shows the same string the table/Figma do. Non-numeric values (e.g. "MP",
// "Ask server") pass through untouched.
function normalizePrice(raw, currency) {
  const s = (raw || '').toString().trim()
  if (!s) return null
  // Already non-numeric → pass through (MP, "Ask", "$14" already formatted, etc.)
  if (/[A-Za-z€£¥₹]|^\$/u.test(s)) return s
  return formatPrice(s, currency)
}

function parseRow(row, currency) {
  return {
    section:     (row['Section'] || '').trim(),
    title:       (row['Title'] || '').trim(),
    description: (row['Description'] || '').trim() || null,
    vt:          (row['VT'] || '').toUpperCase() === 'TRUE',
    ve:          (row['VE'] || '').toUpperCase() === 'TRUE',
    gf:          (row['GF'] || '').toUpperCase() === 'TRUE',
    two_sizes:   (row['2 Sizes'] || '').toUpperCase() === 'TRUE',
    size1:       (row['Size'] || '').trim() || null,
    price1:      normalizePrice(row['Price'], currency),
    size2:       (row['Size 2'] || '').trim() || null,
    price2:      normalizePrice(row['Price 2'], currency),
    status:      mapStatus(row['Status']),
    notes:       (row['Notes'] || '').trim() || null,
  }
}

// Order matches the Google Sheets script (Code.gs) and the exporter so a
// CSV downloaded from the app drops into the Master sheet without column
// reshuffling. The importer reads by header name so legacy CSVs with
// different orders still parse correctly.
const CSV_TEMPLATE_HEADERS = [
  'Section', 'Title', 'VT', 'VE', 'GF', 'Description',
  '2 Sizes', 'Size', 'Price', 'Size 2', 'Price 2', 'Status', 'Notes',
]
const CSV_TEMPLATE_EXAMPLE = [
  ['SIGNATURES',     'Waterfront Mule',    'FALSE', 'FALSE', 'FALSE', 'Vodka, ginger beer, lime, mint',  'FALSE', 'REGULAR', '14', '',      '',   'Active', ''],
  ['SIGNATURES',     'Bay Breeze Spritz',  'FALSE', 'TRUE',  'FALSE', 'Aperol, prosecco, blood orange',  'FALSE', 'REGULAR', '15', '',      '',   'Active', ''],
  ['SELTZERS & BEER','White Claw Variety', 'FALSE', 'TRUE',  'TRUE',  'Assorted flavors',                'FALSE', 'REGULAR', '8',  '',      '',   'Active', ''],
  ['SELTZERS & BEER','Modelo Especial',    'FALSE', 'FALSE', 'FALSE', 'Mexican lager',                   'TRUE',  'REGULAR', '9',  'LARGE', '12', 'Active', ''],
]

function downloadCsvTemplate() {
  const rows = [CSV_TEMPLATE_HEADERS, ...CSV_TEMPLATE_EXAMPLE]
  const csv  = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = 'menu-import-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export default function CsvImport({ menuId, currency, onImported }) {
  const fileRef = useRef(null)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState(null)
  const [importing, setImporting] = useState(false)
  const [mode, setMode] = useState('replace') // 'replace' | 'merge'

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)

    Papa.parse(file, {
      header: false,        // raw rows so we can find the real header row ourselves
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data
        // Scan until we find a row with both 'Section' and 'Title' — skips metadata rows
        const headerIdx = rows.findIndex(row =>
          row.some(c => c.trim() === 'Section') && row.some(c => c.trim() === 'Title')
        )
        if (headerIdx === -1) {
          setError('Could not find Section and Title columns. Make sure your CSV has the correct headers.')
          return
        }
        const headers = rows[headerIdx].map(h => h.trim())
        const parsed = rows.slice(headerIdx + 1)
          .map(row => {
            const obj = {}
            headers.forEach((h, i) => { obj[h] = (row[i] || '') })
            return obj
          })
          .filter(r => r['Section'] && r['Title'])
          .map(row => parseRow(row, currency))
        setPreview(parsed)
      },
      error: (err) => setError(err.message),
    })
  }

  async function handleImport() {
    if (!preview?.length) return
    setImporting(true)

    if (mode === 'replace') {
      await supabase.from('menu_items').delete().eq('menu_id', menuId)
    }

    const insertRows = preview.map((row, i) => ({
      menu_id:    menuId,
      sort_order: i,
      ...row,
    }))

    const { error } = await supabase.from('menu_items').insert(insertRows)
    setImporting(false)

    if (error) {
      setError(error.message)
    } else {
      onImported()
    }
  }

  return (
    <div className="card p-5 border-brand-100 bg-brand-50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-ink-900">Import CSV</h3>
        <button onClick={downloadCsvTemplate} className="btn-secondary btn-sm text-xs">
          ↓ Download Template
        </button>
      </div>

      <div className="flex flex-col gap-3 mb-4">
        <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="text-sm text-ink-700 max-w-full" />
        <div className="flex items-center gap-4 text-sm flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" value="replace" checked={mode === 'replace'} onChange={() => setMode('replace')} />
            Replace all items
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" value="merge" checked={mode === 'merge'} onChange={() => setMode('merge')} />
            Append items
          </label>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{error}</p>
      )}

      {preview && (
        <div className="mb-4">
          <p className="text-xs text-ink-500 mb-2">{preview.length} items parsed — preview (first 5):</p>
          <div className="bg-white border border-surface-200 rounded-lg overflow-auto max-h-48">
            <table className="text-xs w-full">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="px-3 py-2 text-left text-ink-400">Section</th>
                  <th className="px-3 py-2 text-left text-ink-400">Title</th>
                  <th className="px-3 py-2 text-left text-ink-400">Size</th>
                  <th className="px-3 py-2 text-left text-ink-400">Price</th>
                  <th className="px-3 py-2 text-left text-ink-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {preview.slice(0, 5).map((row, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 text-ink-700">{row.section}</td>
                    <td className="px-3 py-1.5 font-medium text-ink-900">{row.title}</td>
                    <td className="px-3 py-1.5 text-ink-500">{row.size1}</td>
                    <td className="px-3 py-1.5 text-ink-500">{row.price1}</td>
                    <td className="px-3 py-1.5 text-ink-500 capitalize">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={handleImport}
          disabled={!preview || importing}
          className="btn-primary btn-sm"
        >
          {importing ? 'Importing…' : `Import ${preview?.length || 0} items`}
        </button>
        <button onClick={onImported} className="btn-secondary btn-sm">Cancel</button>
      </div>
    </div>
  )
}
