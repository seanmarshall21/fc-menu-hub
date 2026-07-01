import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { DEPARTMENTS as BUILTINS } from '@/lib/departments'

// Loads configurable departments from the DB (falls back to the built-in 3 if
// the table is empty / unreachable). Shape: { key, label, blurb, permissions[],
// phases[], built_in }.
export function useDepartments() {
  const [departments, setDepartments] = useState(BUILTINS)
  const [loading, setLoading] = useState(true)

  async function reload() {
    const { data } = await supabase.from('departments').select('*').order('sort_order')
    if (data && data.length) setDepartments(data)
    setLoading(false)
  }
  useEffect(() => { reload() }, [])

  return { departments, loading, reload }
}

// Capabilities a department can grant its members (stage 2 applies these).
export const DEPT_PERMISSIONS = [
  { key: 'cap_edit_content', label: 'Edit item content' },
  { key: 'cap_edit_sponsors', label: 'Edit sponsors' },
  { key: 'cap_approve', label: 'Approve menus' },
  { key: 'cap_manage_events', label: 'Manage events & series' },
]

export const LIFECYCLE_PHASES = ['build', 'proof', 'edits', 'approved', 'exported', 'complete', 'archived']
