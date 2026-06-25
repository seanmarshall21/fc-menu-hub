import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { format } from 'date-fns'

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
  const bottomRef = useRef(null)

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
    if (!text) return
    setPosting(true)
    const { error } = await supabase.from('activity_messages').insert({
      scope_type: scopeType, scope_id: scopeId, parent_id: parentId || null,
      user_id: uid, body: text, mentions: [...mentions],
    })
    setPosting(false)
    if (error) { alert(error.message); return }
    setBody(''); setMentions(new Set()); setShowTag(false); setReplyTo(null)
    await load()
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
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
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={2}
            placeholder="Write a message…" className="input w-full resize-y text-sm" />
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
            <button onClick={() => post(null)} disabled={posting || !body.trim()} className="btn-primary btn-sm ml-auto disabled:opacity-50">
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
      <p className="text-sm text-ink-700 whitespace-pre-wrap">{m.body}</p>
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
              <p className="text-[13px] text-ink-700 whitespace-pre-wrap">{r.body}</p>
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
