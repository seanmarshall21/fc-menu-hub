// ─────────────────────────────────────────────────────────────────────────────
// visual-check — vision review of a rendered menu PNG.
//
// POST { imageUrl, items?: [{title, price1, ...}], menuName? }
// → { findings: [{ severity: 'high'|'low', message }] }
//
// Looks for print-blocking visual problems (clipped/overflowing text, overlap,
// missing/cropped sponsor logos, awkward spacing) and, when given the item
// list, mismatches between what's on the page and the data. Requires
// ANTHROPIC_API_KEY. Uses claude-sonnet-4-6 (vision).
// ─────────────────────────────────────────────────────────────────────────────
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const MODEL = 'claude-sonnet-4-6'

const SYSTEM = `You are a prepress QA reviewer for printed festival food & beverage menus.
You are shown a rendered menu image. Report ONLY real, visible problems that would
hurt the print:
- text cut off, clipped, or overflowing past the menu's edges/margins
- elements overlapping or colliding
- a sponsor logo missing, cropped, stretched, or badly misaligned
- noticeably uneven / awkward spacing between items or sections, or a big empty gap
- anything that looks visually broken
If an item list is provided, flag a visible price or name that clearly conflicts
with the list. Be CONSERVATIVE about "missing item" claims: before saying a
listed item is missing, scan the ENTIRE image carefully — including small print,
secondary sections at the very bottom (e.g. "NA" / non-alcoholic / add-ons / a
single last row), and the edges. Menus routinely place a few items in a small
separate section. Only report a missing item if you are confident it truly does
not appear anywhere. When in doubt, do NOT flag it.
Do NOT nitpick subjective design taste. If it looks clean and print-ready, return
an empty findings array.

Respond with ONLY JSON, no prose:
{"findings":[{"severity":"high|low","message":"<short, specific>"}]}`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not set on the server.' }, 500)

    const body = await req.json().catch(() => ({}))
    const imageUrl = String(body.imageUrl || '')
    if (!imageUrl) return json({ error: 'No imageUrl provided.' }, 400)

    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) return json({ error: `Could not fetch image (${imgRes.status}).` }, 400)
    const mediaType = imgRes.headers.get('content-type') || 'image/png'
    const b64 = encodeBase64(new Uint8Array(await imgRes.arrayBuffer()))

    const items = Array.isArray(body.items) ? body.items : []
    const itemList = items
      .filter((i: any) => i && (i.status === 'active' || i.status === 'pending_approval'))
      .map((i: any) => ({ title: i.title || '', price1: i.price1 || '', price2: i.price2 || '' }))
    const listNote = itemList.length
      ? `\n\nThe menu should contain these items (JSON):\n${JSON.stringify(itemList)}`
      : ''

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType.includes('png') ? 'image/png' : 'image/jpeg', data: b64 } },
            { type: 'text', text: `Review this rendered menu${body.menuName ? ` ("${body.menuName}")` : ''} for print.${listNote}` },
          ],
        }],
      }),
    })
    if (!res.ok) {
      const txt = await res.text()
      return json({ error: `Claude API ${res.status}: ${txt.slice(0, 300)}` }, 502)
    }
    const data = await res.json()
    const text = (data?.content || []).map((b: any) => b?.text || '').join('').trim()
    let parsed: any = null
    try {
      const s = text.indexOf('{'), e = text.lastIndexOf('}')
      parsed = JSON.parse(s >= 0 && e >= 0 ? text.slice(s, e + 1) : text)
    } catch (_) {
      return json({ error: 'Could not parse model output', raw: text.slice(0, 400) }, 502)
    }
    const findings = (Array.isArray(parsed?.findings) ? parsed.findings : [])
      .map((f: any) => ({ severity: f.severity === 'high' ? 'high' : 'low', message: String(f.message || '').slice(0, 240) }))
      .filter((f: any) => f.message)
    return json({ findings })
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500)
  }
})

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}
