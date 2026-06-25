import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// Activity toggle button with an unread indicator. "Seen" is tracked per
// scope in localStorage; a red dot shows when there's activity from someone
// else newer than the last time this user opened the drawer.
export default function ActivityButton({ scopeType, scopeId, open, onOpen, className = '' }) {
  const { session } = useAuth()
  const uid = session?.user?.id
  const key = `activitySeen:${scopeType}:${scopeId}`
  const [unread, setUnread] = useState(false)

  const check = useCallback(async () => {
    if (!scopeId) return
    const since = localStorage.getItem(key)
    const { data } = await supabase.from('activity_messages')
      .select('created_at, user_id')
      .eq('scope_type', scopeType).eq('scope_id', scopeId)
      .order('created_at', { ascending: false }).limit(30)
    const u = (data || []).some(m => m.user_id !== uid && (!since || new Date(m.created_at) > new Date(since)))
    setUnread(u)
  }, [scopeType, scopeId, uid, key])

  useEffect(() => { check() }, [check])
  // Mark seen on open; re-check after it closes (in case others posted).
  useEffect(() => {
    if (open) { localStorage.setItem(key, new Date().toISOString()); setUnread(false) }
    else check()
  }, [open]) // eslint-disable-line

  return (
    <button onClick={onOpen} title="Activity & feedback"
      className={`btn-secondary btn-sm gap-1.5 inline-flex items-center whitespace-nowrap relative ${className}`}>
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.83L3 20l1.17-3.5A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
      Activity
      {unread && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white" />}
    </button>
  )
}
