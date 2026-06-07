import { useCallback, useEffect, useState } from 'react'

/**
 * Per-user, per-table column preferences (order + width).
 * Persists to localStorage so it survives reloads on the same browser.
 *
 *   const [cols, setOrder, setWidth, reset] = useTableColumns('menu_items_v1', DEFAULT_COLUMNS)
 *
 * DEFAULT_COLUMNS is an array of { id, label, defaultWidth, minWidth, frozen }
 * The hook returns the merged columns array (order from prefs, label/frozen/etc
 * from defaults). If the user has no prefs yet, returns the defaults in order.
 */
export function useTableColumns(storageKey, defaultColumns) {
  const [prefs, setPrefs] = useState(() => readPrefs(storageKey))

  useEffect(() => {
    writePrefs(storageKey, prefs)
  }, [storageKey, prefs])

  // Merge defaults with stored prefs.
  const columns = mergeColumns(defaultColumns, prefs)

  const setOrder = useCallback((nextIds) => {
    setPrefs(prev => ({ ...prev, order: nextIds }))
  }, [])

  const setWidth = useCallback((id, px) => {
    setPrefs(prev => ({
      ...prev,
      widths: { ...(prev.widths || {}), [id]: Math.max(40, Math.round(px)) },
    }))
  }, [])

  const reset = useCallback(() => {
    setPrefs({})
  }, [])

  return [columns, setOrder, setWidth, reset]
}

function readPrefs(key) {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(key) || '{}') || {}
  } catch {
    return {}
  }
}
function writePrefs(key, value) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

function mergeColumns(defaults, prefs) {
  const byId = new Map(defaults.map(c => [c.id, c]))
  const result = []
  const seen = new Set()

  // Frozen columns always come first in their default order, regardless of prefs
  for (const def of defaults) {
    if (def.frozen) {
      result.push(applyWidth(def, prefs))
      seen.add(def.id)
    }
  }

  // Then the user's chosen order for non-frozen
  for (const id of (prefs.order || [])) {
    const def = byId.get(id)
    if (def && !def.frozen && !seen.has(id)) {
      result.push(applyWidth(def, prefs))
      seen.add(id)
    }
  }

  // Append any defaults missing from prefs.order
  for (const def of defaults) {
    if (!seen.has(def.id)) {
      result.push(applyWidth(def, prefs))
      seen.add(def.id)
    }
  }

  return result
}

function applyWidth(def, prefs) {
  return { ...def, width: (prefs.widths || {})[def.id] ?? def.defaultWidth }
}
