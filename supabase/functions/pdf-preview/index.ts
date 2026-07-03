// ─────────────────────────────────────────────────────────────────────────────
// pdf-preview — store a rendered print-PDF preview for a menu.
//
// POST { menuId, base64, ext? }  → uploads the image to the public
// menu-previews bucket at print/<menuId>.<ext> and sets menus.print_preview_url.
// ext is 'jpg' (default) or 'png'.
//
// The print files are high-res CMYK PDFs (tens of MB); rasterizing them exceeds
// serverless memory limits, so the page-1 render happens where there's real
// memory (a local/CI step using poppler), and this function only needs the
// service-role key to persist the result. Every surface (tiles, event map,
// public share snapshot) then reads print_preview_url.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  try {
    const { menuId, base64, ext } = await req.json().catch(() => ({}))
    if (!menuId) return json({ error: 'menuId required' }, 400)
    if (!base64) return json({ error: 'base64 required' }, 400)

    const e = ext === 'png' ? 'png' : 'jpg'
    const contentType = e === 'png' ? 'image/png' : 'image/jpeg'
    const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const path = `print/${menuId}.${e}`
    const up = await supabase.storage.from('menu-previews')
      .upload(path, bin, { contentType, upsert: true })
    if (up.error) return json({ error: 'upload failed: ' + up.error.message }, 500)

    const { data: pub } = supabase.storage.from('menu-previews').getPublicUrl(path)
    const url = `${pub.publicUrl}?t=${Date.now()}`
    const { error: updErr } = await supabase.from('menus').update({ print_preview_url: url }).eq('id', menuId)
    if (updErr) return json({ error: 'update failed: ' + updErr.message }, 500)

    return json({ ok: true, url, bytes: bin.length })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})
