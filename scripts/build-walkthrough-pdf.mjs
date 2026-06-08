// ─────────────────────────────────────────────────────────────────────────────
// Regenerate docs/walkthrough.pdf from docs/walkthrough.html using headless
// Chrome. Run locally with: `npm run walkthrough:pdf`. Then commit both
// files — the prebuild script will copy them into public/ on the next build.
//
// LOCAL USE ONLY. Skipped in CI / Netlify (no Chrome there). Use this when
// you've edited docs/walkthrough.html and want the matching PDF refreshed
// before committing.
// ─────────────────────────────────────────────────────────────────────────────

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { platform } from 'node:os'

const here       = dirname(fileURLToPath(import.meta.url))
const projectDir = dirname(here)
const html = join(projectDir, 'docs/walkthrough.html')
const pdf  = join(projectDir, 'docs/walkthrough.pdf')

if (!existsSync(html)) {
  console.error(`[walkthrough:pdf] source missing: ${html}`)
  process.exit(1)
}

// Locate Chrome — macOS first, then common Linux paths
const chromeCandidates = platform() === 'darwin'
  ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']

const chrome = chromeCandidates.find(p => existsSync(p))
if (!chrome) {
  console.error('[walkthrough:pdf] no Chrome/Chromium binary found. Edit docs/walkthrough.html and regenerate the PDF in your browser (File → Print → Save as PDF), then save to docs/walkthrough.pdf.')
  process.exit(1)
}

const args = [
  '--headless',
  '--disable-gpu',
  '--no-pdf-header-footer',
  '--no-margins',
  `--print-to-pdf=${pdf}`,
  `file://${html}`,
]

console.log(`[walkthrough:pdf] rendering with ${chrome}…`)
const proc = spawn(chrome, args, { stdio: 'inherit' })
proc.on('exit', code => {
  if (code === 0) {
    console.log(`[walkthrough:pdf] wrote ${pdf}`)
  } else {
    console.error(`[walkthrough:pdf] Chrome exited with code ${code}`)
    process.exit(code || 1)
  }
})
