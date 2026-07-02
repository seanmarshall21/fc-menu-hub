// ─────────────────────────────────────────────────────────────────────────────
// review-menu — LLM-powered menu copy review (spelling, grammar, consistency).
//
// POST { items: [{ id, title, description, section, size1, price1, ... }] }
// → { findings: [{ itemId, itemTitle, field, kind, message, suggestion }] }
//
// kind ∈ 'spelling' | 'grammar' | 'consistency'. Shape matches the heuristic
// findings in src/lib/menuReview.js so the review panel renders both together.
//
// Requires the ANTHROPIC_API_KEY secret. Uses claude-sonnet-4-6 — menus are
// short, so cost per review is a fraction of a cent.
// ─────────────────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MODEL = 'claude-sonnet-4-6'

const SYSTEM = `You are a careful copy editor for food & beverage event menus. Your job is to
catch clear, objective mistakes — NOT to critique style. These menus get edited
and re-reviewed repeatedly, so by the time you see one it is usually already
clean. Finding nothing is the normal, expected, CORRECT result — not a failure.

Flag ONLY high-confidence issues that a professional editor would unquestionably
fix. There are three kinds:

1. "spelling" — a genuinely misspelled word (NOT a brand spelling, NOT a regional
   or loanword variant, NOT an intentional abbreviation). Suggest the corrected
   full field text.
2. "grammar" — a clear grammar or punctuation error that plainly reads as wrong
   (NOT casing, NOT spacing — handled elsewhere; NOT optional/stylistic
   punctuation like a serial comma). Suggest the corrected full field text.
3. "consistency" — the SAME product or brand written two materially different
   ways across items, e.g. "Tito's" vs "Tito's Handmade Vodka", or a sponsor
   name spelled two ways. Suggest the most complete / most common form.

Hard rules — when in doubt, DO NOT flag:
- If a reasonable editor could leave it exactly as-is, leave it out. A thing you
  would merely "improve" or "prefer differently" is NOT a finding. Precision
  matters far more than catching everything — a false flag is worse than a miss.
- Do NOT flag stylistic choices, word-choice or phrasing preferences, marketing
  voice, debatable punctuation, abbreviations (oz, GF, VT, VE), or intentional
  brand spellings.
- Titles are intentionally Title Case; descriptions are sentence case. NEVER flag
  a word capitalized in a title but lowercase in a description.
- Do NOT invent issues or reach for something to report to seem useful. If the
  menu is clean, return an empty findings array. That is a complete answer.
- Report each real issue once; never list minor variations of the same issue.
- Every finding must reference a real item id and field.

Respond with ONLY a JSON object, no prose:
{"findings":[{"itemId":"<id>","itemTitle":"<title>","field":"title|description","kind":"spelling|grammar|consistency","message":"<short human explanation>","suggestion":"<corrected full field text, or omit for consistency notes that span items>"}]}`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return json({ error: 'ANTHROPIC_API_KEY not set on the server.' }, 500)
    }

    const body = await req.json().catch(() => ({}))
    const items = Array.isArray(body.items) ? body.items : []
    // Only review visible items, only the fields that print.
    const reviewable = items
      .filter((i: any) => i && (i.status === 'active' || i.status === 'pending_approval'))
      .map((i: any) => ({
        id: i.id,
        section: i.section || '',
        title: i.title || '',
        description: i.description || '',
      }))
      .filter((i: any) => i.title || i.description)

    if (reviewable.length === 0) return json({ findings: [] })

    // Editor-confirmed-correct items — the model must NOT flag these again.
    const correct = Array.isArray(body.correct) ? body.correct : []
    let confirmedNote = ''
    if (correct.length) {
      const lines = correct
        .map((c: any) => `- [${c.kind || 'item'}${c.field ? '/' + c.field : ''}] ${c.label || ''}${c.message ? ` — ${c.message}` : ''}`)
        .join('\n')
      confirmedNote = `\n\nIMPORTANT — the following were reviewed by an editor and CONFIRMED CORRECT / intentional. Do NOT flag these or anything equivalent to them again:\n${lines}\n`
    }

    // Findings the editor has already SEEN and chosen to leave as-is. These
    // must not resurface — not even reworded — so the review converges instead
    // of re-litigating settled items on every re-run.
    const dismissed = Array.isArray(body.dismissed) ? body.dismissed : []
    let dismissedNote = ''
    if (dismissed.length) {
      const lines = dismissed
        .map((c: any) => `- [${c.kind || 'item'}${c.field ? '/' + c.field : ''}] ${c.label || ''}${c.message ? ` — ${c.message}` : ''}`)
        .join('\n')
      dismissedNote = `\n\nALREADY REVIEWED — the editor has already seen and INTENTIONALLY LEFT the following as fine. Do NOT raise these again, or any substantially equivalent issue (same item, field, or theme), even worded differently:\n${lines}\n`
    }

    // Optional custom review rules (e.g. "all vodka must say Tito's Handmade Vodka").
    const rules = Array.isArray(body.rules) ? body.rules : []
    let rulesNote = ''
    if (rules.length) {
      const lines = rules.map((r: any) => `- ${typeof r === 'string' ? r : (r.text || '')}`).filter(Boolean).join('\n')
      if (lines) rulesNote = `\n\nADDITIONAL REVIEW RULES — also flag any item that violates these (kind "consistency"):\n${lines}\n`
    }

    const userPrompt = `Review these ${reviewable.length} menu items. Here is the JSON:\n\n${JSON.stringify(reviewable, null, 2)}${rulesNote}${confirmedNote}${dismissedNote}`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        temperature: 0, // deterministic — a clean menu stays clean across re-runs
        system: SYSTEM,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!res.ok) {
      const txt = await res.text()
      return json({ error: `Claude API ${res.status}: ${txt.slice(0, 300)}` }, 502)
    }

    const data = await res.json()
    const text = (data?.content || []).map((b: any) => b?.text || '').join('').trim()

    // Be forgiving about stray prose: pull the first {...} block.
    let parsed: any = null
    try {
      const start = text.indexOf('{')
      const end = text.lastIndexOf('}')
      parsed = JSON.parse(start >= 0 && end >= 0 ? text.slice(start, end + 1) : text)
    } catch (_) {
      return json({ error: 'Could not parse model output', raw: text.slice(0, 400) }, 502)
    }

    const findings = Array.isArray(parsed?.findings) ? parsed.findings : []
    // Validate + normalize against the known item set so the UI can trust refs.
    const byId = new Map(reviewable.map((i: any) => [i.id, i]))
    const clean = findings
      .filter((f: any) => f && byId.has(f.itemId) && ['spelling', 'grammar', 'consistency'].includes(f.kind))
      .map((f: any) => ({
        itemId: f.itemId,
        itemTitle: byId.get(f.itemId)?.title || f.itemTitle || '',
        field: f.field === 'description' ? 'description' : 'title',
        kind: f.kind,
        message: String(f.message || '').slice(0, 240),
        suggestion: typeof f.suggestion === 'string' ? f.suggestion : undefined,
        source: 'ai',
      }))

    return json({ findings: clean })
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500)
  }
})

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}
