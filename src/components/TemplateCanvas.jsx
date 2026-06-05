/**
 * TemplateCanvas v2 — renders a menu at print proportions using the resolved
 * series + event style spec. Fonts, typography, icons, gaps, and assets all
 * come from the spec; colors and background still come from event_templates.
 */
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { buildSectionGroups } from './MenuPreview'
import { formatPrice, resolveCurrencySpec } from '@/lib/formatPrice'

export const SIZE_CONFIGS = {
  sm: { w: 1600, h: 1600,  label: 'SM',  print: '23.5" × 23.5"' },
  md: { w: 1600, h: 2417,  label: 'MD',  print: '23.5" × 35.25"' },
  lg: { w: 1600, h: 3235,  label: 'LG',  print: '23.5" × 47.5"' },
}

const ROLES = ['menu_title', 'section_label', 'item_title', 'item_description', 'item_size', 'item_price', 'footer_dietary', 'footer_price_details']

const DEFAULT_ROLE = { size: 40, weight: 400, tracking: 0, transform: 'none', lineHeight: 1.2, font: 'primary', align: 'left' }
const DEFAULT_GAP_BLOCK = {
  logo_to_title: 80,
  title_to_items: 100,
  items_to_footer: 100,
  section_gap: 'auto',
  item_gap: 'auto',
  item_title_to_description: 12,   // gap between item title and its description
  item_content_to_price: 40,       // horizontal gap between content column and price column
  item_price_stack: 12,            // when two prices stacked vertically
  item_price_row: 24,              // when two prices side-by-side
  item_size_price_layout: 'stacked', // 'stacked' = size above price (default); 'row' = size beside price
  item_two_prices_layout: 'stacked', // 'stacked' = price1 above price2; 'row' = side-by-side
}
const FALLBACK_DIET_ICONS = {
  vegetarian: { url: null, color: '#4a8054' },
  vegan:      { url: null, color: '#a05a3e' },
  gf:         { url: null, color: '#a05a3e' },
}

// ── Resolve effective spec / fonts / assets ──────────────────────────────────

function normalizeSpec(spec) {
  const s = { ...(spec || {}) }
  for (const r of ROLES) s[r] = { ...DEFAULT_ROLE, ...(s[r] || {}) }
  const rawGaps = s.gaps || {}
  const isPerSize = rawGaps.sm || rawGaps.md || rawGaps.lg
  s.gaps = {
    sm: { ...DEFAULT_GAP_BLOCK, ...(isPerSize ? (rawGaps.sm || {}) : rawGaps) },
    md: { ...DEFAULT_GAP_BLOCK, ...(isPerSize ? (rawGaps.md || {}) : rawGaps) },
    lg: { ...DEFAULT_GAP_BLOCK, ...(isPerSize ? (rawGaps.lg || {}) : rawGaps) },
  }
  s.dietary_icons   = s.dietary_icons || FALLBACK_DIET_ICONS
  if (s.dietary_icon_size == null) s.dietary_icon_size = 45
  if (s.logo_max_height  == null) s.logo_max_height   = 100
  return s
}

function resolveSpec(series, event) {
  const seriesSpec = normalizeSpec(series?.style_spec)
  const eventSpec  = event?.style_spec || {}
  const merged = { ...seriesSpec }
  for (const r of ROLES) merged[r] = { ...seriesSpec[r], ...(eventSpec[r] || {}) }
  merged.gaps = {
    sm: { ...seriesSpec.gaps.sm, ...(eventSpec.gaps?.sm || {}) },
    md: { ...seriesSpec.gaps.md, ...(eventSpec.gaps?.md || {}) },
    lg: { ...seriesSpec.gaps.lg, ...(eventSpec.gaps?.lg || {}) },
  }
  if (eventSpec.dietary_icons)      merged.dietary_icons    = eventSpec.dietary_icons
  if (eventSpec.dietary_icon_size != null) merged.dietary_icon_size = eventSpec.dietary_icon_size
  if (eventSpec.logo_max_height   != null) merged.logo_max_height   = eventSpec.logo_max_height
  return merged
}

function resolveFonts(series, event) {
  const arr = Array.isArray(event?.fonts) && event.fonts.length ? event.fonts : (series?.fonts || [])
  return Array.isArray(arr) ? arr : []
}

function resolveHeaderLogo(series, event) { return event?.header_logo_url ?? series?.header_logo_url ?? null }
function resolveFooterUrl(series, event)  { return event?.footer_url      ?? series?.footer_url      ?? null }

// ── Build the font-family string for a role lookup ────────────────────────────

