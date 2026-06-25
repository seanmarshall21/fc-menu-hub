import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import DOMPurify from 'dompurify'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { format } from 'date-fns'

const ALLOWED = { ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'a', 'ul', 'ol', 'li', 'br', 'p', 'div', 'code', 'span', 'hr'], ALLOWED_ATTR: ['href', 'target', 'rel'] }
const EMOJIS = ['😀', '😂', '🙂', '😉', '😍', '😎', '🤔', '😅', '😭', '😱', '👍', '👎', '👏', '🙌', '🙏', '💪', '🔥', '✨', '🎉', '✅', '❌', '⚠️', '❤️', '💯', '👀', '🍻', '🍸', '🍹', '🍔', '🌮', '⭐', '🚩', '📌', '💬', '🤝', '🫶']
const REACTIONS = ['👍', '❤️', '😂', '🎉', '👀', '🙏', '🔥', '✅']

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function formatMessage(text) {
  let h = escapeHtml(text)
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>')
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  h = h.replace(/(^|\s)\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  h = h.replace(/(^|\s)_([^_\s][^_]*)_/g, '$1<em>$2</em>')
  h = h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>')
  return h.replace(/\n/g, '<br>')
}
function renderBody(body) {
  if (!body) return ''
  const html = /<[a-z][\s\S]*>/i.test(body) ? body : formatMessage(body)
  return DOMPurify.sanitize(html, ALLOWED)
}
function htmlIsEmpty(html) { return !String(html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() }

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

function ToolBtn({ onClick, title, children }) {
  return (
    <button type="button" title={title} onMouseDown={e => e.preventDefault()} onClick={onClick}
      className="w-7 h-7 rounded hover:bg-surface-100 text-ink-600 inline-flex items-center justify-center text-sm">
      {children}
    </button>
  )
}

// Collapses bodies taller than ~8 lines behind an "Expand post" toggle.
function RichBody({ html, className = '' }) {
  const ref = useRef(null)
  const [expanded, setExpanded] = useState(false)
  const [overflow, setOverflow] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    setOverflow(el.scrollHeight > el.clientHeight + 4)
  }, [html])
  return (
    <div>
      <div ref={ref} className={`activity-body ${className} ${expanded ? '' : 'max-h-[11rem] overflow-hidden'}`}
        dangerouslySetInnerHTML={{ __html: renderBody(html) }} />
      {overflow && (
        <button onClick={() => setExpanded(e => !e)}
          className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-brand-700 bg-brand-50 border border-brand-200 rounded-full px-2 py-0.5 hover:bg-brand-100">
          {expanded ? 'Show less' : 'Expand post'}
          <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
        </button>
      )}
    </div>
  )
}

