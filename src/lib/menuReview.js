// ─────────────────────────────────────────────────────────────────────────────
// Client-side menu review — fast, deterministic checks that catch the most
// common copy errors without needing a dictionary or LLM. Runs over the items
// of a single menu, returns a list of findings the user can act on.
//
// Findings are advisory — none of this auto-mutates the data.
// ─────────────────────────────────────────────────────────────────────────────

// Common menu typos (extend as you spot more in real copy).
const COMMON_TYPOS = {
  'tequilla': 'tequila',
  'vodca': 'vodka',
  'jalepeno': 'jalapeño',
  'jalapeno': 'jalapeño',
  'guacomole': 'guacamole',
  'margerita': 'margarita',
  'margharita': 'margarita',
  'expresso': 'espresso',
  'capucino': 'cappuccino',
  'parmesean': 'parmesan',
  'parmasen': 'parmesan',
  'caesar': 'caesar',
  'reciept': 'receipt',
  'occured': 'occurred',
  'definately': 'definitely',
  'seperate': 'separate',
  'choclate': 'chocolate',
  'mozarella': 'mozzarella',
  'sandwhich': 'sandwich',
  'ceasar': 'caesar',
  'lemonaid': 'lemonade',
  'beleive': 'believe',
  'recieve': 'receive',
}

/**
 * Run every check against the menu's items. Returns:
 *   [{ itemId, field, kind, message, suggestion? }]
 */
export function reviewMenuItems(items) {
  const findings = []
  if (!Array.isArray(items)) return findings

  const active = items.filter(i => i.status === 'active' || i.status === 'pending_approval')

  // ── Per-item checks ────────────────────────────────────────────────────
  for (const item of active) {
    const fields = {
      title: item.title || '',
      description: item.description || '',
      notes: item.notes || '',
    }
    for (const [field, raw] of Object.entries(fields)) {
      if (!raw) continue
      const text = String(raw)

      // 1. Double spaces
      if (/ {2,}/.test(text)) {
        findings.push({
          itemId: item.id, itemTitle: item.title, field,
          kind: 'spacing',
          message: 'Double space(s) in this field',
          suggestion: text.replace(/ +/g, ' '),
        })
      }

      // 2. Leading/trailing whitespace
      if (text !== text.trim()) {
        findings.push({
          itemId: item.id, itemTitle: item.title, field,
          kind: 'spacing',
          message: 'Extra whitespace at start or end',
          suggestion: text.trim(),
        })
      }

      // 3. Common typos
      const lowered = text.toLowerCase()
      for (const [bad, good] of Object.entries(COMMON_TYPOS)) {
        const re = new RegExp(`\\b${bad}\\b`, 'gi')
        if (re.test(lowered)) {
          findings.push({
            itemId: item.id, itemTitle: item.title, field,
            kind: 'typo',
            message: `"${bad}" → "${good}"`,
            suggestion: text.replace(re, (match) =>
              match[0] === match[0].toUpperCase() ? good[0].toUpperCase() + good.slice(1) : good
            ),
          })
        }
      }

      // 4. Doubled words ("the the", "and and")
      const dupRe = /\b(\w+)\s+\1\b/i
      if (dupRe.test(text)) {
        const m = text.match(dupRe)
        findings.push({
          itemId: item.id, itemTitle: item.title, field,
          kind: 'duplicate-word',
          message: `Repeated word: "${m[1]} ${m[1]}"`,
          suggestion: text.replace(/\b(\w+)\s+\1\b/i, '$1'),
        })
      }

      // 5. Smart-quote / ASCII apostrophe mix on the same field
      if (text.includes("'") && text.includes('’')) {
        findings.push({
          itemId: item.id, itemTitle: item.title, field,
          kind: 'punctuation',
          message: 'Mixed straight and curly apostrophes — pick one',
        })
      }
    }
  }

  // ── Cross-item consistency ──────────────────────────────────────────────
  // Same word capitalized differently across items.
  const wordVariants = new Map()       // lowercase → Map(actualForm → [itemIds])
  for (const item of active) {
    const allWords = `${item.title || ''} ${item.description || ''}`
      .split(/\s+/)
      .filter(w => /^[A-Za-z][A-Za-z'’-]{2,}$/.test(w))   // skip prices, sizes, single chars
    for (const w of allWords) {
      const key = w.toLowerCase()
      if (!wordVariants.has(key)) wordVariants.set(key, new Map())
      const m = wordVariants.get(key)
      if (!m.has(w)) m.set(w, [])
      m.get(w).push(item.id)
    }
  }
  for (const [key, variants] of wordVariants) {
    if (variants.size > 1) {
      // Skip cases where the difference is just first-word-of-sentence capitalization.
      const forms = [...variants.keys()]
      const onlyCaseFirst = forms.every(f => f.toLowerCase() === key)
      if (!onlyCaseFirst) continue
      // Add a single finding for the inconsistency, listing forms.
      findings.push({
        itemId: null, itemTitle: null, field: 'multiple',
        kind: 'consistency',
        message: `"${key}" appears as ${forms.map(f => `"${f}"`).join(' and ')} across items`,
        affectedItemIds: [...new Set([...variants.values()].flat())],
      })
    }
  }

  // Price unit consistency: items that have a Size but a different unit
  // (oz / OZ / Oz, ml vs mL, etc.) — pick the most common form and flag others.
  const unitOccurrences = new Map()
  const unitRe = /^\s*([\d.]+)\s*([A-Za-z]+)\s*$/
  for (const item of active) {
    for (const sizeField of ['size1', 'size2']) {
      const v = item[sizeField]
      if (!v) continue
      const m = String(v).match(unitRe)
      if (!m) continue
      const unit = m[2]
      const key = unit.toLowerCase()
      if (!unitOccurrences.has(key)) unitOccurrences.set(key, new Map())
      const m2 = unitOccurrences.get(key)
      m2.set(unit, (m2.get(unit) || 0) + 1)
    }
  }
  for (const [key, forms] of unitOccurrences) {
    if (forms.size <= 1) continue
    const sorted = [...forms.entries()].sort((a, b) => b[1] - a[1])
    const winning = sorted[0][0]
    const losers = sorted.slice(1).map(([f]) => f)
    findings.push({
      itemId: null, itemTitle: null, field: 'size',
      kind: 'consistency',
      message: `Mixed unit casing for "${key}" — saw "${winning}" (most common) and ${losers.map(l => `"${l}"`).join(', ')}`,
    })
  }

  return findings
}
