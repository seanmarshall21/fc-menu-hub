import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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
import EntityIconPicker from '@/components/EntityIconPicker'
import ErrorBoundary from '@/components/ErrorBoundary'
import FavoriteButton from '@/components/FavoriteButton'
import ApproversPanel from '@/components/ApproversPanel'
import { PLUGIN_INSTALL_URL } from '@/lib/figmaPlugin'
import FigmaLogo from '@/components/FigmaLogo'
import { resolveCurrencySpec } from '@/lib/formatPrice'
import { useFocusRefresh } from '@/hooks/useFocusRefresh'
import { downloadMenuCsv } from '@/lib/downloadMenuCsv'
import MenuStylesTab from '@/components/MenuStylesTab'
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
  const navigate = useNavigate()
  const { isAdmin, isInternal } = useAuth()

  const [brand, setBrand]   = useState(null)
  const [series, setSeries] = useState(null)
  const [event, setEvent]   = useState(null)
  const [menu, setMenu]     = useState(null)
  const [items, setItems]   = useState([])
  const [eventSponsors, setEventSponsors] = useState([])
  const [menuSponsorIds, setMenuSponsorIds] = useState(new Set())
  const [templates, setTemplates] = useState({}) // keyed by size: { sm, md, lg }
  const [previewSize, setPreviewSize] = useState(null) // null = inherit menu.size; user pick overrides
  const [previewZoom, setPreviewZoom] = useState(1)    // (legacy — only used inside the lightbox now)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('items')
  const [showImport, setShowImport] = useState(false)
  const [addingToSection, setAddingToSection] = useState(null) // section name | '__new__' | null
  const [exporting, setExporting] = useState(false)
  const canvasRef = useRef(null)

  // Undo memory for Approve All
  const [lastApprovedIds, setLastApprovedIds] = useState([])

  // Edit menu modal
  const [showEditMenu, setShowEditMenu] = useState(false)
  const [editMenuName, setEditMenuName] = useState('')
  const [editMenuSize, setEditMenuSize] = useState('lg')
  const [editMenuCategory, setEditMenuCategory] = useState('bar')
  const [editMenuIconUrl, setEditMenuIconUrl] = useState(null)
  const [editMenuIconName, setEditMenuIconName] = useState(null)
  const [editMenuSaving, setEditMenuSaving] = useState(false)
  const [editMenuError, setEditMenuError] = useState(null)
  // Delete menu modal state
  const [showDeleteMenu, setShowDeleteMenu] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteBackupDone, setDeleteBackupDone] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

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

        // Event sponsor pool — join to library + series_sponsors so we can
        // resolve effective svg + tint without re-querying in the renderer.
        const { data: esponsors } = await supabase
          .from('event_sponsors')
          .select(`
            id, name, slug, logo_url, active, sort_order, tint_color_override,
            sponsor:sponsors(id, name, slug, svg_url, figma_layer_name, scale, max_width)
          `)
          .eq('event_id', eventData.id)
          .order('sort_order')

        // Pull series-level tints in one shot, key by sponsor_id.
        const { data: seriesTints } = await supabase
          .from('series_sponsors')
          .select('sponsor_id, tint_color')
          .eq('series_id', seriesData.id)
        const tintBySponsorId = new Map((seriesTints || []).map(r => [r.sponsor_id, r.tint_color]))

        // Resolve each event_sponsor to a single shape TemplateCanvas understands:
        //   { id, name, slug, active, logo_url, tint_color }
        const eventTint = eventData?.sponsor_tint_color || null
        const resolved = (esponsors || []).map(es => {
          const lib = es.sponsor
          const svg = lib?.svg_url || es.logo_url || null
          const tint = es.tint_color_override
            || eventTint
            || (lib?.id ? tintBySponsorId.get(lib.id) : null)
            || null
          return {
            id: es.id,
            name: lib?.name || es.name,
            slug: lib?.slug || es.slug,
            active: es.active !== false,
            logo_url: svg,
            tint_color: tint,
            scale: lib?.scale ?? 1,
            max_width: lib?.max_width ?? null,
          }
        })
        setEventSponsors(resolved)

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
  useFocusRefresh(loadMenu)

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

  const syncNeeded = (!menu.last_synced_at || (menu.updated_at && new Date(menu.updated_at) > new Date(menu.last_synced_at)))
  const pendingCount = items.filter(i => i.edit_status === 'pending_approval').length
  const isApproved = menu.phase === 'approved'
  const currency = resolveCurrencySpec(series, event, menu)

  const tabs = [
    { key: 'items', label: 'Items' },
    { key: 'preview', label: 'Preview' },
    ...(isInternal ? [{ key: 'log', label: 'Edit Log', badge: pendingCount > 0 ? pendingCount : null }] : []),
    { key: 'sponsors', label: 'Sponsors' },
    ...((isAdmin || isInternal) ? [{ key: 'styles', label: 'Styles' }] : []),
    { key: 'signoff', label: 'Sign-off' },
    ...(menu.figma_prototype_url ? [{ key: 'figma', label: 'Figma Preview' }] : []),
  ]

  async function approveAllPending() {
    if (!pendingCount) return
    const pendingIds = items.filter(i => i.edit_status === 'pending_approval').map(i => i.id)
    await supabase
      .from('menu_items')
      .update({ edit_status: 'approved' })
      .in('id', pendingIds)
    setLastApprovedIds(pendingIds)
    loadMenu()
  }

  async function undoApproveAll() {
    if (!lastApprovedIds.length) return
    await supabase
      .from('menu_items')
      .update({ edit_status: 'pending_approval' })
      .in('id', lastApprovedIds)
    setLastApprovedIds([])
    loadMenu()
  }

  async function approveMenu() {
    if (isApproved) return
    await supabase.from('menus').update({ phase: 'approved' }).eq('id', menu.id)
    loadMenu()
  }

  async function unapproveMenu() {
    if (!isApproved) return
    await supabase.from('menus').update({ phase: 'proof' }).eq('id', menu.id)
    loadMenu()
  }

  return (
    <PageScreen
      breadcrumbs={[
        { label: brand?.name, to: `/brands/${brandSlug}` },
        { label: series?.name, to: `/brands/${brandSlug}/series/${seriesSlug}` },
        { label: event?.name, to: `/brands/${brandSlug}/series/${seriesSlug}/events/${eventSlug}` },
        { label: menu.name },
      ]}
      actions={<>
        <FavoriteButton type="menu" id={menu.id} size="sm" />
        <PhaseBadge
          phase={menu.phase}
          hasPendingEdits={pendingCount > 0}
          options={['build', 'proof', 'print_prep', 'approved']}
          onChange={canEdit ? async (next) => { await supabase.from('menus').update({ phase: next }).eq('id', menu.id); loadMenu() } : null}
        />
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
      </>}
      secondaryActions={(isAdmin || isInternal) && (<>
        {isApproved ? (
          <button
            onClick={unapproveMenu}
            className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 font-medium"
            title="Click to move back to Proof"
          >
            ✓ Approved
          </button>
        ) : (
          <button
            onClick={approveMenu}
            className="text-xs px-3 py-1.5 rounded-md bg-white text-brand-600 border border-brand-300 hover:bg-brand-50 font-medium"
            title="Mark this menu as Approved"
          >
            Approve Menu
          </button>
        )}
        {canEdit && (
          <button
            onClick={() => {
              setEditMenuName(menu.name)
              setEditMenuSize(menu.size || 'lg')
              setEditMenuCategory(menu.category || 'bar')
              setEditMenuIconUrl(menu.icon_url || null)
              setEditMenuIconName(menu.icon_name || null)
              setEditMenuError(null)
              setShowEditMenu(true)
            }}
            className="btn-secondary btn-sm"
          >
            Edit
          </button>
        )}
      </>)}
      below={(
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
                tab === t.key
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-ink-500 hover:text-ink-700'
              }`}
            >
              {t.label}
              {t.badge != null && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    >
      {showEditMenu ? (
        <PageBody className="max-w-2xl">
          <h2 className="text-base font-semibold text-ink-900 mb-1">Edit Menu</h2>
          <p className="text-xs text-ink-400 mb-5">Update the menu name and icon. Tap Save to apply.</p>
          <form onSubmit={async e => {
            e.preventDefault()
            setEditMenuSaving(true); setEditMenuError(null)
            try {
              const { error } = await supabase.from('menus')
                .update({
                  name: editMenuName.trim(),
                  size: editMenuSize,
                  category: editMenuCategory,
                  icon_url: editMenuIconUrl,
                  icon_name: editMenuIconName,
                })
                .eq('id', menu.id)
              if (error) throw error
              setShowEditMenu(false)
              loadMenu()
            } catch (err) {
              setEditMenuError(err?.message || String(err))
            } finally {
              setEditMenuSaving(false)
            }
          }} className="card p-5 space-y-4">
            <div>
              <label className="label">Menu Name</label>
              <input className="input" value={editMenuName} onChange={e => setEditMenuName(e.target.value)} required autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Size</label>
                <select className="input" value={editMenuSize} onChange={e => setEditMenuSize(e.target.value)}>
                  <option value="sm">Small  — 23.5" × 23.5"</option>
                  <option value="md">Medium — 23.5" × 35.25"</option>
                  <option value="lg">Large  — 23.5" × 47.5"</option>
                </select>
              </div>
              <div>
                <label className="label">Category</label>
                <select className="input" value={editMenuCategory} onChange={e => setEditMenuCategory(e.target.value)}>
                  <option value="bar">Bar</option>
                  <option value="food">Food</option>
                  <option value="vip">VIP</option>
                  <option value="happy_hour">Happy Hour</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">Icon</label>
              <ErrorBoundary>
                <EntityIconPicker
                  iconUrl={editMenuIconUrl}
                  iconName={editMenuIconName}
                  onChange={({ icon_url, icon_name }) => { setEditMenuIconUrl(icon_url); setEditMenuIconName(icon_name) }}
                  uploadBucket="series-assets"
                  uploadPathPrefix={`${menu.id}/icons`}
                  fallbackText={editMenuName}
                  fallbackColor={brand?.color}
                />
              </ErrorBoundary>
            </div>
            {editMenuError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{editMenuError}</p>}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-surface-100">
              <button type="button" onClick={() => setShowEditMenu(false)} className="btn-secondary btn-sm">Cancel</button>
              <button type="submit" className="btn-primary btn-sm" disabled={editMenuSaving}>{editMenuSaving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </form>

          {/* Danger zone */}
          {(isAdmin || isInternal) && (
            <section className="card border-red-200 mt-8 p-5">
              <h3 className="text-sm font-semibold text-red-700">Delete menu</h3>
              <p className="text-xs text-ink-500 mt-1 mb-3">
                Permanently removes this menu and all of its items, edit log, and sponsor toggles. This can't be undone.
                A CSV backup is offered in the confirmation step.
              </p>
              <button
                type="button"
                onClick={() => { setDeleteConfirmText(''); setDeleteBackupDone(false); setDeleteError(null); setShowDeleteMenu(true) }}
                className="text-xs font-medium px-3 py-1.5 rounded-md bg-white text-red-700 border border-red-300 hover:bg-red-50"
              >
                Delete this menu…
              </button>
            </section>
          )}
        </PageBody>
      ) : (
      <PageBody>
      {/* Menu meta + CSV controls */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <p className="text-sm text-ink-500 capitalize">
          {menu.category.replace('_', ' ')} menu · {event?.name}
          {menu.size && <span className="ml-2 px-1.5 py-0.5 rounded bg-surface-100 text-ink-400 text-xs font-mono uppercase not-capitalize">{menu.size}</span>}
        </p>
        {isInternal && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => setShowImport(v => !v)} className="btn-secondary btn-sm">Import CSV</button>
            <CsvExport menu={menu} items={items} />
          </div>
        )}
      </div>

      {/* Compact CTA strip — sync + pending edits */}
      {(syncNeeded || pendingCount > 0) && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          {syncNeeded && event?.figma_file_url && (
            <a
              href={event.figma_file_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium hover:bg-amber-100"
              title={menu.last_synced_at
                ? `Last synced ${new Date(menu.last_synced_at).toLocaleString()} — edited since`
                : 'Never synced to Figma. Open the Figma file and run the Menu Hub plugin.'}
            >
              <FigmaLogo variant="line" size={12} />
              Sync needed
            </a>
          )}
          {syncNeeded && (
            <a
              href={PLUGIN_INSTALL_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white border border-surface-200 text-ink-700 text-[11px] font-medium hover:bg-surface-50"
              title="Install the Menu Hub Figma plugin"
            >
              <FigmaLogo size={12} />
              Plugin
            </a>
          )}
          {syncNeeded && !event?.figma_file_url && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
              ● Sync needed
            </span>
          )}
          {pendingCount > 0 && (isAdmin || isInternal) && (
            <button
              onClick={() => setTab('log')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs font-medium hover:bg-red-100"
            >
              {pendingCount} edit{pendingCount === 1 ? '' : 's'} pending
            </button>
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
          {lastApprovedIds.length > 0 && pendingCount === 0 && (
            <div className="card border-emerald-200 bg-emerald-50 p-3 flex items-center justify-between gap-3">
              <div className="text-sm text-emerald-800">
                ✓ Approved {lastApprovedIds.length} edit{lastApprovedIds.length === 1 ? '' : 's'}.
              </div>
              <button
                onClick={undoApproveAll}
                className="text-xs font-medium px-3 py-1.5 rounded-md bg-white text-emerald-800 border border-emerald-300 hover:bg-emerald-100"
              >
                Undo
              </button>
            </div>
          )}
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
                          currency={currency}
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
            <SpacingOverridePanel
              menu={menu}
              size={activeSize}
              canEdit={canEdit}
              onSaved={loadMenu}
            />
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
              <div className="flex items-center gap-2 flex-wrap">
                {hasTemplate && (
                  <button
                    onClick={() => setLightboxOpen(true)}
                    className="btn-secondary btn-sm text-xs gap-1.5"
                    title="Zoom in to inspect details"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16zM8 11h6M11 8v6" />
                    </svg>
                    Zoom
                  </button>
                )}
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

            {/* Inline canvas — always fits to container as a single solid piece */}
            {hasTemplate ? (
              <div className="rounded-xl overflow-hidden border border-surface-200 shadow-sm bg-surface-50">
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
      {tab === 'log' && (
        <EditLog
          menuId={menu.id}
          onChange={loadMenu}
          onApproveAll={pendingCount > 0 && (isAdmin || isInternal)
            ? async () => { if (confirm(`Approve all ${pendingCount} pending edits at once?`)) await approveAllPending() }
            : null}
        />
      )}

      {/* Sign-off tab */}
      {tab === 'signoff' && (
        <ApproversPanel targetType="menu" targetId={menu.id} title="Menu sign-off" />
      )}

      {tab === 'styles' && (isAdmin || isInternal) && (
        <MenuStylesTab
          menu={menu}
          event={event}
          series={series}
          canEdit={canEdit}
          onSaved={loadMenu}
        />
      )}

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
      )}

      {/* Zoom lightbox */}
      {lightboxOpen && (() => {
        const activeSize = previewSize || menu.size || 'lg'
        const template = templates[activeSize]
        return (
          <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
            <div className="flex items-center justify-between px-4 py-3 text-white">
              <div className="text-sm font-semibold">{menu.name} <span className="text-white/60 font-normal">— {activeSize.toUpperCase()}</span></div>
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center rounded-md bg-white/10 backdrop-blur-sm overflow-hidden">
                  <button onClick={() => setPreviewZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))} className="px-2 py-1 text-white hover:bg-white/10 disabled:opacity-30" disabled={previewZoom <= 0.5}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" /></svg>
                  </button>
                  <button onClick={() => setPreviewZoom(1)} className="px-2 py-1 text-xs text-white hover:bg-white/10 font-mono min-w-[42px]">{Math.round(previewZoom * 100)}%</button>
                  <button onClick={() => setPreviewZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))} className="px-2 py-1 text-white hover:bg-white/10 disabled:opacity-30" disabled={previewZoom >= 4}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                  </button>
                </div>
                <button onClick={() => setLightboxOpen(false)} className="text-white p-1.5 hover:bg-white/10 rounded-md" aria-label="Close">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
              <div className="bg-surface-50 rounded-lg overflow-hidden">
                <TemplateCanvas
                  template={template}
                  series={series}
                  event={event}
                  size={activeSize}
                  menu={menu}
                  items={items}
                  eventSponsors={eventSponsors}
                  menuSponsorIds={menuSponsorIds}
                  zoom={previewZoom}
                />
              </div>
            </div>
          </div>
        )
      })()}

      {/* Delete menu confirm modal */}
      {showDeleteMenu && (
        <Modal title="Delete this menu?" onClose={() => { if (!deleting) setShowDeleteMenu(false) }}>
          <div className="space-y-4">
            <p className="text-sm text-ink-700">
              <strong>{menu.name}</strong> and all of its items, edit log, and sponsor toggles will be permanently removed.
              This can't be undone.
            </p>

            <div className="rounded-lg border border-surface-200 bg-surface-50 p-3">
              <div className="text-xs font-semibold text-ink-700 mb-1">Backup first</div>
              <p className="text-[11px] text-ink-500 mb-2">
                Download a CSV of every item, section, and price so you can re-import later if you change your mind.
              </p>
              <button
                type="button"
                onClick={() => {
                  const ok = downloadMenuCsv(menu, items, { useCurrency: true })
                  if (ok) setDeleteBackupDone(true)
                }}
                className="text-xs font-medium px-3 py-1.5 rounded-md bg-white border border-surface-300 hover:bg-surface-100 inline-flex items-center gap-1.5"
              >
                {deleteBackupDone ? '↻ Re-download CSV' : '↓ Download CSV backup'}
              </button>
              {deleteBackupDone && (
                <span className="ml-2 text-[11px] text-emerald-700">CSV downloaded ✓</span>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-700 mb-1">
                Type <code className="bg-surface-100 px-1 rounded text-red-600">DELETE</code> to confirm
              </label>
              <input
                type="text"
                className="input input-error"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                autoFocus
              />
            </div>

            {deleteError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{deleteError}</p>
            )}

            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowDeleteMenu(false)}
                disabled={deleting}
                className="btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting || deleteConfirmText !== 'DELETE'}
                onClick={async () => {
                  setDeleting(true); setDeleteError(null)
                  try {
                    // Items, menu_sponsors, and edit_log cascade via FK from menus (assumed); fall back
                    // to explicit deletes if needed.
                    await supabase.from('menu_items').delete().eq('menu_id', menu.id)
                    await supabase.from('menu_sponsors').delete().eq('menu_id', menu.id)
                    await supabase.from('edit_log').delete().eq('menu_id', menu.id)
                    const { error } = await supabase.from('menus').delete().eq('id', menu.id)
                    if (error) throw error
                    setShowDeleteMenu(false)
                    navigate(`/brands/${brandSlug}/series/${seriesSlug}/events/${eventSlug}`, { replace: true })
                  } catch (e) {
                    setDeleteError(e?.message || String(e))
                  } finally {
                    setDeleting(false)
                  }
                }}
                className="btn-sm bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg px-4 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </PageScreen>
  )
}

function SpacingOverridePanel({ menu, size, canEdit, onSaved }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const override = (menu.spacing_override || {})[size] || {}
  const hasAny = Object.keys(override).length > 0

  async function setField(field, value) {
    setSaving(true)
    try {
      const all = { ...(menu.spacing_override || {}) }
      const next = { ...(all[size] || {}) }
      if (value === null || value === '') delete next[field]
      else next[field] = value
      if (Object.keys(next).length === 0) delete all[size]
      else all[size] = next
      await supabase.from('menus').update({ spacing_override: Object.keys(all).length ? all : null }).eq('id', menu.id)
      onSaved()
    } finally { setSaving(false) }
  }

  async function clearAll() {
    setSaving(true)
    try {
      const all = { ...(menu.spacing_override || {}) }
      delete all[size]
      await supabase.from('menus').update({ spacing_override: Object.keys(all).length ? all : null }).eq('id', menu.id)
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <div className="mb-4 card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-surface-50"
      >
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-ink-700">Spacing override</span>
          <span className="text-xs text-ink-400">{size.toUpperCase()}</span>
          {hasAny && <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">{Object.keys(override).length} field{Object.keys(override).length === 1 ? '' : 's'} overridden</span>}
        </div>
        <svg className={`w-4 h-4 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-surface-100">
          <p className="text-[11px] text-ink-400 my-3">Tweak gaps for just this menu at the {size.toUpperCase()} size. Leave blank to inherit from series/event. Changes save instantly.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <OverrideNumber label="Logo → Title"   value={override.logo_to_title}   onChange={v => setField('logo_to_title', v)}   disabled={!canEdit || saving} />
            <OverrideNumber label="Title → Items"  value={override.title_to_items}  onChange={v => setField('title_to_items', v)}  disabled={!canEdit || saving} />
            <OverrideNumber label="Items → Footer" value={override.items_to_footer} onChange={v => setField('items_to_footer', v)} disabled={!canEdit || saving} />
            <OverrideGap   label="Section gap" value={override.section_gap} onChange={v => setField('section_gap', v)} disabled={!canEdit || saving} />
            <OverrideGap   label="Item gap"    value={override.item_gap}    onChange={v => setField('item_gap', v)}    disabled={!canEdit || saving} />
          </div>
          {hasAny && canEdit && (
            <div className="flex justify-end mt-3">
              <button onClick={clearAll} disabled={saving} className="text-xs text-red-500 hover:text-red-700">Clear overrides for {size.toUpperCase()}</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function OverrideNumber({ label, value, onChange, disabled }) {
  return (
    <div>
      <label className="block text-[11px] text-ink-500 mb-1">{label}</label>
      <input
        type="number"
        className="input input-sm"
        value={value ?? ''}
        placeholder="inherit"
        onChange={e => onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))}
        disabled={disabled}
      />
    </div>
  )
}

function OverrideGap({ label, value, onChange, disabled }) {
  const isAuto = value === 'auto'
  return (
    <div>
      <label className="block text-[11px] text-ink-500 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(isAuto ? null : 'auto')}
          disabled={disabled}
          className={`text-[10px] px-2 py-1 rounded font-medium ${isAuto ? 'bg-brand-100 text-brand-700' : 'bg-surface-100 text-ink-500'}`}
        >
          auto
        </button>
        {!isAuto && (
          <input
            type="number"
            className="input input-sm flex-1"
            value={typeof value === 'number' ? value : ''}
            placeholder="inherit"
            onChange={e => onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))}
            disabled={disabled}
            step={10}
          />
        )}
      </div>
    </div>
  )
}
