// ─────────────────────────────────────────────────────────────────────────────
// Cloning helpers for menus, events, and series.
//
// All three follow the same shape:
//   - Insert the new parent row, carrying forward design/config fields and
//     skipping sync metadata + the linked-frame fields.
//   - Auto-unique the slug within the target scope.
//   - Recursively clone children (events → menus → items + sponsors).
//
// Returns the newly-created top-level row on success.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/lib/supabase'

function slugify(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// Find a slug that doesn't already exist for the given table+scope.
// Suffixes -2, -3, etc. until we hit something free. Bails after 50 tries.
async function uniqueSlug(table, scopeColumn, scopeValue, baseSlug) {
  if (!baseSlug) baseSlug = `${table}-${Date.now()}`
  let slug = baseSlug
  for (let i = 2; i < 52; i++) {
    const { count } = await supabase
      .from(table).select('id', { count: 'exact', head: true })
      .eq(scopeColumn, scopeValue).eq('slug', slug)
    if (!count) return slug
    slug = `${baseSlug}-${i}`
  }
  return `${baseSlug}-${Date.now()}`
}

/**
 * Clone a menu (and its items + sponsor toggles) into a target event.
 *
 * @param {string}  sourceMenuId
 * @param {object}  opts
 *   - name            new menu name
 *   - targetEventId   uuid of the destination event
 *   - setAllDraft     if true, every cloned item's edit_status becomes 'draft'
 * @returns {Promise<object>} the newly-created menu row
 */
export async function duplicateMenuTo(sourceMenuId, { name, targetEventId, setAllDraft = false }) {
  const { data: src, error: srcErr } = await supabase.from('menus').select('*').eq('id', sourceMenuId).single()
  if (srcErr) throw srcErr

  const baseSlug = slugify(name) || `menu-${Date.now()}`
  const slug = await uniqueSlug('menus', 'event_id', targetEventId, baseSlug)

  const { data: created, error: createErr } = await supabase
    .from('menus').insert({
      event_id:                  targetEventId,
      name,
      slug,
      category:                  src.category,
      size:                      src.size,
      icon_url:                  src.icon_url,
      icon_name:                 src.icon_name,
      phase:                     'build',
      style_spec:                src.style_spec,
      fonts:                     src.fonts,
      header_logo_url:           src.header_logo_url,
      footer_url:                src.footer_url,
      footer_show_diet_key:      src.footer_show_diet_key,
      footer_show_tax_text:      src.footer_show_tax_text,
      footer_custom_text:        src.footer_custom_text,
      override_sponsor_order:    src.override_sponsor_order,
      requires_sponsor_approval: src.requires_sponsor_approval,
      notify_user_ids:           src.notify_user_ids,
      // Intentionally NOT copied: last_synced_at, last_sync_digest,
      // preview_image_url, sponsor_approved_at, sponsor_approved_by.
    })
    .select().single()
  if (createErr) throw createErr

  // ── Items ───────────────────────────────────────────────────────────────
  const { data: items } = await supabase.from('menu_items').select('*').eq('menu_id', sourceMenuId).order('sort_order')
  if (items && items.length > 0) {
    const cloned = items.map(it => {
      const {
        id: _id, menu_id: _mid, created_at: _ca,
        last_edited_at: _lea, last_edited_by: _leb,
        ...rest
      } = it
      return {
        ...rest,
        menu_id: created.id,
        edit_status: setAllDraft
          ? 'draft'
          : (it.edit_status === 'pending_approval' ? 'active' : it.edit_status),
      }
    })
    const { error: itemsErr } = await supabase.from('menu_items').insert(cloned)
    if (itemsErr) throw itemsErr
  }

  // ── Sponsor toggles ─────────────────────────────────────────────────────
  // event_sponsors row ids are event-scoped; only clone these when the
  // target event is the same as the source. Cross-event clones leave
  // the new menu's sponsor list empty for the user to populate.
  if (targetEventId === src.event_id) {
    const { data: sps } = await supabase.from('menu_sponsors').select('*').eq('menu_id', sourceMenuId).order('sort_order')
    if (sps && sps.length > 0) {
      const cloned = sps.map(sp => {
        const { id: _id, menu_id: _mid, created_at: _ca, ...rest } = sp
        return { ...rest, menu_id: created.id }
      })
      await supabase.from('menu_sponsors').insert(cloned)
    }
  }

  return created
}

/**
 * Clone an event into a target series. Cascades: every menu under the source
 * event is duplicated into the new event using duplicateMenuTo.
 *
 * Cross-series clones don't carry sponsor toggles on child menus (same
 * reason as menu duplication — event_sponsors are event-scoped).
 */
export async function duplicateEventTo(sourceEventId, { name, targetSeriesId, setAllItemsToDraft = false, includeMenus = true }) {
  const { data: src, error: srcErr } = await supabase.from('events').select('*').eq('id', sourceEventId).single()
  if (srcErr) throw srcErr

  const baseSlug = slugify(name) || `event-${Date.now()}`
  const slug = await uniqueSlug('events', 'series_id', targetSeriesId, baseSlug)

  const { data: created, error: createErr } = await supabase
    .from('events').insert({
      series_id:        targetSeriesId,
      name,
      slug,
      event_date:       null, // explicitly cleared — user picks a new date
      venue:            src.venue,
      phase:            'build',
      style_spec:       src.style_spec,
      fonts:            src.fonts,
      header_logo_url:  src.header_logo_url,
      footer_url:       src.footer_url,
      override_sponsor_order: src.override_sponsor_order,
      sponsor_tint_color:     src.sponsor_tint_color,
      notify_user_ids:        src.notify_user_ids,
      // Skipped: figma_file_url, figma_page_name (each event needs its own
      // Figma destination), preview_image_url.
    })
    .select().single()
  if (createErr) throw createErr

  // ── Cascade: every menu under the source event (optional) ───────────────
  if (includeMenus) {
    const { data: menus } = await supabase.from('menus').select('id, name').eq('event_id', sourceEventId).order('name')
    for (const m of (menus || [])) {
      try {
        await duplicateMenuTo(m.id, {
          name: m.name,           // preserve original names — the event is what changes
          targetEventId: created.id,
          setAllDraft: setAllItemsToDraft,
        })
      } catch (e) {
        // Don't bail the whole event clone if one menu fails — surface a
        // warning and continue. The user can manually fix up afterwards.
        // eslint-disable-next-line no-console
        console.warn('Skipping menu during event clone:', m.name, e?.message)
      }
    }
  }

  return created
}

/**
 * Clone a series into a target brand. Cascades: every event under the source
 * series is duplicated into the new series, which cascades menus, items, etc.
 */
export async function duplicateSeriesTo(sourceSeriesId, { name, targetBrandId, setAllItemsToDraft = false, includeEvents = true, includeMenus = true }) {
  const { data: src, error: srcErr } = await supabase.from('series').select('*').eq('id', sourceSeriesId).single()
  if (srcErr) throw srcErr

  const baseSlug = slugify(name) || `series-${Date.now()}`
  const slug = await uniqueSlug('series', 'brand_id', targetBrandId, baseSlug)

  const { data: created, error: createErr } = await supabase
    .from('series').insert({
      brand_id:         targetBrandId,
      name,
      slug,
      icon_url:         src.icon_url,
      icon_name:        src.icon_name,
      style_spec:       src.style_spec,
      fonts:            src.fonts,
      header_logo_url:  src.header_logo_url,
      footer_url:       src.footer_url,
      notify_user_ids:  src.notify_user_ids,
    })
    .select().single()
  if (createErr) throw createErr

  // ── Cascade: every event (optional) ─────────────────────────────────────
  if (!includeEvents) return created
  const { data: events } = await supabase.from('events').select('id, name').eq('series_id', sourceSeriesId).order('name')
  for (const ev of (events || [])) {
    try {
      await duplicateEventTo(ev.id, {
        name: ev.name,
        targetSeriesId: created.id,
        setAllItemsToDraft,
        includeMenus,
      })
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Skipping event during series clone:', ev.name, e?.message)
    }
  }

  return created
}
