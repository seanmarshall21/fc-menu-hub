/**
 * Format a raw price value (string or number) using a currency spec.
 *
 *   formatPrice('14', { symbol: '$', decimals: 0,  show: true }) => '$14'
 *   formatPrice('14', { symbol: '$', decimals: 2,  show: true }) => '$14.00'
 *   formatPrice('14.5', { symbol: '$', decimals: 2, show: true }) => '$14.50'
 *   formatPrice('14',   { show: false })                        => '14'
 *   formatPrice('Market price', anyConfig)                       => 'Market price'
 *   formatPrice('$14', { symbol:'$', decimals:2 })               => '$14.00'  (re-formatted to the spec)
 *   formatPrice('£14',   anyConfig)                              => '£14'    (other currency, pass-through)
 *   formatPrice(null,   anyConfig)                               => ''
 */
export function formatPrice(raw, { symbol = '$', decimals = 0, show = true } = {}) {
  if (raw == null) return ''
  const s = String(raw).trim()
  if (!s) return ''
  // Letters or a NON-dollar currency symbol → an explicit label; pass through.
  // A leading '$' + number is re-formatted below so the spec's decimals apply
  // to every price (e.g. an imported "$15" becomes "$15.00").
  if (/[A-Za-z€£¥₹]/u.test(s)) return s
  // Strip everything except digits, decimal, leading minus ($ and commas go)
  const cleaned = s.replace(/[^\d.\-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return s
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return s
  const body = n.toFixed(Math.max(0, decimals | 0))
  return show ? `${symbol}${body}` : body
}

/**
 * Pull the resolved currency spec from a series + event pair. Event values
 * override series defaults when set.
 */
export function resolveCurrencySpec(series, event, menu) {
  return {
    symbol:   menu?.currency_symbol  ?? event?.currency_symbol  ?? series?.currency_symbol  ?? '$',
    decimals: menu?.decimal_places   ?? event?.decimal_places   ?? series?.decimal_places   ?? 0,
    show:     menu?.show_currency    ?? event?.show_currency    ?? series?.show_currency    ?? true,
  }
}
