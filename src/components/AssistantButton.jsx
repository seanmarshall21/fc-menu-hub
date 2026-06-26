import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'

// Opt-in "AI sister" — a floating sparkle that runs a role-tailored checklist so
// people don't forget steps. State (role + checked items + dismissed) persists
// in localStorage. It's a guided companion, not a supervisor.

const ROLE_CHECKLISTS = {
  proofing: {
    label: 'Proofing',
    items: [
      { t: 'Open each menu you’re assigned to proof.', to: '/' },
      { t: 'Run the AI review on every menu and read it over.' },
      { t: 'Sign off each menu (Approvals tab) — that’s what moves it to Approved.' },
      { t: 'Anything sitting in “Edits” needs another look before it can ship.' },
    ],
  },
  sponsorship: {
    label: 'Sponsorship',
    items: [
      { t: 'Go through all menus and flag the ones that need sponsors (Event → Sponsors).', to: '/events' },
      { t: 'Add sponsors to each flagged menu (multi-select, set 1–3 lines).' },
      { t: 'Mark each menu “checked” once its sponsors are right.' },
      { t: 'Watch for ⚠ — sponsors missing a logo need an SVG uploaded.' },
    ],
  },
  creative: {
    label: 'Creative / Print prep',
    items: [
      { t: 'Check the “Ready for print prep” queue on the dashboard.', to: '/' },
      { t: 'In Figma, open Menu Sync and Sync (it auto-fits spacing + recommends size).' },
      { t: 'Pull edits from Figma back into the app if you tweaked text on canvas.' },
      { t: 'Set the menu to Exported and paste the Dropbox link when prompted.' },
    ],
  },
}

export default function AssistantButton() {
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState(() => localStorage.getItem('assistantRole') || '')
  const [checked, setChecked] = useState(() => {
    try { return JSON.parse(localStorage.getItem('assistantChecked') || '{}') } catch { return {} }
  })

  function pickRole(r) { setRole(r); localStorage.setItem('assistantRole', r) }
  function toggle(key) {
    setChecked(prev => {
      const next = { ...prev, [key]: !prev[key] }
      localStorage.setItem('assistantChecked', JSON.stringify(next))
      return next
    })
  }

  const list = role ? ROLE_CHECKLISTS[role] : null

  return createPortal(
    <>
      {open && (
        <div className="fixed bottom-36 sm:bottom-20 right-4 z-[95] w-[320px] max-w-[calc(100vw-2rem)] bg-white border border-surface-200 rounded-xl shadow-2xl overflow-hidden">
          <div className="px-4 py-3 bg-brand-600 text-white flex items-center justify-between">
            <span className="text-sm font-semibold">✦ Quick check</span>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white">✕</button>
          </div>
          {!list ? (
            <div className="p-4">
              <p className="text-sm text-ink-700 mb-3">Want a hand making sure nothing’s missed? What are you working on?</p>
              <div className="space-y-1.5">
                {Object.entries(ROLE_CHECKLISTS).map(([k, v]) => (
                  <button key={k} onClick={() => pickRole(k)} className="w-full text-left px-3 py-2 rounded-lg border border-surface-200 hover:border-brand-300 hover:bg-surface-50 text-sm font-medium text-ink-800">
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-ink-500 uppercase tracking-wide">{list.label}</span>
                <button onClick={() => pickRole('')} className="text-[11px] text-brand-600 hover:text-brand-800">Change</button>
              </div>
              <ul className="space-y-2">
                {list.items.map((it, i) => {
                  const key = `${role}:${i}`
                  return (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <input type="checkbox" checked={!!checked[key]} onChange={() => toggle(key)} className="mt-0.5" />
                      <span className={checked[key] ? 'text-ink-400 line-through' : 'text-ink-700'}>
                        {it.t}{' '}
                        {it.to && <Link to={it.to} onClick={() => setOpen(false)} className="text-brand-600 hover:underline whitespace-nowrap">→ go</Link>}
                      </span>
                    </li>
                  )
                })}
              </ul>
              <p className="text-[11px] text-ink-400 mt-3">Just a reminder helper — check items off as you go.</p>
            </div>
          )}
        </div>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        title="Quick check"
        className="fixed bottom-20 sm:bottom-4 right-4 z-[95] w-12 h-12 rounded-full bg-brand-600 hover:bg-brand-700 text-white shadow-lg flex items-center justify-center text-xl"
      >
        ✦
      </button>
    </>,
    document.body
  )
}
