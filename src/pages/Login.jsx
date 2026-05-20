import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export default function Login() {
  const { session, signIn, signUp, signInWithGoogle } = useAuth()
  const navigate = useNavigate()

  // Drive redirect from session state — handles email/pw race condition and Google OAuth
  useEffect(() => {
    if (session) navigate('/', { replace: true })
  }, [session])

  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)
  const [signUpSent, setSignUpSent] = useState(false)

  function switchMode(newMode) {
    setMode(newMode)
    setError(null)
    setPassword('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (mode === 'signin') {
      const { error } = await signIn(email, password)
      setLoading(false)
      if (error) setError(error.message)
      // navigation handled by useEffect watching session
    } else {
      const { error } = await signUp(email, password)
      setLoading(false)
      if (error) setError(error.message)
      else setSignUpSent(true)
    }
  }

  async function handleGoogle() {
    setError(null)
    const { error } = await signInWithGoogle()
    if (error) setError(error.message)
    // Supabase redirects on success
  }

  const isSignUp = mode === 'signup'

  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <img src="/logo-tile.svg" alt="Menu Hub" className="w-9 h-9 flex-shrink-0" />
          <span className="text-xl font-semibold text-ink-900 tracking-tight">Menu Hub</span>
        </div>

        <div className="card p-8">

          {/* ── Sign-up success state ── */}
          {signUpSent ? (
            <div className="text-center">
              <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-ink-900 mb-2">Check your email</h2>
              <p className="text-sm text-ink-500 mb-1">We sent a confirmation link to</p>
              <p className="text-sm font-medium text-ink-800 mb-4">{email}</p>
              <p className="text-xs text-ink-400 mb-6">Once confirmed, your account will be reviewed by an administrator before you can access Menu Hub.</p>
              <button onClick={() => { setSignUpSent(false); switchMode('signin') }} className="text-sm text-brand-600 hover:text-brand-800 font-medium">
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-ink-900 mb-1">
                {isSignUp ? 'Create account' : 'Sign in'}
              </h1>
              <p className="text-sm text-ink-500 mb-6">
                {isSignUp ? 'Request access to Menu Hub.' : 'BKSTG · Menu Management'}
              </p>

              {/* Google */}
              <button type="button" onClick={handleGoogle} className="btn-secondary w-full justify-center mb-4 gap-3">
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-surface-200" />
                <span className="text-xs text-ink-300">or</span>
                <div className="flex-1 h-px bg-surface-200" />
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">Email</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="label">Password</label>
                  <input
                    type="password"
                    className="input"
                    placeholder={isSignUp ? 'Min 6 characters' : '••••••••'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={isSignUp ? 6 : undefined}
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
                )}

                <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
                  {loading
                    ? (isSignUp ? 'Creating…' : 'Signing in…')
                    : (isSignUp ? 'Create Account' : 'Sign In')}
                </button>
              </form>

              {/* Toggle */}
              <p className="text-center text-sm text-ink-500 mt-5">
                {isSignUp ? (
                  <>Already have an account?{' '}
                    <button onClick={() => switchMode('signin')} className="text-brand-600 hover:text-brand-800 font-medium">Sign in</button>
                  </>
                ) : (
                  <>Don't have an account?{' '}
                    <button onClick={() => switchMode('signup')} className="text-brand-600 hover:text-brand-800 font-medium">Sign up</button>
                  </>
                )}
              </p>
            </>
          )}
        </div>

        {isSignUp && !signUpSent && (
          <p className="text-center text-xs text-ink-400 mt-4">
            Access is subject to administrator approval.
          </p>
        )}
      </div>
    </div>
  )
}
