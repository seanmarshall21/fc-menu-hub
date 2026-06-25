import { useActivityUnread } from '@/lib/useActivityUnread'

// Activity toggle button with an unread indicator (used inline in page headers).
export default function ActivityButton({ scopeType, scopeId, open, onOpen, className = '' }) {
  const unread = useActivityUnread(scopeType, scopeId, open)
  return (
    <button onClick={onOpen} title="Activity & feedback"
      className={`btn-secondary btn-sm gap-1.5 inline-flex items-center whitespace-nowrap relative ${className}`}>
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.83L3 20l1.17-3.5A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
      Activity
      {unread && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white" />}
    </button>
  )
}
