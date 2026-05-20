import Papa from 'papaparse'

export default function CsvExport({ menu, items }) {
  function handleExport() {
    const rows = items.map(item => ({
      Section:     item.section,
      Title:       item.title,
      VT:          item.vt ? 'TRUE' : 'FALSE',
      VE:          item.ve ? 'TRUE' : 'FALSE',
      GF:          item.gf ? 'TRUE' : 'FALSE',
      Description: item.description || '',
      '2 Sizes':   item.two_sizes ? 'TRUE' : 'FALSE',
      Size:        item.size1 || '',
      Price:       item.price1 || '',
      'Size 2':    item.size2 || '',
      'Price 2':   item.price2 || '',
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
    <button onClick={handleExport} className="btn-secondary btn-sm">
      Export CSV
    </button>
  )
}
