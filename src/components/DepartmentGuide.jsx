import { useState } from 'react'
import { Link } from 'react-router-dom'
import Modal from '@/components/Modal'
import { DEPT_GUIDES } from '@/lib/departmentGuides'

// Reopenable per-department playbook. Shows each phase of that team's workflow
// with how-to text, live counts, and marks the phase they're currently on (the
// earliest phase with work waiting). Any phase can be expanded to read it.
export default function DepartmentGuide({ deptKey, lists, onClose }) {
  const guide = DEPT_GUIDES[deptKey]
  const countOf = (p) => (p.countKey ? (lists?.[deptKey]?.[p.countKey]?.length || 0) : null)
  const currentIdx = guide ? guide.phases.findIndex(p => (countOf(p) || 0) > 0) : -1
  const [openIdx, setOpenIdx] = useState(currentIdx >= 0 ? currentIdx : 0)
  if (!guide) return null

  return (
    <Modal title={`${guide.label} — your workflow, step by step`} onClose={onClose}>
      <ol className="space-y-2">
        {guide.phases.map((p, i) => {
          const c = countOf(p)
          const isCurrent = i === currentIdx
          const open = i === openIdx
          return (
            <li key={i} className={`rounded-lg border ${isCurrent ? 'border-brand-300 bg-brand-50/50' : 'border-surface-200'}`}>
              <button onClick={() => setOpenIdx(open ? -1 : i)} className="w-full flex items-center gap-2 px-3 py-2 text-left">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0 ${isCurrent ? 'bg-brand-600 text-white' : 'bg-surface-200 text-ink-600'}`}>{i + 1}</span>
                <span className="flex-1 text-sm font-medium text-ink-900">{p.title}</span>
                {c > 0 && <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">{c}</span>}
                {isCurrent && <span className="text-[10px] uppercase tracking-wide text-brand-600 font-semibold whitespace-nowrap">you’re here</span>}
                <svg className={`w-3.5 h-3.5 text-ink-300 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>
              {open && (
                <div className="px-3 pb-3 pl-10 text-xs text-ink-600 space-y-2">
                  <p className="leading-relaxed">{p.body}</p>
                  <Link to={p.where || '/my-tasks'} onClick={onClose} className="inline-block text-brand-600 hover:underline font-medium">{p.whereLabel || 'Take me there'} →</Link>
                </div>
              )}
            </li>
          )
        })}
      </ol>
      <p className="mt-4 text-[11px] text-ink-400">Reopen this anytime from the “Guide” button on My Tasks.</p>
    </Modal>
  )
}
