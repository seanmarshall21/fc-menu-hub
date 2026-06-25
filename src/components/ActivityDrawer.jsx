import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { format } from 'date-fns'

// Lightweight, safe markdown → HTML for message bodies. Escapes first, then
// applies a small set of formatting (bold/italic/code/links/line breaks).
function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function formatMessage(text) {
  let h = escapeHtml(text)
  h = h.replace(/`([^`]+)`/g, '<code class="bg-surface-100 px-1 rounded text-[12px]">$1</code>')
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  h = h.replace(/(^|\s)\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  h = h.replace(/(^|\s)_([^_\s][^_]*)_/g, '$1<em>$2</em>')
  h = h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer" class="text-brand-600 underline">$1</a>')
  return h.replace(/\n/g, '<br>')
}

function Attachments({ list }) {
  if (!Array.isArray(list) || !list.length) return null
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {list.map((a, i) => (a.type || '').startsWith('image/') ? (
        <a key={i} href={a.url} target="_blank" rel="noreferrer" className="block">
          <img src={a.url} alt={a.name} className="max-h-32 rounded-lg border border-surface-200" />
        </a>
      ) : (
        <a key={i} href={a.url} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-surface-50 border border-surface-200 text-ink-700 hover:bg-surface-100">
          📎 <span className="truncate max-w-[160px]">{a.name}</span>
        </a>
      ))}
    </div>
  )
}

// Collapsible right-side activity / chat drawer for a menu or event. Threaded
// messages with @mentions, pin, high-priority, resolve, and delete. Absorbs the
// old feedback thread (migrated into activity_messages).
//
// Props: scopeType ('menu'|'event'), scopeId, open, onClose, title

export default function ActivityDrawer({ scopeType, scopeId, open, onClose, title }) {
  const { session, profile } = useAuth()
  const uid = session?.user?.id
  const canModerate = profile?.role === 'admin' || profile?.role === 'internal'

  const [messages, setMessages] = useState([])
  const [users, setUsers] = useState([])           // taggable users
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [mentions, setMentions] = useState(() => new Set())
  const [showTag, setShowTag] = useState(false)
  const [replyTo, setReplyTo] = useState(null)
  const [posting, setPosting] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [uploading, setUploading] = useState(false)
  const bottomRef = useRef(null)
  const taRef = useRef(null)
  const fileRef = useRef(null)

  const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users])
  const nameOf = (id) => { const u = userMap.get(id); return u ? (u.full_name || u.email) : 'Someone' }

  const load = useCallback(async () => {
    if (!scopeId) return
    setLoading(true)
    const { data } = await supabase.from('activity_messages')
      .select('*').eq('scope_type', scopeType).eq('scope_id', scopeId)
      .order('created_at', { ascending: true })
    setMessages(data || [])
    setLoading(false)
  }, [scopeType, scopeId])

  useEffect(() => {
    if (!open) return
    load()
    ;(async () => { const { data } = await supabase.rpc('list_taggable_users'); setUsers(data || []) })()
  }, [open, load])

  async function post(parentId) {
    const text = body.trim()
    if (!text && attachments.length === 0) return
    setPosting(true)
    const { error } = await supabase.from('activity_messages').insert({
      scope_type: scopeType, scope_id: scopeId, parent_id: parentId || null,
      user_id: uid, body: text, mentions: [...mentions], attachments,
    })
    setPosting(false)
    if (error) { alert(error.message); return }
    setBody(''); setMentions(new Set()); setShowTag(false); setReplyTo(null); setAttachments([])
    await load()
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  // Upload images/files to storage and stage them on the next message.
  async function uploadFiles(fileList) {
    const files = [...fileList].filter(Boolean)
    if (!files.length) return
    setUploading(true)
    const done = []
    for (const file of files) {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${scopeType}/${scopeId}/${Date.now()}-${safe}`
      const { error } = await supabase.storage.from('activity-attachments').upload(path, file, { upsert: false })
      if (!error) {
        const { data } = supabase.storage.from('activity-attachments').getPublicUrl(path)
        done.push({ url: data.publicUrl, name: file.name, type: file.type, size: file.size })
      }
    }
    setUploading(false)
    setAttachments(prev => [...prev, ...done])
  }
  function onPaste(e) {
    const items = e.clipboardData?.items || []
    const files = []
    for (const it of items) { if (it.kind === 'file') { const f = it.getAsFile(); if (f) files.push(f) } }
    if (files.length) { e.preventDefault(); uploadFiles(files) }
  }
  // Wrap the textarea selection with markdown markers (bold/italic).
  function wrap(before, after) {
    const ta = taRef.current; if (!ta) return
    const s = ta.selectionStart, e = ta.selectionEnd
    const next = body.slice(0, s) + before + body.slice(s, e) + after + body.slice(e)
    setBody(next)
    setTimeout(() => { ta.focus(); ta.selectionStart = s + before.length; ta.selectionEnd = e + before.length }, 0)
  }

  async function patch(id, fields) { await supabase.from('activity_messages').update(fields).eq('id', id); load() }
  async function remove(id) { if (!confirm('Delete this message and its replies?')) return; await supabase.from('activity_messages').delete().eq('id', id); load() }

  function toggleMention(id) {
    setMentions(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const tops = messages.filter(m => !m.parent_id)
  const repliesOf = (id) => messages.filter(m => m.parent_id === id)
  // Pinned / priority first, then chronological.
  const sortedTops = [...tops].sort((a, b) => {
    const ap = (a.priority ? 2 : 0) + (a.pinned ? 1 : 0)
    const bp = (b.priority ? 2 : 0) + (b.pinned ? 1 : 0)
    if (ap !== bp) return bp - ap
    return new Date(a.created_at) - new Date(b.created_at)
  })

  if (!open) return null

  return (
    <div className="fixed top-0 right-0 h-full w-full sm:w-[380px] bg-white border-l border-surface-200 shadow-2xl z-40 flex flex-col">
      <div className="px-4 py-3 border-b border-surface-200 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink-900">Activity</h2>
          {title && <p className="text-[11px] text-ink-400 truncate max-w-[260px]">{title}</p>}
        </div>
        <button onClick={onClose} className="text-ink-400 hover:text-ink-700 p-1" title="Close">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loading ? (
          <p className="text-sm text-ink-400">Loading…</p>
        ) : sortedTops.length === 0 ? (
          <p className="text-sm text-ink-400 italic">No activity yet. Start the conversation below.</p>
        ) : sortedTops.map(m => (
          <MessageRow key={m.id} m={m} replies={repliesOf(m.id)} uid={uid} canModerate={canModerate}
            nameOf={nameOf} onPatch={patch} onRemove={remove}
            onReply={() => setReplyTo(replyTo === m.id ? null : m.id)} replyOpen={replyTo === m.id}
            replyBody={body} setReplyBody={setBody} onPostReply={() => post(m.id)} posting={posting} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Composer (top-level when not replying) */}
      {replyTo === null && (
        <div className="border-t border-surface-200 p-3 space-y-2">
          {mentions.size > 0 && (
            <div className="flex flex-wrap gap-1">
              {[...mentions].map(id => (
                <span key={id} className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700">@{nameOf(id)}</span>
              ))}
            </div>
          )}
          {/* Format toolbar */}
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => wrap('**', '**')} className="w-7 h-7 rounded hover:bg-surface-100 text-ink-600 font-bold text-sm" title="Bold">B</button>
            <button type="button" onClick={() => wrap('*', '*')} className="w-7 h-7 rounded hover:bg-surface-100 text-ink-600 italic text-sm" title="Italic">i</button>
            <button type="button" onClick={() => wrap('`', '`')} className="w-7 h-7 rounded hover:bg-surface-100 text-ink-500 font-mono text-xs" title="Code">{'</>'}</button>
            <button type="button" onClick={() => fileRef.current?.click()} className="w-7 h-7 rounded hover:bg-surface-100 text-ink-600 flex items-center justify-center" title="Attach image or file">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
            </button>
            <input ref={fileRef} type="file" multiple className="hidden"
              onChange={e => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value = '' }} />
            {uploading && <span className="text-[11px] text-ink-400">Uploading…</span>}
          </div>
          <textarea ref={taRef} value={body} onChange={e => setBody(e.target.value)} onPaste={onPaste} rows={2}
            placeholder="Write a message…  (paste a screenshot, **bold**, *italic*)" className="input w-full resize-y text-sm" />
          {/* Staged attachments preview */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((a, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-surface-50 border border-surface-200">
                  {(a.type || '').startsWith('image/') ? '🖼' : '📎'} <span className="truncate max-w-[120px]">{a.name}</span>
                  <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} className="text-ink-400 hover:text-red-600 ml-0.5">×</button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="relative">
              <button onClick={() => setShowTag(s => !s)} className="btn-secondary btn-sm whitespace-nowrap">@ Tag</button>
              {showTag && (
                <div className="absolute bottom-full mb-1 left-0 z-10 bg-white border border-surface-200 rounded-lg shadow-lg py-1 max-h-48 overflow-y-auto min-w-[180px]">
                  {users.map(u => (
                    <button key={u.id} onClick={() => toggleMention(u.id)}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-surface-50 ${mentions.has(u.id) ? 'text-brand-700 font-medium' : 'text-ink-700'}`}>
                      {mentions.has(u.id) ? '✓ ' : ''}{u.full_name || u.email}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => post(null)} disabled={posting || uploading || (!body.trim() && attachments.length === 0)} className="btn-primary btn-sm ml-auto disabled:opacity-50">
              {posting ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function MessageRow({ m, replies, uid, canModerate, nameOf, onPatch, onRemove, onReply, replyOpen, replyBody, setReplyBody, onPostReply, posting }) {
  const mine = m.user_id === uid
  const resolved = !!m.resolved_at
  return (
    <div className={`rounded-lg border p-3 ${m.priority ? 'border-red-200 bg-red-50/50' : m.pinned ? 'border-amber-200 bg-amber-50/40' : 'border-surface-200'} ${resolved ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span className="text-sm font-medium text-ink-900">{nameOf(m.user_id)}</span>
        <span className="text-[11px] text-ink-400">{format(new Date(m.created_at), 'MMM d, h:mma')}</span>
        {m.priority && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">PRIORITY</span>}
        {m.pinned && !m.priority && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">PINNED</span>}
        {resolved && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">resolved</span>}
      </div>
      {m.body && <div className="text-sm text-ink-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: formatMessage(m.body) }} />}
      <Attachments list={m.attachments} />
      {Array.isArray(m.mentions) && m.mentions.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {m.mentions.map(id => <span key={id} className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700">@{nameOf(id)}</span>)}
        </div>
      )}
      <div className="flex items-center gap-3 mt-1.5 text-[11px]">
        <button onClick={onReply} className="text-ink-500 hover:text-brand-600">Reply</button>
        {canModerate && (
          <>
            <button onClick={() => onPatch(m.id, m.resolved_at ? { resolved_at: null, resolved_by: null } : { resolved_at: new Date().toISOString(), resolved_by: uid })}
              className="text-ink-500 hover:text-emerald-700">{resolved ? 'Reopen' : 'Resolve'}</button>
            <button onClick={() => onPatch(m.id, { priority: !m.priority, pinned: m.priority ? m.pinned : true })}
              className="text-ink-500 hover:text-red-600">{m.priority ? 'Clear priority' : 'Priority'}</button>
            <button onClick={() => onPatch(m.id, { pinned: !m.pinned })} className="text-ink-500 hover:text-amber-700">{m.pinned ? 'Unpin' : 'Pin'}</button>
          </>
        )}
        {(mine || canModerate) && <button onClick={() => onRemove(m.id)} className="text-ink-400 hover:text-red-600 ml-auto">Delete</button>}
      </div>

      {/* Replies */}
      {replies.length > 0 && (
        <div className="mt-2 pl-3 border-l-2 border-surface-100 space-y-2">
          {replies.map(r => (
            <div key={r.id} className="text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-ink-800 text-[13px]">{nameOf(r.user_id)}</span>
                <span className="text-[10px] text-ink-400">{format(new Date(r.created_at), 'MMM d, h:mma')}</span>
                {(r.user_id === uid || canModerate) && <button onClick={() => onRemove(r.id)} className="text-[10px] text-ink-400 hover:text-red-600 ml-auto">Delete</button>}
              </div>
              <div className="text-[13px] text-ink-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: formatMessage(r.body) }} />
              <Attachments list={r.attachments} />
            </div>
          ))}
        </div>
      )}

      {replyOpen && (
        <div className="mt-2 pl-3 space-y-1.5">
          <textarea value={replyBody} onChange={e => setReplyBody(e.target.value)} rows={2} placeholder="Reply…" className="input w-full resize-y text-sm" autoFocus />
          <div className="flex justify-end">
            <button onClick={onPostReply} disabled={posting || !replyBody.trim()} className="btn-primary btn-sm disabled:opacity-50">{posting ? 'Posting…' : 'Reply'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