function fontFamilyFor(role, fonts) {
  const slot = fonts.find(f => f.key === role.font) || fonts[0]
  return slot?.family || 'sans-serif'
}

function alignToFlex(align) {
  if (align === 'center')  return 'center'
  if (align === 'right')   return 'flex-end'
  if (align === 'justify') return 'stretch'
  return 'flex-start'
}

// ── Inject Adobe/Google links + @font-face for uploads ───────────────────────

function FontLoader({ fonts }) {
  useEffect(() => {
    const cleanups = []
    const stylesheets = new Set()
    let styleEl = null
    const faceRules = []

    for (const f of fonts) {
      if (!f) continue
      if ((f.source === 'adobe' || f.source === 'google') && f.url) {
        if (stylesheets.has(f.url)) continue
        stylesheets.add(f.url)
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = f.url
        link.setAttribute('data-mh-font', '1')
        document.head.appendChild(link)
        cleanups.push(() => link.remove())
      } else if (f.source === 'upload' && f.url && f.family) {
        const fmt = (f.url.split('.').pop() || '').toLowerCase()
        const format =
          fmt === 'woff2' ? 'woff2' :
          fmt === 'woff'  ? 'woff'  :
          fmt === 'otf'   ? 'opentype' :
          fmt === 'ttf'   ? 'truetype' :
          ''
        faceRules.push(`@font-face { font-family: ${JSON.stringify(f.family)}; src: url(${JSON.stringify(f.url)})${format ? ` format(${JSON.stringify(format)})` : ''}; font-display: swap; }`)
      }
    }

    if (faceRules.length) {
      styleEl = document.createElement('style')
      styleEl.setAttribute('data-mh-font', '1')
      styleEl.textContent = faceRules.join('\n')
      document.head.appendChild(styleEl)
      cleanups.push(() => styleEl.remove())
    }

    return () => { cleanups.forEach(fn => fn()) }
  }, [JSON.stringify(fonts)])

  return null
}

// ── Inline SVG fetcher so we can recolor via currentColor ────────────────────

function InlineSvg({ url, size, color }) {
  const [markup, setMarkup] = useState(null)
  useEffect(() => {
    if (!url) { setMarkup(null); return }
    let aborted = false
    fetch(url).then(r => r.text()).then(t => { if (!aborted) setMarkup(t) }).catch(() => {})
    return () => { aborted = true }
  }, [url])
  if (!url) return null
  if (!markup) {
    return <img src={url} alt="" style={{ width: size, height: size, color, display: 'inline-block' }} />
  }
  return (
    <span
      style={{ width: size, height: size, color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  )
}

// ── Text helpers ─────────────────────────────────────────────────────────────

function roleStyle(role, fonts, colorMap) {
  const style = {
    fontSize: role.size,
    fontWeight: role.weight,
    letterSpacing: `${role.tracking}em`,
    lineHeight: role.lineHeight,
    textTransform: role.transform || 'none',
    textAlign: role.align || 'left',
    fontFamily: fontFamilyFor(role, fonts),
    color: colorMap || undefined,
  }
  // Variable-font axes: only emit when explicitly set so static fonts pass through clean.
  const variations = []
  if (role.width != null) variations.push(`"wdth" ${role.width}`)
  if (role.slant != null) variations.push(`"slnt" ${role.slant}`)
  if (variations.length) style.fontVariationSettings = variations.join(', ')
  return style
}

// ── Item rows ────────────────────────────────────────────────────────────────

function DietaryIcons({ item, icons, size }) {
  const flags = []
  if (item.vt && icons.vegetarian?.url) flags.push({ ...icons.vegetarian, key: 'vt' })
  if (item.ve && icons.vegan?.url)      flags.push({ ...icons.vegan,      key: 've' })
  if (item.gf && icons.gf?.url)         flags.push({ ...icons.gf,         key: 'gf' })
  if (!flags.length) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.3, marginLeft: size * 0.5 }}>
      {flags.map(f => <InlineSvg key={f.key} url={f.url} size={size} color={f.color} />)}
    </span>
  )
}

function PriceBlock({ size, price, sizeRole, priceRole, fonts, colorSize, colorPrice, layout = 'stacked' }) {
  if (!price) return null
  if (layout === 'row') {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 10, whiteSpace: 'nowrap' }}>
        {size && (
          <span style={{ ...roleStyle(sizeRole, fonts), color: colorSize, whiteSpace: 'nowrap' }}>{size}</span>
        )}
        <span style={{ ...roleStyle(priceRole, fonts), color: colorPrice, whiteSpace: 'nowrap' }}>{price}</span>
      </div>
    )
  }
  return (
    <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
      {size && (
        <div style={{ ...roleStyle(sizeRole, fonts), color: colorSize, whiteSpace: 'nowrap' }}>{size}</div>
      )}
      <div style={{ ...roleStyle(priceRole, fonts), color: colorPrice, whiteSpace: 'nowrap' }}>{price}</div>
    </div>
  )
}

