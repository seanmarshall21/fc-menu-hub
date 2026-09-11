import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Check } from 'lucide-react'

// Internal preview of the shadcn/ui foundation, themed onto Menu Hub's own
// tokens. Public route (/ui) so it can be reviewed without signing in. Not
// linked from the app — a scratch surface while we adopt the kit.
const VARIANTS = ['default', 'secondary', 'outline', 'ghost', 'destructive', 'link']

function Section({ title, children }) {
  return (
    <section className="rounded-xl border border-surface-200 bg-surface-0 p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-4">{title}</h2>
      {children}
    </section>
  )
}

export default function UiKitPage() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  function toggleTheme() {
    const next = !dark
    document.documentElement.classList.toggle('dark', next)
    setDark(next)
  }

  return (
    <div className="min-h-screen bg-surface-50 text-ink-900 px-5 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">shadcn/ui — Menu Hub theme</h1>
            <p className="text-sm text-ink-500 mt-1">
              The kit, wired to your own brand / surface / ink tokens. Same components, your palette, both themes.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={toggleTheme} className="whitespace-nowrap flex-shrink-0">
            {dark ? 'Light' : 'Dark'} theme
          </Button>
        </header>

        <Section title="Button — variants">
          <div className="flex flex-wrap gap-3">
            {VARIANTS.map(v => (
              <Button key={v} variant={v} className="capitalize">{v}</Button>
            ))}
          </div>
        </Section>

        <Section title="Button — sizes">
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" aria-label="Add"><Plus /></Button>
          </div>
        </Section>

        <Section title="Button — with icons & states">
          <div className="flex flex-wrap items-center gap-3">
            <Button><Plus /> New menu</Button>
            <Button variant="secondary"><Check /> Mark done</Button>
            <Button variant="destructive"><Trash2 /> Delete</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Section>

        <p className="text-xs text-ink-400 text-center pt-2">
          Foundation only — Input, Select, Dialog and Dropdown come next, then we start swapping real screens onto them.
        </p>
      </div>
    </div>
  )
}
