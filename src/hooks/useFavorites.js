import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

/**
 * Returns { favorites, isFavorite, toggle, loading, refetch }.
 * Favorites are scoped to the signed-in user (RLS enforces it server-side too).
 */
export function useFavorites() {
  const { profile } = useAuth()
  const [favorites, setFavorites] = useState([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    if (!profile?.id) { setFavorites([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('favorites')
      .select('id, target_type, target_id, created_at')
      .order('created_at', { ascending: false })
    setFavorites(data || [])
    setLoading(false)
  }, [profile?.id])

  useEffect(() => { refetch() }, [refetch])

  const isFavorite = useCallback(
    (type, id) => favorites.some(f => f.target_type === type && f.target_id === id),
    [favorites]
  )

  const toggle = useCallback(async (type, id) => {
    if (!profile?.id) return
    const existing = favorites.find(f => f.target_type === type && f.target_id === id)
    if (existing) {
      const prev = favorites
      setFavorites(prev.filter(f => f.id !== existing.id))
      const { error } = await supabase.from('favorites').delete().eq('id', existing.id)
      if (error) setFavorites(prev)
    } else {
      const tempId = `temp-${Date.now()}`
      const optimistic = { id: tempId, target_type: type, target_id: id, created_at: new Date().toISOString() }
      setFavorites(prev => [optimistic, ...prev])
      const { data, error } = await supabase
        .from('favorites')
        .insert({ user_id: profile.id, target_type: type, target_id: id })
        .select('id, target_type, target_id, created_at')
        .single()
      if (error || !data) {
        setFavorites(prev => prev.filter(f => f.id !== tempId))
      } else {
        setFavorites(prev => prev.map(f => f.id === tempId ? data : f))
      }
    }
  }, [favorites, profile?.id])

  return { favorites, isFavorite, toggle, loading, refetch }
}