function ItemRow({ item, spec, fonts, colors, gapBlock, currency }) {
  const isAlt = item.layout === 'alt'
  const titleToDesc   = gapBlock?.item_title_to_description ?? 12
  const contentToPrice = gapBlock?.item_content_to_price ?? 40
  const priceStackGap  = gapBlock?.item_price_stack ?? titleToDesc
  const priceRowGap    = gapBlock?.item_price_row ?? 24
  const sizePriceLayout = gapBlock?.item_size_price_layout || 'stacked'
  const twoPricesLayout = gapBlock?.item_two_prices_layout || 'stacked'
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: contentToPrice, width: '100%' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ ...roleStyle(spec.item_title, fonts), color: colors.title }}>{item.title}</span>
          <DietaryIcons item={item} icons={spec.dietary_icons} size={spec.dietary_icon_size} />
        </div>
        {!isAlt && item.description && (
          <div style={{ ...roleStyle(spec.item_description, fonts), color: colors.description, marginTop: titleToDesc }}>
            {item.description}
          </div>
        )}
      </div>
      <div style={{
        flexShrink: 0,
        display: 'flex',
        flexDirection: twoPricesLayout === 'row' ? 'row' : 'column',
        alignItems: twoPricesLayout === 'row' ? 'baseline' : 'flex-end',
        gap: twoPricesLayout === 'row' ? priceRowGap : priceStackGap,
      }}>
        <PriceBlock size={item.size1} price={formatPrice(item.price1, currency)}
          sizeRole={spec.item_size} priceRole={spec.item_price} fonts={fonts}
          colorSize={colors.sizeLabel} colorPrice={colors.price} layout={sizePriceLayout} />
        {item.two_sizes && item.price2 && (
          <PriceBlock size={item.size2} price={formatPrice(item.price2, currency)}
            sizeRole={spec.item_size} priceRole={spec.item_price} fonts={fonts}
            colorSize={colors.sizeLabel} colorPrice={colors.price} layout={sizePriceLayout} />
        )}
      </div>
    </div>
  )
}

// ── Section block ────────────────────────────────────────────────────────────

function SectionBlock({ group, spec, fonts, colors, gapBlock, currency }) {
  const itemGap = gapBlock.item_gap
  const labelSpec = spec.section_label
  const linePos = labelSpec.line_position || 'below'
  const lineDir = labelSpec.line_direction || 'vertical'
  const lineGap = labelSpec.line_gap ?? 24

  const labelEl = group.section ? (
    <div style={{
      ...roleStyle(labelSpec, fonts),
      color: colors.section,
      writingMode: 'vertical-rl',
      transform: `rotate(${(labelSpec.rotate ?? -90) - 90}deg)`,
      whiteSpace: 'nowrap',
    }}>
      {group.section}
    </div>
  ) : null

  const lineEl = (linePos === 'none' || !group.section) ? null : (
    lineDir === 'vertical'
      ? <div style={{ flex: 1, width: 1, backgroundColor: colors.section || colors.divider, opacity: 0.8 }} />
      : <div style={{ flex: 1, height: 1, backgroundColor: colors.section || colors.divider, opacity: 0.8 }} />
  )

  // Build the label column based on line position
  let labelColumn = null
  if (group.section) {
    if (linePos === 'below' || linePos === 'above') {
      labelColumn = (
        <div style={{
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: lineGap,
        }}>
          {linePos === 'above' && lineEl}
          {labelEl}
          {linePos === 'below' && lineEl}
        </div>
      )
    } else if (linePos === 'left' || linePos === 'right') {
      labelColumn = (
        <div style={{
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'stretch',
          gap: lineGap,
        }}>
          {linePos === 'left' && lineEl}
          {labelEl}
          {linePos === 'right' && lineEl}
        </div>
      )
    } else {
      // line: 'none'
      labelColumn = <div style={{ flexShrink: 0 }}>{labelEl}</div>
    }
  }

  return (
    <div style={{ display: 'flex', gap: 36, alignItems: 'stretch' }}>
      {labelColumn}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        justifyContent: itemGap === 'auto' ? 'space-between' : 'flex-start',
        gap: itemGap === 'auto' ? 0 : itemGap,
      }}>
        {group.items.map(item => (
          <ItemRow key={item.id} item={item} spec={spec} fonts={fonts} colors={colors} gapBlock={gapBlock} currency={currency} />
        ))}
      </div>
    </div>
  )
}

