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

  // ── Cross-item consistency (capitalization) ─────────────────────────────
  // Compare a word's casing ONLY within the same field type — titles against
  // titles, descriptions against descriptions. Titles are Title Case and
  // descriptions are sentence case, so "Tacos" in a title and "tacos" in a
  // description is expected, not a discrepancy. We also skip the first word
  // of each description (legit sentence-start capitalization).
  //
  // Each finding carries `occurrences` ({ itemId, itemTitle, field, form })
  // and `targetForms` (distinct forms, most-common first) so the UI can show
  // details + offer "make all use X" fixes.
  for (const fieldType of ['title', 'description']) {
    const wordMap = new Map() // lowercaseKey → Map(form → [{ itemId, itemTitle, field }])
    for (const item of active) {
      const raw = String(item[fieldType] || '')
      if (!raw.trim()) continue
      const words = raw.split(/\s+/)
      words.forEach((w, idx) => {
        // skip sentence-start word in descriptions (expected capital)
        if (fieldType === 'description' && idx === 0) return
        // strip trailing punctuation for the comparison, keep letters/’'-
        const cleaned = w.replace(/^[^A-Za-z]+|[^A-Za-z'’-]+$/g, '')
        if (!/^[A-Za-z][A-Za-z'’-]{2,}$/.test(cleaned)) return // skip prices/sizes/short
        const key = cleaned.toLowerCase()
        if (!wordMap.has(key)) wordMap.set(key, new Map())
        const forms = wordMap.get(key)
        if (!forms.has(cleaned)) forms.set(cleaned, [])
        forms.get(cleaned).push({ itemId: item.id, itemTitle: item.title, field: fieldType })
      })
    }
    for (const [key, forms] of wordMap) {
      if (forms.size < 2) continue
      // only a casing difference (same letters lowercased)
      const formList = [...forms.keys()]
      if (!formList.every(f => f.toLowerCase() === key)) continue
      const sorted = [...forms.entries()].sort((a, b) => b[1].length - a[1].length)
      const occurrences = sorted.flatMap(([form, occ]) => occ.map(o => ({ ...o, form })))
      findings.push({
        itemId: null, itemTitle: null, field: fieldType,
        kind: 'consistency',
        word: key,
        message: `"${key}" appears as ${formList.map(f => `"${f}"`).join(' and ')} across ${fieldType === 'title' ? 'titles' : 'descriptions'}`,
        affectedItemIds: [...new Set(occurrences.map(o => o.itemId))],
        occurrences,
        targetForms: sorted.map(([form, occ]) => ({ form, count: occ.length })),
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
