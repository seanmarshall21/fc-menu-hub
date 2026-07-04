// send-share-email — email a preview/order share link to its recipient list
// via Resend. Staff-only (admin/internal/production). Marks each recipient
// sent_at on success.
//
// POST { shareId, recipientIds? }  → { sent, failed }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const APP_URL = 'https://fcmenus.netlify.app'
const FROM = 'CRSSD Menus <no-reply@crssd.com>'
const GRAD = 'linear-gradient(135deg,#FFD54F,#FFB300,#FB8C00)'

function emailHtml(title: string, isOrder: boolean, url: string, name?: string | null) {
  const hello = name ? `Hi ${name},` : 'Hi,'
  const what = isOrder ? 'a printable menu order' : 'a menu preview gallery'
  return `<!doctype html><html><body style="margin:0;background:#f5f3ee;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <p style="font-size:15px;line-height:1.6">${hello}</p>
    <p style="font-size:15px;line-height:1.6">You've been shared ${what}${title ? ` for <strong>${title}</strong>` : ''}.</p>
    <p style="margin:28px 0">
      <a href="${url}" style="display:inline-block;background:${GRAD};color:#000;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px">${isOrder ? 'View the order' : 'View the menus'}</a>
    </p>
    <p style="font-size:13px;color:#666;line-height:1.6">Or open this link:<br><a href="${url}" style="color:#B26A00">${url}</a></p>
    <p style="font-size:12px;color:#999;margin-top:28px">Sent by CRSSD Menu Hub. Please don't reply to this address.</p>
  </div></body></html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  try {
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) return json({ error: 'RESEND_API_KEY not configured' }, 500)

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const service = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Verify the caller is staff.
    const authHeader = req.headers.get('Authorization') || ''
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'unauthorized' }, 401)
    const { data: prof } = await service.from('user_profiles').select('role').eq('id', user.id).single()
    if (!prof || !['admin', 'internal', 'production'].includes(prof.role)) return json({ error: 'forbidden' }, 403)

    const { shareId, recipientIds } = await req.json().catch(() => ({}))
    if (!shareId) return json({ error: 'shareId required' }, 400)

    const { data: share } = await service.from('menu_preview_shares').select('id, title, kind').eq('id', shareId).single()
    if (!share) return json({ error: 'share not found' }, 404)

    let q = service.from('menu_share_recipients').select('id, name, email').eq('share_id', shareId)
    if (Array.isArray(recipientIds) && recipientIds.length) q = q.in('id', recipientIds)
    const { data: recipients } = await q
    if (!recipients || !recipients.length) return json({ error: 'no recipients' }, 400)

    const url = `${APP_URL}/share/${shareId}`
    const isOrder = share.kind === 'order'
    const subject = `${share.title || (isOrder ? 'Menu order' : 'Menu previews')} — CRSSD`
    let sent = 0, failed = 0
    for (const r of recipients) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM, to: [r.email], subject, html: emailHtml(share.title, isOrder, url, r.name) }),
      })
      if (res.ok) { sent++; await service.from('menu_share_recipients').update({ sent_at: new Date().toISOString() }).eq('id', r.id) }
      else { failed++; console.error('resend failed', r.email, res.status, await res.text()) }
    }
    return json({ ok: true, sent, failed })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})
