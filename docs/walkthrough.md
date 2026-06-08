# Menu Hub — Walkthrough

A guide for everyone editing menus in **Menu Hub** ([fcmenus.netlify.app](https://fcmenus.netlify.app)).

This covers what you'll touch day-to-day. Anything design-system, brand-setup, or Figma-template-related is covered in a separate **Admin Walkthrough** doc.

---

## 1. The big picture

Menu Hub is the **single source of truth** for every menu across every event. You edit content here; the Figma menu templates pull from here; the printed PDF/SVG exports pull from here. No more passing CSVs around or hunting for the latest version of a Figma file.

The hierarchy goes:

> **Brand** → **Series** → **Event** → **Menu** → **Items**

For CRSSD, that looks like:

> **CRSSD** → **CRSSD Festival** → **CRSSD Spring 2026** → **Craft Cocktails** → *Waterfront Mule, Bay Breeze Spritz, …*

You'll spend most of your time at the **Menu** and **Item** levels.

---

## 2. Logging in

1. Go to **[fcmenus.netlify.app](https://fcmenus.netlify.app)**
2. Sign in with your email + password
3. First time logging in: use the magic-link or password reset flow from the sign-in page
4. If you don't have access yet, ask Sean — accounts are added one at a time

After logging in you land on the **Dashboard**.

---

## 3. Dashboard

Your home screen. Shows:

| Panel | What it is |
|---|---|
| **Recent Events** | Events you've touched lately — fastest way back into work |
| **Brands** | Every brand you have access to. Click one to drill in |
| **Favorites** | Star any event/menu and it appears here |

The left sidebar always has **Dashboard, Favorites, Sponsors, Help, Admin**. The brands you have access to also appear in the sidebar under "BRANDS".

---

## 4. Navigating to a menu

The path is always the same:

1. Click a brand in the sidebar (e.g. **CRSSD**)
2. Click a series (e.g. **CRSSD Festival**)
3. Click an event (e.g. **CRSSD Spring 2026**)
4. Click a menu (e.g. **Craft Cocktails**)

The breadcrumb at the top (`CRSSD / CRSSD Festival / CRSSD Spring 2026`) is clickable — use it to jump back up.

The **<** back arrow next to the page title also works.

---

## 5. The event page — what each tab does

When you open an event, you see these tabs:

| Tab | What it shows |
|---|---|
| **Menus** | Every menu for this event as cards. **Status chip** (Build / Proof / Approved) on each. **Sync chip** (Synced / Not synced) shows whether the Figma version is up to date. **Red number badge** = pending edits awaiting approval. Click a card to open it. |
| **Preview all** | Visual previews of every menu in one screen — handy for review meetings |
| **Sponsors** | All sponsors enabled for this event. Toggle which ones are active. This populates the sponsor library that menus draw from |
| **Approvals** | Sign-off panel. Track who needs to approve the event-level work and where each person stands |

---

## 6. The menu page — what each tab does

When you open a menu, you see these tabs:

| Tab | What it does |
|---|---|
| **Items** | Where you do 90% of the work. List every item with section headers, prices, dietary flags, status |
| **Preview** | Live preview of the menu rendered the way it will appear in print. Pinch/scroll to zoom; click the expand icon for a full-screen lightbox |
| **Edit Log** | Every change made to this menu — who, when, what changed. Pending edits get an amber badge |
| **Sponsors** | Toggle which sponsors appear on **this specific menu** (subset of the event's sponsor library) |
| **Approvals** | Per-menu sign-off. Same idea as event-level Approvals, but scoped to this menu |

---

## 7. Editing items — the core workflow

### Adding an item

1. On the **Items** tab, scroll to the section you want to add to (or create a new section)
2. Click **"+ Add item to [Section]"** at the bottom of the section
3. Fill in the row:
   - **Title** *(required)*
   - **Description**
   - **Dietary flags** (VT / VE / GF) — tick whichever apply
   - **Size** + **Price** — e.g. `12oz` + `$8`
   - **2 Sizes?** — tick this if you want a second size/price (e.g. Single / Double)
   - **Size 2** + **Price 2** — only used if "2 Sizes" is on
   - **Status** — Active (will appear), Not Added (won't appear), Draft (won't appear, work-in-progress)
   - **Notes** — internal notes about this item, optional

### Editing an existing item

Click any cell to edit in place. Changes save automatically when you tab out or click elsewhere.

### Why your edit shows up amber

Any edit you make on an Active item flips it to **Pending Approval**. The change is saved, but it won't appear in syncs to Figma until an admin approves it.

Why: prevents accidental mid-edit changes from going live before someone signs off.

### Reordering items

Grab the row by the **⋮⋮** handle on the left and drag up/down. Items can't move between sections — you'd need to change the section name on the item itself.

### Reordering sections

Use the **↑ section / ↓ section** buttons in the section header.

### Reset columns

If you've dragged columns around or resized them and want the default layout back, click **Reset columns** above the table.

---

## 8. Status values — what each one means

Every item has a Status. This controls whether it shows up where.

| Status | Where it appears |
|---|---|
| **Active** | Shows in Menu Hub, Figma sync, exports — the live menu |
| **Pending Approval** | Saved but not visible in syncs until approved. Highlighted amber |
| **Not Added** | Saved but explicitly hidden. Use for items you want to keep around but not show this round |
| **Draft** | Saved as work-in-progress. Hidden everywhere except the Items table |

Same vocabulary applies in the Master Google Sheet and CSV imports.

---

## 9. Sections

Sections are just text labels — type whatever you want (`SIGNATURES`, `BEER`, `NON-ALCOHOLIC`, etc.). Items group automatically by their Section field.

To rename a section, change the Section field on every item in it (or use the Master Sheet for bulk).

To create a new section, type its name in any item's Section field. The new section appears in the table immediately.

---

## 10. CSV import / export

The most common bulk workflow.

### Exporting a menu

1. Open the menu → **Items** tab
2. Click **Export CSV** (top right)
3. Downloads a `.csv` you can open in Excel/Numbers/Google Sheets

### Importing a menu

1. Open the menu → **Items** tab
2. Click **Import CSV**
3. Drop your CSV file — preview shows you what will be added/updated
4. Confirm to apply

### CSV column order

The columns are fixed and must be:

| Section | Title | VT | VE | GF | Description | 2 Sizes | Size | Price | Size 2 | Price 2 | Status | Notes |
|---------|-------|----|----|----|-------------|---------|------|-------|--------|---------|--------|-------|

- **VT / VE / GF / 2 Sizes** = `TRUE` or `FALSE`
- **Price columns** can be `12`, `$12`, `$12.00` — all get normalized
- **Status** = `Active`, `Pending Approval`, `Not Added`, or `Draft`

If you download the **template CSV** from Menu Hub (Items tab → Import CSV → "Download template"), it has the right headers and an example row.

### The Master Google Sheet

There's a Master Sheet that mirrors the CSV format with one tab per menu, plus extra automation (auto-flag edits, approval workflow, version log). If you've been given access, use it for bulk edits across many menus at once.

Instructions for the Master Sheet are in the sheet itself (Help / README tab).

---

## 11. Approving edits

When someone edits an Active item, its Status flips to **Pending Approval**.

To approve:

1. Open the menu → **Items** tab
2. Pending items are highlighted amber. You'll also see an amber **"Edits"** chip in the page header
3. Click **Approve Menu** (top of page) to approve everything in one shot, **or**
4. Open the **Edit Log** tab to review each change individually, with old/new value diffs, and approve/reject from there
5. Approved items return to **Active** and the next Figma sync will push them out

Internal users can approve their own and others' edits. External users can edit but not approve (only an admin/internal can approve external edits).

---

## 12. The Preview tab

Shows the menu rendered the way it will look in print, using whatever style spec the brand/event/menu is set to.

- **Zoom in/out** with the +/− buttons in the lightbox
- **Reset zoom** with the percentage label
- **Esc** or click the X to close the lightbox
- The preview also gets pushed to Figma when someone syncs the menu via the **Menu Sync** plugin

If the preview looks off (cut off, weird spacing), an admin needs to adjust the menu's style overrides — flag it to them.

---

## 13. Sponsors

Sponsors are managed at three levels:

| Level | Where | What |
|---|---|---|
| **Series** | Sidebar → Sponsors | The full library of sponsors that exist for the series. Sean/admin manages this |
| **Event** | Event → Sponsors tab | Which sponsors are active for this event (subset of the series library) |
| **Menu** | Menu → Sponsors tab | Which sponsors appear on this specific menu (subset of the event's active set) |

Each menu can override / re-order which sponsors appear. By default, menus inherit the full active set from the event.

To add a sponsor not yet in the library: ask Sean — it has to be added to the series-level library first.

---

## 14. Sync status — what the chips mean

On the event's **Menus** tab, each menu card shows a chip:

| Chip | Meaning |
|---|---|
| 🟢 **Synced** | The Figma version is up to date with the latest Menu Hub data |
| 🟡 **Sync** (yellow) | Menu Hub has changes that haven't been pushed to Figma yet. Tell whoever runs the plugin to re-sync |
| ⚪️ **Not synced** | This menu has never been pushed to Figma. Needs an initial sync |

A red number badge means there are **pending edits** awaiting approval — not the same as sync status.

The Figma sync itself is run by whoever has the **Menu Sync** plugin installed (covered in the Admin Walkthrough). You don't need to do it — but you can watch the chip to know when your edits have made it to print.

---

## 15. Favorites

Star ⭐ icon on any event or menu's header → it appears in your **Favorites** sidebar item. Per-user, so star whatever you work on most.

---

## 16. Mobile

Menu Hub works on phone/tablet. Cards stack, tabs scroll horizontally. The items table becomes a card list. Editing inline still works.

Reasonable for quick checks, status approvals, walking through a menu with a vendor. Not ideal for heavy bulk editing — use a laptop for that.

---

## 17. Help inside the app

Sidebar → **Help** has searchable docs that mirror this walkthrough, plus FAQs and shortcuts. The version inside the app is always the most current — if something here is out of date, that one wins.

---

## 18. Who to ask

| Issue | Who |
|---|---|
| Can't log in / forgot password | Sean |
| Need access to a brand | Sean |
| Preview looks broken | Sean (style spec issue) |
| Want to add a sponsor not in the library | Sean (series-level addition) |
| Found a bug | Sean — describe the menu, the tab, and what happened |
| Want to bulk-edit dozens of items | Use the Master Google Sheet, or ask Sean for access |

---

## 19. Things to remember

- Your edits **save automatically** — no Save button to forget
- Edits to Active items become **Pending Approval** until someone signs off
- Status defaults to **Active** when you add a new item — if it should be hidden initially, set it to **Draft**
- The **Preview** tab is the source of truth for how the printed menu will look, **not** the items table layout
- Don't rename sections by editing one item — change the Section field on every item in that section (the Master Sheet makes this easy)
- The **Sync chip** tells you whether your changes have hit Figma yet; it doesn't mean your edits aren't saved (they are, immediately)

---

*Last updated: June 2026. For the always-current version, see the Help page inside Menu Hub.*
