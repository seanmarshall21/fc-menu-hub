import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export function useBrands() {
  const [brands, setBrands] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchBrands = useCallback(() => {
    setLoading(true)
    supabase
      .from('brands')
      .select('*')
      .order('name')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setBrands(data || [])
        setLoading(false)
      })
  }, [])

  useEffect(() => { fetchBrands() }, [fetchBrands])

  return { brands, loading, error, refetch: fetchBrands }
}
