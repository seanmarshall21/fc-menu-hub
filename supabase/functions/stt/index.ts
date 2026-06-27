// ─────────────────────────────────────────────────────────────────────────────
// stt — speech-to-text. Client records audio (MediaRecorder) and posts base64;
// we transcribe server-side so it works on iOS where the browser SpeechRecognition
// API doesn't. Uses ElevenLabs Scribe (same key as tts).
//
// POST { audio: "<base64>", mime?: "audio/webm" } → { text }
// ─────────────────────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const key = Deno.env.get('ELEVENLABS_API_KEY')
    if (!key) return json({ error: 'No STT provider configured (set ELEVENLABS_API_KEY).' }, 503)

    const body = await req.json().catch(() => ({}))
    const b64 = String(body.audio || '')
    if (!b64) return json({ error: 'No audio.' }, 400)
    const mime = String(body.mime || 'audio/webm')

    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)

    const form = new FormData()
    form.append('model_id', 'scribe_v1')
    const ext = mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'webm'
    form.append('file', new Blob([bytes], { type: mime }), `audio.${ext}`)

    const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': key },
      body: form,
    })
    if (!r.ok) return json({ error: `ElevenLabs STT ${r.status}: ${(await r.text()).slice(0, 200)}` }, 502)
    const data = await r.json()
    return json({ text: String(data?.text || '').trim() })
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500)
  }
})

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}
