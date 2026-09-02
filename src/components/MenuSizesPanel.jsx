/**
 * MenuSizesPanel — manage the sizes a single menu is produced in.
 *
 * A menu keeps ONE primary size (`menus.size`, unchanged behavior). This panel
 * adds *extra* sizes as `menu_variants` rows — each with its own layout mode
 * (template vs proportional scale), Figma-sync state, and final print file. The
 * menu's content is shared across every size; only the layout differs.
 *
 * Purely additive: a menu with no variants shows just its primary row.
 */
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useSizeDefs } from '@/lib/sizes'
import { chooseFromDropbox, dropboxConfigured } from '@/lib/dropboxChooser'

// Inline Lucide-style line icons (this project inlines SVGs; no icon package).
function Icon({ path, className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {path}
    </svg>
  )
}
const Trash2 = (p) => <Icon {...p} path={<><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M10 11v6M14 11v6" /></>} />
const Check = (p) => <Icon {...p} path={<path d="M20 6 9 17l-5-5" />} />
const CircleDashed = (p) => <Icon {...p} path={<circle cx="12" cy="12" r="9" strokeDasharray="3 3" />} />

function fmtDate(ts) {
  if (!ts) return null
  try { return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }
  catch { return null }
}

function SyncStatus({ syncedAt }) {
  const d = fmtDate(syncedAt)
  if (d) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-700 whitespace-nowrap">
        <Check className="w-3.5 h-3.5" /> Synced {d}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink-400 whitespace-nowrap">
      <CircleDashed className="w-3.5 h-3.5" /> Not synced
    </span>
  )
}

