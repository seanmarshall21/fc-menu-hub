import { useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  VOICE_OPTIONS, INPUT_MODES, PAUSE_OPTIONS,
  loadAssistantSettings, saveAssistantSettings, speakWith,
} from '@/lib/assistantVoice'

// Profile settings for the ✦ assistant: reply voice, voice-input mode, and the
// pause-before-replying for Listening mode. Persisted per user (localStorage).
export default function AssistantSettings() {
  const { profile } = useAuth()
  const uid = profile?.id
  const [s, setS] = useState(() => loadAssistantSettings(uid))
  const [testing, setTesting] = useState(false)
  const audioRef = useRef(null)

  function update(patch) {
    const next = { ...s, ...patch }
    setS(next); saveAssistantSettings(uid, next)
  }
  async function test() {
    if (!audioRef.current) audioRef.current = new Audio()
    setTesting(true)
    await speakWith('Hey — this is how I’ll sound when I read things back to you.', s.voice, audioRef.current)
    setTesting(false)
  }

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-ink-900 mb-1">Assistant</h2>
      <p className="text-xs text-ink-500 mb-4">How the ✦ Quick-check assistant talks and listens.</p>

      {/* Voice */}
      <label className="text-[11px] font-semibold text-ink-400 uppercase tracking-wide">Reply voice</label>
      <div className="flex items-center gap-2 mt-1">
        <select value={s.voice} onChange={e => update({ voice: e.target.value })} className="input py-1.5 text-sm flex-1">
          {VOICE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button onClick={test} disabled={testing} className="btn-secondary btn-sm whitespace-nowrap flex-shrink-0">
          {testing ? 'Playing…' : 'Test'}
        </button>
      </div>
      <p className="text-[11px] text-ink-400 mt-1">
        Your cloned voice needs the ElevenLabs key set; Google voices need the Google TTS key. Browser voice always works offline.
      </p>

      {/* Voice input mode */}
      <label className="text-[11px] font-semibold text-ink-400 uppercase tracking-wide block mt-4">Voice input</label>
      <div className="flex gap-1.5 mt-1">
        {INPUT_MODES.map(m => (
          <button key={m.value} onClick={() => update({ inputMode: m.value })}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium border whitespace-nowrap ${s.inputMode === m.value ? 'bg-brand-50 border-brand-300 text-brand-700' : 'border-surface-200 text-ink-600 hover:bg-surface-50'}`}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-ink-400 mt-1">{INPUT_MODES.find(m => m.value === s.inputMode)?.hint}</p>

      {/* Pause (Listening only) */}
      {s.inputMode === 'listening' && (
        <div className="mt-4">
          <label className="text-[11px] font-semibold text-ink-400 uppercase tracking-wide">Pause before replying</label>
          <select value={s.pause} onChange={e => update({ pause: Number(e.target.value) })} className="input py-1.5 text-sm w-full mt-1">
            {PAUSE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <p className="text-[11px] text-ink-400 mt-1">How long to wait after you stop talking before it answers.</p>
        </div>
      )}
    </div>
  )
}
