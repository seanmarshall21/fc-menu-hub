// Netlify Background Function — renders a menu's print PDF (page 1) to JPEG and
// hands it to the pdf-preview Supabase edge function to store.
//
// Background functions (name ends in "-background") get up to 15 min and ~1 GB
// memory — enough for the 65–99 MB CMYK print PDFs that blow past the 256 MB
// serverless-edge limit. mupdf (wasm) runs fine in this Node runtime.
//
// Invoked by a Supabase DB trigger when a menu becomes complete with a print
// file. Body: { menuId, printFileUrl, secret }. The secret must match the
// PREVIEW_HOOK_SECRET env var set in Netlify. No Supabase service-role key is
// needed here — the edge function holds it; we authenticate with the public
// anon key.
import * as mupdf from 'mupdf'

const EDGE_FN = 'https://wysvknamfxtbehwetjxf.supabase.co/functions/v1/pdf-preview'
// Public anon key (same one embedded in the web app).
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5c3ZrbmFtZnh0YmVod2V0anhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwMjkwNTAsImV4cCI6MjA5MDYwNTA1MH0.tGdzLe4IVLl9PvfbiG6Exi42lwDDwjBVMQxuj73eMZs'
const LONG_EDGE = 1800
const QUALITY = 90

function directDropbox(u) {
  try { const url = new URL(u); url.searchParams.set('dl', '1'); return url.toString() } catch { return u }
}

export default async (req) => {
  try {
    const { menuId, printFileUrl, secret } = await req.json().catch(() => ({}))
    if (!process.env.PREVIEW_HOOK_SECRET || secret !== process.env.PREVIEW_HOOK_SECRET) {
      return new Response('forbidden', { status: 403 })
    }
    if (!menuId || !printFileUrl) return new Response('menuId and printFileUrl required', { status: 400 })
    if (printFileUrl.includes('/scl/fo/')) {
      console.log('skip folder link', menuId)
      return new Response('skipped folder link', { status: 200 })
    }

    const pdfRes = await fetch(directDropbox(printFileUrl))
    if (!pdfRes.ok) { console.error('pdf fetch failed', menuId, pdfRes.status); return new Response('pdf fetch ' + pdfRes.status, { status: 502 }) }
    const buf = new Uint8Array(await pdfRes.arrayBuffer())

    const doc = mupdf.Document.openDocument(buf, 'application/pdf')
    const page = doc.loadPage(0)
    const b = page.getBounds()
    const ptW = Math.abs(b[2] - b[0]), ptH = Math.abs(b[3] - b[1])
    const scale = LONG_EDGE / Math.max(ptW, ptH)
    const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false)
    const jpeg = pix.asJPEG(QUALITY, false)
    const base64 = Buffer.from(jpeg).toString('base64')

    const up = await fetch(EDGE_FN, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ menuId, base64, ext: 'jpg' }),
    })
    const txt = await up.text()
    console.log('menu', menuId, 'render', pix.getWidth() + 'x' + pix.getHeight(), Math.round(jpeg.length / 1024) + 'KB', 'store', up.status, txt.slice(0, 200))
    return new Response(txt, { status: up.ok ? 200 : 500 })
  } catch (e) {
    console.error('render-print-preview error', String((e && e.stack) || e))
    return new Response('error: ' + String((e && e.message) || e), { status: 500 })
  }
}