// Reusable rich composer: toolbar, emoji, attachments, @mentions.
function Composer({ ctx, onSubmit, placeholder = 'Write a message…', initialHtml = '', submitLabel = 'Post', onCancel, autoFocus }) {
  const { users, scopeType, scopeId } = ctx
  const [editorEmpty, setEditorEmpty] = useState(!initialHtml)
  const [mentions, setMentions] = useState(() => new Set())
  const [showTag, setShowTag] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [uploading, setUploading] = useState(false)
  const [posting, setPosting] = useState(false)
  const editorRef = useRef(null)
  const fileRef = useRef(null)

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = initialHtml || ''
      setEditorEmpty(htmlIsEmpty(initialHtml))
      if (autoFocus) editorRef.current.focus()
    }
  }, []) // eslint-disable-line

  function exec(cmd, val) {
    editorRef.current?.focus()
    document.execCommand(cmd, false, val)
    setEditorEmpty(htmlIsEmpty(editorRef.current?.innerHTML || ''))
  }
  function addLink() { const url = prompt('Link URL:'); if (url) exec('createLink', /^https?:\/\//i.test(url) ? url : 'https://' + url) }
  function addMention(u) { setMentions(p => new Set(p).add(u.id)); exec('insertText', '@' + (u.full_name || u.email) + ' '); setShowTag(false) }

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
    if (files.length) { e.preventDefault(); uploadFiles(files); return }
    const text = e.clipboardData?.getData('text/plain')
    if (text != null) { e.preventDefault(); document.execCommand('insertText', false, text); setEditorEmpty(htmlIsEmpty(editorRef.current?.innerHTML || '')) }
  }

  async function submit() {
    const html = editorRef.current?.innerHTML || ''
    if (htmlIsEmpty(html) && attachments.length === 0) return
    setPosting(true)
    const ok = await onSubmit(htmlIsEmpty(html) ? '' : html, mentions, attachments)
    setPosting(false)
    if (ok !== false) {
      setMentions(new Set()); setAttachments([]); setShowTag(false); setShowEmoji(false)
      if (editorRef.current) { editorRef.current.innerHTML = ''; setEditorEmpty(true) }
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-0.5 flex-wrap">
        <ToolBtn onClick={() => exec('bold')} title="Bold"><span className="font-bold">B</span></ToolBtn>
        <ToolBtn onClick={() => exec('italic')} title="Italic"><span className="italic font-serif">I</span></ToolBtn>
        <ToolBtn onClick={() => exec('underline')} title="Underline"><span className="underline">U</span></ToolBtn>
        <ToolBtn onClick={() => exec('strikeThrough')} title="Strikethrough"><span className="line-through">S</span></ToolBtn>
        <span className="w-px h-4 bg-surface-200 mx-1" />
        <ToolBtn onClick={addLink} title="Link">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 10-5.656-5.656l-1.1 1.1" /></svg>
        </ToolBtn>
        <ToolBtn onClick={() => exec('insertOrderedList')} title="Numbered list">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7 6h13M7 12h13M7 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
        </ToolBtn>
        <ToolBtn onClick={() => exec('insertUnorderedList')} title="Bulleted list">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </ToolBtn>
        <ToolBtn onClick={() => exec('insertHorizontalRule')} title="Divider">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16" /><path strokeLinecap="round" d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 16h.01M10 16h.01M14 16h.01M18 16h.01" /></svg>
        </ToolBtn>
        <span className="w-px h-4 bg-surface-200 mx-1" />
        <div className="relative">
          <ToolBtn onClick={() => setShowEmoji(s => !s)} title="Emoji"><span className="text-base leading-none">🙂</span></ToolBtn>
          {showEmoji && (
            <div className="absolute bottom-full mb-1 right-0 z-20 bg-white border border-surface-200 rounded-lg shadow-lg p-2 w-[232px] grid grid-cols-8 gap-0.5">
              {EMOJIS.map(em => (
                <button key={em} type="button" onMouseDown={e => e.preventDefault()}
                  onClick={() => { exec('insertText', em); setShowEmoji(false) }}
                  className="w-6 h-6 rounded hover:bg-surface-100 text-base leading-none">{em}</button>
              ))}
            </div>
          )}
        </div>
        <ToolBtn onClick={() => fileRef.current?.click()} title="Attach image or file">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
        </ToolBtn>
        <input ref={fileRef} type="file" multiple className="hidden"
          onChange={e => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value = '' }} />
        {uploading && <span className="text-[11px] text-ink-400 ml-1">Uploading…</span>}
      </div>
      <div ref={editorRef} contentEditable suppressContentEditableWarning
        onInput={() => setEditorEmpty(htmlIsEmpty(editorRef.current?.innerHTML || ''))}
        onPaste={onPaste} data-placeholder={placeholder}
        className="rich-editor input w-full text-sm min-h-[64px] overflow-y-auto resize-y" />
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
            <div className="absolute bottom-full mb-1 left-0 z-20 bg-white border border-surface-200 rounded-lg shadow-lg py-1 max-h-48 overflow-y-auto min-w-[180px]">
              {users.map(u => (
                <button key={u.id} onClick={() => addMention(u)}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-surface-50 ${mentions.has(u.id) ? 'text-brand-700 font-medium' : 'text-ink-700'}`}>
                  {mentions.has(u.id) ? '✓ ' : ''}{u.full_name || u.email}
                </button>
              ))}
            </div>
          )}
        </div>
        {onCancel && <button onClick={onCancel} className="btn-secondary btn-sm">Cancel</button>}
        <button onClick={submit} disabled={posting || uploading || (editorEmpty && attachments.length === 0)} className="btn-primary btn-sm ml-auto disabled:opacity-50">
          {posting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </div>
  )
}

// Reaction chips + an add-reaction picker.
function ReactionBar({ ctx, m }) {
  const [show, setShow] = useState(false)
  const groups = ctx.reactionsFor(m.id)
  return (
    <div className="flex items-center gap-1 flex-wrap mt-1.5">
      {groups.map(g => (
        <button key={g.emoji} onClick={() => ctx.onReact(m.id, g.emoji)}
          className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border ${g.mine ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-surface-200 bg-white text-ink-600'} hover:border-brand-300`}>
          <span className="leading-none">{g.emoji}</span> {g.count}
        </button>
      ))}
      <div className="relative">
        <button onClick={() => setShow(s => !s)} title="React" className="w-6 h-6 rounded-full border border-surface-200 text-ink-400 hover:text-ink-700 hover:border-brand-300 inline-flex items-center justify-center text-xs">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </button>
        {show && (
          <div className="absolute bottom-full mb-1 left-0 z-20 bg-white border border-surface-200 rounded-lg shadow-lg p-1.5 flex gap-0.5">
            {REACTIONS.map(em => (
              <button key={em} onClick={() => { ctx.onReact(m.id, em); setShow(false) }}
                className="w-7 h-7 rounded hover:bg-surface-100 text-base leading-none">{em}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// One message, used both in the feed (with thread affordance) and inside a thread.
function MessageItem({ ctx, m, replyCount = 0, isReply = false }) {
  const mine = m.user_id === ctx.uid
  const resolved = !!m.resolved_at
  const editing = ctx.editingId === m.id

  if (editing) {
    return (
      <div className="rounded-lg border border-brand-200 p-3">
        <Composer ctx={ctx} initialHtml={m.body} submitLabel="Save" autoFocus
          onSubmit={(html, mentions) => ctx.onSaveEdit(m.id, html, mentions)} onCancel={() => ctx.setEditingId(null)} />
      </div>
    )
  }

  return (
    <div className={`rounded-lg border p-3 ${m.priority ? 'border-red-200 bg-red-50/50' : m.pinned ? 'border-amber-200 bg-amber-50/40' : 'border-surface-200'} ${resolved ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span className={`font-medium text-ink-900 ${isReply ? 'text-[13px]' : 'text-sm'}`}>{ctx.nameOf(m.user_id)}</span>
        <span className="text-[11px] text-ink-400">{format(new Date(m.created_at), 'MMM d, h:mma')}</span>
        {m.edited_at && <span className="text-[10px] text-ink-300">(edited)</span>}
        {m.priority && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">PRIORITY</span>}
        {m.pinned && !m.priority && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">PINNED</span>}
        {resolved && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">resolved</span>}
      </div>
      {m.body && <RichBody html={m.body} className={`text-ink-700 leading-relaxed ${isReply ? 'text-[13px]' : 'text-sm'}`} />}
      <Attachments list={m.attachments} />
      {Array.isArray(m.mentions) && m.mentions.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {m.mentions.map(id => <span key={id} className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700">@{ctx.nameOf(id)}</span>)}
        </div>
      )}
      <ReactionBar ctx={ctx} m={m} />
      <div className="flex items-center gap-3 mt-1.5 text-[11px]">
        {!isReply && (
          <button onClick={() => ctx.onOpenThread(m.id)} className="text-ink-500 hover:text-brand-600 font-medium">
            {replyCount > 0 ? `${replyCount} repl${replyCount === 1 ? 'y' : 'ies'}` : 'Reply'}
          </button>
        )}
        {mine && <button onClick={() => ctx.setEditingId(m.id)} className="text-ink-500 hover:text-brand-600">Edit</button>}
        {ctx.canModerate && (
          <>
            <button onClick={() => ctx.onPatch(m.id, m.resolved_at ? { resolved_at: null, resolved_by: null } : { resolved_at: new Date().toISOString(), resolved_by: ctx.uid })}
              className="text-ink-500 hover:text-emerald-700">{resolved ? 'Reopen' : 'Resolve'}</button>
            {!isReply && <button onClick={() => ctx.onPatch(m.id, { priority: !m.priority, pinned: m.priority ? m.pinned : true })} className="text-ink-500 hover:text-red-600">{m.priority ? 'Clear priority' : 'Priority'}</button>}
            {!isReply && <button onClick={() => ctx.onPatch(m.id, { pinned: !m.pinned })} className="text-ink-500 hover:text-amber-700">{m.pinned ? 'Unpin' : 'Pin'}</button>}
          </>
        )}
        {(mine || ctx.canModerate) && <button onClick={() => ctx.onRemove(m.id)} className="text-ink-400 hover:text-red-600 ml-auto">Delete</button>}
      </div>
    </div>
  )
}

// Collapsible right-side activity / chat drawer for a menu or event.
// Props: scopeType ('menu'|'event'), scopeId, open, onClose, title
export default function ActivityDrawer({ scopeType, scopeId, open, onClose, title }) {
  const { session, profile } = useAuth()
  const uid = session?.user?.id
  const canModerate = profile?.role === 'admin' || profile?.role === 'internal'

  const [messages, setMessages] = useState([])
  const [reactionRows, setReactionRows] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [threadId, setThreadId] = useState(null)   // open thread (parent id)
  const [editingId, setEditingId] = useState(null)
  const [width, setWidth] = useState(() => Number(localStorage.getItem('activityWidth')) || 380)
  const bottomRef = useRef(null)

  const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users])
  const nameOf = (id) => { const u = userMap.get(id); return u ? (u.full_name || u.email) : 'Someone' }

  const load = useCallback(async () => {
    if (!scopeId) return
    const { data } = await supabase.from('activity_messages')
      .select('*').eq('scope_type', scopeType).eq('scope_id', scopeId)
      .order('created_at', { ascending: true })
    const msgs = data || []
    setMessages(msgs)
    const ids = msgs.map(m => m.id)
    if (ids.length) {
      const { data: rx } = await supabase.from('activity_reactions').select('*').in('message_id', ids)
      setReactionRows(rx || [])
    } else setReactionRows([])
    setLoading(false)
  }, [scopeType, scopeId])

  useEffect(() => {
    if (!open) return
    setLoading(true); setThreadId(null); setEditingId(null)
    load()
    ;(async () => { const { data } = await supabase.rpc('list_taggable_users'); setUsers(data || []) })()
  }, [open, load])

  function startResize(e) {
    e.preventDefault()
    let latest = width
    const move = (ev) => { latest = Math.min(760, Math.max(320, window.innerWidth - ev.clientX)); setWidth(latest) }
    const up = () => {
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up)
      document.body.style.userSelect = ''; localStorage.setItem('activityWidth', String(latest))
    }
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up)
  }

  async function postMessage(parentId, html, mentions, attachments) {
    const { error } = await supabase.from('activity_messages').insert({
      scope_type: scopeType, scope_id: scopeId, parent_id: parentId || null,
      user_id: uid, body: html, mentions: [...mentions], attachments,
    })
    if (error) { alert(error.message); return false }
    await load()
    if (!parentId) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    return true
  }
  async function saveEdit(id, html, mentions) {
    await supabase.from('activity_messages').update({ body: html, mentions: [...mentions], edited_at: new Date().toISOString() }).eq('id', id)
    setEditingId(null); await load(); return true
  }
  async function patch(id, fields) { await supabase.from('activity_messages').update(fields).eq('id', id); load() }
  async function remove(id) {
    if (!confirm('Delete this message and its replies?')) return
    await supabase.from('activity_messages').delete().eq('id', id)
    if (id === threadId) setThreadId(null)
    load()
  }
  async function onReact(messageId, emoji) {
    const mine = reactionRows.some(r => r.message_id === messageId && r.emoji === emoji && r.user_id === uid)
    if (mine) await supabase.from('activity_reactions').delete().match({ message_id: messageId, user_id: uid, emoji })
    else await supabase.from('activity_reactions').insert({ message_id: messageId, user_id: uid, emoji })
    const ids = messages.map(m => m.id)
    const { data: rx } = await supabase.from('activity_reactions').select('*').in('message_id', ids)
    setReactionRows(rx || [])
  }
  function reactionsFor(messageId) {
    const map = new Map()
    for (const r of reactionRows) {
      if (r.message_id !== messageId) continue
      if (!map.has(r.emoji)) map.set(r.emoji, { emoji: r.emoji, count: 0, mine: false })
      const g = map.get(r.emoji); g.count++; if (r.user_id === uid) g.mine = true
    }
    return [...map.values()]
  }

  const ctx = { uid, canModerate, nameOf, users, scopeType, scopeId, onReact, reactionsFor, onPatch: patch, onRemove: remove, onOpenThread: setThreadId, editingId, setEditingId, onSaveEdit: saveEdit }

  const tops = messages.filter(m => !m.parent_id)
  const repliesOf = (id) => messages.filter(m => m.parent_id === id)
  const sortedTops = [...tops].sort((a, b) => {
    const ap = (a.priority ? 2 : 0) + (a.pinned ? 1 : 0)
    const bp = (b.priority ? 2 : 0) + (b.pinned ? 1 : 0)
    if (ap !== bp) return bp - ap
    return new Date(b.created_at) - new Date(a.created_at)   // newest first
  })
  const threadParent = threadId ? messages.find(m => m.id === threadId) : null
  const threadReplies = threadId ? repliesOf(threadId) : []

  return createPortal(
    <>
      {/* Mobile backdrop — tap to dismiss. Desktop keeps the page usable alongside. */}
      <div onClick={onClose} className={`sm:hidden fixed inset-0 bg-black/40 z-[110] transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} />
      <div style={{ width }} className={`fixed top-0 right-0 h-full max-w-[100vw] max-sm:!w-full bg-white border-l border-surface-200 shadow-2xl z-[120] flex flex-col transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
      <div onMouseDown={startResize} title="Drag to resize" className="hidden sm:block absolute left-0 top-0 h-full w-1.5 -ml-0.5 cursor-ew-resize hover:bg-brand-300/60 z-10" />
      {/* Collapse handle — sticks out on the drawer's left edge, mirrors the
          floating open tab so the panel reads as a slide-out. Only when open
          (otherwise the off-screen panel's handle peeks at the right edge). */}
      <button onClick={onClose} title="Collapse" aria-label="Collapse activity"
        className={`absolute left-0 top-[88px] -translate-x-full items-center justify-center bg-brand-600 hover:bg-brand-700 text-white rounded-l-xl shadow-lg py-2.5 pl-3 pr-2.5 ${open ? 'hidden sm:flex' : 'hidden'}`}>
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
      </button>

      <div className="px-4 py-3 border-b border-surface-200 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {threadParent && (
            <button onClick={() => setThreadId(null)} className="text-ink-400 hover:text-ink-700 p-1 -ml-1" title="Back">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
          )}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink-900">{threadParent ? 'Thread' : 'Activity'}</h2>
            {title && <p className="text-[11px] text-ink-400 truncate max-w-[240px]">{title}</p>}
          </div>
        </div>
        <button onClick={onClose} className="text-ink-400 hover:text-ink-700 p-1" title="Close">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loading ? (
          <p className="text-sm text-ink-400">Loading…</p>
        ) : threadParent ? (
          <>
            <MessageItem ctx={ctx} m={threadParent} replyCount={threadReplies.length} />
            <div className="pl-3 border-l-2 border-surface-100 space-y-2">
              {threadReplies.length === 0
                ? <p className="text-xs text-ink-400 italic">No replies yet.</p>
                : threadReplies.map(r => <MessageItem key={r.id} ctx={ctx} m={r} isReply />)}
            </div>
          </>
        ) : sortedTops.length === 0 ? (
          <p className="text-sm text-ink-400 italic">No activity yet. Start the conversation below.</p>
        ) : (
          sortedTops.map(m => <MessageItem key={m.id} ctx={ctx} m={m} replyCount={repliesOf(m.id).length} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer — posts a reply when inside a thread, otherwise a new message */}
      <div className="border-t border-surface-200 p-3">
        {threadParent
          ? <Composer ctx={ctx} placeholder="Reply…" submitLabel="Reply" onSubmit={(h, m, a) => postMessage(threadId, h, m, a)} />
          : <Composer ctx={ctx} onSubmit={(h, m, a) => postMessage(null, h, m, a)} />}
      </div>
      </div>
    </>,
    document.body
  )
}
