import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import EntityIcon from '@/components/EntityIcon'
import ThemeToggle from '@/components/ThemeToggle'

// Public, no-login "review piece": a standalone gallery of menu preview images.
// Reached via /share/:shareId. NOTHING else from Menu Hub is exposed here — no
// nav, no menus list, no links back into the app. What a viewer can do is
// controlled entirely by the share's toggles (print-file link, comments); the
// PNG download is always available.
//
// The share row snapshots {name, category, size, image, printFile} per menu, so
// this page never reads the RLS-protected menus table — a teammate without an
// account can open it. Private shares only resolve for signed-in staff (RLS).

function downloadHref(image, name) {
  if (!image) return image
  const sep = image.includes('?') ? '&' : '?'
  return `${image}${sep}download=${encodeURIComponent((name || 'menu') + '.png')}`
}

const SHARE_GRADIENT = 'linear-gradient(135deg, #FFD54F 0%, #FFB300 50%, #FB8C00 100%)'
// Physical print dimensions per size (width × height).
const SIZE_SPECS = { SM: '23.5" × 23.5"', MD: '23.5" × 35.25"', LG: '23.5" × 47.5"' }
const Stat = ({ label, value }) => (
  <div className="rounded-md bg-surface-100 px-3 py-2">
    <p className="text-lg font-bold text-ink-900 leading-none">{value}</p>
    <p className="text-[11px] text-ink-400 mt-1">{label}</p>
  </div>
)

