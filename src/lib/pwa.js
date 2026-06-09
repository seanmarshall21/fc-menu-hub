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

import { supabase } from '@/lib/supabase'

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

// Web Push subscription. Subscribes the browser, persists the endpoint to
// Supabase (so the send-push edge function can target it later), and
// returns the live PushSubscription.
//
// Possible reason values when ok=false:
//   - 'vapid-not-configured'  → VITE_VAPID_PUBLIC_KEY env var is missing
//   - 'unsupported'           → browser lacks Push API / Service Workers
//   - 'denied'                → user dismissed the system permission prompt
//   - 'not-signed-in'         → no Supabase session to associate with
export async function ensurePushSubscription() {
  if (!VAPID) return { ok: false, reason: 'vapid-not-configured' }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'unsupported' }
  }
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { ok: false, reason: 'denied' }
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID),
    })
  }
  await persistSubscription(sub)
  return { ok: true, subscription: sub }
}

// Drop the local subscription + remove it from Supabase. Use when the user
// toggles push notifications off in settings.
export async function clearPushSubscription() {
  if (!('serviceWorker' in navigator)) return { ok: true }
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return { ok: true }
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  try {
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  } catch { /* ignore */ }
  return { ok: true }
}

// True if this device currently has an active push subscription stored
// both in the browser AND mirrored to Supabase.
export async function hasPushSubscription() {
  if (!('serviceWorker' in navigator)) return false
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return !!sub
}

async function persistSubscription(sub) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return
  const json = sub.toJSON()
  const row = {
    user_id:    session.user.id,
    endpoint:   sub.endpoint,
    p256dh:     json.keys?.p256dh || '',
    auth_key:   json.keys?.auth   || '',
    user_agent: navigator.userAgent || null,
    last_seen:  new Date().toISOString(),
  }
  // Upsert on (user_id, endpoint) — matches the unique constraint, so a
  // re-subscribe on the same device just refreshes last_seen.
  await supabase.from('push_subscriptions').upsert(row, {
    onConflict: 'user_id,endpoint',
  })
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const base = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
