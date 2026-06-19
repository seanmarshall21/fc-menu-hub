import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import PageScreen, { PageBody } from '@/components/PageScreen'
import PizzaLoader from '@/components/PizzaLoader'
import { useDelayedLoader } from '@/hooks/useDelayedLoader'
import PhaseBadge from '@/components/PhaseBadge'
import MenuItemRow from '@/components/MenuItemRow'
import MenuItemCard from '@/components/MenuItemCard'
import CsvImport from '@/components/CsvImport'
import CsvExport from '@/components/CsvExport'
import EditLog from '@/components/EditLog'
import MenuPreview, { buildSectionGroups } from '@/components/MenuPreview'
import TemplateCanvas, { SIZE_CONFIGS } from '@/components/TemplateCanvas'
import EntityIconPicker from '@/components/EntityIconPicker'
import ErrorBoundary from '@/components/ErrorBoundary'
import FavoriteButton from '@/components/FavoriteButton'
import ApproversPanel from '@/components/ApproversPanel'
import NotifyForEditsEditor from '@/components/NotifyForEditsEditor'
import MenuReviewPanel from '@/components/MenuReviewPanel'
import { PLUGIN_INSTALL_URL } from '@/lib/figmaPlugin'
import FigmaLogo from '@/components/FigmaLogo'
import { resolveCurrencySpec } from '@/lib/formatPrice'
import { useFocusRefresh } from '@/hooks/useFocusRefresh'
import { downloadMenuCsv } from '@/lib/downloadMenuCsv'
import MenuStylesTab from '@/components/MenuStylesTab'
import ItemsTableHeader from '@/components/ItemsTableHeader'
import SegmentedToggle from '@/components/SegmentedToggle'
import SortableList, { DragHandle } from '@/components/SortableList'
import { DEFAULT_ITEM_COLUMNS } from '@/components/MenuItemRow'
import { useTableColumns } from '@/hooks/useTableColumns'
import {
  DndContext, PointerSensor, TouchSensor, KeyboardSensor,
  closestCenter, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, useSortable, verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
  const { isAdmin, isInternal, canEditStyles } = useAuth()

  const [brand, setBrand]   = useState(null)
  const [series, setSeries] = useState(null)
  const [event, setEvent]   = useState(null)
  const [menu, setMenu]     = useState(null)
  const [items, setItems]   = useState([])
  const [eventSponsors, setEventSponsors] = useState([])
  // Resolved "Notify for edits" list — union of brand + series + event + menu.
  // Pre-fills the item edit form so editors don't have to remember to tag
  // people who are already configured upstream. Deduped via Set.
  const resolvedNotifyIds = useMemo(() => {
    const s = new Set()
    ;[brand?.notify_user_ids, series?.notify_user_ids, event?.notify_user_ids, menu?.notify_user_ids]
      .filter(Array.isArray).forEach(list => list.forEach(id => id && s.add(id)))
    return [...s]
  }, [brand?.notify_user_ids, series?.notify_user_ids, event?.notify_user_ids, menu?.notify_user_ids])

  // Sponsor state is split into draft (the live UI) + server (last-loaded
  // snapshot). The Sponsors tab uses a Save/Cancel pattern instead of
  // committing on every toggle, so anything the user changes lives in the
  // draft until they press Save. Cancel reverts draft to server.
  const [menuSponsorIds, setMenuSponsorIds] = useState(new Set())          // draft
  const [menuSponsorRows, setMenuSponsorRows] = useState([])               // draft
  const [menuSponsorIdsServer, setMenuSponsorIdsServer] = useState(new Set())
  const [menuSponsorRowsServer, setMenuSponsorRowsServer] = useState([])
  const [menuOverrideOrderDraft, setMenuOverrideOrderDraft] = useState(false)
  const [menuSponsorsSaving, setMenuSponsorsSaving] = useState(false)
  const [selectedItemIds, setSelectedItemIds] = useState(new Set())
  const [batchBusy, setBatchBusy] = useState(false)
  const [templates, setTemplates] = useState({}) // keyed by size: { sm, md, lg }
  const [previewSize, setPreviewSize] = useState(null) // null = inherit menu.size; user pick overrides
  const [previewZoom, setPreviewZoom] = useState(1)    // (legacy — only used inside the lightbox now)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const showPageLoader = useDelayedLoader(loading)
  const [tab, setTab] = useState('items')
  // Escape always closes the lightbox — safety net in case the close button
  // ever gets covered. Switching tabs also closes it so you can't get stuck.
  useEffect(() => {
    if (!lightboxOpen) return
    function onKey(e) { if (e.key === 'Escape') setLightboxOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxOpen])
  useEffect(() => { setLightboxOpen(false) }, [tab])
  // Drop batch selection when leaving the items tab so it doesn't linger.
  useEffect(() => { if (tab !== 'items') setSelectedItemIds(new Set()) }, [tab])
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
  const [editMenuRequiresSponsorApproval, setEditMenuRequiresSponsorApproval] = useState(false)
  const [editMenuFigmaPrefix, setEditMenuFigmaPrefix] = useState('')
  const [editMenuSaving, setEditMenuSaving] = useState(false)
  const [editMenuError, setEditMenuError] = useState(null)
  // Delete menu modal state
  const [showDeleteMenu, setShowDeleteMenu] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteBackupDone, setDeleteBackupDone] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const loadMenu = useCallback(async () => {
    const { data: brandData } = await supabase.from('brands').select('id,name,slug,color,notify_user_ids,figma_component_prefix').eq('slug', brandSlug).single()
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

        // Which event sponsors are toggled onto this menu (include sort_order)
        const { data: msponsors } = await supabase
          .from('menu_sponsors')
          .select('id, event_sponsor_id, sort_order')
          .eq('menu_id', menuData.id)
          .not('event_sponsor_id', 'is', null)
          .order('sort_order')
        const initialRows = msponsors || []
        const initialIds  = new Set(initialRows.map(s => s.event_sponsor_id))
        setMenuSponsorRows(initialRows)
        setMenuSponsorIds(initialIds)
        // Snapshot what the server has so the Sponsors tab can compute a
        // "dirty" flag and offer Cancel.
        setMenuSponsorRowsServer(initialRows)
        setMenuSponsorIdsServer(initialIds)
        setMenuOverrideOrderDraft(!!menuData.override_sponsor_order)

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

  // Column prefs need to be a top-level hook so the order/count is stable
  // across renders — must NOT live after the early returns below.
  const [itemColumns, setItemColumnOrder, setItemColumnWidth, resetItemColumns] = useTableColumns('menu_items_v1', DEFAULT_ITEM_COLUMNS)

  // Sponsor toggle/reorder/override — DRAFT only. Nothing hits the DB until
  // the user presses Save Changes on the sponsor bar. saveMenuSponsors below
  // diffs draft vs server and runs the actual writes.
  // ── Batch selection on the items table ───────────────────────────────────
  function toggleItemSelect(id) {
    setSelectedItemIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function clearItemSelection() { setSelectedItemIds(new Set()) }
  function selectAllItems() {
    setSelectedItemIds(new Set((items || []).map(i => i.id)))
  }
  async function batchSetStatus(status) {
    const ids = [...selectedItemIds]
    if (!ids.length) return
    setBatchBusy(true)
    try {
      await supabase.from('menu_items').update({ status }).in('id', ids)
      clearItemSelection()
      await loadMenu()
    } finally { setBatchBusy(false) }
  }
  async function batchApproveEdits() {
    const ids = [...selectedItemIds]
    if (!ids.length) return
    setBatchBusy(true)
    try {
      await supabase.from('menu_items').update({ edit_status: 'approved' }).in('id', ids)
      clearItemSelection()
      await loadMenu()
    } finally { setBatchBusy(false) }
  }
  async function batchDelete() {
    const ids = [...selectedItemIds]
    if (!ids.length) return
    if (!confirm(`Delete ${ids.length} item${ids.length === 1 ? '' : 's'}? This can't be undone.`)) return
    setBatchBusy(true)
    try {
      await supabase.from('menu_items').delete().in('id', ids)
      clearItemSelection()
      await loadMenu()
    } finally { setBatchBusy(false) }
  }

  function toggleSponsor(sponsorId) {
    const sp = eventSponsors.find(s => s.id === sponsorId)
    if (menuSponsorIds.has(sponsorId)) {
      setMenuSponsorIds(prev => { const next = new Set(prev); next.delete(sponsorId); return next })
      setMenuSponsorRows(prev => prev.filter(r => r.event_sponsor_id !== sponsorId))
    } else {
      const sortOrder = menuSponsorRows.length
      setMenuSponsorIds(prev => new Set([...prev, sponsorId]))
      setMenuSponsorRows(prev => [...prev, {
        // No DB id yet — gets a real one after save. Mark as draft via _draft.
        id: `draft-${sponsorId}`,
        event_sponsor_id: sponsorId,
        sort_order: sortOrder,
        _draft: true,
        name: sp?.name || '',
        slug: sp?.slug || '',
      }])
    }
  }

  // Master on/off for the whole sponsor list. on → every event sponsor
  // active (preserving event order); off → none. Goes through the same
  // draft state so the Save/Cancel bar applies.
  function setAllSponsors(active) {
    if (active) {
      setMenuSponsorIds(new Set(eventSponsors.map(es => es.id)))
      setMenuSponsorRows(eventSponsors.map((es, i) => ({
        id: `draft-${es.id}`,
        event_sponsor_id: es.id,
        sort_order: i,
        _draft: true,
        name: es.name || '',
        slug: es.slug || '',
      })))
    } else {
      setMenuSponsorIds(new Set())
      setMenuSponsorRows([])
    }
  }

  function toggleMenuOverrideOrder(next) {
    if (next === menuOverrideOrderDraft) return
    setMenuOverrideOrderDraft(next)
    if (!next) {
      // Snap draft order back to the event's order so the preview reflects
      // what'll happen on save. Real sort_order gets persisted at save time.
      const eventOrderIndex = new Map(eventSponsors.map((es, i) => [es.id, i]))
      setMenuSponsorRows(prev =>
        [...prev].sort((a, b) =>
          (eventOrderIndex.get(a.event_sponsor_id) ?? 9999) -
          (eventOrderIndex.get(b.event_sponsor_id) ?? 9999)
        ).map((r, i) => ({ ...r, sort_order: i }))
      )
    }
  }

  function reorderMenuSponsors(newRows) {
    const updates = newRows.map((row, i) => ({ id: row.menuRowId, sort_order: i }))
    setMenuSponsorRows(prev => prev.map(r => {
      const u = updates.find(x => x.id === r.id)
      return u ? { ...r, sort_order: u.sort_order } : r
    }))
  }

  // ── Save / cancel for the sponsor draft ────────────────────────────────
  const sponsorsDirty = useMemo(() => {
    if (menuOverrideOrderDraft !== !!menu?.override_sponsor_order) return true
    if (menuSponsorIds.size !== menuSponsorIdsServer.size) return true
    for (const id of menuSponsorIds) if (!menuSponsorIdsServer.has(id)) return true
    // Order-sensitive: compare the row sequence too.
    const aOrder = menuSponsorRows.map(r => r.event_sponsor_id).join(',')
    const bOrder = menuSponsorRowsServer.map(r => r.event_sponsor_id).join(',')
    if (aOrder !== bOrder) return true
    return false
  }, [menu?.override_sponsor_order, menuOverrideOrderDraft, menuSponsorIds, menuSponsorIdsServer, menuSponsorRows, menuSponsorRowsServer])

  async function saveMenuSponsors() {
    if (!menu?.id) return
    setMenuSponsorsSaving(true)
    try {
      // 1. Toggle delta
      const toAdd = [...menuSponsorIds].filter(id => !menuSponsorIdsServer.has(id))
      const toRemove = [...menuSponsorIdsServer].filter(id => !menuSponsorIds.has(id))

      // 2. Apply removals (with edit-log entries)
      for (const sponsorId of toRemove) {
        const sp = eventSponsors.find(s => s.id === sponsorId)
        const sponsorName = sp?.name || sp?.slug || 'sponsor'
        await supabase.from('menu_sponsors').delete()
          .eq('menu_id', menu.id).eq('event_sponsor_id', sponsorId)
        supabase.rpc('log_sponsor_change', {
          p_menu_id: menu.id, p_sponsor_name: sponsorName, p_action: 'removed',
        }).then(() => {}, () => {})
      }

      // 3. Apply adds (with edit-log entries)
      for (const sponsorId of toAdd) {
        const sp = eventSponsors.find(s => s.id === sponsorId)
        const sponsorName = sp?.name || sp?.slug || 'sponsor'
        const sortOrder = menuSponsorRows.find(r => r.event_sponsor_id === sponsorId)?.sort_order ?? 9999
        await supabase.from('menu_sponsors').insert({
          menu_id: menu.id,
          event_sponsor_id: sponsorId,
          name: sp?.name || '',
          slug: sp?.slug || '',
          active: true,
          sort_order: sortOrder,
        })
        supabase.rpc('log_sponsor_change', {
          p_menu_id: menu.id, p_sponsor_name: sponsorName, p_action: 'added',
        }).then(() => {}, () => {})
      }

      // 4. Reorder existing rows (skip draft rows — those just got their id)
      const reorderUpdates = menuSponsorRows
        .filter(r => !r._draft && r.id && !String(r.id).startsWith('draft-'))
        .map(r => ({ id: r.id, sort_order: r.sort_order }))
      await Promise.all(reorderUpdates.map(u =>
        supabase.from('menu_sponsors').update({ sort_order: u.sort_order }).eq('id', u.id)
      ))

      // 5. Override-order toggle on the menu row
      if (menuOverrideOrderDraft !== !!menu.override_sponsor_order) {
        await supabase.from('menus')
          .update({ override_sponsor_order: menuOverrideOrderDraft })
          .eq('id', menu.id)
      }

      await loadMenu()  // refetches and snapshots draft = server again
    } finally {
      setMenuSponsorsSaving(false)
    }
  }

  function cancelMenuSponsorChanges() {
    setMenuSponsorIds(new Set(menuSponsorIdsServer))
    setMenuSponsorRows(menuSponsorRowsServer)
    setMenuOverrideOrderDraft(!!menu?.override_sponsor_order)
  }

  // Warn before navigating away (refresh, close tab, back) while there are
  // unsaved sponsor changes. Browsers ignore the custom message — they show
  // their own confirm dialog — but setting returnValue is what arms it.
  useEffect(() => {
    if (!sponsorsDirty) return
    function onBeforeUnload(e) {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [sponsorsDirty])

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

  // ── Replace a section's items with a new ordering (used by drag-and-drop) ──
  async function reorderItemsInSection(sectionName, newSectionItems) {
    // Rebuild the full flat items list keeping items outside the section in their original positions
    // and substituting the reordered section items.
    const newItems = []
    let sectionIdx = 0
    for (const it of items) {
      if (it.section === sectionName) {
        newItems.push(newSectionItems[sectionIdx++])
      } else {
        newItems.push(it)
      }
    }
    setItems(newItems) // optimistic UI
    await Promise.all(
      newItems.map((it, i) => supabase.from('menu_items').update({ sort_order: i }).eq('id', it.id))
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

  if (showPageLoader) return <PizzaLoader />
  if (loading) return null
  if (!menu) return <div className="px-8 py-8 text-sm text-red-500">Menu not found.</div>

  // Consecutive section groups — preserves duplicate section names at different positions
  const sectionGroups = buildSectionGroups(items)
  const sectionNames = [...new Set(items.map(i => i.section))] // unique names for datalist only
  const canEdit = (isAdmin || isInternal) && menu.phase !== 'approved'

  const syncNeeded = (!menu.last_synced_at || (menu.updated_at && new Date(menu.updated_at) > new Date(menu.last_synced_at)))
  const pendingCount = items.filter(i => i.edit_status === 'pending_approval').length
  const isApproved = menu.phase === 'approved'
  const currency = resolveCurrencySpec(series, event, menu)

  // Sponsor order shown in preview/export. When menu.override_sponsor_order is
  // true, active sponsors are placed first in menu_sponsors.sort_order; when
  // false, the event order (already in eventSponsors) is preserved.
  const previewSponsors = (() => {
    if (!menu.override_sponsor_order) return eventSponsors
    const orderById = new Map(menuSponsorRows.map(r => [r.event_sponsor_id, r.sort_order]))
    return [...eventSponsors].sort((a, b) => {
      const aActive = menuSponsorIds.has(a.id)
      const bActive = menuSponsorIds.has(b.id)
      if (aActive && !bActive) return -1
      if (!aActive && bActive) return 1
      if (aActive && bActive) return (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0)
      return 0
    })
  })()

  const tabs = [
    { key: 'items', label: 'Items' },
    { key: 'preview', label: 'Preview' },
    ...(isInternal ? [{ key: 'log', label: 'Edit Log', badge: pendingCount > 0 ? pendingCount : null }] : []),
    { key: 'sponsors', label: 'Sponsors' },
    ...(canEditStyles ? [{ key: 'styles', label: 'Styles' }] : []),
    { key: 'signoff', label: 'Approvals' },
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
      tourKey="menu"
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
            data-tour="menu-approve-button"
            className="text-xs px-3 py-1.5 rounded-md bg-white text-brand-600 border border-brand-300 hover:bg-brand-50 font-medium whitespace-nowrap"
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
              setEditMenuRequiresSponsorApproval(!!menu.requires_sponsor_approval)
              setEditMenuFigmaPrefix(menu.figma_component_prefix || '')
              setEditMenuError(null)
              setShowEditMenu(true)
            }}
            data-tour="menu-edit-button"
            className="btn-secondary btn-sm whitespace-nowrap"
          >
            Edit
          </button>
        )}
      </>)}
      below={(
        <div className="flex gap-1 overflow-x-auto overflow-y-hidden touch-pan-x overscroll-x-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
          {tabs.map(t => (
            <button
              key={t.key}
              data-tour={`menu-tab-${t.key}`}
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
                  requires_sponsor_approval: editMenuRequiresSponsorApproval,
                  figma_component_prefix: (editMenuFigmaPrefix || '').trim() || null,
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
            <div className="pt-3 border-t border-surface-100">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={editMenuRequiresSponsorApproval}
                  onChange={e => setEditMenuRequiresSponsorApproval(e.target.checked)}
                  className="rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm text-ink-700">Requires sponsor approval</span>
              </label>
              <p className="text-xs text-ink-400 mt-1 ml-6">Surfaces an amber "Needs sponsor approval" chip at the top of this menu until someone marks it approved.</p>
            </div>
            <div className="pt-3 border-t border-surface-100">
              <label className="label">Figma component prefix <span className="text-ink-400 font-normal">(optional override)</span></label>
              <input
                type="text"
                className="input font-mono"
                value={editMenuFigmaPrefix}
                onChange={e => setEditMenuFigmaPrefix(e.target.value)}
                placeholder={`Inherits from event / series / brand${event?.figma_component_prefix ? `: ${event.figma_component_prefix}` : (series?.figma_component_prefix ? `: ${series.figma_component_prefix}` : (brand?.figma_component_prefix ? `: ${brand.figma_component_prefix}` : ''))}`}
                spellCheck={false}
              />
              <p className="text-[11px] text-ink-400 mt-1 leading-relaxed">
                Leave blank to inherit. Override only when this specific menu uses a different master-component set (e.g. a sponsor-takeover menu with a totally different template than the rest of the event).
              </p>
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
          <div data-tour="menu-csv-toolbar" className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => setShowImport(v => !v)} data-tour="menu-import-csv" className="btn-secondary btn-sm whitespace-nowrap">Import CSV</button>
            <CsvExport menu={menu} items={items} />
          </div>
        )}
      </div>

      {/* Compact CTA strip — sync + pending edits */}
      {(syncNeeded || pendingCount > 0) && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          {syncNeeded && event?.figma_file_url && (
            <a
              href={(() => {
                // Deep-link to the specific frame when we know its id (the
                // plugin writes it to menus.last_synced_frame_id on every
                // sync). Figma respects ?node-id=… and scrolls to + selects
                // the matching node, in either browser or desktop app.
                let url = event.figma_file_url
                if (menu.last_synced_frame_id) {
                  const sep = url.includes('?') ? '&' : '?'
                  url = `${url}${sep}node-id=${encodeURIComponent(menu.last_synced_frame_id)}`
                }
                return url
              })()}
              target="_blank"
              rel="noreferrer"
              data-tour="menu-sync-chip"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium hover:bg-amber-100 whitespace-nowrap"
              title={menu.last_synced_at
                ? `Last synced ${new Date(menu.last_synced_at).toLocaleString()} — edited since. Opens the linked Figma frame.`
                : 'Never synced to Figma. Open the Figma file and run the Menu Sync plugin.'}
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
              title="Install Menu Sync from Figma Community"
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
              data-tour="menu-pending-chip"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs font-medium hover:bg-red-100 whitespace-nowrap"
            >
              {pendingCount} edit{pendingCount === 1 ? '' : 's'} pending
            </button>
          )}
        </div>
      )}

      {/* Sponsor approval state — only shown when the menu is flagged as
          needing sponsor sign-off. Chip flips green once approved. */}
      {menu.requires_sponsor_approval && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          {menu.sponsor_approved_at ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium"
              title={`Approved by sponsor ${new Date(menu.sponsor_approved_at).toLocaleString()}`}>
              ✓ Approved by sponsor
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
              ⏳ Needs sponsor approval
            </span>
          )}
          {(isAdmin || isInternal) && (
            <button
              onClick={async () => {
                const wasApproved = !!menu.sponsor_approved_at
                const update = wasApproved
                  ? { sponsor_approved_at: null, sponsor_approved_by: null }
                  : { sponsor_approved_at: new Date().toISOString(), sponsor_approved_by: profile?.id || null }
                await supabase.from('menus').update(update).eq('id', menu.id)
                loadMenu()
              }}
              className="text-[11px] text-ink-500 hover:text-ink-700 underline-offset-2 hover:underline"
            >
              {menu.sponsor_approved_at ? 'Mark as not approved' : 'Mark as approved'}
            </button>
          )}
        </div>
      )}

      {showImport && (
        <div className="mb-6">
          <CsvImport menuId={menu.id} currency={currency} onImported={() => { setShowImport(false); loadMenu() }} />
        </div>
      )}

      {/* Items tab */}
      {tab === 'items' && (
        <div className="space-y-8">
          {canEdit && <MenuReviewPanel items={items} menuId={menu.id} onJumpToItem={() => {}} onChanged={loadMenu} />}

          {/* Batch action bar — appears when items are selected via the
              checkboxes in the item column. */}
          {canEdit && selectedItemIds.size > 0 && (
            <div className="sticky top-0 z-20 -mt-4 mb-2 rounded-lg border border-brand-200 bg-brand-50 shadow-sm px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 text-sm">
                <span className="font-semibold text-brand-700">{selectedItemIds.size} selected</span>
                <button onClick={selectAllItems} className="text-xs text-brand-600 hover:text-brand-800 underline-offset-2 hover:underline whitespace-nowrap">Select all {items.length}</button>
                <button onClick={clearItemSelection} className="text-xs text-ink-500 hover:text-ink-700 underline-offset-2 hover:underline whitespace-nowrap">Clear</button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-ink-400 mr-1">Set status:</span>
                <button onClick={() => batchSetStatus('active')}    disabled={batchBusy} className="btn-secondary btn-sm whitespace-nowrap">Active</button>
                <button onClick={() => batchSetStatus('draft')}     disabled={batchBusy} className="btn-secondary btn-sm whitespace-nowrap">Draft</button>
                <button onClick={() => batchSetStatus('not_added')} disabled={batchBusy} className="btn-secondary btn-sm whitespace-nowrap">Not&nbsp;Added</button>
                {(isAdmin || isInternal) && (
                  <button onClick={batchApproveEdits} disabled={batchBusy} className="btn-secondary btn-sm whitespace-nowrap">Approve edits</button>
                )}
                <button onClick={batchDelete} disabled={batchBusy} className="text-xs px-3 py-1.5 rounded-md bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 font-medium whitespace-nowrap">Delete</button>
              </div>
            </div>
          )}
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

          {canEdit && sectionGroups.length > 0 && (
            <div className="hidden md:flex items-center justify-end -mt-3 -mb-4">
              <button
                onClick={() => { if (confirm('Reset column order and widths to the default?')) resetItemColumns() }}
                className="text-[11px] text-ink-400 hover:text-ink-700 underline-offset-2 hover:underline"
                title="Discard your column reorder/resize and restore the default layout"
              >
                Reset columns
              </button>
            </div>
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
              {/* Mobile: stacked cards (tap to edit in modal) */}
              <div className="md:hidden space-y-2">
                {group.items.map(it => (
                  <MenuItemCard
                    key={it.id}
                    item={it}
                    menu={menu}
                    canEdit={canEdit}
                    currency={currency}
                    sections={sectionNames}
                    onUpdated={loadMenu}
                    defaultNotifyIds={resolvedNotifyIds}
                  />
                ))}
                {canEdit && (
                  addingToSection === group.key ? (
                    <div className="card overflow-hidden">
                      <table className="w-full text-sm">
                        <tbody>
                          <AddItemRow
                            menuId={menu.id}
                            sections={sectionNames}
                            defaultSection={group.section || ''}
                            nextSortOrder={sectionMaxSort + 1}
                            onSaved={() => { setAddingToSection(null); loadMenu() }}
                          />
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingToSection(group.key)}
                      className="w-full border border-dashed border-surface-300 rounded-lg px-3 py-2.5 text-xs text-brand-500 hover:text-brand-700 hover:border-brand-300 font-medium flex items-center justify-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Add item to {group.section || 'this section'}
                    </button>
                  )
                )}
              </div>

              {/* Desktop: full sortable/resizable table */}
              <div className="hidden md:block card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="text-sm" style={{ tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
                    <ItemsTableHeader
                      columns={itemColumns}
                      canEdit={canEdit}
                      onReorder={setItemColumnOrder}
                      onResize={setItemColumnWidth}
                    />
                    <SectionTbody
                      group={group}
                      menu={menu}
                      canEdit={canEdit}
                      currency={currency}
                      sectionNames={sectionNames}
                      loadMenu={loadMenu}
                      onReorderSection={reorderItemsInSection}
                      columns={itemColumns}
                      defaultNotifyIds={resolvedNotifyIds}
                      selectedIds={selectedItemIds}
                      onToggleSelect={toggleItemSelect}
                    >
                      {/* The Add-item row stays in normal tbody render flow */}
                      {canEdit && addingToSection === group.key && (
                        <AddItemRow
                          menuId={menu.id}
                          sections={sectionNames}
                          defaultSection={group.section || ''}
                          nextSortOrder={sectionMaxSort + 1}
                          onSaved={() => { setAddingToSection(null); loadMenu() }}
                        />
                      )}
                    </SectionTbody>
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
                  data-tour="menu-add-item-button"
                  className="text-xs text-brand-500 hover:text-brand-700 font-medium flex items-center gap-1.5 whitespace-nowrap"
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
                  eventSponsors={previewSponsors}
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
                  eventSponsors={previewSponsors}
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

      {/* Approvals tab — existing sign-off list + per-menu notify editor */}
      {tab === 'signoff' && (
        <div className="space-y-4 max-w-2xl">
          <ApproversPanel targetType="menu" targetId={menu.id} title="Menu approvals" />
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-ink-900 mb-1">Notify for edits</h2>
            <p className="text-xs text-ink-500 mb-4">
              People notified for every edit on this menu. Brand + series + event picks above stay on automatically.
            </p>
            <NotifyForEditsEditor
              table="menus"
              entityId={menu.id}
              current={menu.notify_user_ids || []}
              inheritedIds={Array.from(new Set([
                ...((brand?.notify_user_ids) || []),
                ...((series?.notify_user_ids) || []),
                ...((event?.notify_user_ids) || []),
              ]))}
              inheritedFromLabel="brand + series + event"
              canEdit={isAdmin || isInternal}
              onSaved={loadMenu}
            />
          </div>
        </div>
      )}

      {tab === 'styles' && canEditStyles && (
        <MenuStylesTab
          menu={menu}
          event={event}
          series={series}
          canEdit={canEditStyles && menu.phase !== 'approved'}
          onSaved={loadMenu}
        />
      )}

      {/* Sponsors tab */}
      {tab === 'sponsors' && (
        <>
          <MenuSponsorsPanel
            eventSponsors={eventSponsors}
            menuSponsorIds={menuSponsorIds}
            menuSponsorRows={menuSponsorRows}
            menuOverrideOrder={menuOverrideOrderDraft}
            canEdit={canEdit}
            onToggle={toggleSponsor}
            onToggleOverride={toggleMenuOverrideOrder}
            onReorder={reorderMenuSponsors}
            onSetAll={setAllSponsors}
          />

          {/* Sticky Save/Cancel bar — appears only when the draft differs
              from the server snapshot. Same pattern we'll use everywhere
              once we roll Save/Cancel out beyond the Sponsors tab. */}
          {canEdit && sponsorsDirty && (
            <div
              className="fixed bottom-0 left-0 right-0 z-30 md:left-60 bg-white border-t border-amber-200 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
            >
              <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3 max-w-6xl mx-auto">
                <div className="flex items-center gap-2 text-sm text-amber-700">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium">Unsaved sponsor changes</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={cancelMenuSponsorChanges}
                    disabled={menuSponsorsSaving}
                    className="btn-secondary btn-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveMenuSponsors}
                    disabled={menuSponsorsSaving}
                    className="btn-primary btn-sm"
                  >
                    {menuSponsorsSaving ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
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
          <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col overflow-hidden" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
            {/* Header sits above the scroller in its own stacking context so
                it can't be covered by the zoomed canvas; flex-shrink-0 keeps
                it visible when the scroller fights for space. */}
            <div className="relative z-10 flex-shrink-0 flex items-center justify-between px-4 py-3 text-white bg-black/90">
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
            {/* min-h-0 + min-w-0 are mandatory on flex children that need to
                clip via overflow — without them flex items default to
                min-{width,height}: auto and grow with their content, which
                here would push the lightbox wider/taller than the viewport
                and shove the close button out of reach. */}
            <div className="flex-1 min-h-0 min-w-0 overflow-auto p-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
              <div className="bg-surface-50 rounded-lg" style={{ width: 'max-content', minWidth: '100%' }}>
                <TemplateCanvas
                  template={template}
                  series={series}
                  event={event}
                  size={activeSize}
                  menu={menu}
                  items={items}
                  eventSponsors={previewSponsors}
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
                    // FK cascades handle items/sponsors/edit_log, so we only
                    // need the menus delete. Critically: use .select() so we
                    // can verify the row actually came out — without it, RLS
                    // silently filtering returns success + 0 rows and the UI
                    // falsely reports "deleted" while the menu lingers.
                    const { data, error } = await supabase
                      .from('menus')
                      .delete()
                      .eq('id', menu.id)
                      .select('id')
                    if (error) throw error
                    if (!data || data.length === 0) {
                      throw new Error(
                        'Delete request returned 0 rows. You may not have permission to delete this menu, ' +
                        'or your session may have expired. Try signing out and back in.'
                      )
                    }
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

// ─────────────────────────────────────────────────────────────────────────────
// Drag-and-drop reorder for a single section's items. Lives inside <table>
// rendering a real <tbody>, so the dnd-kit hooks attach directly to <tr>s.

function SectionTbody({ group, menu, canEdit, currency, sectionNames, loadMenu, onReorderSection, columns, children, defaultNotifyIds, selectedIds, onToggleSelect }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const ids = group.items.map(i => i.id)
  function handleEnd({ active, over }) {
    if (!over || active.id === over.id) return
    const fromIdx = ids.indexOf(active.id)
    const toIdx   = ids.indexOf(over.id)
    if (fromIdx === -1 || toIdx === -1) return
    onReorderSection(group.section, arrayMove(group.items, fromIdx, toIdx))
  }

  return (
    <tbody className="divide-y divide-surface-100">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {group.items.map(item => (
            <SortableItemTr
              key={item.id}
              item={item}
              menu={menu}
              canEdit={canEdit}
              currency={currency}
              sectionNames={sectionNames}
              loadMenu={loadMenu}
              columns={columns}
              defaultNotifyIds={defaultNotifyIds}
              selected={selectedIds ? selectedIds.has(item.id) : false}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </SortableContext>
      </DndContext>
      {children}
    </tbody>
  )
}

function SortableItemTr({ item, menu, canEdit, currency, sectionNames, loadMenu, columns, defaultNotifyIds, selected, onToggleSelect }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <MenuItemRow
      item={item}
      menu={menu}
      canEdit={canEdit}
      currency={currency}
      sections={sectionNames}
      columns={columns}
      onUpdated={loadMenu}
      defaultNotifyIds={defaultNotifyIds}
      selected={selected}
      onToggleSelect={onToggleSelect}
      dragRef={setNodeRef}
      dragStyle={style}
      dragAttributes={attributes}
      dragListeners={listeners}
      isDragging={isDragging}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Menu sponsors picker — toggles which event sponsors appear on this menu.
// Supports inherit/override of the parent event's sponsor order, with
// drag-and-drop reordering when override is on.

const SPONSOR_ORDER_OPTS = [
  { value: 'inherit',  label: 'Inherit from event' },
  { value: 'override', label: 'Override order' },
]

function MenuSponsorsPanel({
  eventSponsors, menuSponsorIds, menuSponsorRows, menuOverrideOrder,
  canEdit, onToggle, onToggleOverride, onReorder, onSetAll,
}) {
  // Map event_sponsor_id → menu_sponsors row so we can grab row IDs for the reorder
  const menuRowByEsId = new Map(menuSponsorRows.map(r => [r.event_sponsor_id, r]))

  if (eventSponsors.length === 0) {
    return (
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-ink-900 mb-1">Sponsors</h2>
        <p className="text-sm text-ink-400">No sponsors configured for this event yet. Add them on the Event page.</p>
      </div>
    )
  }

  // Split active vs inactive
  const activeEventSponsors  = eventSponsors.filter(es => menuSponsorIds.has(es.id))
  const inactiveEventSponsors = eventSponsors.filter(es => !menuSponsorIds.has(es.id))

  // When override is on, sort active by menu_sponsors.sort_order
  const sortedActive = menuOverrideOrder
    ? [...activeEventSponsors].sort((a, b) => {
        const aOrder = menuRowByEsId.get(a.id)?.sort_order ?? 0
        const bOrder = menuRowByEsId.get(b.id)?.sort_order ?? 0
        return aOrder - bOrder
      })
    : activeEventSponsors

  const activeRows = sortedActive
    .map(es => ({ id: es.id, es, menuRowId: menuRowByEsId.get(es.id)?.id }))
    .filter(r => r.menuRowId) // skip rows we haven't refetched yet

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-ink-900">Sponsors</h2>
          <p className="text-xs text-ink-400 mt-0.5">Toggle which event sponsors appear on this menu.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Master on/off for the whole list */}
          {canEdit && onSetAll && (
            <div className="inline-flex items-center rounded-md border border-surface-200 overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => onSetAll(true)}
                disabled={activeEventSponsors.length === eventSponsors.length}
                className="px-2.5 py-1 font-medium text-ink-600 hover:bg-surface-50 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                title="Turn every sponsor on for this menu"
              >
                All on
              </button>
              <span className="w-px self-stretch bg-surface-200" />
              <button
                type="button"
                onClick={() => onSetAll(false)}
                disabled={activeEventSponsors.length === 0}
                className="px-2.5 py-1 font-medium text-ink-600 hover:bg-surface-50 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                title="Turn every sponsor off for this menu"
              >
                All off
              </button>
            </div>
          )}
          {canEdit && activeRows.length > 0 && (
            <SegmentedToggle
              value={menuOverrideOrder ? 'override' : 'inherit'}
              options={SPONSOR_ORDER_OPTS}
              onChange={v => onToggleOverride(v === 'override')}
            />
          )}
        </div>
      </div>

      <ul className="divide-y divide-surface-100">
        {menuOverrideOrder && canEdit && activeRows.length > 0 ? (
          <SortableList items={activeRows} getId={r => r.id} onReorder={onReorder}>
            {(row, { handleListeners }) => (
              <MenuSponsorRow
                sp={row.es}
                active
                canEdit={canEdit}
                onToggle={onToggle}
                handleListeners={handleListeners}
              />
            )}
          </SortableList>
        ) : (
          activeRows.map(row => (
            <MenuSponsorRow key={row.id} sp={row.es} active canEdit={canEdit} onToggle={onToggle} />
          ))
        )}
        {inactiveEventSponsors.map(es => (
          <MenuSponsorRow key={es.id} sp={es} active={false} canEdit={canEdit} onToggle={onToggle} />
        ))}
      </ul>
    </div>
  )
}

function MenuSponsorRow({ sp, active, canEdit, onToggle, handleListeners }) {
  return (
    <li className={`px-4 py-2.5 flex items-center gap-3 bg-white ${!active ? 'opacity-60' : ''}`}>
      {handleListeners && canEdit && active && <DragHandle listeners={handleListeners} />}
      {canEdit ? (
        <button
          onClick={() => onToggle(sp.id)}
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
    </li>
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
