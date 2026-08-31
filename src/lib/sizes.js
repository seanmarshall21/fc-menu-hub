/**
 * Data-driven menu sizes.
 *
 * Sizes used to be hardcoded in three places (the Size <select>, the print
 * legend, and TemplateCanvas.SIZE_CONFIGS). They now come from the `size_defs`
 * table so a new physical size (e.g. an 8.5×11 flyer) is a row, not a code
 * change. The three original tokens (sm/md/lg) are seeded to match exactly, and
 * DEFAULT_SIZE_CONFIGS below is the offline fallback so the UI never blanks
 * while size_defs loads (or if it's empty).
 */
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Canvas renders at a normalized 1600px width; height follows the real aspect
// ratio. round(1600 * h/w) reproduces the original sm/md/lg pixel heights
// exactly (e.g. lg: 1600 * 47.5/23.5 ≈ 3235).
const CANVAS_W = 1600

export function deriveSizeConfig(def) {
  const w = Number(def.width_in) || 1
  const h = Number(def.height_in) || 1
  return {
    w: CANVAS_W,
    h: Math.round(CANVAS_W * (h / w)),
    label: def.label || String(def.id || '').toUpperCase(),
    name: def.name || def.label || def.id,
    print: `${def.width_in}" × ${def.height_in}"`,
    width_in: def.width_in,
    height_in: def.height_in,
    figma_tokens: def.figma_tokens || [],
    sort_order: def.sort_order ?? 999,
  }
}

// Fallback that matches the seeded sm/md/lg exactly — used before size_defs
// loads, or if the table can't be read.
export const DEFAULT_SIZE_DEFS = [
  { id: 'sm', label: 'SM', name: 'Small',  width_in: 23.5, height_in: 23.5,  sort_order: 10 },
  { id: 'md', label: 'MD', name: 'Medium', width_in: 23.5, height_in: 35.25, sort_order: 20 },
  { id: 'lg', label: 'LG', name: 'Large',  width_in: 23.5, height_in: 47.5,  sort_order: 30 },
]

export function buildSizeConfigs(defs) {
  const out = {}
  for (const d of defs || []) out[d.id] = deriveSizeConfig(d)
  return out
}

export const DEFAULT_SIZE_CONFIGS = buildSizeConfigs(DEFAULT_SIZE_DEFS)

// Module-level cache so we fetch size_defs once per page load, not per mount.
let _cache = null
let _inflight = null

export async function loadSizeDefs() {
  if (_cache) return _cache
  if (_inflight) return _inflight
  _inflight = supabase
    .from('size_defs')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .then(({ data, error }) => {
      _inflight = null
      if (error || !data || !data.length) {
        // Fall back to the built-in three so the UI still works.
        _cache = DEFAULT_SIZE_DEFS
        return _cache
      }
      _cache = data
      return _cache
    })
  return _inflight
}

/**
 * Hook: returns the active size definitions, a token→config map, and an
 * ordered list. Falls back to the built-in sm/md/lg until the table loads.
 */
export function useSizeDefs() {
  const [defs, setDefs] = useState(_cache || DEFAULT_SIZE_DEFS)
  useEffect(() => {
    let alive = true
    loadSizeDefs().then(d => { if (alive) setDefs(d) })
    return () => { alive = false }
  }, [])
  return {
    defs,
    configs: buildSizeConfigs(defs),
    order: defs.map(d => d.id),
  }
}
