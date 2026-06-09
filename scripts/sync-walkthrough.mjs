// ─────────────────────────────────────────────────────────────────────────────
// Sync the canonical walkthrough docs from docs/ into public/ so Vite picks
// them up as static assets. Runs on every `npm run build` via the `prebuild`
// script in package.json — also runs on Netlify, since docs/ is committed.
//
// Edit menu-hub/docs/walkthrough.{html,pdf,md} as the source of truth.
// Public copies are derived; never edit them directly.
// ─────────────────────────────────────────────────────────────────────────────

import { copyFile, mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here       = dirname(fileURLToPath(import.meta.url))
const projectDir = dirname(here)
const docsDir    = join(projectDir, 'docs')
const publicDir  = join(projectDir, 'public')

const files = [
  { src: 'walkthrough.html',        dst: 'walkthrough.html' },
  { src: 'walkthrough.pdf',         dst: 'walkthrough.pdf'  },
  { src: 'admin-walkthrough.html',  dst: 'admin-walkthrough.html' },
  { src: 'admin-walkthrough.pdf',   dst: 'admin-walkthrough.pdf'  },
]

await mkdir(publicDir, { recursive: true })

let copied = 0
let skipped = 0

for (const { src, dst } of files) {
  const from = join(docsDir, src)
  const to   = join(publicDir, dst)
  try {
    await stat(from)
  } catch {
    console.warn(`[sync-walkthrough] source missing, skipping: docs/${src}`)
    skipped++
    continue
  }
  await copyFile(from, to)
  copied++
}

console.log(`[sync-walkthrough] copied ${copied} file(s) from docs/ → public/${skipped ? ` (${skipped} skipped)` : ''}`)
