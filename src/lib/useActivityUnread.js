import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// Tracks whether a scope (menu/event) has activity the current user hasn't seen.
// "Seen" is stored per scope in localStorage; unread = any message from someone
// else newer than the last time the drawer was opened. Pass `open` so it marks
// seen on open and re-checks on close.
export function useActivityUnread(scopeType, scopeId, open) {
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
    setUnread((data || []).some(m => m.user_id !== uid && (!since || new Date(m.created_at) > new Date(since))))
  }, [scopeType, scopeId, uid, key])

  useEffect(() => { check() }, [check])
  useEffect(() => {
    if (open) { localStorage.setItem(key, new Date().toISOString()); setUnread(false) }
    else check()
  }, [open]) // eslint-disable-line

  return unread
}
