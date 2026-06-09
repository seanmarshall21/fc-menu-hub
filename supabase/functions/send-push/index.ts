// ─────────────────────────────────────────────────────────────────────────────
// send-push — Supabase Edge Function
//
// Called by a database trigger on `notifications` insert (see SQL in
// supabase/schema.sql). For each active push_subscriptions row for the
// notified user, builds + signs a Web Push request and delivers it.
//
// Required environment (set via `supabase secrets set …`):
//   - VAPID_PUBLIC_KEY     base64url-encoded ECDSA public key
//   - VAPID_PRIVATE_KEY    base64url-encoded ECDSA private key
//   - VAPID_SUBJECT        contact URL, e.g. mailto:sean@crssd.com
//   - SUPABASE_URL         auto-injected by Supabase
//   - SUPABASE_SERVICE_ROLE_KEY  auto-injected
//
// Generate keys once with:
//   npx web-push generate-vapid-keys
// then upload:
//   supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:you@example.com
// then deploy:
//   supabase functions deploy send-push --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.7'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC     = Deno.env.get('VAPID_PUBLIC_KEY')  || ''
const VAPID_PRIVATE    = Deno.env.get('VAPID_PRIVATE_KEY') || ''
const VAPID_SUBJECT    = Deno.env.get('VAPID_SUBJECT')     || 'mailto:hello@example.com'

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return new Response(JSON.stringify({ ok: false, reason: 'vapid-not-configured' }), { status: 500 })
  }

  let body: { notification_id?: string; user_id?: string; title?: string; message?: string; link_url?: string } = {}
  try { body = await req.json() } catch { /* ignore — invalid JSON falls through */ }

  // Caller can either pass a notification_id (we fetch + hydrate) or push
  // ad-hoc fields directly. The DB trigger uses notification_id.
  let notification = null as any
  if (body.notification_id) {
    const { data, error } = await supabase
      .from('notifications').select('*').eq('id', body.notification_id).single()
    if (error || !data) return new Response(JSON.stringify({ ok: false, reason: 'notification-not-found' }), { status: 404 })
    notification = data
  } else if (body.user_id) {
    notification = {
      user_id:  body.user_id,
      title:    body.title    || 'Menu Hub',
      message:  body.message  || '',
      link_url: body.link_url || '/inbox',
    }
  } else {
    return new Response(JSON.stringify({ ok: false, reason: 'no-target' }), { status: 400 })
  }

  const { data: subs, error: subsErr } = await supabase
    .from('push_subscriptions').select('*').eq('user_id', notification.user_id)
  if (subsErr) {
    return new Response(JSON.stringify({ ok: false, reason: subsErr.message }), { status: 500 })
  }
  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ ok: true, delivered: 0 }))
  }

  const payload = JSON.stringify({
    title:    notification.title    || 'Menu Hub',
    body:     notification.message  || '',
    link_url: notification.link_url || '/inbox',
    tag:      notification.id || undefined,
    context:  notification.context || undefined,
  })

  let delivered = 0
  const stale: string[] = []
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
        payload,
      )
      delivered++
    } catch (e: any) {
      // 404 / 410 from the push service = endpoint is dead. Prune it so we
      // don't keep retrying.
      const code = e?.statusCode || 0
      if (code === 404 || code === 410) stale.push(s.endpoint)
    }
  }))

  if (stale.length > 0) {
    await supabase.from('push_subscriptions').delete().in('endpoint', stale)
  }

  return new Response(JSON.stringify({ ok: true, delivered, pruned: stale.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
