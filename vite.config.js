import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Build version: prefer Netlify's COMMIT_REF (set in CI), then local git SHA, then 'dev'.
const fullSha = process.env.COMMIT_REF || (() => {
  try { return execSync('git rev-parse HEAD').toString().trim() }
  catch { return 'dev' }
})()
const appVersion = fullSha.slice(0, 7)

// Vite plugin: write dist/version.json after build so the running app can poll it.
function writeVersionJson() {
  return {
    name: 'write-version-json',
    apply: 'build',
    writeBundle(options) {
      const outDir = options.dir || 'dist'
      const path = resolve(outDir, 'version.json')
      writeFileSync(path, JSON.stringify({
        version: appVersion,
        builtAt: new Date().toISOString(),
      }))
    },
  }
}

export default defineConfig({
  plugins: [react(), writeVersionJson()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
})
