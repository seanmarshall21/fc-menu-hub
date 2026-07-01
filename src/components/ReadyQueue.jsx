import { Link } from 'react-router-dom'
import { useReadyMenus, readyMenuLink } from '@/hooks/useReadyMenus'

// Dashboard widget: the first few menus ready for print prep, with a link to
// the full searchable/sortable list. Keeps the homepage short when there are
// many ready menus.
const PREVIEW = 3

export default function ReadyQueue() {
  const { ready, awaiting, loaded } = useReadyMenus()
  if (!loaded || (ready.length === 0 && awaiting === 0)) return null
  const top = ready.slice(0, PREVIEW)

  return (
    <div className="card overflow-hidden mb-6">
      <div className="px-4 sm:px-6 py-4 border-b border-surface-200 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink-900">✦ Ready for print prep</h2>
        <span className="text-xs text-ink-400">
          {ready.length} ready{awaiting > 0 ? ` · ${awaiting} awaiting sponsors` : ''}
        </span>
      </div>
      {ready.length === 0 ? (
        <div className="px-6 py-6 text-sm text-ink-400">Nothing ready yet — {awaiting} approved menu{awaiting === 1 ? '' : 's'} still waiting on sponsors.</div>
      ) : (
        <>
          <ul className="divide-y divide-surface-100">
            {top.map(m => {
              const to = readyMenuLink(m)
              const row = (
                <span className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
                  <span className="min-w-0">
                    <span className="font-medium text-ink-900">{m.name}</span>
                    {m.size && <span className="text-[10px] uppercase ml-2 px-1.5 py-0.5 rounded bg-surface-100 text-ink-500">{m.size}</span>}
                    <span className="block text-xs text-ink-400 truncate">{m.events?.series?.brand?.name} · {m.events?.slug}</span>
                  </span>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex-shrink-0">Ready to export</span>
                </span>
              )
              return <li key={m.id}>{to ? <Link to={to} className="block table-row-hover">{row}</Link> : row}</li>
            })}
          </ul>
          <Link to="/ready" className="block px-4 sm:px-6 py-3 text-sm font-medium text-brand-600 hover:bg-surface-50 border-t border-surface-100 whitespace-nowrap">
            View all {ready.length} ready →
          </Link>
        </>
      )}
    </div>
  )
}
