import Papa from 'papaparse'

function defaultFormatPrice(raw) {
  if (raw == null || raw === '') return ''
  const s = String(raw).trim()
  if (/[a-zA-Z$€£¥]/.test(s)) return s
  const num = parseFloat(s.replace(/[^0-9.\-]/g, ''))
  if (Number.isNaN(num)) return s
  return num % 1 === 0 ? `$${num}` : `$${num.toFixed(2)}`
}

/**
 * Build the CSV for a menu's items and trigger a browser download.
 *   downloadMenuCsv(menu, items, { useCurrency: true })
 *
 * Returns true on success, false if there's nothing to export.
 */
export function downloadMenuCsv(menu, items, { useCurrency = true } = {}) {
  if (!menu || !Array.isArray(items)) return false

  const rows = items.map(item => ({
    Section:     item.section,
    Title:       item.title,
    VT:          item.vt ? 'TRUE' : 'FALSE',
    VE:          item.ve ? 'TRUE' : 'FALSE',
    GF:          item.gf ? 'TRUE' : 'FALSE',
    Description: item.description || '',
    '2 Sizes':   item.two_sizes ? 'TRUE' : 'FALSE',
    Size:        item.size1 || '',
    Price:       useCurrency ? defaultFormatPrice(item.price1) : (item.price1 || ''),
    'Size 2':    item.size2 || '',
    'Price 2':   useCurrency ? defaultFormatPrice(item.price2) : (item.price2 || ''),
    Status:      item.status === 'active' ? 'Added' : item.status === 'not_added' ? 'Not Added' : 'Draft',
    Notes:       item.notes || '',
  }))

  const csv = Papa.unparse(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(menu.name || 'menu').replace(/\s+/g, '_')}.csv`
  a.click()
  URL.revokeObjectURL(url)
  return true
}
