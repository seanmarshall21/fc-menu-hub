// Dropbox Chooser (Drop-ins) — lets you pick a file from Dropbox inside a popup
// and get its shareable link back, with no copy-paste and no app switching.
//
// Requires a Dropbox "app key" (public, client-side) in VITE_DROPBOX_APP_KEY and
// the site's domain allow-listed in the Dropbox App Console. When the key is
// absent the picker button hides and the paste field still works — so nothing
// breaks before setup.

const APP_KEY = import.meta.env.VITE_DROPBOX_APP_KEY

export function dropboxConfigured() {
  return !!APP_KEY
}

let loadPromise = null
// Inject dropins.js once. Call on mount so the SDK is ready by the time the user
// clicks (Dropbox.choose must run in the click gesture to avoid popup blocking).
export function preloadDropbox() {
  if (!APP_KEY) return Promise.resolve(false)
  if (loadPromise) return loadPromise
  loadPromise = new Promise((resolve) => {
    if (window.Dropbox) { resolve(true); return }
    const existing = document.getElementById('dropboxjs')
    if (existing) { existing.addEventListener('load', () => resolve(!!window.Dropbox)); return }
    const s = document.createElement('script')
    s.src = 'https://www.dropbox.com/static/api/2/dropins.js'
    s.id = 'dropboxjs'
    s.setAttribute('data-app-key', APP_KEY)
    s.onload = () => resolve(!!window.Dropbox)
    s.onerror = () => resolve(false)
    document.body.appendChild(s)
  })
  return loadPromise
}

// Open the picker. onSuccess(link, name) fires with a permanent shareable link.
export function chooseFromDropbox({ onSuccess, extensions = ['.pdf'] }) {
  if (!window.Dropbox) return false
  window.Dropbox.choose({
    linkType: 'preview',      // permanent www.dropbox.com/... share link
    multiselect: false,
    extensions,
    success: (files) => { if (files && files[0]) onSuccess(files[0].link, files[0].name) },
  })
  return true
}
