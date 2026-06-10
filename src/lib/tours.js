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
  menu: {
    title: 'Menu page',
    summary: 'The day-to-day editing surface. Items, preview, edit log, approvals.',
    steps: [
      {
        title: 'Items tab',
        body: 'Add, edit, reorder, and section your items. Click any item row to open the edit form. Changes save when you press Save — not before. External edits land as Pending Approval.',
        target: '[data-tour="menu-tab-items"]',
      },
      {
        title: 'Preview',
        body: 'Live preview of the menu the way it will appear in print. Click the expand icon for a full-screen lightbox with zoom.',
        target: '[data-tour="menu-tab-preview"]',
      },
      {
        title: 'Edit Log',
        body: 'Every change ever made to this menu, grouped into Pending / Approved / Rejected / History accordions. Add review notes, approve or reject pending edits, archive resolved ones.',
        target: '[data-tour="menu-tab-editlog"]',
      },
      {
        title: 'Sponsors',
        body: 'Toggle which sponsors appear on this specific menu (subset of the event\'s active set), and reorder them if needed.',
        target: '[data-tour="menu-tab-sponsors"]',
      },
      {
        title: 'Approvals',
        body: 'Per-menu sign-off list + Notify-for-edits picker. Brand/series/event picks show as inherited and pre-fill each item\'s edit form.',
        target: '[data-tour="menu-tab-signoff"]',
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
