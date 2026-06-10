# Menu Hub — engineering notes for Claude

Small project-specific guardrails that every Claude session on this repo should
respect, in addition to the global behavior. Keep this file short; long-form
context belongs in `docs/` or inline code comments.

## UI rules

### Buttons stay on one line, always

CTA labels never wrap across two lines. The button stays its natural width;
surrounding text/container shrinks instead. Apply by default:

- `whitespace-nowrap` on every button's className
- `flex-shrink-0` when the button sits in a flex row next to growing text
  (`flex items-center justify-between` is the common culprit)

The two-line "Turn off" / "Save changes" look is broken-looking and not
acceptable. If a button label legitimately can't fit the viewport, shorten the
copy — don't let it wrap.

## Stack

- React 18 + Vite + Tailwind 3 + React Router v6
- Supabase: Postgres + Auth + Storage + Edge Functions, RLS-first
- Deployed to fcmenus.netlify.app (Netlify project: **fcmenus**, not fcbkstg)
- Companion Figma plugin lives at `../menu-sync-plugin/`
- Master Sheet Apps Script at `../sheets-script/Code.gs`

## Conventions

- Don't add Vivo / VivoCreative branding anywhere — Menu Hub is a CRSSD product
- `?` button + onboarding tours are wired up via `tourKey` on `<PageScreen>`;
  definitions live in `src/lib/tours.js`
- New SQL goes in `supabase/schema.sql` with `if not exists` guards; the user
  copies relevant chunks into the Supabase SQL editor by hand
- Plugin runtime is QuickJS — no `??` or `?.`, no async page switching except
  via `figma.setCurrentPageAsync()`
