/**
 * MenuPreview — web-based visual proof of a menu.
 * Approximates the Figma template layout: sections with items in
 * main (with description) or alt (compact) layout, sponsor strip at bottom.
 */

// ── Diet icon SVGs (approximating the Figma icons) ──────────────────────────
const IcnVegetarian = () => (
  <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="9" stroke="#758080" strokeWidth="1.5" />
    <path d="M6 10c1.5-3 4-4 7-3-1 3-3 5-7 5v-2z" fill="#758080" />
  </svg>
)
const IcnVegan = () => (
  <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="9" stroke="#C78454" strokeWidth="1.5" />
    <path d="M7 13c0-4 2-7 6-7-1 4-3 7-6 7z" fill="#C78454" />
  </svg>
)
const IcnGF = () => (
  <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="9" stroke="#CE8063" strokeWidth="1.5" />
    <text x="10" y="14" textAnchor="middle" fontSize="8" fill="#CE8063" fontWeight="700">GF</text>
  </svg>
)

// ── Group items into consecutive section chunks ──────────────────────────────
// Preserves duplicate section names at different positions in the menu
export function buildSectionGroups(items) {
  const groups = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    if (last && last.section === item.section) {
      last.items.push(item)
    } else {
      groups.push({ section: item.section, key: `${item.section}__${groups.length}`, items: [item] })
    }
  }
  return groups
}

// ── Price group (size label + price) ─────────────────────────────────────────
function PriceGroup({ size, price, align = 'right' }) {
  if (!price) return null
  return (
    <div className={`flex-shrink-0 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {size && <div className="text-[10px] uppercase tracking-widest text-gray-400 font-medium">{size}</div>}
      <div className="font-bold text-[18px] leading-tight text-gray-900">{price}</div>
    </div>
  )
}

// ── Single item — main layout ─────────────────────────────────────────────────
// Left: title + diet icons + description
// Right: price_group_1 stacked above price_group_2 (vertical column)
function ItemMain({ item }) {
  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-start justify-between gap-6">
        {/* Details column */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-1">
            <span className="font-bold text-[15px] leading-tight text-gray-900 uppercase tracking-wide">
              {item.title}
            </span>
            {(item.vt || item.ve || item.gf) && (
              <div className="flex items-center gap-1 pt-0.5 flex-shrink-0">
                {item.vt && <IcnVegetarian />}
                {item.ve && <IcnVegan />}
                {item.gf && <IcnGF />}
              </div>
            )}
          </div>
          {item.description && (
            <p className="text-[12px] leading-snug text-gray-500">{item.description}</p>
          )}
        </div>
        {/* Price column — group_1 on top, group_2 below (matches Figma price-group-column) */}
        <div className="flex flex-col gap-1 flex-shrink-0">
          <PriceGroup size={item.size1} price={item.price1} align="right" />
          {item.two_sizes && <PriceGroup size={item.size2} price={item.price2} align="right" />}
        </div>
      </div>
    </div>
  )
}

// ── Single item — alt layout ──────────────────────────────────────────────────
// Title only (description hidden, diet icons hidden per Figma)
// Prices in a horizontal row: price_group_2 LEFT, price_group_1 RIGHT (Figma order)
function ItemAlt({ item }) {
  return (
    <div className="py-2 border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between gap-4">
        {/* Title — no description, no diet icons (hidden in Figma alt layout) */}
        <span className="font-bold text-[14px] text-gray-900 uppercase tracking-wide flex-1 min-w-0 truncate">
          {item.title}
        </span>
        {/* Price row — group_1 on left, group_2 on right.
            Single price stays left-anchored so it doesn't float right. */}
        <div className="flex items-center gap-6 flex-shrink-0">
          <PriceGroup size={item.size1} price={item.price1} align="right" />
          {item.two_sizes && <PriceGroup size={item.size2} price={item.price2} align="right" />}
        </div>
      </div>
    </div>
  )
}

// ── Sponsor strip ─────────────────────────────────────────────────────────────
function SponsorStrip({ sponsors }) {
  if (!sponsors.length) return null
  return (
    <div className="mt-6 pt-4 border-t border-gray-200">
      <div className="flex flex-wrap items-center justify-center gap-4">
        {sponsors.map(sp => (
          sp.logo_url ? (
            <img key={sp.id} src={sp.logo_url} alt={sp.name}
              className="h-6 object-contain opacity-80" />
          ) : (
            <span key={sp.id} className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
              {sp.name}
            </span>
          )
        ))}
      </div>
      <p className="text-center text-[9px] text-gray-300 mt-3 uppercase tracking-widest">
        Prices do not include sales tax
      </p>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function MenuPreview({ menu, items, eventSponsors, menuSponsorIds }) {
  const activeSponsors = (eventSponsors || []).filter(s => menuSponsorIds?.has(s.id) && s.active)
  const sectionGroups = buildSectionGroups(
    (items || []).filter(i => i.status === 'active')
  )

  // Filter out inactive items for preview (only show active)
  const totalActive = items?.filter(i => i.status === 'active').length || 0

  if (totalActive === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-ink-400">
        No active items to preview. Set items to "active" status to see them here.
      </div>
    )
  }

  return (
    <div className="flex justify-center">
      {/* Menu document */}
      <div className="w-full max-w-[680px] bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-10 pt-8 pb-4 border-b border-gray-100">
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400 mb-1">{menu.category?.replace('_', ' ')}</p>
          <h1 className="text-[28px] font-black uppercase tracking-tight text-gray-900 leading-none">
            {menu.print_title || menu.name}
          </h1>
        </div>

        {/* Sections */}
        <div className="px-10 py-6 space-y-6">
          {sectionGroups.map(group => (
            <div key={group.key}>
              {/* Section title — rotated label approximation */}
              {group.section && (
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-0.5 h-10 bg-gray-200 flex-shrink-0" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">
                    {group.section}
                  </span>
                </div>
              )}

              {/* Items */}
              <div>
                {group.items.map(item => (
                  item.layout === 'alt'
                    ? <ItemAlt key={item.id} item={item} />
                    : <ItemMain key={item.id} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Sponsor strip */}
        <div className="px-10 pb-8">
          <SponsorStrip sponsors={activeSponsors} />
        </div>
      </div>
    </div>
  )
}
