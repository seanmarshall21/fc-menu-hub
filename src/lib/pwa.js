// ─────────────────────────────────────────────────────────────────────────────
// PWA + push helpers. Service worker registration, badge sync, optional
// push subscription (gated on a configured VAPID public key).
//
// Today this enables:
//   - Installability (manifest.json + sw.js)
//   - Native app badge on the dock/home-screen tied to unread count
//
// Push notifications are scaffolded but gated on VITE_VAPID_PUBLIC_KEY
// being set. To turn them on:
//   1. Generate a VAPID keypair (npx web-push generate-vapid-keys)
//   2. Stash the public key in .env as VITE_VAPID_PUBLIC_KEY
//   3. Stash the private key as a secret in Supabase + add an edge
//      function that signs + sends push payloads when a notifications
//      row is inserted.
// ─────────────────────────────────────────────────────────────────────────────

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    return reg
  } catch (err) {
    console.warn('[pwa] SW registration failed', err)
    return null
  }
}

// Native badging API — supported by recent Safari, Chromium on macOS/Windows.
// No-ops gracefully on browsers that don't have it.
export function setAppBadge(count) {
  if (typeof navigator === 'undefined') return
  if (count > 0 && navigator.setAppBadge) {
    navigator.setAppBadge(count).catch(() => {})
  } else if (count === 0 && navigator.clearAppBadge) {
    navigator.clearAppBadge().catch(() => {})
  }
}

// Web Push subscription. Returns the PushSubscription object you can POST
// to your server to store + use as a delivery target later.
export async function ensurePushSubscription() {
  if (!VAPID) return { ok: false, reason: 'vapid-not-configured' }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'unsupported' }
  }
  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  if (existing) return { ok: true, subscription: existing }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, reason: 'denied' }
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID),
  })
  return { ok: true, subscription: sub }
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const base = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
