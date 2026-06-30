// ─────────────────────────────────────────────────────────────────────────────
// Onboarding tours.
//
// Each tour is keyed by page (the route or a logical page name). A tour is
// an ordered list of steps; each step has a title, body, and optionally:
//   - `target` — CSS selector. The overlay spotlights the matching element
//                (cutout + pulsing ring) and auto-places the step card so
//                it never covers what's highlighted. Prefer the stable
//                `[data-tour="…"]` attributes added in the markup over
//                class-based selectors, which can break with restyles.
//   - `image`  — public-relative path to a screenshot. Renders inline in
//                the card. Use this when the step is about a place the
//                user hasn't navigated to (e.g. illustrating a modal that
//                isn't open). Drop PNGs into public/tour/.
//
// First-visit auto-open is handled by the useTour hook. Manual re-trigger
// lives in the PageScreen header (the ? button). Seen-state is per-user in
// localStorage so onboarding is independent for each account.
// ─────────────────────────────────────────────────────────────────────────────

export const TOURS = {
  // ── MY TASKS ─────────────────────────────────────────────────────────────
  'my-tasks': {
    title: 'My Tasks',
    summary: 'Your lane — only the work that’s yours, across every event.',
    steps: [
      {
        title: 'This is your work queue',
        body: 'Instead of the whole app, this page shows only the menus that need YOU right now — grouped by your department(s). An admin sets your departments in Admin.',
      },
      {
        title: 'Each box is a phase of your job',
        body: 'Sponsorship: menus to attach sponsors to, then verify. Food & Beverage: what’s ready to approve, approved, exported, complete. Design: what’s approved and ready to export, plus anything that needs a Figma re-sync.',
        target: '[data-tour="mytasks-list"]',
      },
      {
        title: 'Click a menu to jump straight there',
        body: 'Every menu chip is a link — it drops you on that exact menu so you can do the step. Green boxes are “ready for you”; amber boxes are “waiting on you”.',
        target: '[data-tour="mytasks-list"]',
      },
      {
        title: 'You’ll get pinged when your phase opens',
        body: 'When work reaches your team — menus added, sponsors verified, a menu approved — a “Your phase” notification lands in your Inbox with a link here. The ? button reopens this tour anytime.',
        target: '[data-tour="inbox-link"]',
      },
    ],
  },

  // ── DASHBOARD ────────────────────────────────────────────────────────────
  dashboard: {
    title: 'Welcome to Menu Hub',
    summary: 'A 30-second tour of the dashboard.',
    steps: [
      {
        title: 'This is your dashboard',
        body: 'Recent events, your favorited brands, and the events you care about — all in one place. Anything you star anywhere in the app shows up under Favorites.',
      },
      {
        title: 'Brands live in the sidebar',
        body: 'Click a brand to drill into its series, then events, then individual menus. The breadcrumb at the top of every page lets you jump back up.',
        target: '[data-tour="sidebar"]',
      },
      {
        title: 'Inbox sits in the sidebar too',
        body: 'Anyone who tags you on an edit lands a notification there. The red badge counts your unread ones.',
        target: '[data-tour="inbox-link"]',
      },
      {
        title: 'Help when you need it',
        body: 'The ? icon in the page header (top-right of any screen) reopens this tour anytime. Every page that has one of these icons has a tour available.',
        target: '[data-tour="help-button"]',
      },
    ],
  },

  // ── BRAND ────────────────────────────────────────────────────────────────
  brand: {
    title: 'Brand page',
    summary: 'How a brand hangs together: series, approvals, and edit notifications.',
    steps: [
      {
        title: 'Series under this brand',
        body: 'Every brand has one or more series (think: CRSSD Festival, CRSSD Lights). Each series groups events together. Click a series to see its events.',
        target: '[data-tour="brand-tab-series"]',
      },
      {
        title: 'Approvals tab',
        body: 'Set who gets notified for every edit on every menu under this brand. Everyone added here is pre-checked on edits all the way down — series, event, menu, individual item.',
        target: '[data-tour="brand-tab-approvals"]',
      },
      {
        title: 'Duplicate or delete from the card',
        body: 'The ⋯ on each series card lets you Edit, Duplicate, or Delete. Duplicating cascades — clones every event and menu underneath.',
      },
    ],
  },

  // ── SERIES ───────────────────────────────────────────────────────────────
  series: {
    title: 'Series page',
    summary: 'Events under a series, plus the design + sponsor library.',
    steps: [
      {
        title: 'Events tab',
        body: 'Every event under this series. Each row has a ⋯ menu with Edit, Duplicate, and Delete. Duplicating an event cascades — clones every menu underneath.',
        target: '[data-tour="series-tab-events"]',
      },
      {
        title: 'Sponsors tab',
        body: 'Pick which sponsors from your global library are eligible for this series. Events under this series can then activate any subset.',
        target: '[data-tour="series-tab-sponsors"]',
      },
      {
        title: 'Approvals tab',
        body: 'Brand-level notification picks appear here as inherited (grayed). Add anyone specific to this series — they get pinged on every edit on every menu under it.',
        target: '[data-tour="series-tab-approvals"]',
      },
      {
        title: 'Styles tab (admin only)',
        body: 'The full design spec — fonts, type sizes, spacing, dietary icons. Event and menu styles inherit from here unless explicitly overridden.',
        target: '[data-tour="series-tab-styles"]',
      },
    ],
  },

  // ── EVENT ────────────────────────────────────────────────────────────────
  event: {
    title: 'Event page',
    summary: 'Where most of your editing happens. Five tabs, one card per menu.',
    steps: [
      {
        title: 'Menus tab',
        body: 'Every menu for this event as a card. Each card shows pending edits (red badge), Figma sync status (green = up to date, amber = needs sync), and a ⋯ menu with Duplicate or Delete.',
        target: '[data-tour="event-tab-menus"]',
      },
      {
        title: 'Preview all',
        body: 'Visual previews of every menu in one view. Handy for review meetings and quick sanity checks before sync.',
        target: '[data-tour="event-tab-preview"]',
      },
      {
        title: 'Sponsors',
        body: 'Activate which series sponsors apply to this event, and reorder them if needed. Each menu can then further toggle which ones appear.',
        target: '[data-tour="event-tab-sponsors"]',
      },
      {
        title: 'Approvals',
        body: 'Event-level sign-off list + the Notify-for-edits picker. Brand and series picks show as inherited.',
        target: '[data-tour="event-tab-signoff"]',
      },
      {
        title: 'Templates & Styles (admin)',
        body: 'Templates configures the per-size background image + color palette the previews and Figma sync use. Styles override series defaults if you need event-specific tweaks.',
        target: '[data-tour="event-tab-templates"]',
      },
    ],
  },

  // ── MENU ─────────────────────────────────────────────────────────────────
  // The menu page is the deepest surface in the app — five tabs, each with
  // multiple actions. The tour walks through each tab in order, using
  // clickFirst on tab targets so the actual tab content opens as the
  // spotlight moves. Per-element steps within each tab follow.
  menu: {
    title: 'Menu page',
    summary: 'A guided walk through every tab — items, preview, edit log, sponsors, approvals.',
    steps: [
      // ── Top-of-page chips ────────────────────────────────────────────────
      {
        title: 'Edit menu settings',
        body: 'Change the menu name, size (SM / MD / LG), category, icon, and whether this menu needs sponsor approval before going live. The size choice drives which Figma template the plugin auto-targets.',
        target: '[data-tour="menu-edit-button"]',
      },
      {
        title: 'Approve the whole menu',
        body: 'When everything looks good, Approve Menu locks it (status → Approved). Subsequent item edits still save, but they get flagged as pending approval until you re-approve.',
        target: '[data-tour="menu-approve-button"]',
      },
      {
        title: 'Sync chip jumps to Figma',
        body: 'When Menu Hub data has drifted ahead of Figma, this amber Sync needed chip appears. Clicking it opens the linked Figma frame directly — desktop app if installed, browser if not.',
        target: '[data-tour="menu-sync-chip"]',
      },
      {
        title: 'Pending edits chip',
        body: 'Red count of edits that haven\'t been approved yet. Click to jump to the Edit Log tab pre-filtered to Pending.',
        target: '[data-tour="menu-pending-chip"]',
      },

      // ── Items tab ───────────────────────────────────────────────────────
      {
        title: 'Items tab',
        body: 'The day-to-day editing surface — every item with section headers, prices, dietary flags, status.',
        target: '[data-tour="menu-tab-items"]',
        clickFirst: true,
      },
      {
        title: 'CSV import / export',
        body: 'Import bulk-edited menus from a CSV (or the Master Google Sheet). Export to send to a designer or external reviewer. Column order matches the template — Section, Title, VT, VE, GF, Description, …',
        target: '[data-tour="menu-csv-toolbar"]',
      },
      {
        title: 'Add new item',
        body: 'Quick-add a new item to an existing section, or create a new section on the fly. Click an item row to edit it inline (drawer opens on the right).',
        target: '[data-tour="menu-add-item-button"]',
      },

      // ── Preview tab ─────────────────────────────────────────────────────
      {
        title: 'Preview tab',
        body: 'Live preview of the menu rendered the way it will appear in print, using the current style spec from series → event → menu inheritance.',
        target: '[data-tour="menu-tab-preview"]',
        clickFirst: true,
      },
      {
        title: 'Test different sizes',
        body: 'The Edit button lets you set the size (SM / MD / LG). Preview re-renders to that page format so you can see which size fits your content best.',
      },
      {
        title: 'Zoom into the preview',
        body: 'Click the expand icon on the preview canvas for a full-screen lightbox with zoom controls. Esc to close.',
      },

      // ── Edit Log tab ────────────────────────────────────────────────────
      {
        title: 'Edit Log tab',
        body: 'Every change ever made to this menu — who, when, what changed, old → new value. Grouped into Pending (default open), Approved, Rejected, History, Archived (collapsed by default).',
        target: '[data-tour="menu-tab-editlog"]',
        clickFirst: true,
      },
      {
        title: 'Approving an edit',
        body: 'Approve marks the change as live, flips the item back to Active, and notifies the original editor via Inbox. The edit log row drops into the Approved accordion.',
      },
      {
        title: 'Rejecting an edit',
        body: 'Reject reverts the item to its pre-edit values (walks every pending edit_log row for that item, takes the earliest old_value per field). The original editor gets notified. Row drops into Rejected.',
      },
      {
        title: 'Review notes',
        body: 'Each edit row can have a review note attached. Add your reasoning before approving or rejecting; the editor sees it in their inbox notification.',
      },
      {
        title: 'Archive cleans things up',
        body: 'Once an edit is resolved (approved or rejected), Archive moves it out of the active buckets so the log stays scannable. Restore brings it back. Admins can also Delete archived rows permanently.',
      },

      // ── Sponsors tab ────────────────────────────────────────────────────
      {
        title: 'Sponsors tab',
        body: 'Toggle which sponsors appear on this specific menu. By default the menu inherits the full active set from the event — turn ones off here that don\'t belong on this particular menu.',
        target: '[data-tour="menu-tab-sponsors"]',
        clickFirst: true,
      },
      {
        title: 'Reorder sponsors',
        body: 'Drag the ⋮⋮ handle to change order. Override sponsor order applies just to this menu; un-toggle the override to fall back to the event\'s order.',
      },

      // ── Approvals tab ───────────────────────────────────────────────────
      {
        title: 'Approvals tab',
        body: 'Two things live here: the sign-off list (named people whose explicit approval is required) and Notify for edits (people automatically tagged on every edit on this menu).',
        target: '[data-tour="menu-tab-signoff"]',
        clickFirst: true,
      },
      {
        title: 'Inherited from above',
        body: 'Brand → Series → Event notify picks show as inherited (grayed). Add anyone specific to this menu on top — they get pinged for every edit here.',
      },
      {
        title: 'You\'re set',
        body: 'That\'s every tab. Click the ? in the header anytime to relaunch this tour. Add the screenshot/feature you want highlighted next? Ask Sean.',
      },
    ],
  },

  // ── INBOX ────────────────────────────────────────────────────────────────
  inbox: {
    title: 'Inbox',
    summary: 'Notifications about edits you were tagged on and edits you made.',
    steps: [
      {
        title: 'Three buckets',
        body: 'Tagged in edits = someone explicitly notified you. My edits = your edit was approved or rejected. Archived = dismissed (collapses for clutter).',
        target: '[data-tour="inbox-link"]',
      },
      {
        title: 'Per-row actions',
        body: 'Click any notification to mark it read + jump to the menu. Archive removes it from active. Restore brings it back. Mark all read / Archive all top right.',
      },
    ],
  },

  // ── HELP ─────────────────────────────────────────────────────────────────
  help: {
    title: 'Help & resources',
    summary: 'Where the support docs and CSV template live.',
    steps: [
      {
        title: 'Walkthrough',
        body: 'The full presentation-style doc — the same content as these tours, but in one scannable page. PDF download for offline.',
      },
      {
        title: 'CSV template',
        body: 'Drop-in template with the right column order + a sample row. Use it as the starting point for bulk edits in Excel/Numbers/Sheets.',
      },
      {
        title: 'Master Google Sheet',
        body: 'Link to the shared sheet where every menu has its own tab. Apps Script powers the approve/email/log automation — instructions in the sheet itself.',
      },
    ],
  },
}

// localStorage key for tracking which tours a given user has seen.
export function tourSeenKey(userId) {
  return `menuhub.tours.seen.${userId || 'anon'}`
}