// ── Sponsor strip ────────────────────────────────────────────────────────────

function SponsorLogo({ sponsor, fallbackColor }) {
  const tint = sponsor.tint_color || fallbackColor
  if (!sponsor.logo_url) {
    return (
      <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: tint }}>
        {sponsor.name}
      </span>
    )
  }
  // Inline-fetch so currentColor SVGs can be tinted via parent color.
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 64, color: tint, opacity: 0.95 }}>
      <InlineSvgFromUrl url={sponsor.logo_url} fallbackAlt={sponsor.name} maxHeight={64} />
    </span>
  )
}

function InlineSvgFromUrl({ url, maxHeight = 64, fallbackAlt = '' }) {
  const [markup, setMarkup] = useState(null)
  useEffect(() => {
    if (!url) return
    let aborted = false
    fetch(url).then(r => r.text()).then(t => { if (!aborted) setMarkup(t) }).catch(() => {})
    return () => { aborted = true }
  }, [url])
  if (!url) return null
  if (!markup) {
    return <img src={url} alt={fallbackAlt} style={{ height: maxHeight, objectFit: 'contain' }} />
  }
  return (
    <span
      style={{ height: maxHeight, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  )
}

function SponsorStrip({ sponsors, color }) {
  if (!sponsors.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 48 }}>
      {sponsors.map(sp => <SponsorLogo key={sp.id} sponsor={sp} fallbackColor={color} />)}
    </div>
  )
}

// ── Main export ──────────────────────────────────────────────────────────────

