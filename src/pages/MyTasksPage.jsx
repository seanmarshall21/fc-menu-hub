import { Link } from 'react-router-dom'
import PageScreen, { PageBody } from '@/components/PageScreen'
import { useAuth } from '@/contexts/AuthContext'
import { DEPARTMENTS } from '@/lib/departments'
import { useMyTasks } from '@/hooks/useMyTasks'

// Per-department work queue. Shows only the groups for the departments the user
// belongs to (admins see all), so each team sees their phase, not everything.
export default function MyTasksPage() {
  const { profile, isAdmin } = useAuth()
  const { loading, lists } = useMyTasks()
  const myDepts = isAdmin ? DEPARTMENTS.map(d => d.key) : (profile?.departments || [])

  const SECTIONS = {
    sponsorship: [
      { title: 'Need sponsors attached', rows: lists.sponsorship.attach, tone: 'amber', cta: { to: '/sponsors', label: 'Add sponsors' } },
      { title: 'Verify sponsors & check off', rows: lists.sponsorship.verify, tone: 'amber' },
    ],
    food_bev: [
      { title: 'Ready to approve', rows: lists.food_bev.readyToApprove, tone: 'emerald' },
      { title: 'Not yet approved', rows: lists.food_bev.notApproved, tone: 'neutral' },
      { title: 'Approved', rows: lists.food_bev.approved, tone: 'neutral' },
      { title: 'Exported', rows: lists.food_bev.exported, tone: 'neutral' },
      { title: 'Complete', rows: lists.food_bev.complete, tone: 'neutral', cta: { to: '/ready', label: 'Ready-to-print page' } },
    ],
    design: [
      { title: 'Ready to export', rows: lists.design.readyToExport, tone: 'emerald' },
      { title: 'Needs a Figma sync', rows: lists.design.needsSync, tone: 'amber' },
      { title: 'Exported', rows: lists.design.exported, tone: 'neutral' },
    ],
  }

  const visible = DEPARTMENTS.filter(d => myDepts.includes(d.key))

  return (
    <PageScreen breadcrumbs={[{ label: 'My Tasks' }]}>
      <PageBody>
        {loading ? (
          <div className="text-sm text-ink-400">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-sm text-ink-500">You're not assigned to a department yet.</p>
            <p className="text-xs text-ink-400 mt-1">An admin can set your departments in Admin → people, so this page shows your tasks.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {visible.map(dept => (
              <div key={dept.key} className="card overflow-hidden">
                <div className="px-4 sm:px-6 py-3 border-b border-surface-200">
                  <h2 className="text-sm font-semibold text-ink-900">{dept.label}</h2>
                  <p className="text-[11px] text-ink-400">{dept.blurb}</p>
                </div>
                <div className="divide-y divide-surface-100">
                  {SECTIONS[dept.key].map(sec => <Group key={sec.title} {...sec} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </PageBody>
    </PageScreen>
  )
}

function Group({ title, rows, tone, cta }) {
  const cap = 12
  const shown = rows.slice(0, cap)
  const toneCls = tone === 'emerald' ? 'bg-emerald-100 text-emerald-800' : tone === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-surface-100 text-ink-500'
  return (
    <div className="px-4 sm:px-6 py-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-ink-800">{title}</span>
          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${toneCls}`}>{rows.length}</span>
        </div>
        {cta && <Link to={cta.to} className="text-xs text-brand-600 hover:text-brand-800 whitespace-nowrap">{cta.label} →</Link>}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-ink-300">Nothing here.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {shown.map(r => (
            r.to
              ? <Link key={r.id} to={r.to} title={r.event} className="text-xs px-2 py-1 rounded-md bg-surface-50 border border-surface-200 text-ink-700 hover:border-brand-300 hover:text-brand-700 max-w-[220px] truncate">{r.name}</Link>
              : <span key={r.id} className="text-xs px-2 py-1 rounded-md bg-surface-50 border border-surface-200 text-ink-500 max-w-[220px] truncate">{r.name}</span>
          ))}
          {rows.length > cap && <span className="text-xs text-ink-400 self-center">+{rows.length - cap} more</span>}
        </div>
      )}
    </div>
  )
}
