import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import PageScreen, { PageBody } from '@/components/PageScreen'
import PhaseBadge from '@/components/PhaseBadge'
import MenuItemRow from '@/components/MenuItemRow'
import CsvImport from '@/components/CsvImport'
import CsvExport from '@/components/CsvExport'
import EditLog from '@/components/EditLog'
import MenuPreview, { buildSectionGroups } from '@/components/MenuPreview'
import TemplateCanvas, { SIZE_CONFIGS } from '@/components/TemplateCanvas'
import html2canvas from 'html2canvas'

const STATUS_OPTIONS = ['active', 'not_added', 'draft']
const LAYOUT_OPTIONS = [
  { value: 'main', label: 'Main' },
  { value: 'alt',  label: 'Alt' },
]

function AddItemRow({ menuId, sections, defaultSection, onSaved, nextSortOrder }) {
  const [form, setForm] = useState({
    title: '', layout: 'main', section: defaultSection || '',
    price1: '', size1: '', status: 'active',
  })
  const [saving, setSaving] = useState(false)
  const [addError, setAddError] = useState(null)

  async function save(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    setAddError(null)
    const { error } = await supabase.from('menu_items').insert({
      menu_id: menuId,
      title: form.title.trim(),
      layout: form.layout,
      section: form.section.trim() || null,
      price1: form.price1.trim() || null,
      size1: form.size1.trim() || null,
      status: form.status,
      sort_order: nextSortOrder ?? 9999,
    })
    setSaving(false)
    if (error) { setAddError(error.message); return }
    onSaved()
  }

  return (
    <tr className="bg-surface-50">
      <td colSpan={5} className="px-4 py-3">
        <form onSubmit={save} className="flex items-center gap-2 flex-wrap">
          <input
            className="input py-1.5 text-sm min-w-[160px] flex-1"
            placeholder="Item title"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            spellCheck required autoFocus
          />
          <select
            className="input py-1.5 text-sm w-20"
            value={form.layout}
            onChange={e => setForm(f => ({ ...f, layout: e.target.value }))}
          >
            {LAYOUT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input
            className="input py-1.5 text-sm w-28"
            list="add-sections-list"
            placeholder="Section"
            value={form.section}
            onChange={e => setForm(f => ({ ...f, section: e.target.value }))}
            spellCheck
          />
          <datalist id="add-sections-list">
            {(sections || []).map(s => <option key={s} value={s} />)}
          </datalist>
          <input
            className="input py-1.5 text-sm w-20"
            placeholder="Size"
            value={form.size1}
            onChange={e => setForm(f => ({ ...f, size1: e.target.value }))}
          />
          <input
            className="input py-1.5 text-sm w-20"
            placeholder="Price"
            value={form.price1}
            onChange={e => setForm(f => ({ ...f, price1: e.target.value }))}
          />
          <select
            className="input py-1.5 text-sm w-28"
            value={form.status}
            onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
          >
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
          <button type="submit" disabled={saving} className="btn-primary btn-sm">{saving ? '…' : 'Add'}</button>
          <button type="button" onClick={onSaved} className="btn-secondary btn-sm">Cancel</button>
          {addError && <span className="text-xs text-red-600">{addError}</span>}
        </form>
      </td>
    </tr>
  )
}

export default function MenuPage() {
  const { brandSlug, seriesSlug, eventSlug, menuSlug } = useParams()
  const { isAdmin, isInternal } = useAuth()

  const [brand, setBrand]   = useState(null)
  const [series, setSeries] = useState(null)
  const [event, setEvent]   = useState(null)
  const [menu, setMenu]     = useState(null)
  const [items, setItems]   = useState([])
  const [eventSponsors, setEventSponsors] = useState([])
  const [menuSponsorIds, setMenuSponsorIds] = useState(new Set())
  const [templates, setTemplates] = useState({}) // keyed by size: { sm, md, lg }
  const [previewSize, setPreviewSize] = useState(null) // size active in preview tab
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('items')
  const [showImport, setShowImport] = useState(false)
  const [addingToSection, setAddingToSection] = useState(null) // section name | '__new__' | null
  const [exporting, setExporting] = useState(false)
  const canvasRef = useRef(null)

  const loadMenu = useCallback(async () => {
    const { data: brandData } = await supabase.from('brands').select('id,name,slug,color').eq('slug', brandSlug).single()
    setBrand(brandData)
    const { data: seriesData } = await supabase.from('series').select('*').eq('brand_id', brandData?.id).eq('slug', seriesSlug).single()
    setSeries(seriesData)
    const { data: eventData } = await supabase.from('events').select('*').eq('series_id', seriesData?.id).eq('slug', eventSlug).single()
    setEvent(eventData)

    if (eventData) {
      const { data: menuData } = await supabase
        .from('menus')
        .select('*')
        .eq('event_id', eventData.id)
        .eq('slug', menuSlug)
        .single()
      setMenu(menuData)

      if (menuData) {
        const { data: itemsData } = await supabase
          .from('menu_items')
          .select('*')
          .eq('menu_id', menuData.id)
          .order('sort_order')
        setItems(itemsData || [])

        // Event sponsor pool
        const { data: esponsors } = await supabase
          .from('event_sponsors')
          .select('*')
          .eq('event_id', eventData.id)
          .order('sort_order')
        setEventSponsors(esponsors || [])

        // Which event sponsors are toggled onto this menu
        const { data: msponsors } = await supabase
          .from('menu_sponsors')
          .select('event_sponsor_id')
          .eq('menu_id', menuData.id)
          .not('event_sponsor_id', 'is', null)
        setMenuSponsorIds(new Set((msponsors || []).map(s => s.event_sponsor_id)))

        // Event templates (background + style config per size)
        const { data: templateRows } = await supabase
          .from('event_templates')
          .select('*')
          .eq('event_id', eventData.id)
        const tmplMap = {}
        ;(templateRows || []).forEach(t => { tmplMap[t.size] = t })
        setTemplates(tmplMap)
        // Default preview size to menu's own size
        setPreviewSize(prev => prev || menuData.size || 'lg')
      }
    }
    setLoading(false)
  }, [brandSlug, seriesSlug, eventSlug, menuSlug])

  useEffect(() => { loadMenu() }, [loadMenu])

  async function toggleSponsor(sponsorId) {
    const sp = eventSponsors.find(s => s.id === sponsorId)
    if (menuSponsorIds.has(sponsorId)) {
      await supabase.from('menu_sponsors').delete()
        .eq('menu_id', menu.id)
        .eq('event_sponsor_id', sponsorId)
      setMenuSponsorIds(prev => { const next = new Set(prev); next.delete(sponsorId); return next })
    } else {
      await supabase.from('menu_sponsors').insert({
        menu_id: menu.id,
        event_sponsor_id: sponsorId,
        name: sp?.name || '',
        slug: sp?.slug || '',
        active: true,
      })
      setMenuSponsorIds(prev => new Set([...prev, sponsorId]))
    }
  }

  // ── Item reorder within its section group ──
  async function moveItemInSection(itemId, groupItems, direction) {
    const idx = groupItems.findIndex(i => i.id === itemId)
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= groupItems.length) return
    // Swap positions in the full flat list then renumber 0..n
    const aId = groupItems[idx].id
    const bId = groupItems[targetIdx].id
    const reordered = [...items]
    const flatA = reordered.findIndex(i => i.id === aId)
    const flatB = reordered.findIndex(i => i.id === bId)
    ;[reordered[flatA], reordered[flatB]] = [reordered[flatB], reordered[flatA]]
    await Promise.all(
      reordered.map((it, i) => supabase.from('menu_items').update({ sort_order: i }).eq('id', it.id))
    )
    loadMenu()
  }

  // ── Section reorder (moves all items in a section above/below adjacent section) ──
  async function moveSectionGroup(groupIdx, direction) {
    const targetIdx = direction === 'up' ? groupIdx - 1 : groupIdx + 1
    if (targetIdx < 0 || targetIdx >= sectionGroups.length) return
    const reorderedGroups = sectionGroups.map((g, i) => {
      if (i === groupIdx) return sectionGroups[targetIdx]
      if (i === targetIdx) return sectionGroups[groupIdx]
      return g
    })
    let order = 0
    await Promise.all(
      reorderedGroups.flatMap(group =>
        group.items.map(item => supabase.from('menu_items').update({ sort_order: order++ }).eq('id', item.id))
      )
    )
    loadMenu()
  }

  async function exportPng(size) {
    if (!canvasRef.current) return
    setExporting(true)
    const el = canvasRef.current
    const prevTransform = el.style.transform
    el.style.transform = 'none'
    try {
      const cfg = SIZE_CONFIGS[size] || SIZE_CONFIGS.lg
      const canvas = await html2canvas(el, {
        useCORS: true,
        allowTaint: true,
        width: cfg.w,
        height: cfg.h,
        scrollX: 0,
        scrollY: 0,
        scale: 1,
      })
      const link = document.createElement('a')
      link.download = `${menu?.name || 'menu'}-${size}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (err) {
      console.error('PNG export failed:', err)
    } finally {
      el.style.transform = prevTransform
      setExporting(false)
    }
  }

  if (loading) return <div className="px-8 py-8 text-sm text-ink-400">Loading…</div>
  if (!menu) return <div className="px-8 py-8 text-sm text-red-500">Menu not found.</div>

  // Consecutive section groups — preserves duplicate section names at different positions
  const sectionGroups = buildSectionGroups(items)
  const sectionNames = [...new Set(items.map(i => i.section))] // unique names for datalist only
  const canEdit = (isAdmin || isInternal) && menu.phase !== 'approved'

  const tabs = [
    { key: 'items', label: 'Items' },
    { key: 'preview', label: 'Preview' },
    ...(isInternal ? [{ key: 'log', label: 'Edit Log' }] : []),
    { key: 'sponsors', label: 'Sponsors' },
    ...(menu.figma_prototype_url ? [{ key: 'figma', label: 'Figma Preview' }] : []),
  ]

  const syncNeeded = (!menu.last_synced_at || (menu.updated_at && new Date(menu.updated_at) > new Date(menu.last_synced_at)))

  return (
    <PageScreen
      breadcrumbs={[
        { label: brand?.name, to: `/brands/${brandSlug}` },
        { label: series?.name, to: `/brands/${brandSlug}/series/${seriesSlug}` },
        { label: event?.name, to: `/brands/${brandSlug}/series/${seriesSlug}/events/${eventSlug}` },
        { label: menu.name },
      ]}
      actions={<>
        <PhaseBadge phase={menu.phase} />
        {syncNeeded && (
          <span
            title={menu.last_synced_at
              ? `Last synced ${new Date(menu.last_synced_at).toLocaleString()} · edited since`
              : 'Never synced to Figma'}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
            Sync
          </span>
        )}
        {isInternal && (
          <>
            <button onClick={() => setShowImport(v => !v)} className="btn-secondary btn-sm hidden sm:inline-flex">
              Import CSV
            </button>
            <CsvExport menu={menu} items={items} />
          </>
        )}
      </>}
      below={(
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                tab === t.key
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-ink-500 hover:text-ink-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    >
      <PageBody>
      {/* Menu meta */}
      <p className="text-sm text-ink-500 capitalize mb-4">
        {menu.category.replace('_', ' ')} menu · {event?.name}
        {menu.size && <span className="ml-2 px-1.5 py-0.5 rounded bg-surface-100 text-ink-400 text-xs font-mono uppercase not-capitalize">{menu.size}</span>}
      </p>

      {/* Sync helper banner */}
      {syncNeeded && (
        <div className="mb-6 card border-amber-200 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <div className="text-sm font-semibold text-amber-900">Sync needed</div>
            <p className="text-xs text-amber-800 mt-0.5">
              {menu.last_synced_at
                ? `Items have been edited since the last sync (${new Date(menu.last_synced_at).toLocaleString()}).`
                : 'This menu has never been synced to Figma.'}
              {' '}Open the Figma file and run the Menu Hub plugin to push these changes.
            </p>
          </div>
          {event?.figma_file_url && (
            <a
              href={event.figma_file_url}
              target="_blank"
              rel="noreferrer"
              className="btn-primary btn-sm flex-shrink-0 self-start sm:self-auto"
            >
              Open Figma →
            </a>
          )}
        </div>
      )}

      {showImport && (
        <div className="mb-6">
          <CsvImport menuId={menu.id} onImported={() => { setShowImport(false); loadMenu() }} />
        </div>
      )}

      {/* Items tab */}
      {tab === 'items' && (
        <div className="space-y-8">
          {sectionGroups.length === 0 && !canEdit && (
            <p className="text-sm text-ink-400">No items yet.</p>
          )}

          {sectionGroups.map((group, groupIdx) => {
            const sectionMaxSort = group.items.length
              ? Math.max(...group.items.map(i => i.sort_order))
              : 0
            return (
            <div key={group.key}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-ink-400 uppercase tracking-wider">
                  {group.section || 'Unsectioned'}
                </h2>
                {canEdit && sectionGroups.length > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => moveSectionGroup(groupIdx, 'up')}
                      disabled={groupIdx === 0}
                      className="text-xs text-ink-300 hover:text-brand-500 disabled:opacity-20 disabled:cursor-default px-1 py-0.5 rounded"
                      title="Move section up"
                    >↑ section</button>
                    <button
                      onClick={() => moveSectionGroup(groupIdx, 'down')}
                      disabled={groupIdx === sectionGroups.length - 1}
                      className="text-xs text-ink-300 hover:text-brand-500 disabled:opacity-20 disabled:cursor-default px-1 py-0.5 rounded"
                      title="Move section down"
                    >↓ section</button>
                  </div>
                )}
              </div>
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="border-b border-surface-100 bg-surface-50">
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-400">Item</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-400">Description</th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium text-ink-400">Diet</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-400">Size / Price</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-400">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {group.items.map((item, itemIdx) => (
                        <MenuItemRow
                          key={item.id}
                          item={item}
                          menu={menu}
                          canEdit={canEdit}
                          onUpdated={loadMenu}
                          sections={sectionNames}
                          isFirst={itemIdx === 0}
                          isLast={itemIdx === group.items.length - 1}
                          onMoveUp={() => moveItemInSection(item.id, group.items, 'up')}
                          onMoveDown={() => moveItemInSection(item.id, group.items, 'down')}
                        />
                      ))}
                      {canEdit && addingToSection === group.key && (
                        <AddItemRow
                          menuId={menu.id}
                          sections={sectionNames}
                          defaultSection={group.section || ''}
                          nextSortOrder={sectionMaxSort + 1}
                          onSaved={() => { setAddingToSection(null); loadMenu() }}
                        />
                      )}
                    </tbody>
                  </table>
                </div>
                {canEdit && addingToSection !== group.key && (
                  <div className="px-4 py-2.5 border-t border-surface-100">
                    <button
                      onClick={() => setAddingToSection(group.key)}
                      className="text-xs text-brand-500 hover:text-brand-700 font-medium flex items-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Add item to {group.section || 'this section'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )})}

          {/* Add new item (possibly new section) */}
          {canEdit && (
            <div>
              {addingToSection === '__new__' ? (
                <div className="card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[560px]">
                      <tbody>
                        <AddItemRow
                          menuId={menu.id}
                          sections={sectionNames}
                          defaultSection=""
                          nextSortOrder={items.length > 0 ? Math.max(...items.map(i => i.sort_order)) + 1 : 0}
                          onSaved={() => { setAddingToSection(null); loadMenu() }}
                        />
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingToSection('__new__')}
                  className="text-xs text-brand-500 hover:text-brand-700 font-medium flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add new item
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Preview tab */}
      {tab === 'preview' && (() => {
        const activeSize = previewSize || menu.size || 'lg'
        const template = templates[activeSize]
        const hasTemplate = !!template?.background_url
        return (
          <div>
            {/* Size switcher + Figma sync badge */}
            <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
              <div className="flex items-center gap-1">
                {Object.entries(SIZE_CONFIGS).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => setPreviewSize(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      activeSize === key
                        ? 'bg-brand-500 text-white'
                        : 'bg-surface-100 text-ink-500 hover:bg-surface-200'
                    }`}
                  >
                    {cfg.label}
                    <span className="ml-1 opacity-60 font-normal">{cfg.print}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {hasTemplate && (
                  <button
                    onClick={() => exportPng(activeSize)}
                    disabled={exporting}
                    className="btn-secondary btn-sm text-xs"
                  >
                    {exporting ? 'Exporting…' : 'Export PNG'}
                  </button>
                )}
                {menu.preview_image_url && (
                  <a href={menu.preview_image_url} target="_blank" rel="noreferrer"
                    className="btn-secondary btn-sm text-xs">
                    Figma PNG ↗
                  </a>
                )}
              </div>
            </div>

            {/* Template canvas */}
            {hasTemplate ? (
              <div className="rounded-xl overflow-hidden border border-surface-200 shadow-sm">
                <TemplateCanvas
                  ref={canvasRef}
                  template={template}
                  series={series}
                  event={event}
                  size={activeSize}
                  menu={menu}
                  items={items}
                  eventSponsors={eventSponsors}
                  menuSponsorIds={menuSponsorIds}
                />
              </div>
            ) : (
              <div>
                <div className="mb-4 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                  No template configured for this event's <strong>{activeSize.toUpperCase()}</strong> size yet.
                  Upload a background on the Event page → Templates tab, then set fonts and colors.
                </div>
                <MenuPreview
                  menu={menu}
                  items={items}
                  eventSponsors={eventSponsors}
                  menuSponsorIds={menuSponsorIds}
                />
              </div>
            )}
          </div>
        )
      })()}

      {/* Edit log tab */}
      {tab === 'log' && <EditLog menuId={menu.id} />}

      {/* Sponsors tab */}
      {tab === 'sponsors' && (
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-ink-900 mb-1">Sponsors</h2>
          <p className="text-xs text-ink-400 mb-4">Toggle which sponsors from this event's pool appear on this menu.</p>
          {eventSponsors.length === 0 ? (
            <p className="text-sm text-ink-400">No sponsors configured for this event yet. Add them on the Event page.</p>
          ) : (
            <div className="space-y-1">
              {eventSponsors.map(sp => {
                const active = menuSponsorIds.has(sp.id)
                return (
                  <div key={sp.id} className="flex items-center gap-3 py-2.5 border-b border-surface-100 last:border-0">
                    {canEdit ? (
                      <button
                        onClick={() => toggleSponsor(sp.id)}
                        className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 relative ${active ? 'bg-brand-500' : 'bg-surface-300'}`}
                        title={active ? 'Remove from menu' : 'Add to menu'}
                      >
                        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${active ? 'left-4' : 'left-0.5'}`} />
                      </button>
                    ) : (
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? 'bg-emerald-400' : 'bg-surface-300'}`} />
                    )}
                    {sp.logo_url && (
                      <img src={sp.logo_url} alt={sp.name} className="w-6 h-6 object-contain rounded" />
                    )}
                    <span className="text-sm font-medium text-ink-900">{sp.name}</span>
                    <span className="text-xs text-ink-400 font-mono">sponsor--{sp.slug}</span>
                    {!active && <span className="text-xs text-ink-400 ml-auto">not on menu</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Figma preview tab */}
      {tab === 'figma' && menu.figma_prototype_url && (
        <div className="card overflow-hidden" style={{ height: 700 }}>
          <iframe
            src={menu.figma_prototype_url}
            className="w-full h-full border-0"
            title="Figma prototype preview"
            allowFullScreen
          />
        </div>
      )}
      </PageBody>
    </PageScreen>
  )
}
