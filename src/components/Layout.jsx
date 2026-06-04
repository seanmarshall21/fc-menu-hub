import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useBrands } from '@/hooks/useBrands'
import { supabase } from '@/lib/supabase'
import Modal from '@/components/Modal'
import VersionWatcher from '@/components/VersionWatcher'
import BrandLogoUploader from '@/components/BrandLogoUploader'
import clsx from 'clsx'

function IconHelp() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function IconDashboard() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}

function IconAdmin() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function Logo() {
  return (
    <img src="/logo-tile.svg" alt="Menu Hub" className="w-7 h-7 flex-shrink-0" />
  )
}

function BottomTab({ to, end = false, label, icon }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => clsx(
        'flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors',
        isActive ? 'text-brand-600' : 'text-ink-400'
      )}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </NavLink>
  )
}

function BottomTabButton({ onClick, label, icon }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex flex-col items-center justify-center gap-0.5 text-ink-400 hover:text-ink-700 transition-colors"
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  )
}

export default function Layout() {
  const { profile, signOut, isAdmin, isInternal } = useAuth()
  const { brands, refetch } = useBrands()
  const navigate = useNavigate()
  const location = useLocation()

  const [drawerOpen, setDrawerOpen] = useState(false)

  // Profile edit modal
  const [showProfile, setShowProfile]       = useState(false)
  const [profileName, setProfileName]       = useState('')
  const [profileSaving, setProfileSaving]   = useState(false)
  const [profileError, setProfileError]     = useState(null)
  const [profileSuccess, setProfileSuccess] = useState(false)

  function openProfile() {
    setProfileName(profile?.full_name || '')
    setProfileError(null)
    setProfileSuccess(false)
    setShowProfile(true)
    setDrawerOpen(false)
  }

  async function handleSaveProfile(e) {
    e.preventDefault()
    setProfileSaving(true); setProfileError(null); setProfileSuccess(false)
    const { error } = await supabase
      .from('user_profiles')
      .update({ full_name: profileName.trim() })
      .eq('id', profile.id)
    setProfileSaving(false)
    if (error) { setProfileError(error.message); return }
    setProfileSuccess(true)
    // Refresh profile in auth context
    await supabase.from('user_profiles').select('*').eq('id', profile.id).single()
      .then(({ data }) => { if (data) Object.assign(profile, data) })
  }

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false) }, [location.pathname])

  // New brand modal state
  const [showNewBrand, setShowNewBrand] = useState(false)
  const [brandName, setBrandName] = useState('')
  const [brandSlugField, setBrandSlugField] = useState('')
  const [brandColor, setBrandColor] = useState('#6366f1')
  const [brandLogoUrl, setBrandLogoUrl] = useState(null)
  const [brandTmpPathKey] = useState(() => `new-${Date.now()}`)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  function openNewBrand() {
    setBrandName(''); setBrandSlugField(''); setBrandColor('#6366f1'); setBrandLogoUrl(null); setSaveError(null)
    setShowNewBrand(true)
    setDrawerOpen(false)
  }

  async function handleCreateBrand(e) {
    e.preventDefault()
    setSaving(true); setSaveError(null)
    const { error } = await supabase.from('brands').insert({
      name: brandName.trim(),
      slug: brandSlugField.trim(),
      color: brandColor,
      logo_url: brandLogoUrl,
    })
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    setShowNewBrand(false)
    refetch()
  }

  const navLinkClass = ({ isActive }) => clsx(
    'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
    isActive
      ? 'bg-brand-50 text-brand-700'
      : 'text-ink-600 hover:bg-surface-100 hover:text-ink-900'
  )

  const SidebarContents = () => (
    <>
      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
        <NavLink to="/" end className={navLinkClass}>
          <IconDashboard />
          Dashboard
        </NavLink>

        <NavLink to="/favorites" className={navLinkClass}>
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.86 5.706a1 1 0 00.95.69h6.001c.969 0 1.371 1.24.588 1.81l-4.857 3.527a1 1 0 00-.364 1.118l1.86 5.706c.3.921-.755 1.688-1.539 1.118l-4.857-3.527a1 1 0 00-1.176 0l-4.857 3.527c-.784.57-1.838-.197-1.539-1.118l1.86-5.706a1 1 0 00-.364-1.118L2.6 11.133c-.783-.57-.38-1.81.588-1.81h6.002a1 1 0 00.95-.69l1.86-5.706z" />
          </svg>
          Favorites
        </NavLink>

        {(isAdmin || isInternal) && (
          <NavLink to="/sponsors" className={navLinkClass}>
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            Sponsors
          </NavLink>
        )}

        <NavLink to="/help" className={navLinkClass}>
          <IconHelp />
          Help
        </NavLink>

        {isAdmin && (
          <NavLink to="/admin" className={navLinkClass}>
            <IconAdmin />
            Admin
          </NavLink>
        )}

        <div className="pt-3">
          <div className="px-3 pb-1.5 flex items-center justify-between">
            <p className="text-xs font-semibold text-ink-300 uppercase tracking-wider">Brands</p>
            {isAdmin && (
              <button onClick={openNewBrand} className="text-ink-300 hover:text-brand-500 transition-colors" title="New Brand">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            )}
          </div>
          {brands.map(brand => (
            <NavLink key={brand.id} to={`/brands/${brand.slug}`} className={navLinkClass}>
              {brand.logo_url ? (
                <img src={brand.logo_url} alt="" className="w-5 h-5 rounded object-contain flex-shrink-0 bg-surface-50" />
              ) : (
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: brand.color || '#6366f1' }} />
              )}
              <span className="truncate">{brand.name}</span>
            </NavLink>
          ))}
          {brands.length === 0 && (
            <p className="px-3 py-2 text-xs text-ink-300 italic">No brands yet</p>
          )}
        </div>
      </nav>

      {/* User footer */}
      <div
        className="px-3 pt-3 border-t border-surface-200 flex-shrink-0"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        <div className="flex items-center gap-3 px-2 py-2">
          <button
            onClick={openProfile}
            className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
            title="Edit profile"
          >
            <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 text-xs font-semibold flex-shrink-0">
              {profile?.full_name?.[0] || profile?.email?.[0] || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-ink-900 truncate">{profile?.full_name || profile?.email}</p>
              <p className="text-xs text-ink-400 capitalize">{profile?.role}</p>
            </div>
          </button>
          <button onClick={handleSignOut} className="text-ink-400 hover:text-ink-700 transition-colors flex-shrink-0" title="Sign out">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </>
  )

  return (
    <div className="flex h-[100dvh] bg-surface-50 overflow-hidden">

      {/* ── DESKTOP sidebar (md+) ── */}
      <aside className="hidden md:flex w-60 flex-shrink-0 bg-white border-r border-surface-200 flex-col">
        <div className="px-5 py-5 border-b border-surface-200 flex items-center gap-2.5">
          <Logo />
          <span className="font-semibold text-ink-900 text-sm tracking-tight">Menu Hub</span>
        </div>
        <SidebarContents />
      </aside>

      {/* ── MOBILE drawer overlay ── */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setDrawerOpen(false)}
        />
      )}
      <aside className={clsx(
        'md:hidden fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-surface-200 flex flex-col',
        'transition-transform duration-200 ease-in-out',
        drawerOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Drawer header */}
        <div className="px-5 py-5 border-b border-surface-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="font-semibold text-ink-900 text-sm tracking-tight">Menu Hub</span>
          </div>
          <button onClick={() => setDrawerOpen(false)} className="text-ink-400 hover:text-ink-700 p-1 -mr-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <SidebarContents />
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <main
          className="flex-1 overflow-y-auto"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 64px)' }}
        >
          <Outlet />
        </main>
      </div>

      {/* ── Mobile bottom tab bar (always visible, never hides) ── */}
      <nav
        className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-white border-t border-surface-200"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-stretch justify-around h-16">
          <BottomTab to="/" end label="Home" icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          } />
          <BottomTabButton onClick={() => setDrawerOpen(true)} label="Menus" icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14-4H5m14 8H5m14 4H5" />
            </svg>
          } />
          {(isAdmin || isInternal) && (
            <BottomTab to="/sponsors" label="Sponsors" icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            } />
          )}
          <BottomTab to="/favorites" label="Favorites" icon={
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.86 5.706a1 1 0 00.95.69h6.001c.969 0 1.371 1.24.588 1.81l-4.857 3.527a1 1 0 00-.364 1.118l1.86 5.706c.3.921-.755 1.688-1.539 1.118l-4.857-3.527a1 1 0 00-1.176 0l-4.857 3.527c-.784.57-1.838-.197-1.539-1.118l1.86-5.706a1 1 0 00-.364-1.118L2.6 11.133c-.783-.57-.38-1.81.588-1.81h6.002a1 1 0 00.95-.69l1.86-5.706z" />
            </svg>
          } />
          <BottomTabButton onClick={() => {}} label="Search" icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
          } />
        </div>
      </nav>

      <VersionWatcher />

      {/* Profile edit modal */}
      {showProfile && (
        <Modal title="Edit Profile" onClose={() => setShowProfile(false)}>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label className="label">Display Name</label>
              <input
                className="input"
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                placeholder="Your name"
                autoFocus
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input bg-surface-50 text-ink-400" value={profile?.email || ''} disabled />
              <p className="text-xs text-ink-400 mt-1">Email can't be changed here. Contact an admin if needed.</p>
            </div>
            <div>
              <label className="label">Role</label>
              <input className="input bg-surface-50 text-ink-400 capitalize" value={profile?.role || ''} disabled />
            </div>
            {profileError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{profileError}</p>
            )}
            {profileSuccess && (
              <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">Name updated.</p>
            )}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button type="button" onClick={() => setShowProfile(false)} className="btn-secondary btn-sm">Close</button>
              <button type="submit" className="btn-primary btn-sm" disabled={profileSaving}>
                {profileSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
          <div className="mt-5 pt-4 border-t border-surface-200 space-y-1">
            <button
              onClick={() => { setShowProfile(false); navigate('/help') }}
              className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm text-ink-700 hover:bg-surface-100 transition-colors"
            >
              <IconHelp />
              Help &amp; CSV templates
            </button>
            <button
              onClick={() => { setShowProfile(false); handleSignOut() }}
              className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
          </div>
        </Modal>
      )}

      {/* New Brand modal */}
      {showNewBrand && (
        <Modal title="New Brand" onClose={() => setShowNewBrand(false)}>
          <form onSubmit={handleCreateBrand} className="space-y-4">
            <div>
              <label className="label">Brand Name</label>
              <input className="input" value={brandName} onChange={e => { setBrandName(e.target.value); setBrandSlugField(slugify(e.target.value)) }} placeholder="e.g. CRSSD" required autoFocus />
            </div>
            <div>
              <label className="label">Slug</label>
              <input className="input font-mono text-sm" value={brandSlugField} onChange={e => setBrandSlugField(slugify(e.target.value))} placeholder="crssd" required />
              <p className="mt-1 text-xs text-ink-400">Auto-generated from name</p>
            </div>
            <div>
              <label className="label">Brand Color</label>
              <div className="flex items-center gap-3">
                <input type="color" className="w-10 h-10 rounded-lg border border-surface-200 cursor-pointer" value={brandColor} onChange={e => setBrandColor(e.target.value)} />
                <span className="text-sm text-ink-500 font-mono">{brandColor}</span>
              </div>
            </div>
            <div>
              <label className="label">Logo <span className="text-ink-300 font-normal">(optional)</span></label>
              <BrandLogoUploader
                value={brandLogoUrl}
                onChange={setBrandLogoUrl}
                pathKey={brandSlugField || brandTmpPathKey}
              />
            </div>
            {saveError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</p>}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button type="button" onClick={() => setShowNewBrand(false)} className="btn-secondary btn-sm">Cancel</button>
              <button type="submit" className="btn-primary btn-sm" disabled={saving}>{saving ? 'Creating…' : 'Create Brand'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
