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

export default function HelpPage() {
  return (
    <PageScreen breadcrumbs={[{ label: 'Help & Resources' }]}>
      <PageBody className="max-w-3xl">
      <p className="text-sm text-ink-400 mb-6">Templates, workflow guides, and reference for Menu Hub.</p>

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
