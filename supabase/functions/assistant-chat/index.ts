// ─────────────────────────────────────────────────────────────────────────────
// assistant-chat — conversational brain for the ✦ Quick-check assistant.
// Answers questions grounded ONLY in the event context the client passes
// (computed live from the DB), and can suggest a route to navigate to.
//
// POST { question, context, history? } → { text, navigate }
// Requires ANTHROPIC_API_KEY. Model claude-sonnet-4-6.
// ─────────────────────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const MODEL = 'claude-sonnet-4-6'

const SYSTEM = `You are the ✦ assistant inside Menu Hub, an app the creative & approvals team uses to produce festival food/drink menus. You help one teammate get their menus over the line.

You are given a JSON "context" describing the CURRENTLY SELECTED event's live state (menu counts by phase, sponsor status, what's ready for print, the user's outstanding tasks, etc.). Rules:
- Answer ONLY from the provided context. Use its exact numbers. Never invent menus, names, or counts. If the context doesn't contain the answer, say you can only speak to what's in this event and suggest what you can tell them.
- Be concise and warm — 1–3 short sentences, like a helpful coworker. No bullet dumps unless asked.
- If the user wants to act/go somewhere, choose the single best matching route from context.tasks[].route and put it in "navigate". Otherwise navigate must be null.
- Phases are: build → proof → edits → approved → exported → complete → archived. "Ready for print prep" = approved with sponsors resolved.

Respond with ONLY JSON, no prose, no code fences:
{"text":"<your reply>","navigate":"<a route string from the context, or null>"}`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not set.' }, 500)
    const body = await req.json().catch(() => ({}))
    const question = String(body.question || '').slice(0, 1000)
    if (!question) return json({ error: 'No question.' }, 400)
    const context = body.context || {}
    const history = Array.isArray(body.history) ? body.history.slice(-6) : []

    const userText = `Question: ${question}\n\nEvent context (JSON):\n${JSON.stringify(context)}\n\nRecent conversation:\n${JSON.stringify(history)}`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        system: SYSTEM,
        messages: [{ role: 'user', content: userText }],
      }),
    })
    if (!res.ok) return json({ error: `Claude ${res.status}: ${(await res.text()).slice(0, 200)}` }, 502)
    const data = await res.json()
    const text = (data?.content || []).map((b: any) => b?.text || '').join('').trim()
    let parsed: any = null
    try {
      const s = text.indexOf('{'), e = text.lastIndexOf('}')
      parsed = JSON.parse(s >= 0 && e >= 0 ? text.slice(s, e + 1) : text)
    } catch (_) {
      return json({ text: text || 'Sorry, I lost my train of thought — try again?', navigate: null })
    }
    const navigate = typeof parsed?.navigate === 'string' && parsed.navigate.startsWith('/') ? parsed.navigate : null
    return json({ text: String(parsed?.text || '').slice(0, 800) || 'Okay.', navigate })
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500)
  }
})

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}
