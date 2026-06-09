// ─────────────────────────────────────────────────────────────────────────────
// Regenerate docs/*.pdf from the matching docs/*.html using headless Chrome.
// Run locally with `npm run walkthrough:pdf`. Then commit the updated PDFs —
// the prebuild script copies them into public/ on the next deploy.
//
// LOCAL USE ONLY. Skipped in CI / Netlify (no Chrome there).
// ─────────────────────────────────────────────────────────────────────────────

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { platform } from 'node:os'

const here       = dirname(fileURLToPath(import.meta.url))
const projectDir = dirname(here)

const docs = [
  { html: 'docs/walkthrough.html',       pdf: 'docs/walkthrough.pdf' },
  { html: 'docs/admin-walkthrough.html', pdf: 'docs/admin-walkthrough.pdf' },
]

const chromeCandidates = platform() === 'darwin'
  ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']

const chrome = chromeCandidates.find(p => existsSync(p))
if (!chrome) {
  console.error('[walkthrough:pdf] no Chrome/Chromium binary found. Edit the HTML and regenerate the PDF in your browser (File → Print → Save as PDF), then save to docs/<name>.pdf.')
  process.exit(1)
}

function renderOne(htmlRel, pdfRel) {
  return new Promise((resolve, reject) => {
    const html = join(projectDir, htmlRel)
    const pdf  = join(projectDir, pdfRel)
    if (!existsSync(html)) {
      console.warn(`[walkthrough:pdf] skipping ${htmlRel} — source missing`)
      return resolve(false)
    }
    const args = [
      '--headless', '--disable-gpu',
      '--no-pdf-header-footer', '--no-margins',
      `--print-to-pdf=${pdf}`, `file://${html}`,
    ]
    console.log(`[walkthrough:pdf] rendering ${htmlRel} …`)
    const proc = spawn(chrome, args, { stdio: 'inherit' })
    proc.on('exit', code => {
      if (code === 0) { console.log(`[walkthrough:pdf] wrote ${pdfRel}`); resolve(true) }
      else { reject(new Error(`Chrome exited with code ${code} on ${htmlRel}`)) }
    })
  })
}

let ok = 0
for (const { html, pdf } of docs) {
  try {
    const wrote = await renderOne(html, pdf)
    if (wrote) ok++
  } catch (e) {
    console.error(`[walkthrough:pdf] ${e.message}`)
    process.exit(1)
  }
}
console.log(`[walkthrough:pdf] done — ${ok} file(s) rendered`)
