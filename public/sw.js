// Service worker for Menu Hub.
//
// Responsibilities today:
//   - Make the app installable as a PWA (install/activate skeleton)
//   - Handle Web Push payloads (when push is wired up server-side)
//   - Forward notification clicks to the right URL in the app
//
// Deliberately keeps caching minimal — Menu Hub is data-heavy and stale
// data is worse than a network round-trip. If you want offline support
// later, layer it in via Workbox or a hand-rolled fetch handler.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// ── Push handler ─────────────────────────────────────────────────────────
// When a push arrives, parse the JSON payload (shape mirrors
// `notifications` table rows) and surface as a system notification.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = {} }

  const title = data.title || 'Menu Hub'
  const options = {
    body: data.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: data.tag || (data.context && data.context.menu_item_id) || 'menuhub',
    data: { url: data.link_url || '/inbox' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// ── Click handler ────────────────────────────────────────────────────────
// Bring the existing tab to the foreground if open; otherwise open one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/inbox'
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of all) {
        if (client.url && new URL(client.url).pathname === url && 'focus' in client) {
          return client.focus()
        }
      }
      // No existing tab — open a new one
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })()
  )
})
