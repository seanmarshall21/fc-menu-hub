// ─────────────────────────────────────────────────────────────────────────────
// tts — text-to-speech proxy. Keeps the provider key server-side and returns
// base64 audio the client plays. Provider-agnostic so we can add ElevenLabs
// (for a cloned voice) later without touching the client.
//
// POST { text, voice? } → { audio: "<base64 mp3>" }
//
// Google Cloud TTS: set GOOGLE_TTS_API_KEY secret. Default voice en-US-Neural2-J.
// (To add a cloned voice later: set ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID and
//  branch on provider here.)
// ─────────────────────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const body = await req.json().catch(() => ({}))
    const text = String(body.text || '').slice(0, 1200)
    if (!text) return json({ error: 'No text.' }, 400)

    const provider = String(body.provider || '')
    const elevenKey = Deno.env.get('ELEVENLABS_API_KEY')
    const elevenVoice = Deno.env.get('ELEVENLABS_VOICE_ID')
    // ElevenLabs (cloned voice) unless the caller explicitly asked for Google.
    if (provider !== 'google' && elevenKey && elevenVoice) {
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${elevenVoice}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': elevenKey, 'content-type': 'application/json' },
        body: JSON.stringify({ text, model_id: 'eleven_turbo_v2_5' }),
      })
      if (!r.ok) return json({ error: `ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}` }, 502)
      return json({ audio: b64(new Uint8Array(await r.arrayBuffer())), provider: 'elevenlabs' })
    }

    const googleKey = Deno.env.get('GOOGLE_TTS_API_KEY')
    if (!googleKey) return json({ error: 'No TTS provider configured (set GOOGLE_TTS_API_KEY).' }, 503)
    const voice = String(body.voice || 'en-US-Neural2-J')
    const r = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${googleKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: voice.slice(0, 5), name: voice },
        audioConfig: { audioEncoding: 'MP3' },
      }),
    })
    if (!r.ok) return json({ error: `Google TTS ${r.status}: ${(await r.text()).slice(0, 200)}` }, 502)
    const data = await r.json()
    if (!data?.audioContent) return json({ error: 'No audio returned.' }, 502)
    return json({ audio: data.audioContent, provider: 'google' })
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500)
  }
})

function b64(bytes: Uint8Array) {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}
