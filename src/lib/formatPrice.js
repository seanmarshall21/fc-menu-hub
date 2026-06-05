/**
 * Format a raw price value (string or number) using a currency spec.
 *
 *   formatPrice('14', { symbol: '$', decimals: 0,  show: true }) => '$14'
 *   formatPrice('14', { symbol: '$', decimals: 2,  show: true }) => '$14.00'
 *   formatPrice('14.5', { symbol: '$', decimals: 2, show: true }) => '$14.50'
 *   formatPrice('14',   { show: false })                        => '14'
 *   formatPrice('Market price', anyConfig)                       => 'Market price'
 *   formatPrice('$14',   anyConfig)                              => '$14'   (already formatted, pass-through)
 *   formatPrice(null,   anyConfig)                               => ''
 */
export function formatPrice(raw, { symbol = '$', decimals = 0, show = true } = {}) {
  if (raw == null) return ''
  const s = String(raw).trim()
  if (!s) return ''
  // Already has the symbol or non-numeric letters → pass through
  if (/[A-Za-z€£¥₹]|^\$/u.test(s)) return s
  // Strip everything except digits, decimal, leading minus
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
export function resolveCurrencySpec(series, event) {
  return {
    symbol:   event?.currency_symbol  ?? series?.currency_symbol  ?? '$',
    decimals: event?.decimal_places   ?? series?.decimal_places   ?? 0,
    show:     event?.show_currency    ?? series?.show_currency    ?? true,
  }
}
