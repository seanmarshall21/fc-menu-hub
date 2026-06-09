const CSV_TEMPLATE_HEADERS = [
  'Section', 'Title', 'Description', 'VT', 'VE', 'GF',
  '2 Sizes', 'Size', 'Price', 'Size 2', 'Price 2', 'Status', 'Notes',
]
const CSV_TEMPLATE_EXAMPLE = [
  ['SIGNATURES', 'Waterfront Mule', 'Vodka, ginger beer, lime, mint', 'FALSE', 'FALSE', 'FALSE', 'FALSE', 'REGULAR', '14', '', '', 'added', ''],
  ['SIGNATURES', 'Bay Breeze Spritz', 'Aperol, prosecco, blood orange', 'FALSE', 'TRUE', 'FALSE', 'FALSE', 'REGULAR', '15', '', '', 'added', ''],
  ['SELTZERS & BEER', 'White Claw Variety', 'Assorted flavors', 'FALSE', 'TRUE', 'TRUE', 'FALSE', 'REGULAR', '8', '', '', 'added', ''],
  ['SELTZERS & BEER', 'Modelo Especial', 'Mexican lager', 'FALSE', 'FALSE', 'FALSE', 'TRUE', 'REGULAR', '9', 'LARGE', '12', 'added', ''],
]

function downloadCsvTemplate() {
  const rows = [CSV_TEMPLATE_HEADERS, ...CSV_TEMPLATE_EXAMPLE]
  const csv  = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = 'menu-import-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function Section({ title, children }) {
  return (
    <div className="mb-10">
      <h2 className="text-base font-semibold text-ink-900 mb-4 pb-2 border-b border-surface-200">{title}</h2>
      {children}
    </div>
  )
}

function Step({ n, title, children }) {
  return (
    <div className="flex gap-4 mb-5">
      <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{n}</div>
      <div>
        <p className="text-sm font-semibold text-ink-800 mb-1">{title}</p>
        <div className="text-sm text-ink-500 space-y-1">{children}</div>
      </div>
    </div>
  )
}

function Code({ children }) {
  return <code className="bg-surface-100 text-ink-700 font-mono text-xs px-1.5 py-0.5 rounded">{children}</code>
}

import PageScreen, { PageBody } from '@/components/PageScreen'
import { PLUGIN_INSTALL_URL, PLUGIN_LOCAL_INSTALL_DOC } from '@/lib/figmaPlugin'
import FigmaLogo from '@/components/FigmaLogo'
import { useAuth } from '@/contexts/AuthContext'

