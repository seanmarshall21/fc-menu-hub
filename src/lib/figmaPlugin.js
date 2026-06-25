/**
 * Where to point users to install / open the Menu Sync Figma plugin.
 * Published to the Figma Community — anyone with the link can install.
 *
 * Plugin ID: 1645758553039246791
 */
export const PLUGIN_INSTALL_URL =
  'https://www.figma.com/community/plugin/1645758553039246791/menu-sync'

export const PLUGIN_LOCAL_INSTALL_DOC =
  'https://help.figma.com/hc/en-us/articles/360042786733-Create-a-plugin-for-development'

// Turn a figma.com web URL into the desktop-app deep link (figma:// scheme,
// which the installed desktop app registers). Falls back to the original URL
// if it isn't a figma.com link we recognize.
export function figmaDesktopUrl(webUrl) {
  try {
    const u = new URL(webUrl)
    if (u.hostname.endsWith('figma.com')) {
      return 'figma://' + u.pathname.replace(/^\/+/, '') + u.search
    }
  } catch (_) { /* not a parseable URL */ }
  return webUrl
}

// Open a Figma file preferring the DESKTOP app, falling back to the browser if
// the app doesn't grab focus shortly after. Wire to an <a>'s onClick (pass the
// event so we can preventDefault) while keeping href = web URL for middle-click
// / right-click and accessibility.
export function openFigmaDesktopFirst(e, webUrl) {
  if (e && e.preventDefault) e.preventDefault()
  const deep = figmaDesktopUrl(webUrl)
  if (deep === webUrl) { window.open(webUrl, '_blank', 'noopener'); return }
  // If the desktop app opens, the window blurs — cancel the web fallback.
  const fallback = setTimeout(() => { window.open(webUrl, '_blank', 'noopener') }, 1500)
  const cancel = () => clearTimeout(fallback)
  window.addEventListener('blur', cancel, { once: true })
  setTimeout(() => window.removeEventListener('blur', cancel), 3000)
  window.location.href = deep
}
