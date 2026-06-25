// Deterministic layout-fit solver — the app-side mirror of the Figma plugin's
// auto-fit. Same math, same authoritative spec slots, so the in-app preview's
// "best size" matches what the plugin will produce.
//
// The only free variables are the item gap and the section gap (head, footer,
// dividers, and item content are fixed). We solve gaps to fill the available
// height while keeping the section:item ratio inside [rMin, rMax].

// Authoritative item-area heights per size + sponsor state (from the design
// spec): menuHeight − head − footer − 120px vertical padding. Content width is
// always 1300px, so item heights are identical across sizes.
export const ITEM_SLOT = {
  lg: { sponsors: 2404, none: 2574 },
  md: { sponsors: 1586, none: 1756 },
  sm: { sponsors: 769,  none: 939 },
}

export function slotFor(size, sponsors) {
  const row = ITEM_SLOT[size]
  if (!row) return null
  return sponsors ? row.sponsors : row.none
}

// solve gap = (A - C) / (I + S*ratio), nudging ratio within range to keep the
// item gap inside [gMin, gMax]. status: ok | overflow | sparse | single.
export function solveGaps(A, { C, I, S }, opts = {}) {
  const { rTarget = 1.5, rMin = 1.3, rMax = 2.0, gMin = 8, gMax = 400 } = opts
  if (I + S === 0) return { itemGap: Math.round(gMin), sectionGap: Math.round(gMin * rTarget), ratio: rTarget, status: 'single', free: A - C }
  const gFor = r => { const d = I + S * r; return d > 0 ? (A - C) / d : 0 }
  let r = rTarget, g = gFor(r)
  if (g > gMax) { r = rMax; g = gFor(r) }
  else if (g < gMin) { r = rMin; g = gFor(r) }
  let status = 'ok'
  if (g < gMin) { status = 'overflow'; g = gMin }
  else if (g > gMax) { status = 'sparse'; g = gMax }
  return { itemGap: Math.round(g), sectionGap: Math.round(g * r), ratio: Math.round(r * 100) / 100, status, free: A - C }
}

// Evaluate the content against all three sizes in the given sponsor state and
// pick the most comfortable. Content height is constant across sizes (fixed
// 1300px width), so this is exact.
export function recommendSize(metrics, sponsors, opts = {}) {
  const sizes = ['sm', 'md', 'lg']
  const perSize = {}
  let best = null
  for (const size of sizes) {
    const avail = slotFor(size, sponsors)
    if (!avail) continue
    const sol = solveGaps(avail, metrics, opts)
    perSize[size] = sol
    const rank = sol.status === 'ok' ? 0 : (sol.status === 'sparse' ? 1 : 2)
    const comfy = Math.abs(sol.itemGap - 24)
    const cand = { size, rank, comfy }
    if (!best || cand.rank < best.rank || (cand.rank === best.rank && cand.comfy < best.comfy)) best = cand
  }
  if (!best) return { size: null, reason: '', perSize }
  const sol = perSize[best.size]
  const reason = sol.status === 'ok' ? 'comfortable spacing'
    : sol.status === 'sparse' ? 'least empty space'
    : 'tightest fit — may overflow'
  return { size: best.size, reason, perSize }
}

// Measure gap-free content height (C), inter-item gap count (I), and inter-
// section gap count (S) from a rendered TemplateCanvas DOM subtree. Uses
// offsetHeight, which ignores the CSS scale transform. Returns null if the
// preview hasn't rendered. Only item heights count toward C — the rotated
// section label sits beside the items and doesn't add vertical height.
export function measureFit(root) {
  if (!root) return null
  const cols = root.querySelectorAll('[data-sections-column="1"]')
  if (!cols.length) return null
  let best = null
  cols.forEach(col => {
    const sections = col.querySelectorAll('[data-section="1"]')
    if (!sections.length) return
    let C = 0, I = 0
    sections.forEach(sec => {
      const itemsCol = sec.querySelector('[data-items-col="1"]') || sec
      const items = itemsCol.querySelectorAll('[data-item="1"]')
      items.forEach(it => { C += it.offsetHeight })
      I += Math.max(0, items.length - 1)
    })
    const S = Math.max(0, sections.length - 1)
    // Pick the column with the most content (handles single- and multi-column).
    if (!best || C > best.C) best = { C, I, S }
  })
  return best
}