export default function MenuSizesPanel({ menu, variants = [], templates = {}, canEdit = false, onChanged, onChangePrimary }) {
  const { defs, configs } = useSizeDefs()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  // Collapsed by default so the panel doesn't crowd out the preview below it.
  const [open, setOpen] = useState(false)

  const primarySize = menu?.size || 'lg'
  const used = new Set([primarySize, ...variants.map(v => v.size)])
  const available = defs.filter(d => !used.has(d.id))

  async function run(fn) {
    setBusy(true); setErr(null)
    try { await fn() } catch (e) { setErr(e?.message || String(e)) }
    finally { setBusy(false); onChanged?.() }
  }

  const addSize = (size) => run(async () => {
    if (!size) return
    const { error } = await supabase.from('menu_variants')
      .insert({ menu_id: menu.id, size, layout_mode: 'template', source_size: primarySize })
    if (error) throw error
  })

  const patchVariant = (id, patch) => run(async () => {
    const { error } = await supabase.from('menu_variants')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  })

  const removeVariant = (v) => {
    const label = configs[v.size]?.label || v.size
    if (v.final_file_url && !confirm(`Remove the ${label} size? Its final file link will be lost.`)) return
    run(async () => {
      const { error } = await supabase.from('menu_variants').delete().eq('id', v.id)
      if (error) throw error
    })
  }

  const label = (size) => configs[size]?.label || String(size).toUpperCase()
  const dims  = (size) => configs[size]?.print || ''

  // Compact one-line size summary shown when collapsed (e.g. "LG · FLYER").
  const summary = [primarySize, ...variants.map(v => v.size)].map(label).join(' · ')

  return (
    <div className="card px-4 sm:px-5 py-3 mb-4">
      {/* Always-visible compact header — click to expand the manager. */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 text-left"
      >
        <span className="text-sm font-semibold text-ink-900 whitespace-nowrap">Sizes</span>
        <span className="text-xs text-ink-400 font-mono truncate min-w-0">{summary}</span>
        <span className="ml-auto text-xs text-brand-600 font-medium whitespace-nowrap flex items-center gap-1">
          {open ? 'Hide' : (canEdit ? 'Manage' : 'Details')}
          <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </span>
      </button>

      {open && (<>
      <div className="flex items-center justify-between gap-3 flex-wrap mt-3 mb-3">
        <p className="text-xs text-ink-400">
          Same content, different layouts — each size syncs to Figma and gets its own final file.
        </p>
        {canEdit && available.length > 0 && (
          <label className="inline-flex items-center gap-2 flex-shrink-0">
            <span className="sr-only">Add a size</span>
            <select
              className="input input-sm"
              value=""
              disabled={busy}
              onChange={e => addSize(e.target.value)}
            >
              <option value="">+ Add a size…</option>
              {available.map(d => (
                <option key={d.id} value={d.id}>{d.label} — {d.name || d.id}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2.5 py-1.5 mb-3">{err}</p>}

      <div className="space-y-2.5">
        {/* Primary size — its size is the menu's own; changeable right here. */}
        <div className="flex items-center gap-3 flex-wrap rounded-lg border border-surface-200 bg-surface-50 px-3 py-2.5">
          <span className="inline-flex items-center gap-2 min-w-0">
            {canEdit && onChangePrimary ? (
              <select
                className="input input-sm w-auto"
                value={primarySize}
                disabled={busy}
                onChange={e => onChangePrimary(e.target.value)}
                title="Change the menu's primary size"
              >
                {defs.map(d => <option key={d.id} value={d.id}>{d.label} — {d.width_in}"×{d.height_in}"</option>)}
              </select>
            ) : (
              <>
                <span className="text-xs font-mono font-semibold text-ink-700 uppercase">{label(primarySize)}</span>
                <span className="text-xs text-ink-400 whitespace-nowrap">{dims(primarySize)}</span>
              </>
            )}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-700 bg-brand-50 rounded px-1.5 py-0.5 whitespace-nowrap">Primary</span>
          <span className="ml-auto flex items-center gap-3">
            <SyncStatus syncedAt={menu?.last_synced_at} />
            {menu?.print_file_url
              ? <span className="text-xs text-emerald-700 whitespace-nowrap">Final file ✓</span>
              : <span className="text-xs text-ink-300 whitespace-nowrap">No final file</span>}
          </span>
        </div>

        {/* Extra sizes */}
        {variants.map(v => {
          const isProp = v.layout_mode === 'proportional'
          const missingTemplate = !isProp && !templates[v.size]?.background_url
          return (
            <div key={v.id} className="rounded-lg border border-surface-200 px-3 py-2.5 space-y-2.5">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center gap-2 min-w-0">
                  <span className="text-xs font-mono font-semibold text-ink-700 uppercase">{label(v.size)}</span>
                  <span className="text-xs text-ink-400 whitespace-nowrap">{dims(v.size)}</span>
                </span>
                <span className="ml-auto flex items-center gap-3">
                  <SyncStatus syncedAt={v.last_synced_at} />
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => removeVariant(v)}
                      disabled={busy}
                      title="Remove this size"
                      className="text-ink-300 hover:text-red-600 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <label className="inline-flex items-center gap-1.5 text-xs text-ink-500">
                  Layout
                  <select
                    className="input input-sm"
                    value={v.layout_mode}
                    disabled={!canEdit || busy}
                    onChange={e => patchVariant(v.id, { layout_mode: e.target.value })}
                  >
                    <option value="template">Own template</option>
                    <option value="proportional">Scale from…</option>
                  </select>
                </label>
                {isProp && (
                  <label className="inline-flex items-center gap-1.5 text-xs text-ink-500">
                    from
                    <select
                      className="input input-sm"
                      value={v.source_size || primarySize}
                      disabled={!canEdit || busy}
                      onChange={e => patchVariant(v.id, { source_size: e.target.value })}
                    >
                      {[primarySize, ...variants.filter(x => x.id !== v.id).map(x => x.size)].map(s => (
                        <option key={s} value={s}>{label(s)}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="inline-flex items-center gap-1.5 text-xs text-ink-600 whitespace-nowrap ml-auto">
                  <input
                    type="checkbox"
                    checked={!!v.is_final}
                    disabled={!canEdit || busy}
                    onChange={e => patchVariant(v.id, { is_final: e.target.checked })}
                  />
                  Final
                </label>
              </div>

              {missingTemplate && (
                <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1">
                  No template for {label(v.size)} yet — add one on the Event page → Templates, or switch this to “Scale from”.
                </p>
              )}

              {canEdit && (
                <div className="flex gap-2">
                  <input
                    className="input input-sm flex-1"
                    type="url"
                    placeholder="Final print file link (optional)"
                    defaultValue={v.final_file_url || ''}
                    onBlur={e => {
                      const val = e.target.value.trim() || null
                      if (val !== (v.final_file_url || null)) patchVariant(v.id, { final_file_url: val })
                    }}
                  />
                  {dropboxConfigured() && (
                    <button
                      type="button"
                      onClick={() => chooseFromDropbox({ onSuccess: (link) => patchVariant(v.id, { final_file_url: link }) })}
                      className="btn-sm whitespace-nowrap flex-shrink-0 inline-flex items-center gap-1.5 px-3 rounded-md text-black text-xs font-semibold shadow-sm hover:brightness-105 transition"
                      style={{ background: 'linear-gradient(135deg, #FFD54F 0%, #FFB300 50%, #FB8C00 100%)' }}
                      title="Pick the PDF from Dropbox"
                    >
                      Dropbox
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {canEdit && available.length === 0 && variants.length > 0 && (
        <p className="text-[11px] text-ink-300 mt-3">Every available size is in use. Add more sizes on the Admin → Sizes list.</p>
      )}
      </>)}
    </div>
  )
}
