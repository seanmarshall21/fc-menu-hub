import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

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

// Inline outline icons, matching Menu Hub's icon style (no emoji, no icon lib).
const svgBase = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, viewBox: '0 0 24 24' }
const IconDownload = ({ className }) => (<svg className={className} {...svgBase}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>)
const IconChat = ({ className }) => (<svg className={className} {...svgBase}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.9 9.9 0 0 1-4-.8L3 21l1.8-4A7.9 7.9 0 0 1 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z" /></svg>)
const IconExternal = ({ className }) => (<svg className={className} {...svgBase}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>)
const IconX = ({ className }) => (<svg className={className} {...svgBase}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>)
const IconChevronLeft = ({ className }) => (<svg className={className} {...svgBase}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>)
const IconChevronRight = ({ className }) => (<svg className={className} {...svgBase}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>)

export default function PreviewSharePage() {
  const { shareId } = useParams()
  const [share, setShare] = useState(undefined) // undefined = loading, null = not found/private
  const [idx, setIdx] = useState(null)          // lightbox index, or null
  const [comments, setComments] = useState([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('menu_preview_shares')
        .select('title, items, is_public, show_print_files, allow_comments')
        .eq('id', shareId)
        .maybeSingle()
      if (cancelled) return
      setShare((error || !data) ? null : data)
      if (data && data.allow_comments) loadComments()
    })()
    return () => { cancelled = true }
  }, [shareId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadComments() {
    const { data } = await supabase
      .from('menu_preview_share_comments')
      .select('id, menu_index, author_name, body, created_at')
      .eq('share_id', shareId)
      .order('created_at', { ascending: true })
    setComments(Array.isArray(data) ? data : [])
  }

  const items = (share && Array.isArray(share.items)) ? share.items : []
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

  if (share === undefined) {
    return <div className="min-h-[100dvh] bg-surface-50 flex items-center justify-center text-ink-400 text-sm">Loading…</div>
  }
  if (share === null) {
    return (
      <div className="min-h-[100dvh] bg-surface-50 flex flex-col items-center justify-center gap-2 text-center px-6">
        <img src="/logo-tile.svg" alt="" className="w-9 h-9 mb-2 opacity-80" />
        <p className="text-ink-900 font-semibold">This gallery isn’t available</p>
        <p className="text-ink-400 text-sm max-w-xs">The link may be private (sign in to view) or no longer exists.</p>
      </div>
    )
  }

  return (
    // Own scroll container: this public page renders outside Layout, and the
    // global `html, body, #root { overflow: hidden }` would otherwise clip
    // everything below the fold.
    <div className="h-[100dvh] overflow-y-auto bg-surface-50 text-ink-900">
      <header className="px-6 py-5 border-b border-surface-200 flex items-center gap-3 sticky top-0 bg-surface-50/95 backdrop-blur z-10">
        <img src="/logo-tile.svg" alt="" className="w-7 h-7 flex-shrink-0" />
        <div className="min-w-0">
          <h1 className="font-semibold text-ink-900 text-sm truncate">{share.title || 'Menu previews'}</h1>
          <p className="text-xs text-ink-400">
            {items.length} menu{items.length === 1 ? '' : 's'} · tap any to view full size
            {share.allow_comments ? ' · leave feedback' : ''}
          </p>
        </div>
      </header>

      {items.length === 0 ? (
        <p className="text-center text-ink-400 text-sm py-16">No previews in this gallery.</p>
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

      {idx != null && items[idx] && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col" onClick={close}>
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-white/90 text-sm" onClick={e => e.stopPropagation()}>
            <span className="font-medium truncate">{items[idx].name}</span>
            <span className="text-white/60 flex-shrink-0">{idx + 1} / {items.length}</span>
            <div className="flex items-center gap-1 flex-shrink-0">
              <a href={downloadHref(items[idx].image, items[idx].name)} title="Download PNG" className="p-1.5 hover:bg-white/10 rounded-md inline-flex" onClick={e => e.stopPropagation()}><IconDownload className="w-4 h-4" /></a>
              {share.show_print_files && items[idx].printFile && (
                <a href={items[idx].printFile} target="_blank" rel="noreferrer" title="Open print file" className="px-2 py-1 hover:bg-white/10 rounded-md text-xs inline-flex items-center gap-1">Print file <IconExternal className="w-3 h-3" /></a>
              )}
              <button onClick={close} className="p-1.5 hover:bg-white/10 rounded-md inline-flex" aria-label="Close"><IconX className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="flex-1 relative flex items-center justify-center min-h-0 px-2" onClick={e => e.stopPropagation()}>
            <img src={items[idx].image} alt={items[idx].name} className="max-h-full max-w-full object-contain" />
            {items.length > 1 && (
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
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CommentsPanel({ shareId, menuIndex, comments, onPosted }) {
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
          <div key={c.id} className="text-sm text-white/90">
            <span className="font-medium">{c.author_name || 'Anonymous'}</span>
            <span className="text-white/40 text-[11px] ml-2">{new Date(c.created_at).toLocaleString()}</span>
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
