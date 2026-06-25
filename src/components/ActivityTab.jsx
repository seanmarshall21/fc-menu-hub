import { createPortal } from 'react-dom'
import { useActivityUnread } from '@/lib/useActivityUnread'

// Persistent slide-out handle anchored to the right edge of the viewport, on
// top of everything (portaled). Click to open the Activity drawer. Hidden while
// the drawer is open (the drawer carries its own collapse handle). Shows an
// unread pulse when there's activity the user hasn't seen.
export default function ActivityTab({ scopeType, scopeId, open, onOpen }) {
  const unread = useActivityUnread(scopeType, scopeId, open)
  if (open) return null
  return createPortal(
    <button onClick={onOpen} title="Activity & feedback"
      className="fixed right-0 top-[88px] z-[115] flex items-center justify-center bg-brand-600 hover:bg-brand-700 text-white rounded-l-xl shadow-lg py-2.5 pl-3 pr-2.5 transition-colors">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.83L3 20l1.17-3.5A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
      {unread && <span className="absolute -top-1 -left-1 w-3 h-3 rounded-full bg-red-500 ring-2 ring-white" />}
    </button>,
    document.body
  )
}
