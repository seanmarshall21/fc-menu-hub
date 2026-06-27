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

You are given a JSON "context": the CURRENTLY SELECTED event's live state (counts by phase, sponsor status, ready-for-print, the user's tasks, and context.menus[] = {id,name,phase,flaggedForSponsors}), plus context.eventsOverview[] = a summary of ALL events ({event, route, total, byPhase, flaggedForSponsors, flaggedStillNeedingSponsorsAdded}).

Rules:
- Answer ONLY from the provided context. Use its exact numbers. Never invent menus, names, or counts. For cross-event questions ("which events still need sponsors?") use eventsOverview.
- Be concise and warm — 1–3 short sentences, like a helpful coworker. No bullet dumps unless asked.
- To send the user somewhere, set "navigate" to the best matching route (from context.yourTasks[].route or eventsOverview[].route). Otherwise null.
- Phases: build → proof → edits → approved → exported → complete → archived. "Ready for print prep" = approved with sponsors resolved.

ACTIONS — only when the user clearly asks to CHANGE something on a specific menu. You never execute; you PROPOSE one action and the user confirms. Target a menu by its id from context.menus[]. Allowed:
- {"kind":"mark_sponsors_checked","menuId":"<id>"} — mark that menu's sponsors checked off.
- {"kind":"set_phase","menuId":"<id>","phase":"build|proof|edits|approved|exported|complete|archived"} — change that menu's phase.
Put the action in "action" and describe it in "text" (e.g. "Want me to mark Cowgirl Coffee's sponsors as checked?"). If the user is only asking a question, action must be null. Never propose an action they didn't ask for, and never act across many menus at once — one menu per action.

Respond with ONLY JSON, no prose, no code fences:
{"text":"<reply>","navigate":"<route string or null>","action":<action object or null>}`

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
    let action = null
    const a = parsed?.action
    const PHASES = ['build', 'proof', 'edits', 'approved', 'exported', 'complete', 'archived']
    if (a && typeof a.menuId === 'string') {
      if (a.kind === 'mark_sponsors_checked') action = { kind: 'mark_sponsors_checked', menuId: a.menuId }
      else if (a.kind === 'set_phase' && PHASES.includes(a.phase)) action = { kind: 'set_phase', menuId: a.menuId, phase: a.phase }
    }
    return json({ text: String(parsed?.text || '').slice(0, 800) || 'Okay.', navigate, action })
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500)
  }
})

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}
