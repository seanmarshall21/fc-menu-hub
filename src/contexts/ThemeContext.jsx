import { createContext, useContext, useEffect, useState } from 'react'

// Light / dark theme. The dark palette is a warm "orange-dark" mix (see the
// :root / .dark blocks in index.css). We persist the choice and toggle a `dark`
// class on <html>; an inline script in index.html applies it before first paint
// to avoid a light flash on load.
const STORAGE_KEY = 'mh-theme'
const ThemeContext = createContext({ theme: 'light', toggle: () => {}, setTheme: () => {} })

function getInitial() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch (_) { /* ignore */ }
  return 'light'
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitial)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.style.colorScheme = theme // native form controls, scrollbars
    try { localStorage.setItem(STORAGE_KEY, theme) } catch (_) { /* ignore */ }
  }, [theme])

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