// Inline outline icons, matching Menu Hub's icon style (no emoji, no icon lib).
const svgBase = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, viewBox: '0 0 24 24' }
const IconDownload = ({ className }) => (<svg className={className} {...svgBase}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>)
const IconChat = ({ className }) => (<svg className={className} {...svgBase}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.9 9.9 0 0 1-4-.8L3 21l1.8-4A7.9 7.9 0 0 1 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z" /></svg>)
const IconExternal = ({ className }) => (<svg className={className} {...svgBase}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>)
const IconX = ({ className }) => (<svg className={className} {...svgBase}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>)
const IconChevronLeft = ({ className }) => (<svg className={className} {...svgBase}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>)
const IconChevronRight = ({ className }) => (<svg className={className} {...svgBase}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>)
const IconTrash = ({ className }) => (<svg className={className} {...svgBase}><path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m1 0-.5 12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6.5 7" /></svg>)
const IconPrint = ({ className }) => (<svg className={className} {...svgBase}><path strokeLinecap="round" strokeLinejoin="round" d="M6 9V3h12v6M6 18H4a2 2 0 01-2-2v-4a2 2 0 012-2h16a2 2 0 012 2v4a2 2 0 01-2 2h-2M6 14h12v7H6v-7Z" /></svg>)

export default function PreviewSharePage() {
  const { shareId } = useParams()
  const [share, setShare] = useState(undefined) // undefined = loading, null = not found/private
  const [idx, setIdx] = useState(null)          // lightbox index, or null
  const [comments, setComments] = useState([])
  const [meId, setMeId] = useState(null)        // current user (owner can moderate feedback)
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' }) // order list sorting
  const [liveItems, setLiveItems] = useState(null) // live-order: current menu values by menuId
  const [orderTab, setOrderTab] = useState('list') // 'list' | 'gallery' (layout='both')
  const [showSummary, setShowSummary] = useState(true)
  const [summaryOpen, setSummaryOpen] = useState(false) // expanded breakdown

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('menu_preview_shares')
        .select('title, items, is_public, show_print_files, allow_comments, created_by, kind, layout, notes, meta, is_live')
        .eq('id', shareId)
        .maybeSingle()
      if (cancelled) return
      setShare((error || !data) ? null : data)
      if (data && data.allow_comments) loadComments()
    })()
    supabase.auth.getUser().then(({ data }) => { if (!cancelled) setMeId(data?.user?.id || null) })
    return () => { cancelled = true }
  }, [shareId]) // eslint-disable-line react-hooks/exhaustive-deps

  // The share's creator (signed in on the same domain) can delete feedback.
  const isOwner = !!(meId && share && share.created_by === meId)
  async function deleteComment(id) {
    await supabase.from('menu_preview_share_comments').delete().eq('id', id)
    loadComments()
  }

  async function loadComments() {
    const { data } = await supabase
      .from('menu_preview_share_comments')
      .select('id, menu_index, author_name, body, created_at')
      .eq('share_id', shareId)
      .order('created_at', { ascending: true })
    setComments(Array.isArray(data) ? data : [])
  }

  const items = (share && Array.isArray(share.items)) ? share.items : []
  const isOrder = share?.kind === 'order'
  const orderLayout = share?.layout || 'both'
  const meta = share?.meta || {}
  // Live orders render current menu values; everything else uses the snapshot.
  const displayItems = (isOrder && share?.is_live && liveItems) ? liveItems : items
  const totalQty = displayItems.reduce((n, it) => n + (Number(it.quantity) || 0), 0)
  // Total quantity per size (SM/MD/LG…), for the order-form summary.
  const sizeTotals = displayItems.reduce((acc, it) => {
    const s = (it.size || '—').toString().toUpperCase()
    acc[s] = (acc[s] || 0) + (Number(it.quantity) || 0)
    return acc
  }, {})
  // Fuller breakdowns for the expandable summary: menus + print-count per size
  // and per category.
  const bySize = displayItems.reduce((acc, it) => {
    const s = (it.size || '—').toString().toUpperCase()
    acc[s] = acc[s] || { menus: 0, qty: 0 }
    acc[s].menus++; acc[s].qty += Number(it.quantity) || 0
    return acc
  }, {})
  const byCategory = displayItems.reduce((acc, it) => {
    const c = (it.category || 'Other').toString()
    acc[c] = acc[c] || { menus: 0, qty: 0 }
    acc[c].menus++; acc[c].qty += Number(it.quantity) || 0
    return acc
  }, {})
  const uniqueMenus = displayItems.length
  const uniqueSizes = Object.keys(bySize).length
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s
  const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null
  // Sortable copy of the items for the order list table.
  const sortedItems = [...displayItems].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1
    if (sort.key === 'qty') return ((Number(a.quantity) || 0) - (Number(b.quantity) || 0)) * dir
    if (sort.key === 'size') return String(a.size || '').localeCompare(String(b.size || '')) * dir || String(a.name || '').localeCompare(String(b.name || ''))
    return String(a.name || '').localeCompare(String(b.name || '')) * dir
  })
  const toggleSort = (key) => setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  const sortArrow = (key) => sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''
  const close = useCallback(() => setIdx(null), [])
  const prev = useCallback(() => setIdx(i => (i == null ? i : (i - 1 + items.length) % items.length)), [items.length])
  const next = useCallback(() => setIdx(i => (i == null ? i : (i + 1) % items.length)), [items.length])

  useEffect(() => {
    if (idx == null) return
    function onKey(e) {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [idx, close, prev, next])

  // Live order form: pull each menu's current values by id and merge over the
  // frozen snapshot (preserving order). A deleted menu falls back to its
  // snapshot. Menus are publicly readable, so this works without login.
  useEffect(() => {
    if (!share || share.kind !== 'order' || !share.is_live) { setLiveItems(null); return }
    const snap = Array.isArray(share.items) ? share.items : []
    const ids = snap.map(it => it.menuId).filter(Boolean)
    if (!ids.length) { setLiveItems(null); return }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('menus')
        .select('id, name, category, size, quantity, print_preview_url, preview_image_url, print_file_url')
        .in('id', ids)
      if (cancelled) return
      const byId = new Map((data || []).map(m => [m.id, m]))
      setLiveItems(snap.map(it => {
        const m = it.menuId && byId.get(it.menuId)
        if (!m) return it
        return {
          ...it, name: m.name, category: m.category, size: m.size,
          quantity: m.quantity ?? 0,
          image: m.print_preview_url || m.preview_image_url || it.image || null,
          printFile: m.print_file_url || null,
        }
      }))
    })()
    return () => { cancelled = true }
  }, [share])

  if (share === undefined) {
    return <div className="min-h-[100dvh] bg-surface-50 flex items-center justify-center text-ink-400 text-sm">Loading…</div>
  }
  if (share === null) {
    return (
      <div className="min-h-[100dvh] bg-surface-50 flex flex-col items-center justify-center gap-2 text-center px-6">
        <img src="/logo-tile.svg" alt="" className="w-9 h-9 mb-2 opacity-80" />
        <p className="text-ink-900 font-semibold">This link isn’t available</p>
        <p className="text-ink-400 text-sm max-w-xs">It may be private (sign in to view) or no longer exists.</p>
      </div>
    )
  }

  return (
    // Own scroll container: this public page renders outside Layout, and the
    // global `html, body, #root { overflow: hidden }` would otherwise clip
    // everything below the fold.
    <div className="h-[100dvh] overflow-y-auto print:h-auto print:overflow-visible bg-surface-50 text-ink-900">
      <header className="px-6 py-5 border-b border-surface-200 flex items-center gap-3 sticky top-0 bg-surface-50/95 backdrop-blur z-10 print:hidden">
        <img src="/logo-tile.svg" alt="" className="w-7 h-7 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="font-semibold text-ink-900 text-sm truncate">{share.title || (isOrder ? 'Menu order' : 'Menu previews')}</h1>
          <p className="text-xs text-ink-400">
            {isOrder
              ? `${items.length} menu${items.length === 1 ? '' : 's'} · ${totalQty} total`
              : `${items.length} menu${items.length === 1 ? '' : 's'} · tap any to view full size${share.allow_comments ? ' · leave feedback' : ''}`}
          </p>
        </div>
        <ThemeToggle className="flex-shrink-0" />
        {isOrder && (
          <button onClick={() => window.print()} className="btn-primary btn-sm inline-flex items-center gap-1.5 flex-shrink-0">
            <IconPrint className="w-4 h-4" /> Print / Save PDF
          </button>
        )}
      </header>

      {items.length === 0 ? (
        <p className="text-center text-ink-400 text-sm py-16">Nothing in this {isOrder ? 'order' : 'gallery'}.</p>
      ) : isOrder ? (
        <div className="p-6 max-w-4xl mx-auto space-y-5">
          {/* Event logo + title (prints at the top of the sheet) */}
          <div className="flex items-center gap-3">
            <EntityIcon
              iconName={meta.eventIcon?.iconName}
              iconUrl={meta.eventIcon?.iconUrl}
              fallbackText={meta.eventIcon?.name || share.title || 'Order'}
              fallbackColor={meta.eventIcon?.color || '#FFB300'}
              size={44} rounded="lg"
            />
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-ink-900 leading-tight truncate">{share.title || 'Menu order'}</h1>
              {(fmtDate(meta.eventDate) || meta.eventLocation) && (
                <p className="text-xs text-ink-400 truncate">{[fmtDate(meta.eventDate), meta.eventLocation].filter(Boolean).join(' · ')}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {fmtDate(meta.neededBy) && (
              <div className="text-sm text-ink-800"><span className="text-ink-400">Order needed by:</span> <span className="font-semibold">{fmtDate(meta.neededBy)}</span></div>
            )}
            {share.show_print_files && meta.printFolder && (
              <a href={meta.printFolder} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-black shadow-sm hover:brightness-105 transition whitespace-nowrap flex-shrink-0 print:hidden" style={{ background: SHARE_GRADIENT }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>
                Open print folder
              </a>
            )}
          </div>

          {/* Totals summary — expandable + can be turned off */}
          {showSummary ? (
            <div className="bg-surface-0 border border-surface-200 rounded-lg px-4 py-3 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-surface-100 font-semibold text-ink-700">{uniqueMenus} menu{uniqueMenus === 1 ? '' : 's'}</span>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-black font-semibold" style={{ background: SHARE_GRADIENT }}>{totalQty} to print</span>
                  {Object.entries(sizeTotals).sort().map(([s, q]) => (
                    <span key={s} className="inline-flex items-center px-2.5 py-1 rounded-md bg-surface-100 text-ink-600"><span className="font-semibold mr-1">{s}</span> {q}</span>
                  ))}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 print:hidden">
                  <button onClick={() => setSummaryOpen(o => !o)} className="text-[11px] text-brand-600 hover:underline whitespace-nowrap">{summaryOpen ? 'Less' : 'More'}</button>
                  <button onClick={() => setShowSummary(false)} className="text-ink-300 hover:text-ink-500" aria-label="Hide summary"><IconX className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              {summaryOpen && (
                <div className="border-t border-surface-100 pt-3 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Stat label="Unique menus" value={uniqueMenus} />
                    <Stat label="Unique sizes" value={uniqueSizes} />
                    <Stat label="Menus to print" value={totalQty} />
                    <Stat label="Types" value={Object.keys(byCategory).length} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-ink-400 mb-1">By size</p>
                      <div className="space-y-0.5 text-sm">
                        {Object.entries(bySize).sort().map(([s, v]) => (
                          <div key={s} className="flex justify-between text-ink-700"><span className="font-medium">{s}</span><span className="text-ink-500">{v.menus} menu{v.menus === 1 ? '' : 's'} · {v.qty} to print</span></div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-ink-400 mb-1">By type</p>
                      <div className="space-y-0.5 text-sm">
                        {Object.entries(byCategory).sort().map(([c, v]) => (
                          <div key={c} className="flex justify-between text-ink-700"><span className="font-medium capitalize">{cap(c)}</span><span className="text-ink-500">{v.menus} menu{v.menus === 1 ? '' : 's'} · {v.qty} to print</span></div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button onClick={() => setShowSummary(true)} className="text-xs text-brand-600 hover:underline print:hidden">Show summary</button>
          )}

          {share.notes && (
            <div className="text-sm text-ink-700 bg-surface-0 border border-surface-200 rounded-lg px-4 py-3 whitespace-pre-wrap">{share.notes}</div>
          )}

          {/* Tabs (only when both layouts are included; print shows both) */}
          {orderLayout === 'both' && (
            <div className="flex items-center gap-1 border-b border-surface-200 print:hidden">
              {['list', 'gallery'].map(t => (
                <button key={t} onClick={() => setOrderTab(t)}
                  className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px capitalize ${orderTab === t ? 'border-brand-500 text-brand-600' : 'border-transparent text-ink-500 hover:text-ink-700'}`}>
                  {t}
                </button>
              ))}
            </div>
          )}

          {orderLayout !== 'gallery' && (
            <div className={`overflow-x-auto ${orderLayout === 'both' && orderTab !== 'list' ? 'hidden print:block' : ''}`}>
              <table className="w-full text-sm border border-surface-200 rounded-lg overflow-hidden">
                <thead className="bg-surface-100 text-ink-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left font-semibold px-3 py-2">
                      <button onClick={() => toggleSort('name')} className="inline-flex items-center hover:text-ink-800 print:pointer-events-none">Menu{sortArrow('name')}</button>
                    </th>
                    <th className="text-left font-semibold px-3 py-2">
                      <button onClick={() => toggleSort('size')} className="inline-flex items-center hover:text-ink-800 print:pointer-events-none">Size{sortArrow('size')}</button>
                    </th>
                    {share.show_print_files && <th className="text-left font-semibold px-3 py-2 print:hidden">Print file</th>}
                    <th className="text-right font-semibold px-3 py-2">
                      <button onClick={() => toggleSort('qty')} className="inline-flex items-center hover:text-ink-800 print:pointer-events-none">Qty{sortArrow('qty')}</button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {sortedItems.map((it, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">
                        <span className="font-medium text-ink-900">{it.name}</span>
                        {it.category && <span className="text-ink-400 text-xs ml-2 capitalize">{it.category}</span>}
                      </td>
                      <td className="px-3 py-2 text-ink-500 uppercase">{it.size || ''}</td>
                      {share.show_print_files && (
                        <td className="px-3 py-2 print:hidden">
                          {it.printFile
                            ? <a href={it.printFile} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline inline-flex items-center gap-1">Open <IconExternal className="w-3 h-3" /></a>
                            : <span className="text-ink-300">—</span>}
                        </td>
                      )}
                      <td className="px-3 py-2 text-right font-semibold text-ink-900">{Number(it.quantity) || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-right text-sm font-semibold text-ink-900 mt-2">Total: {totalQty}</div>
            </div>
          )}

          {orderLayout !== 'list' && (
            <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 ${orderLayout === 'both' && orderTab !== 'gallery' ? 'hidden print:grid' : ''}`}>
              {displayItems.map((it, i) => (
                <div key={i} className="card overflow-hidden flex flex-col">
                  <button onClick={() => setIdx(i)} className="relative w-full aspect-[2/3] bg-surface-0 overflow-hidden text-left hover:opacity-95">
                    {it.image
                      ? <img src={it.image} alt={it.name} loading="lazy" className="w-full h-full object-contain" />
                      : <div className="w-full h-full flex items-center justify-center text-ink-300 text-xs">No preview</div>}
                    <span className="absolute top-1.5 right-1.5 text-black text-xs font-bold px-2 py-0.5 rounded-full shadow"
                      style={{ background: 'linear-gradient(135deg, #FFD54F 0%, #FFB300 50%, #FB8C00 100%)' }}>×{Number(it.quantity) || 0}</span>
                  </button>
                  <div className="px-3 py-2">
                    <p className="text-xs font-medium text-ink-900 truncate">{it.name}</p>
                    <p className="text-[10px] text-ink-400 uppercase tracking-wide">{it.category || ''}{it.size ? ` · ${it.size}` : ''} · Qty {Number(it.quantity) || 0}</p>
                    {share.show_print_files && it.printFile && (
                      <a href={it.printFile} target="_blank" rel="noreferrer" className="text-[11px] text-brand-600 hover:underline inline-flex items-center gap-1 mt-1 print:hidden">Print file <IconExternal className="w-3 h-3" /></a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {Object.keys(sizeTotals).some(s => SIZE_SPECS[s]) && (
            <div className="border-t border-surface-200 pt-3 text-[11px] text-ink-400 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-semibold text-ink-500 uppercase tracking-wide">Print sizes (w × h)</span>
              {Object.keys(sizeTotals).filter(s => SIZE_SPECS[s]).sort().map(s => (
                <span key={s}><span className="font-medium text-ink-600">{s}</span> {SIZE_SPECS[s]}</span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((it, i) => {
            const cCount = share.allow_comments ? comments.filter(c => c.menu_index === i).length : 0
            return (
              <div key={i} className="card overflow-hidden flex flex-col">
                <button onClick={() => setIdx(i)} className="w-full aspect-[2/3] bg-surface-0 overflow-hidden text-left hover:opacity-95">
                  {it.image
                    ? <img src={it.image} alt={it.name} loading="lazy" className="w-full h-full object-contain" />
                    : <div className="w-full h-full flex items-center justify-center text-ink-300 text-xs">No preview</div>}
                </button>
                <div className="px-3 py-2 flex flex-col gap-1.5">
                  <div>
                    <p className="text-xs font-medium text-ink-900 truncate">{it.name}</p>
                    {(it.category || it.size) && (
                      <p className="text-[10px] text-ink-400 uppercase tracking-wide">{it.category || ''}{it.size ? ` · ${it.size}` : ''}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2.5 text-[11px]">
                    <a href={downloadHref(it.image, it.name)} className="text-brand-600 hover:underline inline-flex items-center gap-1"><IconDownload className="w-3.5 h-3.5" /> PNG</a>
                    {share.show_print_files && it.printFile && (
                      <a href={it.printFile} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline inline-flex items-center gap-1">Print file <IconExternal className="w-3 h-3" /></a>
                    )}
                    {share.allow_comments && (
                      <button onClick={() => setIdx(i)} className="ml-auto text-ink-400 hover:text-ink-600 inline-flex items-center gap-1"><IconChat className="w-3.5 h-3.5" /> {cCount || ''}</button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {idx != null && displayItems[idx] && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col" onClick={close}>
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-white/90 text-sm" onClick={e => e.stopPropagation()}>
            <span className="font-medium truncate">{displayItems[idx].name}</span>
            <span className="text-white/60 flex-shrink-0">{idx + 1} / {displayItems.length}</span>
            <div className="flex items-center gap-1 flex-shrink-0">
              <a href={downloadHref(displayItems[idx].image, displayItems[idx].name)} title="Download PNG" className="p-1.5 hover:bg-white/10 rounded-md inline-flex" onClick={e => e.stopPropagation()}><IconDownload className="w-4 h-4" /></a>
              {share.show_print_files && displayItems[idx].printFile && (
                <a href={displayItems[idx].printFile} target="_blank" rel="noreferrer" title="Open print file" className="px-2 py-1 hover:bg-white/10 rounded-md text-xs inline-flex items-center gap-1">Print file <IconExternal className="w-3 h-3" /></a>
              )}
              <button onClick={close} className="p-1.5 hover:bg-white/10 rounded-md inline-flex" aria-label="Close"><IconX className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="flex-1 relative flex items-center justify-center min-h-0 px-2" onClick={e => e.stopPropagation()}>
            <img src={displayItems[idx].image} alt={displayItems[idx].name} className="max-h-full max-w-full object-contain" />
            {displayItems.length > 1 && (
              <>
                {/* Absolutely positioned + always-visible circular targets so a
                    full-bleed image can never cover the tap area. */}
                <button onClick={prev} aria-label="Previous"
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 active:scale-95 transition">
                  <IconChevronLeft className="w-6 h-6" />
                </button>
                <button onClick={next} aria-label="Next"
                  className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 active:scale-95 transition">
                  <IconChevronRight className="w-6 h-6" />
                </button>
              </>
            )}
          </div>
          {share.allow_comments && (
            <div onClick={e => e.stopPropagation()}>
              <CommentsPanel
                shareId={shareId}
                menuIndex={idx}
                comments={comments.filter(c => c.menu_index === idx)}
                onPosted={loadComments}
                canModerate={isOwner}
                onDelete={deleteComment}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CommentsPanel({ shareId, menuIndex, comments, onPosted, canModerate, onDelete }) {
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function post() {
    if (!body.trim()) return
    setBusy(true); setErr(null)
    const { error } = await supabase.from('menu_preview_share_comments').insert({
      share_id: shareId, menu_index: menuIndex,
      author_name: name.trim() || null, body: body.trim(),
    })
    setBusy(false)
    if (error) { setErr('Could not post. The link owner may have turned comments off.'); return }
    setBody('')
    onPosted && onPosted()
  }

  return (
    <div className="bg-neutral-900 border-t border-white/10 max-h-[38vh] flex flex-col">
      <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-white/50 flex-shrink-0">
        Feedback{comments.length ? ` · ${comments.length}` : ''}
      </div>
      <div className="px-4 overflow-y-auto flex-1 min-h-0 space-y-2 pb-2">
        {comments.length === 0 && <p className="text-white/40 text-xs py-2">No feedback yet — be the first.</p>}
        {comments.map(c => (
          <div key={c.id} className="text-sm text-white/90 group">
            <div className="flex items-center gap-2">
              <span className="font-medium">{c.author_name || 'Anonymous'}</span>
              <span className="text-white/40 text-[11px]">{new Date(c.created_at).toLocaleString()}</span>
              {canModerate && (
                <button
                  onClick={() => { if (window.confirm('Delete this feedback?')) onDelete(c.id) }}
                  className="ml-auto text-white/40 hover:text-red-300 p-0.5 flex-shrink-0"
                  aria-label="Delete feedback"
                >
                  <IconTrash className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <p className="text-white/80 whitespace-pre-wrap">{c.body}</p>
          </div>
        ))}
      </div>
      <div className="px-4 py-3 border-t border-white/10 flex-shrink-0 flex items-end gap-2">
        <div className="flex-1 flex flex-col gap-1.5">
          <input
            value={name} onChange={e => setName(e.target.value)} placeholder="Your name (optional)"
            className="bg-white/10 text-white placeholder-white/40 rounded-md px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-white/30"
          />
          <textarea
            value={body} onChange={e => setBody(e.target.value)} placeholder="Leave feedback on this menu…" rows={2}
            className="bg-white/10 text-white placeholder-white/40 rounded-md px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-white/30 resize-none"
          />
          {err && <p className="text-red-300 text-[11px]">{err}</p>}
        </div>
        <button
          onClick={post} disabled={busy || !body.trim()}
          className="text-black text-xs font-semibold px-3 py-1.5 rounded-md disabled:opacity-40 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #FFD54F 0%, #FFB300 50%, #FB8C00 100%)' }}
        >{busy ? '…' : 'Post'}</button>
      </div>
    </div>
  )
}
