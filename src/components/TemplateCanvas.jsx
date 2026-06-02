/**
 * TemplateCanvas — renders a menu at actual print proportions using the
 * event_template record (background image, fonts, colors, layout).
 * Scales to fit the available container width via CSS transform.
 */
import { forwardRef, useEffect, useRef, useState } from 'react'
import { buildSectionGroups } from './MenuPreview'

// ── Canvas dimensions at 1600px base width ────────────────────────────────────
export const SIZE_CONFIGS = {
  sm: { w: 1600, h: 1600,  label: 'SM',  print: '23.5" × 23.5"' },
  md: { w: 1600, h: 2417,  label: 'MD',  print: '23.5" × 35.25"' },
  lg: { w: 1600, h: 3235,  label: 'LG',  print: '23.5" × 47.5"' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function px(n) { return `${n}px` }

// ── Diet flags ────────────────────────────────────────────────────────────────
function DietFlags({ item, color }) {
  const flags = []
  if (item.vt) flags.push('VT')
  if (item.ve) flags.push('VE')
  if (item.gf) flags.push('GF')
  if (!flags.length) return null
  return (
    <span style={{ fontSize: 18, color, fontWeight: 500, marginLeft: 10, opacity: 0.7 }}>
      {flags.join(' · ')}
    </span>
  )
}

// ── Single menu item row ──────────────────────────────────────────────────────
function ItemRow({ item, colors, fonts, itemGap }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 40,
      paddingBottom: itemGap,
    }}>
      {/* Left: title + description */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 0 }}>
          <span style={{
            fontSize: 30,
            fontWeight: 600,
            color: colors.title,
            fontFamily: fonts.primary,
            lineHeight: 1.2,
            textTransform: 'uppercase',
            letterSpacing: '0.03em',
          }}>
            {item.title}
          </span>
          <DietFlags item={item} color={colors.description} />
        </div>
        {item.description && (
          <div style={{
            fontSize: 20,
            color: colors.description,
            fontFamily: fonts.primary,
            marginTop: 6,
            lineHeight: 1.4,
            fontStyle: 'italic',
          }}>
            {item.description}
          </div>
        )}
      </div>

      {/* Right: price(s) */}
      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        <PriceBlock
          size={item.size1} price={item.price1}
          colors={colors} fonts={fonts}
        />
        {item.two_sizes && item.price2 && (
          <div style={{ marginTop: 6 }}>
            <PriceBlock
              size={item.size2} price={item.price2}
              colors={colors} fonts={fonts}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function PriceBlock({ size, price, colors, fonts }) {
  if (!price) return null
  return (
    <div>
      {size && (
        <div style={{
          fontSize: 16,
          color: colors.sizeLabel,
          fontFamily: fonts.primary,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          lineHeight: 1,
        }}>{size}</div>
      )}
      <div style={{
        fontSize: 36,
        fontWeight: 700,
        color: colors.price,
        fontFamily: fonts.primary,
        lineHeight: 1.1,
        letterSpacing: '-0.01em',
      }}>{price}</div>
    </div>
  )
}

// ── Section block: vertical title + items ────────────────────────────────────
function SectionBlock({ group, colors, fonts, layout }) {
  return (
    <div style={{ display: 'flex', gap: 36, alignItems: 'flex-start' }}>
      {/* Vertical section label */}
      {group.section && (
        <div style={{
          writingMode: 'vertical-rl',
          transform: 'rotate(180deg)',
          fontSize: 20,
          fontWeight: 800,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: colors.section,
          fontFamily: fonts.primary,
          flexShrink: 0,
          lineHeight: 1,
          alignSelf: 'stretch',
          display: 'flex',
          alignItems: 'center',
        }}>
          {group.section}
        </div>
      )}

      {/* Vertical rule */}
      <div style={{
        width: 1,
        alignSelf: 'stretch',
        flexShrink: 0,
        backgroundColor: colors.divider,
        opacity: 0.5,
      }} />

      {/* Items */}
      <div style={{ flex: 1 }}>
        {group.items.map(item => (
          <ItemRow
            key={item.id}
            item={item}
            colors={colors}
            fonts={fonts}
            itemGap={layout.itemGap}
          />
        ))}
      </div>
    </div>
  )
}

// ── Sponsor strip ─────────────────────────────────────────────────────────────
function SponsorStrip({ sponsors, colors, fonts }) {
  if (!sponsors.length) return null
  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 48,
      paddingTop: 32,
    }}>
      {sponsors.map(sp => (
        sp.logo_url ? (
          <img key={sp.id} src={sp.logo_url} alt={sp.name}
            style={{ height: 56, objectFit: 'contain', opacity: 0.85 }} />
        ) : (
          <span key={sp.id} style={{
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: colors.description,
            fontFamily: fonts.primary,
          }}>
            {sp.name}
          </span>
        )
      ))}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
const TemplateCanvas = forwardRef(function TemplateCanvas({
  template,   // event_template record (may be null)
  size,       // 'sm' | 'md' | 'lg'
  menu,
  items,
  eventSponsors,
  menuSponsorIds,
}, innerRef) {
  const containerRef = useRef(null)
  const [scale, setScale] = useState(1)
  const sizeConfig = SIZE_CONFIGS[size] || SIZE_CONFIGS.lg

  // Recalculate scale when container width changes
  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        const availW = containerRef.current.offsetWidth
        setScale(availW / sizeConfig.w)
      }
    }
    update()
    const ro = new ResizeObserver(update)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [sizeConfig.w])

  // Inject Adobe Fonts stylesheet if configured
  useEffect(() => {
    if (!template?.adobe_fonts_url) return
    const existing = document.querySelector(`link[data-adobe-fonts]`)
    if (existing) existing.remove()
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = template.adobe_fonts_url
    link.setAttribute('data-adobe-fonts', '1')
    document.head.appendChild(link)
    return () => link.remove()
  }, [template?.adobe_fonts_url])

  const fonts = { primary: template?.font_primary || 'sans-serif' }
  const colors = {
    section:     template?.color_section     || '#1a1a1a',
    title:       template?.color_title       || '#1a1a1a',
    description: template?.color_description || '#555555',
    price:       template?.color_price       || '#1a1a1a',
    sizeLabel:   template?.color_size_label  || '#888888',
    divider:     template?.color_divider     || 'rgba(0,0,0,0.15)',
  }
  const layout = {
    padTop:     template?.padding_top    ?? 160,
    padRight:   template?.padding_right  ?? 100,
    padBottom:  template?.padding_bottom ?? 160,
    padLeft:    template?.padding_left   ?? 100,
    sectionGap: template?.section_gap    ?? 72,
    itemGap:    template?.item_gap       ?? 24,
    columns:    template?.columns        ?? 1,
  }

  const backgroundStyle = template?.background_url
    ? { backgroundImage: `url(${template.background_url})`, backgroundSize: 'cover', backgroundPosition: 'center top' }
    : { backgroundColor: template?.background_color || '#f5f0e8' }

  const activeItems = (items || []).filter(i => i.status === 'active')
  const sectionGroups = buildSectionGroups(activeItems)
  const activeSponsors = (eventSponsors || [])
    .filter(s => menuSponsorIds?.has(s.id) && s.active)

  if (activeItems.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-ink-400 italic">
        No active items — set items to "active" status to preview them here.
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative', height: sizeConfig.h * scale }}>
      {/* Scaled canvas — innerRef lets callers capture at native resolution */}
      <div ref={innerRef} style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: px(sizeConfig.w),
        height: px(sizeConfig.h),
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        ...backgroundStyle,
        fontFamily: fonts.primary,
        overflow: 'hidden',
      }}>
        {/* Content area inset by template padding */}
        <div style={{
          position: 'absolute',
          top: px(layout.padTop),
          right: px(layout.padRight),
          bottom: px(layout.padBottom),
          left: px(layout.padLeft),
          display: 'flex',
          flexDirection: 'column',
          gap: px(layout.sectionGap),
          overflow: 'hidden',
        }}>
          {layout.columns === 2 ? (
            // ── 2-column: split section groups evenly left/right ──
            <div style={{ display: 'flex', gap: px(layout.sectionGap), alignItems: 'flex-start', flex: 1 }}>
              {[0, 1].map(colIdx => {
                const colGroups = sectionGroups.filter((_, i) => i % 2 === colIdx)
                return (
                  <div key={colIdx} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: px(layout.sectionGap) }}>
                    {colGroups.map(group => (
                      <SectionBlock key={group.key} group={group} colors={colors} fonts={fonts} layout={layout} />
                    ))}
                  </div>
                )
              })}
            </div>
          ) : (
            // ── 1-column: straight stack ──
            sectionGroups.map(group => (
              <SectionBlock key={group.key} group={group} colors={colors} fonts={fonts} layout={layout} />
            ))
          )}

          {/* Sponsors pushed to bottom */}
          {activeSponsors.length > 0 && (
            <div style={{ marginTop: 'auto' }}>
              <SponsorStrip sponsors={activeSponsors} colors={colors} fonts={fonts} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

export default TemplateCanvas
