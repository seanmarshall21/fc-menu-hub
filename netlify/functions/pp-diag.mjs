// TEMP diagnostic: synchronous twin of the print-preview renderer. Returns the
// real error inline (background functions swallow it). Renders page 1 only —
// no upload — to isolate whether mupdf runs in the Lambda runtime.
// Delete once the background function is confirmed working.
export default async (req) => {
  const out = { steps: [] }
  try {
    out.hasSecret = !!process.env.PREVIEW_HOOK_SECRET
    const url = new URL(req.url)
    const printFileUrl = url.searchParams.get('url')
      || 'https://www.dropbox.com/scl/fi/dponw6z9fimiovcpcsa1i/UTBS-26-Menu-Bar-ILovePickles-2x2-CMYK.pdf?rlkey=yh3d4c1rkt0nsri97y56xr6sq&dl=1'
    out.steps.push('import mupdf')
    const mupdf = await import('mupdf')
    out.steps.push('mupdf imported: ' + typeof mupdf.Document?.openDocument)
    const pdfRes = await fetch(printFileUrl)
    out.steps.push('fetch ' + pdfRes.status)
    const buf = new Uint8Array(await pdfRes.arrayBuffer())
    out.pdfBytes = buf.length
    const doc = mupdf.Document.openDocument(buf, 'application/pdf')
    const page = doc.loadPage(0)
    const b = page.getBounds()
    const scale = 1800 / Math.max(Math.abs(b[2] - b[0]), Math.abs(b[3] - b[1]))
    const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false)
    const jpeg = pix.asJPEG(90, false)
    out.ok = true
    out.dims = pix.getWidth() + 'x' + pix.getHeight()
    out.jpegBytes = jpeg.length
    return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    out.ok = false
    out.error = String((e && e.stack) || e)
    return new Response(JSON.stringify(out), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
