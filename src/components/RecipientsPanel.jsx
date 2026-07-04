import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const SHARE_GRADIENT = 'linear-gradient(135deg, #FFD54F 0%, #FFB300 50%, #FB8C00 100%)'
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// Manage a share's recipient list (name + email) and email them the link via
// the send-share-email edge function. The link itself stays public — this is
// for delivery + tracking who it went to. Emails live in a staff-only table.
export default function RecipientsPanel({ shareId, kind }) {
  const [list, setList] = useState([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState(null)

  async function load() {
    const { data } = await supabase.from('menu_share_recipients')
      .select('id, name, email, sent_at').eq('share_id', shareId).order('created_at')
    setList(Array.isArray(data) ? data : [])
  }
  useEffect(() => { if (shareId) load() }, [shareId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function add() {
    const e = email.trim()
    if (!EMAIL_RE.test(e)) { setMsg('Enter a valid email address.'); return }
    setBusy(true)
    const { error } = await supabase.from('menu_share_recipients').insert({ share_id: shareId, name: name.trim() || null, email: e })
    setBusy(false)
    if (error) { setMsg('Could not add: ' + error.message); return }
    setName(''); setEmail(''); setMsg(null); load()
  }
  async function remove(id) { await supabase.from('menu_share_recipients').delete().eq('id', id); load() }
  async function send() {
    if (!list.length) { setMsg('Add at least one recipient first.'); return }
    setSending(true); setMsg(null)
    const { data, error } = await supabase.functions.invoke('send-share-email', { body: { shareId } })
    setSending(false)
    if (error || data?.error) { setMsg('Could not send: ' + (data?.error || error?.message || 'unknown error')); return }
    setMsg(`Emailed ${data.sent}${data.failed ? ` · ${data.failed} failed` : ''}.`); load()
  }

  return (
    <div className="space-y-2.5 border-t border-surface-100 pt-3">
      <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide">Recipients</p>
      {list.length === 0 && (
        <p className="text-xs text-ink-400">No one added yet. The link stays public — adding people just lets you email it to them and track who it went to.</p>
      )}
      {list.map(r => (
        <div key={r.id} className="flex items-center gap-2 text-sm">
          <div className="min-w-0 flex-1 truncate">
            <span className="text-ink-800">{r.name || r.email}</span>
            {r.name && <span className="text-ink-400 ml-1.5 text-xs">{r.email}</span>}
          </div>
          {r.sent_at && <span className="text-[10px] text-emerald-600 font-semibold flex-shrink-0">sent</span>}
          <button onClick={() => remove(r.id)} className="text-ink-300 hover:text-red-500 flex-shrink-0" aria-label="Remove recipient">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" className="input text-xs w-24 flex-shrink-0" />
        <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} placeholder="email@company.com" className="input text-xs flex-1 min-w-0" />
        <button onClick={add} disabled={busy} className="btn-secondary btn-sm flex-shrink-0">Add</button>
      </div>
      {msg && <p className="text-[11px] text-ink-500">{msg}</p>}
      <button onClick={send} disabled={sending || !list.length}
        className="btn-sm w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-black text-xs font-semibold disabled:opacity-50 hover:brightness-105 transition"
        style={{ background: SHARE_GRADIENT }}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
        {sending ? 'Sending…' : `Email the link${list.length ? ` to ${list.length}` : ''}`}
      </button>
    </div>
  )
}
