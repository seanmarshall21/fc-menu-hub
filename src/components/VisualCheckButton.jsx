import { useState } from 'react'
import { supabase } from '@/lib/supabase'

// Runs an AI vision pass over the menu's rendered preview PNG (from Figma sync)
// to catch print-blocking visual problems before export.
// Props: imageUrl (menu.preview_image_url), items, menuName
export default function VisualCheckButton({ imageUrl, items, menuName }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)   // { findings } | { error }
  const hasImage = !!imageUrl

  async function run() {
    setBusy(true); setResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('visual-check', {
        body: { imageUrl, items, menuName },
      })
      if (error) setResult({ error: error.message })
      else setResult(data)
    } catch (e) {
      setResult({ error: String(e?.message || e) })
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-2">
      <button onClick={run} disabled={busy || !hasImage}
        className="btn-secondary btn-sm gap-1.5 inline-flex items-center whitespace-nowrap disabled:opacity-50"
        title={hasImage ? 'AI checks the rendered preview for print problems' : 'Sync to Figma first to generate a preview image'}>
        <svg className="w-3.5 h-3.5 text-purple-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5L13 3z" /></svg>
        {busy ? 'Checking…' : 'Visual check'}
      </button>
      {result?.error && <p className="text-xs text-red-600">{result.error}</p>}
      {result?.findings && (
        result.findings.length === 0 ? (
          <p className="text-xs text-emerald-700">✓ Looks clean — no visual issues spotted.</p>
        ) : (
          <ul className="space-y-1">
            {result.findings.map((f, i) => (
              <li key={i} className={`text-xs px-2 py-1 rounded ${f.severity === 'high' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
                {f.severity === 'high' ? '⚠ ' : '• '}{f.message}
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  )
}
