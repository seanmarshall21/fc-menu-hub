// ─────────────────────────────────────────────────────────────────────────────
// openPreviewExportWindow — opens a new tab with a print-ready grid of
// selected menu preview images. The user picks a per-page layout from the
// floating toolbar and prints to PDF via the browser's native print dialog.
//
// Why a separate window? Because:
//   - Browser print rules (Cmd+P → "Save as PDF") work better on a clean
//     standalone HTML document than on a fragment of the app.
//   - The user can tweak page size, margins, scale natively without us
//     reimplementing PDF generation.
//   - No new dependency. html2canvas is already in package.json for other
//     features but we don't need image-rasterization here — we're embedding
//     the existing preview PNGs directly.
//
// Usage:
//   import { openPreviewExportWindow } from '@/lib/openPreviewExportWindow'
//   openPreviewExportWindow(menus, 'CRSSD Spring 2026')
// ─────────────────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  }[c]))
}

export function openPreviewExportWindow(menus, eventName) {
  if (!Array.isArray(menus) || menus.length === 0) return
  const w = window.open('', '_blank', 'noopener,noreferrer')
  if (!w) {
    alert('Popup was blocked. Allow popups for fcmenus.netlify.app and try again.')
    return
  }

  const title = `${eventName} — menu previews`
  const cards = menus.map(m => `
    <figure class="card">
      <img src="${esc(m.print_preview_url || m.preview_image_url)}" alt="${esc(m.name)}" />
      <figcaption>${esc(m.name)}</figcaption>
    </figure>
  `).join('')

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root {
    --gap: 16px;
    --ink: #1f2330;
    --muted: #6b7280;
    --line: #e7e5e4;
    --accent: #6366f1;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    color: var(--ink);
    background: #f7f6f3;
    -webkit-font-smoothing: antialiased;
  }
  body { padding: 92px 32px 32px; }
  h1 { font-size: 14px; font-weight: 600; margin: 0 0 24px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
  .toolbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 10;
    background: rgba(31, 35, 48, 0.96);
    backdrop-filter: blur(8px);
    color: #fff;
    padding: 12px 24px;
    display: flex; align-items: center; justify-content: center;
    gap: 12px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    flex-wrap: wrap;
  }
  .toolbar label { font-size: 12px; opacity: 0.7; }
  .toolbar select, .toolbar button {
    font: inherit; font-size: 13px;
    background: rgba(255,255,255,0.1);
    color: #fff;
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 6px;
    padding: 6px 12px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .toolbar button:hover, .toolbar select:hover { background: rgba(255,255,255,0.18); }
  .toolbar button.primary {
    background: var(--accent);
    border-color: var(--accent);
  }
  .toolbar button.primary:hover { background: #4f46e5; border-color: #4f46e5; }
  .toolbar .hint { font-size: 11px; opacity: 0.55; margin-left: auto; }

  .grid {
    display: grid;
    gap: var(--gap);
    max-width: 1400px;
    margin: 0 auto;
  }
  .grid[data-cols="1"] { grid-template-columns: minmax(0, 1fr); }
  .grid[data-cols="2"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .grid[data-cols="3"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .grid[data-cols="4"] { grid-template-columns: repeat(4, minmax(0, 1fr)); }

  .card {
    margin: 0;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    break-inside: avoid;
  }
  .card img {
    width: 100%;
    height: auto;
    display: block;
    background: #fff;
  }
  .card figcaption {
    font-size: 11px;
    padding: 8px 12px;
    color: var(--muted);
    border-top: 1px solid var(--line);
    text-align: center;
  }

  /* Page-break controls per layout option */
  body[data-per-page="1"] .card { page-break-after: always; }
  body[data-per-page="1"] .card:last-child { page-break-after: auto; }

  @page {
    size: letter;
    margin: 0.4in;
  }
  @media print {
    body { background: #fff; padding: 0; }
    .toolbar { display: none; }
    h1 { display: none; }
    .card { box-shadow: none; border-color: #d1d5db; }
    .grid { gap: 12px; }
  }
</style>
</head>
<body data-per-page="auto">
  <div class="toolbar">
    <label for="cols">Columns</label>
    <select id="cols" onchange="setCols(this.value)">
      <option value="1">1</option>
      <option value="2" selected>2</option>
      <option value="3">3</option>
      <option value="4">4</option>
    </select>
    <label for="perpage">Page break</label>
    <select id="perpage" onchange="setPerPage(this.value)">
      <option value="auto" selected>Flow naturally</option>
      <option value="1">One menu per page</option>
    </select>
    <button class="primary" onclick="window.print()">Print / Save as PDF</button>
    <span class="hint">Use your browser's print dialog → "Save as PDF" for a digital copy.</span>
  </div>

  <h1>${esc(eventName)} · ${menus.length} preview${menus.length === 1 ? '' : 's'}</h1>
  <div class="grid" id="grid" data-cols="2">
    ${cards}
  </div>

  <script>
    function setCols(n) {
      document.getElementById('grid').dataset.cols = n;
    }
    function setPerPage(v) {
      document.body.dataset.perPage = v;
    }
  </script>
</body>
</html>`

  w.document.open()
  w.document.write(html)
  w.document.close()
}