export default function HelpPage() {
  const { isAdmin } = useAuth()
  return (
    <PageScreen tourKey="help" breadcrumbs={[{ label: 'Help & Resources' }]}>
      <PageBody className="max-w-3xl">
      <p className="text-sm text-ink-400 mb-6">Templates, workflow guides, and reference for Menu Hub.</p>

      {/* ── Walkthrough CTA — full presentation doc, opens in new tab ── */}
      <div className="mb-8 rounded-xl overflow-hidden border border-brand-200 bg-gradient-to-br from-brand-50 via-white to-brand-50 shadow-sm">
        <div className="p-6 sm:p-7 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-brand-500 text-white flex items-center justify-center shadow-sm">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-wider text-brand-600 font-semibold mb-1">New here? Start with this</div>
            <h2 className="text-lg font-bold text-ink-900 mb-1">Menu Hub Walkthrough</h2>
            <p className="text-sm text-ink-600">
              The full presentation-style guide to everything in Menu Hub — navigation, editing, approvals, sync status, CSV import/export. Read it once, refer back as needed.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
            <a
              href="/walkthrough.html"
              target="_blank"
              rel="noreferrer"
              className="btn-primary text-sm inline-flex items-center gap-2 whitespace-nowrap"
            >
              View support documentation
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
            <a
              href="/walkthrough.pdf"
              download
              className="btn-secondary text-sm inline-flex items-center gap-1.5 whitespace-nowrap"
              title="Download as PDF for offline reference or printing"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
              </svg>
              PDF
            </a>
          </div>
        </div>
      </div>

      {/* Admin Walkthrough — only visible to admins. Same shape as the user
          card but purple-tinted so it stands apart at a glance. */}
      {isAdmin && (
        <div className="mb-8 rounded-xl overflow-hidden border border-purple-200 bg-gradient-to-br from-purple-50 via-white to-purple-50 shadow-sm">
          <div className="p-6 sm:p-7 flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-purple-600 text-white flex items-center justify-center shadow-sm">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-wider text-purple-700 font-semibold mb-1">Admin only · for the Vivo team</div>
              <h2 className="text-lg font-bold text-ink-900 mb-1">Admin Walkthrough</h2>
              <p className="text-sm text-ink-600">
                Setup, design system, Figma pipeline, data ops, troubleshooting — everything you and your team need to administrate Menu Hub.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
              <a
                href="/admin-walkthrough.html"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 whitespace-nowrap text-sm font-medium px-3 py-1.5 rounded-md bg-purple-600 text-white hover:bg-purple-700"
              >
                View admin documentation
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
              <a
                href="/admin-walkthrough.pdf"
                download
                className="btn-secondary text-sm inline-flex items-center gap-1.5 whitespace-nowrap"
                title="Download as PDF for offline reference or printing"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                </svg>
                PDF
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── CSV Template ── */}
      <Section title="CSV Template">
        <p className="text-sm text-ink-500 mb-4">
          Download the template to see the correct column format before importing menus. Each row is one menu item.
        </p>
        <div className="flex items-center gap-3 mb-6">
          <button onClick={downloadCsvTemplate} className="btn-primary btn-sm">
            ↓ Download CSV Template
          </button>
          <a
            href="https://docs.google.com/spreadsheets/d/1V-O7NsZLk9Dsn0T0lZFzNfEr5xwpVsqkNtbtLG0RDDI/edit?usp=drive_link"
            target="_blank"
            rel="noreferrer"
            className="btn-secondary btn-sm"
          >
            ↗ Master Google Sheet
          </a>
        </div>

        <div className="card overflow-x-auto mb-3">
          <table className="text-xs w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-surface-100 bg-surface-50">
                {CSV_TEMPLATE_HEADERS.map(h => (
                  <th key={h} className="px-3 py-2 text-left text-ink-500 font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {CSV_TEMPLATE_EXAMPLE.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-1.5 text-ink-600 whitespace-nowrap">{cell || <span className="text-ink-200">—</span>}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="text-xs text-ink-400 space-y-1">
          <p><strong>Section</strong> — group name in ALL CAPS (e.g. SIGNATURES, SELTZERS &amp; BEER). Items with the same section name are grouped together.</p>
          <p><strong>VT / VE / GF</strong> — dietary flags. Use <Code>TRUE</Code> or <Code>FALSE</Code>.</p>
          <p><strong>2 Sizes</strong> — set <Code>TRUE</Code> and fill in Size 2 + Price 2 for two-size items.</p>
          <p><strong>Status</strong> — use <Code>added</Code>, <Code>not added</Code>, or <Code>draft</Code>.</p>
        </div>
      </Section>

      {/* ── Export from Google Sheets ── */}
      <Section title="Exporting from Google Sheets">
        <Step n={1} title="Set up your sheet with the right columns">
          <p>Your sheet's first row must match the column headers exactly: <Code>Section</Code>, <Code>Title</Code>, <Code>Description</Code>, etc. Download the template above and copy the header row into your sheet to be safe.</p>
        </Step>
        <Step n={2} title="Select the correct sheet tab">
          <p>Make sure the tab with your menu data is active — Google will export whichever tab is currently visible.</p>
        </Step>
        <Step n={3} title="File → Download → Comma Separated Values (.csv)">
          <p>In Google Sheets: <Code>File</Code> → <Code>Download</Code> → <Code>Comma Separated Values (.csv)</Code>. The file downloads immediately — no extra steps.</p>
        </Step>
        <Step n={4} title="Import into Menu Hub">
          <p>On the Event page, click <strong>↑ Import CSVs</strong>. Select one or more CSV files. You can import multiple menus at once — each file becomes one menu. Review the name, slug, and category before confirming.</p>
        </Step>

        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          <strong>Common issues:</strong> Extra header rows or metadata at the top of your sheet will be skipped automatically as long as the required <Code>Section</Code> and <Code>Title</Code> columns are present. If items aren't importing, check that those two columns have data.
        </div>
      </Section>

      {/* ── Figma Plugin Workflow ── */}
      <Section title="Install the Menu Hub Figma plugin">
        <p className="text-sm text-ink-500 mb-3">
          The plugin runs inside Figma and reads menu data from this app to populate your templates. Install it once per Figma account.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <a
            href={PLUGIN_INSTALL_URL}
            target="_blank"
            rel="noreferrer"
            className="btn-primary btn-sm gap-2 inline-flex"
          >
            <FigmaLogo size={14} />
            Install Menu Hub Figma plugin
          </a>
          <a
            href={PLUGIN_LOCAL_INSTALL_DOC}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary btn-sm"
          >
            Manual install (ask an admin)
          </a>
        </div>
        <p className="text-xs text-ink-400 mt-3">
          If the install button leads to a 404, the plugin hasn't been published to Figma Community yet — ask an admin for the zipped plugin folder and import it via Figma → Menu → Plugins → Development → Import plugin from manifest.
        </p>
      </Section>

      <Section title="Syncing to Figma">
        <Step n={1} title="Open the menu template frame in Figma">
          <p>Select the frame you want to populate. It should use the Menu Sync component structure (prefixed layer names).</p>
        </Step>
        <Step n={2} title="Open the Menu Sync plugin">
          <p>Plugins → Menu Sync. Select the event, then the menu from the dropdowns. The plugin reads directly from the database.</p>
        </Step>
        <Step n={3} title="Configure layout options">
          <p>Set item gap, section gap, sponsor visibility, and diet key before syncing.</p>
        </Step>
        <Step n={4} title="Click Sync to Figma">
          <p>The plugin populates all items, sets visibility on sponsor and diet layers, and renames the frame to include the menu slug. After sync, a preview PNG is automatically saved to the app — visible in the menu's Preview tab.</p>
        </Step>
        <Step n={5} title="Re-syncing">
          <p>If you edit items in Menu Hub after syncing, an <strong>amber "Sync needed" badge</strong> appears on the menu. Run the plugin again from Figma to push the updated data.</p>
        </Step>

        <div className="mt-4 bg-brand-50 border border-brand-100 rounded-lg px-4 py-3 text-sm text-brand-800">
          <strong>Frame locking:</strong> Once a frame is synced, it's locked to that menu. Trying to sync a different menu to the same frame shows a warning — confirm to override, or select a different frame.
        </div>
      </Section>

      {/* ── Sponsor Slugs ── */}
      <Section title="Sponsor layer naming">
        <p className="text-sm text-ink-500 mb-3">
          Each sponsor in the Figma template must have a layer named <Code>sponsor--{'{slug}'}</Code> where <Code>{'{slug}'}</Code> matches exactly what you entered in the Event's Sponsors tab.
        </p>
        <p className="text-sm text-ink-500 mb-3">
          For example, if your sponsor slug is <Code>stella-artois</Code>, the Figma layer must be named <Code>sponsor--stella-artois</Code> (or with the frame prefix: <Code>cf26f--sponsor--stella-artois</Code>).
        </p>
        <div className="bg-surface-100 rounded-lg px-4 py-3 text-xs font-mono text-ink-600 space-y-1">
          <p>sponsor--modelo-especial</p>
          <p>sponsor--stella-artois</p>
          <p>sponsor--patron-tequila</p>
        </div>
      </Section>
      </PageBody>
    </PageScreen>
  )
}
