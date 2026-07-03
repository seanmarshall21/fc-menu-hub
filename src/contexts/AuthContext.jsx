import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })

    // Auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signUp(email, password) {
    const { error } = await supabase.auth.signUp({ email, password })
    return { error }
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        // Always show Google's account chooser so you can switch accounts
        // instead of being silently re-signed into the last one.
        queryParams: { prompt: 'select_account' },
      },
    })
    return { error }
  }

  async function signOut() {
    await supabase.auth.signOut({ scope: 'global' })
  }

  const isAdmin       = profile?.role === 'admin'
  const isInternal    = profile?.role === 'internal' || isAdmin
  const isExternal    = profile?.role === 'external'
  // Viewer = read-only reviewer scoped to specific events/menus they're
  // granted. Sees only their assigned content; can leave comments, not edit.
  const isViewer      = profile?.role === 'viewer'
  // Production = print/production team. Locked down: sees completed menus and
  // can send preview links + order forms; no editing or other workflow.
  const isProduction  = profile?.role === 'production'
  const isPending     = profile?.role === 'pending' || (session && !profile && !loading)
  // Elevated style/template access. Admins always get it; trusted internals
  // get it when an admin flips can_edit_styles on their profile.
  const canEditStyles = isAdmin || !!profile?.can_edit_styles

  // ── Per-person capabilities ────────────────────────────────────────────
  // Each capability is a nullable boolean on the profile. null = "use the
  // role default", so existing internal users keep full access (no
  // regression). Admin always has everything. An internal user with every
  // flag turned off is effectively an "internal viewer".
  //   cap(flag, internalDefault, externalDefault)
  function cap(flag, internalDefault, externalDefault) {
    if (isAdmin) return true
    const v = profile?.[flag]
    if (v === true) return true
    if (v === false) return false
    // null/undefined → role default
    if (profile?.role === 'internal') return internalDefault
    if (profile?.role === 'external') return externalDefault
    return false // viewer / pending / unknown
  }
  const can = {
    // Internal default = full access (preserves today's behavior).
    // External default: may edit content (lands as pending), nothing else.
    editContent:  cap('cap_edit_content',  true, true),
    editSponsors: cap('cap_edit_sponsors', true, false),
    approve:      cap('cap_approve',       true, false),
    manageEvents: cap('cap_manage_events', true, false),
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, signIn, signUp, signInWithGoogle, signOut, isAdmin, isInternal, isExternal, isViewer, isProduction, isPending, canEditStyles, can }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