const TemplateCanvas = forwardRef(function TemplateCanvas({
  template, series, event, size, menu, items, eventSponsors, menuSponsorIds, zoom = 1,
}, innerRef) {
  const containerRef = useRef(null)
  const [fitScale, setFitScale] = useState(1)
  const sizeConfig = SIZE_CONFIGS[size] || SIZE_CONFIGS.lg
  const scale = fitScale * (zoom || 1)

  useEffect(() => {
    const update = () => {
      if (containerRef.current) setFitScale(containerRef.current.offsetWidth / sizeConfig.w)
    }
    update()
    const ro = new ResizeObserver(update)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [sizeConfig.w])

  const spec     = useMemo(() => resolveSpec(series, event),         [series, event])
  const fonts    = useMemo(() => resolveFonts(series, event),        [series, event])
  const currency = useMemo(() => resolveCurrencySpec(series, event), [series, event])
  const headerLogoUrl = resolveHeaderLogo(series, event)
  const footerUrl     = resolveFooterUrl(series, event)
  // Per-menu spacing override wins over series/event gaps for the active size only.
  const baseGap = spec.gaps[size] || spec.gaps.md
  const gapBlock = useMemo(
    () => ({ ...baseGap, ...((menu?.spacing_override?.[size]) || {}) }),
    [baseGap, menu?.spacing_override, size]
  )

  const colors = {
    section:     template?.color_section     || '#1a1a1a',
    title:       template?.color_title       || '#1a1a1a',
    description: template?.color_description || '#555555',
    price:       template?.color_price       || '#1a1a1a',
    sizeLabel:   template?.color_size_label  || '#888888',
    divider:     template?.color_divider     || 'rgba(0,0,0,0.2)',
  }
  const backgroundStyle = template?.background_url
    ? { backgroundImage: `url(${template.background_url})`, backgroundSize: 'cover', backgroundPosition: 'center top' }
    : { backgroundColor: template?.background_color || '#ffffff' }

  const activeItems = (items || []).filter(i => i.status === 'active')
  const sectionGroups = buildSectionGroups(activeItems)
  const activeSponsors = (eventSponsors || []).filter(s => menuSponsorIds?.has(s.id) && s.active)

  // Boiler head (diet key + tax line)
  const showDietKey = menu?.footer_show_diet_key !== false
  const showTaxText = menu?.footer_show_tax_text !== false
  const customFooter = menu?.footer_custom_text

  if (activeItems.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-ink-400 italic">
        No active items — set items to "active" status to preview them here.
      </div>
    )
  }

  // Padding: 100px default (overridable per-template — kept for backwards compat)
  const padT = template?.padding_top    ?? 140
  const padR = template?.padding_right  ?? 120
  const padB = template?.padding_bottom ?? 100
  const padL = template?.padding_left   ?? 120
  const sectionsJustify = gapBlock.section_gap === 'auto' ? 'space-between' : 'flex-start'
  const sectionsGapPx   = gapBlock.section_gap === 'auto' ? 0 : gapBlock.section_gap

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <FontLoader fonts={fonts} />
      <div style={{
        position: 'relative',
        width: sizeConfig.w * scale,
        height: sizeConfig.h * scale,
        minWidth: '100%',
      }}>
      <div ref={innerRef} style={{
        position: 'absolute', top: 0, left: 0,
        width: sizeConfig.w, height: sizeConfig.h,
        transform: `scale(${scale})`, transformOrigin: 'top left',
        ...backgroundStyle, overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          top: padT, right: padR, bottom: padB, left: padL,
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Header logo — alignment follows menu_title.align so they stay coordinated */}
          {headerLogoUrl && (
            <img src={headerLogoUrl} alt="" style={{ maxHeight: spec.logo_max_height, alignSelf: alignToFlex(spec.menu_title.align) }} />
          )}
          {headerLogoUrl && <div style={{ height: gapBlock.logo_to_title }} />}

          {/* Menu title */}
          {menu?.name && (
            <div style={{ ...roleStyle(spec.menu_title, fonts), color: colors.title }}>{menu.name}</div>
          )}
          <div style={{ height: gapBlock.title_to_items }} />

          {/* Sections — fill remaining space; 1 or 2 columns based on template.columns */}
          {(template?.columns ?? 1) === 2 ? (
            <div style={{
              flex: 1,
              display: 'flex',
              gap: gapBlock.section_gap === 'auto' ? 60 : gapBlock.section_gap,
              alignItems: 'stretch',
              minHeight: 0,
            }}>
              {[0, 1].map(colIdx => {
                const colGroups = sectionGroups.filter((_, i) => i % 2 === colIdx)
                return (
                  <div key={colIdx} style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    justifyContent: sectionsJustify,
                    gap: sectionsGapPx,
                    minHeight: 0,
                  }}>
                    {colGroups.map(group => (
                      <SectionBlock key={group.key} group={group} spec={spec} fonts={fonts} colors={colors} gapBlock={gapBlock} currency={currency} />
                    ))}
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{
              flex: 1,
              display: 'flex', flexDirection: 'column',
              justifyContent: sectionsJustify,
              gap: sectionsGapPx,
              minHeight: 0,
            }}>
              {sectionGroups.map(group => (
                <SectionBlock key={group.key} group={group} spec={spec} fonts={fonts} colors={colors} gapBlock={gapBlock} currency={currency} />
              ))}
            </div>
          )}

          <div style={{ height: gapBlock.items_to_footer }} />

          {/* Sponsors */}
          {activeSponsors.length > 0 && (
            <div style={{ marginBottom: footerUrl || showDietKey || showTaxText || customFooter ? 60 : 0 }}>
              <SponsorStrip sponsors={activeSponsors} color={colors.description} />
            </div>
          )}

          {/* Boiler head row: diet key + tax text — both align end to bottom of row */}
          {(showDietKey || showTaxText || customFooter) && (
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 60, marginBottom: footerUrl ? 30 : 0, whiteSpace: 'nowrap' }}>
              {showDietKey ? (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: spec.dietary_icon_size * 0.6, whiteSpace: 'nowrap' }}>
                  {[
                    { url: spec.dietary_icons.vegetarian?.url, color: spec.dietary_icons.vegetarian?.color, label: 'Vegetarian' },
                    { url: spec.dietary_icons.vegan?.url,      color: spec.dietary_icons.vegan?.color,      label: 'Vegan' },
                    { url: spec.dietary_icons.gf?.url,         color: spec.dietary_icons.gf?.color,         label: 'Gluten Free' },
                  ].filter(x => x.url).map(({ url, color, label }) => (
                    <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: spec.dietary_icon_size * 0.3, whiteSpace: 'nowrap' }}>
                      <span style={{ ...roleStyle(spec.footer_dietary, fonts), color: colors.description, whiteSpace: 'nowrap' }}>{label}</span>
                      <InlineSvg url={url} size={spec.dietary_icon_size * 0.7} color={color} />
                    </span>
                  ))}
                </div>
              ) : <span />}
              {(showTaxText || customFooter) && (
                <span style={{ ...roleStyle(spec.footer_price_details, fonts), color: colors.description, whiteSpace: 'nowrap' }}>
                  {customFooter || 'Prices do not include sales tax · Cashless event'}
                </span>
              )}
            </div>
          )}

          {/* Footer / boiler graphic */}
          {footerUrl && (
            <img src={footerUrl} alt="" style={{ width: '100%', height: 'auto', objectFit: 'contain', maxHeight: 80, alignSelf: 'stretch' }} />
          )}
        </div>
      </div>
      </div>
    </div>
  )
})

export default TemplateCanvas
