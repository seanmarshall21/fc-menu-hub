import { supabase } from '@/lib/supabase'

// Voice + input preferences for the assistant. Shared by the drawer and the
// Profile settings panel. Persisted per user in localStorage.
export const VOICE_OPTIONS = [
  { value: 'eleven', label: 'My voice (cloned)' },
  { value: 'google:en-US-Neural2-J', label: 'Google · Jordan (M)' },
  { value: 'google:en-US-Neural2-D', label: 'Google · Dylan (M)' },
  { value: 'google:en-US-Neural2-F', label: 'Google · Fiona (F)' },
  { value: 'google:en-US-Neural2-C', label: 'Google · Clara (F)' },
  { value: 'browser', label: 'Browser (offline)' },
]
export const INPUT_MODES = [
  { value: 'listening', label: 'Listening', hint: 'Tap once; it stops when you stop talking.' },
  { value: 'tap', label: 'Tap to talk', hint: 'Tap to start, tap again to stop.' },
  { value: 'text', label: 'Text only', hint: 'Hide the mic; type your messages.' },
]
export const PAUSE_OPTIONS = [
  { value: 0.8, label: 'Quick (0.8s)' },
  { value: 1.2, label: 'Normal (1.2s)' },
  { value: 2.0, label: 'Relaxed (2s)' },
]
const DEFAULTS = { voice: 'eleven', inputMode: 'tap', pause: 1.2 }

function key(uid) { return `assistantSettings:${uid || 'anon'}` }
export function loadAssistantSettings(uid) {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(key(uid)) || '{}') } } catch { return { ...DEFAULTS } }
}
export function saveAssistantSettings(uid, s) {
  try { localStorage.setItem(key(uid), JSON.stringify(s)) } catch (_) {}
}

export function speakBrowser(text) {
  try { window.speechSynthesis?.cancel(); window.speechSynthesis?.speak(new SpeechSynthesisUtterance(text)) } catch (_) {}
}

// Speak `text` using the chosen voice. Pass a shared (gesture-primed) <audio>
// element so playback isn't blocked on iOS. Falls back to the browser voice.
export async function speakWith(text, voice, audioEl) {
  if (voice === 'browser') { speakBrowser(text); return }
  const body = { text }
  if (typeof voice === 'string' && voice.indexOf('google:') === 0) { body.provider = 'google'; body.voice = voice.slice(7) }
  else body.provider = 'elevenlabs'
  try {
    const { data, error } = await supabase.functions.invoke('tts', { body })
    if (!error && data?.audio) {
      const a = audioEl || new Audio()
      try { a.pause() } catch (_) {}
      a.src = 'data:audio/mp3;base64,' + data.audio
      await a.play()
      return
    }
  } catch (_) { /* fall through */ }
  speakBrowser(text)
}
