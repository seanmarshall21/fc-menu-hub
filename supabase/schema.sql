-- ─────────────────────────────────────────────────────────────────────────────
-- MENU HUB — Supabase Schema
-- Run this in the Supabase SQL editor (Project → SQL Editor → New Query)
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ─── Brands ──────────────────────────────────────────────────────────────────
-- Top level: CRSSD, Outriders, LED, etc.
create table if not exists brands (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  logo_url    text,
  color       text,           -- hex accent color for UI
  created_at  timestamptz default now()
);

-- ─── Series ──────────────────────────────────────────────────────────────────
-- Mid level: CRSSD Fest, Proper, Under the Big Sky
create table if not exists series (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid references brands(id) on delete cascade,
  name        text not null,
  slug        text unique not null,
  created_at  timestamptz default now()
);

-- ─── Events ──────────────────────────────────────────────────────────────────
-- Specific dated events: CRSSD Fest Fall 2026, Under the Big Sky 2026
create table if not exists events (
  id              uuid primary key default gen_random_uuid(),
  series_id       uuid references series(id) on delete cascade,
  name            text not null,
  slug            text unique not null,
  event_date      date,
  venue           text,
  phase           text default 'build'
                  check (phase in ('build', 'proof', 'print_prep', 'approved', 'archived')),
  figma_file_url  text,
  created_at      timestamptz default now()
);

-- ─── Menus ───────────────────────────────────────────────────────────────────
-- Individual menus per event: Square Bar, Craft Cocktails, Happy Hour, etc.
create table if not exists menus (
  id                    uuid primary key default gen_random_uuid(),
  event_id              uuid references events(id) on delete cascade,
  name                  text not null,
  slug                  text not null,
  category              text default 'bar'
                        check (category in ('bar', 'food', 'vip', 'happy_hour', 'custom')),
  template_type         text default 'standard'
                        check (template_type in ('standard', 'custom')),
  phase                 text default 'build'
                        check (phase in ('build', 'proof', 'print_prep', 'approved')),
  -- Figma integration
  figma_frame_id        text,
  figma_prototype_url   text,
  -- Footer options
  footer_show_diet_key  boolean default true,
  footer_show_tax_text  boolean default true,
  footer_custom_text    text,
  -- Sync tracking
  last_synced_at        timestamptz,
  has_pending_edits     boolean default false,
  created_at            timestamptz default now(),
  unique(event_id, slug)
);

-- ─── Menu Sponsors ───────────────────────────────────────────────────────────
create table if not exists menu_sponsors (
  id          uuid primary key default gen_random_uuid(),
  menu_id     uuid references menus(id) on delete cascade,
  name        text not null,
  slug        text not null,           -- matches Figma sponsor--[slug] layer name
  logo_url    text,
  active      boolean default true,
  sort_order  int default 0
);

-- ─── Menu Items ──────────────────────────────────────────────────────────────
create table if not exists menu_items (
  id              uuid primary key default gen_random_uuid(),
  menu_id         uuid references menus(id) on delete cascade,
  section         text not null,
  title           text not null,
  description     text,
  vt              boolean default false,
  ve              boolean default false,
  gf              boolean default false,
  two_sizes       boolean default false,
  size1           text,
  price1          text,
  size2           text,
  price2          text,
  status          text default 'active'
                  check (status in ('active', 'not_added', 'draft')),
  notes           text,
  sort_order      int default 0,
  custom_fields   jsonb default '{}',
  -- Edit tracking
  edit_status     text default 'clean'
                  check (edit_status in ('clean', 'pending_approval', 'approved')),
  last_edited_by  uuid references auth.users(id),
  last_edited_at  timestamptz,
  created_at      timestamptz default now()
);

-- ─── Edit Log ────────────────────────────────────────────────────────────────
create table if not exists edit_log (
  id              uuid primary key default gen_random_uuid(),
  menu_item_id    uuid references menu_items(id) on delete cascade,
  menu_id         uuid references menus(id) on delete cascade,
  user_id         uuid references auth.users(id),
  user_email      text,
  field_changed   text not null,
  old_value       text,
  new_value       text,
  phase_at_edit   text,
  note            text,                              -- reviewer note explaining the edit / approval / rejection
  archived_at     timestamptz,                       -- soft-archive (anyone w/ log access can archive)
  archived_by     uuid references auth.users(id),
  redacted_at     timestamptz,                       -- author redaction (only if item not yet approved)
  redacted_by     uuid references auth.users(id),
  created_at      timestamptz default now()
);

-- ─── User Profiles ───────────────────────────────────────────────────────────
create table if not exists user_profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text,
  full_name       text,
  avatar_url      text,
  role            text default 'external'
                  check (role in ('admin', 'internal', 'external', 'viewer', 'production', 'pending')),
  brand_access    uuid[] default '{}',  -- brand IDs this user can access (empty = all for admin)
  -- Elevated permission for trusted internal users who manage the design
  -- system (styles, templates) alongside admins.
  can_edit_styles boolean default false,
  created_at      timestamptz default now()
);
-- Idempotent column add for existing projects
alter table user_profiles add column if not exists can_edit_styles boolean default false;

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into user_profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ─── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists idx_series_brand_id   on series(brand_id);
create index if not exists idx_events_series_id  on events(series_id);
create index if not exists idx_menus_event_id    on menus(event_id);
create index if not exists idx_menu_items_menu   on menu_items(menu_id);
create index if not exists idx_menu_items_status on menu_items(status);
create index if not exists idx_edit_log_menu     on edit_log(menu_id);
create index if not exists idx_edit_log_item     on edit_log(menu_item_id);

-- ─── Row Level Security ───────────────────────────────────────────────────────
alter table brands         enable row level security;
alter table series         enable row level security;
alter table events         enable row level security;
alter table menus          enable row level security;
alter table menu_sponsors  enable row level security;
alter table menu_items     enable row level security;
alter table edit_log       enable row level security;
alter table user_profiles  enable row level security;

-- Admins: full access to everything
create policy "admins_all" on brands         for all using (
  exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
);
create policy "admins_all" on series         for all using (
  exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
);
create policy "admins_all" on events         for all using (
  exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
);
create policy "admins_all" on menus          for all using (
  exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
);
create policy "admins_all" on menu_sponsors  for all using (
  exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
);
create policy "admins_all" on menu_items     for all using (
  exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
);
create policy "admins_all" on edit_log       for all using (
  exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
);

-- Internal users: read all, write items/menus for their accessible brands
create policy "internal_read" on brands for select using (
  exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal'))
);
create policy "internal_read" on series for select using (
  exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal'))
);
create policy "internal_read" on events for select using (
  exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal'))
);
create policy "internal_read" on menus for select using (
  exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal'))
);
-- Internal users run day-to-day: create + edit events and series too.
-- DELETE stays admin-only (admins_all). Mirrors the menus policies below.
create policy "internal_insert_events" on events for insert with check (
  exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal'))
);
create policy "internal_update_events" on events for update using (
  exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal'))
) with check (
  exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal'))
);
create policy "internal_insert_series" on series for insert with check (
  exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal'))
);
create policy "internal_update_series" on series for update using (
  exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal'))
) with check (
  exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal'))
);
-- Internal users build + edit menus (including the event-level CSV importer
-- which creates menu rows). INSERT + UPDATE only — DELETE stays admin-only
-- via admins_all so external/internal can't drop menus.
create policy "internal_insert_menus" on menus for insert with check (
  exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal'))
);
create policy "internal_update_menus" on menus for update using (
  exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal'))
) with check (
  exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal'))
);
create policy "internal_items_rw" on menu_items for all using (
  exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal'))
);
-- Internal users manage which sponsors appear on a menu (the menu Sponsors
-- tab toggles). Without this, saves silently failed under RLS and reverted.
create policy "internal_write_menu_sponsors" on menu_sponsors for all using (
  exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal'))
) with check (
  exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal'))
);
create policy "internal_read_log" on edit_log for select using (
  exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal'))
);

-- Internal users: full read+write on sponsor library + series/event/menu
-- sponsor join tables. They manage the sponsor lineup the same as admin.
-- (sponsors, series_sponsors, event_sponsors tables — created via dashboard
-- migration; these policies assume RLS is enabled on each.)
do $$
begin
  if to_regclass('public.sponsors') is not null then
    execute 'drop policy if exists "internal_sponsors_rw" on sponsors';
    execute 'create policy "internal_sponsors_rw" on sponsors for all using (exists (select 1 from user_profiles where id = auth.uid() and role in (''admin'',''internal'')))';
  end if;
  if to_regclass('public.series_sponsors') is not null then
    execute 'drop policy if exists "internal_series_sponsors_rw" on series_sponsors';
    execute 'create policy "internal_series_sponsors_rw" on series_sponsors for all using (exists (select 1 from user_profiles where id = auth.uid() and role in (''admin'',''internal'')))';
  end if;
  if to_regclass('public.event_sponsors') is not null then
    execute 'drop policy if exists "internal_event_sponsors_rw" on event_sponsors';
    execute 'create policy "internal_event_sponsors_rw" on event_sponsors for all using (exists (select 1 from user_profiles where id = auth.uid() and role in (''admin'',''internal'')))';
  end if;
end$$;
-- Internal users can also update edit_log (to archive / add reviewer notes / redact own).
create policy "internal_update_log" on edit_log for update using (
  exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal'))
);

-- All users: read their own profile
create policy "own_profile" on user_profiles for all using (id = auth.uid());
create policy "admin_read_profiles" on user_profiles for select using (
  exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
);
-- Internal users need to see other admin/internal users so they can be
-- tagged for edit notifications. We expose this via a SECURITY DEFINER
-- function rather than a recursive RLS policy — recursive policies on
-- user_profiles can interact unpredictably with the existing admin
-- policy and break the profile fetch (caller sees an empty result and
-- gets shown the Access Pending screen).
create or replace function list_taggable_users()
returns table (id uuid, full_name text, email text, role text)
language sql
security definer
stable
as $$
  select up.id, up.full_name, up.email, up.role
    from user_profiles up
   where up.role in ('admin','internal')
     and exists (
       select 1 from user_profiles me
        where me.id = auth.uid() and me.role in ('admin','internal')
     )
   order by up.full_name nulls last
$$;

-- ─── Cascading Figma component prefix ──────────────────────────────────────
-- Set per brand by default. Each level below (series, event, menu) can
-- override with its own prefix when a sub-section of the brand uses a
-- different master-component set. At sync time the plugin walks
-- menu → event → series → brand and picks the first non-null value.
--
-- Use case: CRSSD typically uses `crssd--menu-item_layout_main`, but one
-- bespoke event with a wholly different template can set its own prefix
-- without forcing the whole brand to switch.
alter table brands add column if not exists figma_component_prefix text;
alter table series add column if not exists figma_component_prefix text;
alter table events add column if not exists figma_component_prefix text;
alter table menus  add column if not exists figma_component_prefix text;
-- Backfill brand-level only; lower levels stay null (= inherit by default).
update brands set figma_component_prefix = slug where figma_component_prefix is null;

-- ─── Frame deep-link for the Sync chip ──────────────────────────────────────
-- When the plugin syncs a menu it writes the target frame's Figma node id
-- here. The Sync needed chip on MenuPage appends ?node-id={value} so clicking
-- it opens Figma right at the frame, not just the file.
alter table menus add column if not exists last_synced_frame_id text;
-- Content fingerprint of the last sync, written by mark_menu_synced. The
-- plugin also stores it on the frame's pluginData for drift detection; this
-- column keeps a server-side copy.
alter table menus add column if not exists last_sync_digest text;

-- "Check sponsors" status. sponsors_updated_at bumps whenever a menu's sponsor
-- selection changes (trigger on menu_sponsors); sponsors_checked_at is set when
-- a person verifies them. needs-check = changed since last checked (or never).
-- These columns are excluded from the updated_at stamp trigger above so they
-- don't false-flag "sync needed".
alter table menus add column if not exists sponsors_updated_at timestamptz;
alter table menus add column if not exists sponsors_checked_at timestamptz;
alter table menus add column if not exists sponsors_checked_by uuid;

-- Optional printed title (Figma + in-app preview); name stays the app identifier.
alter table menus add column if not exists print_title text;

-- Persistent review decisions per menu. 'ignored' = hide for now (resettable);
-- 'correct' = confirmed correct, never re-flag + fed into the review-menu prompt.
create table if not exists menu_review_decisions (
  id          uuid primary key default gen_random_uuid(),
  menu_id     uuid not null references menus(id) on delete cascade,
  signature   text not null,
  decision    text not null check (decision in ('ignored','correct')),
  kind text, field text, label text, detail text,
  created_by  uuid,
  created_at  timestamptz default now(),
  unique (menu_id, signature)
);
alter table menu_review_decisions enable row level security;
create policy mrd_read on menu_review_decisions for select using (
  exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal')));
create policy mrd_write on menu_review_decisions for all using (
  exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal'))
) with check (
  exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal')));
create or replace function bump_menu_sponsors_updated()
returns trigger language plpgsql security definer as $$
declare mid uuid;
begin
  mid := coalesce(new.menu_id, old.menu_id);
  update menus set sponsors_updated_at = now() where id = mid;
  return null;
end;
$$;
drop trigger if exists trg_bump_menu_sponsors_updated on menu_sponsors;
create trigger trg_bump_menu_sponsors_updated
  after insert or update or delete on menu_sponsors
  for each row execute function bump_menu_sponsors_updated();

-- ─── Per-person capability flags (internal users) ───────────────────────────
-- NULL = use the role default (full access for internal, so no regression).
-- Admin always bypasses. An internal user with all four off = "internal
-- viewer"; all on (or default) = "internal editor". Resolved in AuthContext
-- (UI) and — once enforcement ships — in capability-aware RLS policies.
alter table user_profiles add column if not exists cap_edit_content  boolean;
alter table user_profiles add column if not exists cap_edit_sponsors boolean;
alter table user_profiles add column if not exists cap_approve        boolean;
alter table user_profiles add column if not exists cap_manage_events  boolean;

-- updated_at stamping: bump only on real content/config changes. Sync,
-- preview, and sponsor-approval metadata writes must NOT advance updated_at,
-- or the "Sync needed" heuristic (updated_at > last_synced_at) false-flags a
-- menu immediately after syncing it. An explicit updated_at change by the
-- caller (the item-change touch trigger) is always respected.
create or replace function menus_stamp_updated_at_skip_sync_meta()
returns trigger language plpgsql as $$
begin
  if new.updated_at is distinct from old.updated_at then
    return new;
  end if;
  if (to_jsonb(new) - 'updated_at' - 'last_synced_at' - 'last_sync_digest'
        - 'last_synced_frame_id' - 'preview_image_url'
        - 'sponsor_approved_at' - 'sponsor_approved_by'
        - 'phase' - 'approval_overridden_by' - 'approval_overridden_at'
        - 'sponsors_checked_at' - 'sponsors_checked_by'
        - 'print_file_url' - 'prep_file_url' - 'locked')
     is distinct from
     (to_jsonb(old) - 'updated_at' - 'last_synced_at' - 'last_sync_digest'
        - 'last_synced_frame_id' - 'preview_image_url'
        - 'sponsor_approved_at' - 'sponsor_approved_by'
        - 'phase' - 'approval_overridden_by' - 'approval_overridden_at'
        - 'sponsors_checked_at' - 'sponsors_checked_by'
        - 'print_file_url' - 'prep_file_url' - 'locked')
  then
    new.updated_at = now();
  end if;
  return new;
end;
$$;
drop trigger if exists menus_stamp_updated_at on menus;
create trigger menus_stamp_updated_at before update on menus
  for each row execute function menus_stamp_updated_at_skip_sync_meta();

-- ─── Separate color for menu title vs item title ────────────────────────────
-- event_templates.color_title styles the big menu title; color_item_title
-- styles individual item names. Falls back to color_title when unset so
-- existing templates render unchanged.
alter table event_templates add column if not exists color_item_title text;
update event_templates set color_item_title = color_title where color_item_title is null;

-- ─── Cascading approver permissions ─────────────────────────────────────────
-- Like notify_user_ids: resolved as the UNION of the column across
-- brand → series → event → menu. menu_approver_ids gates "flip menu to
-- Approved"; edit_approver_ids gates "approve/reject pending item edits".
-- Admins can always approve. Empty resolved list = any internal user can
-- approve (default). Non-empty = only listed users (plus admins).
alter table brands add column if not exists menu_approver_ids uuid[] default '{}';
alter table series add column if not exists menu_approver_ids uuid[] default '{}';
alter table events add column if not exists menu_approver_ids uuid[] default '{}';
alter table menus  add column if not exists menu_approver_ids uuid[] default '{}';
alter table brands add column if not exists edit_approver_ids uuid[] default '{}';
alter table series add column if not exists edit_approver_ids uuid[] default '{}';
alter table events add column if not exists edit_approver_ids uuid[] default '{}';
alter table menus  add column if not exists edit_approver_ids uuid[] default '{}';

-- Hard enforcement (DB-level) of the approver lists. The app UI gates the
-- buttons; these triggers gate the actual writes so the rule holds even if
-- someone hits the API directly.
--   user_can_approve(menu_id, kind) → admin always; empty union → internal
--   default; else must be in the resolved union. Null auth.uid() (service
--   role / backend) bypasses.
-- Can the current user approve this menu? Admin always; else a designated
-- proofing-roster approver (event override → series default) OR a legacy
-- approver-list member; if no approvers configured, any internal user.
create or replace function user_can_approve(p_menu_id uuid, p_kind text)
returns boolean language plpgsql security definer stable as $$
declare v_uid uuid := auth.uid(); v_role text; v_approvers uuid[]; v_event uuid; v_series uuid;
begin
  if v_uid is null then return true; end if;
  select role into v_role from user_profiles where id = v_uid;
  if v_role = 'admin' then return true; end if;

  select m.event_id, e.series_id into v_event, v_series
    from menus m join events e on e.id = m.event_id where m.id = p_menu_id;
  -- New proofing roster (event override → series default).
  if p_kind = 'menu' then
    if exists (select 1 from event_approval_roles where event_id = v_event and role='proofing' and user_id = v_uid) then return true; end if;
    if not exists (select 1 from event_approval_roles where event_id = v_event and role='proofing')
       and exists (select 1 from series_approval_roles where series_id = v_series and role='proofing' and user_id = v_uid) then return true; end if;
  end if;

  if p_kind = 'menu' then
    select array(select distinct unnest(ids) from (
        select b.menu_approver_ids ids from menus m join events e on e.id=m.event_id join series s on s.id=e.series_id join brands b on b.id=s.brand_id where m.id=p_menu_id
        union all select s.menu_approver_ids from menus m join events e on e.id=m.event_id join series s on s.id=e.series_id where m.id=p_menu_id
        union all select e.menu_approver_ids from menus m join events e on e.id=m.event_id where m.id=p_menu_id
        union all select m.menu_approver_ids from menus m where m.id=p_menu_id
      ) q where ids is not null) into v_approvers;
  else
    select array(select distinct unnest(ids) from (
        select b.edit_approver_ids ids from menus m join events e on e.id=m.event_id join series s on s.id=e.series_id join brands b on b.id=s.brand_id where m.id=p_menu_id
        union all select s.edit_approver_ids from menus m join events e on e.id=m.event_id join series s on s.id=e.series_id where m.id=p_menu_id
        union all select e.edit_approver_ids from menus m join events e on e.id=m.event_id where m.id=p_menu_id
        union all select m.edit_approver_ids from menus m where m.id=p_menu_id
      ) q where ids is not null) into v_approvers;
  end if;
  if v_approvers is null or array_length(v_approvers,1) is null then return v_role = 'internal'; end if;
  return v_uid = any(v_approvers);
end; $$;

-- Approving (entering 'approved') is approver-only. Un-approving (leaving
-- 'approved' to reopen a menu for edits) is allowed for any internal/staff
-- user, not just designated approvers — anyone who needs to make an edit must
-- be able to take it off approved without waiting on an approver. Null
-- auth.uid() (service role / backend) bypasses both.
create or replace function trg_enforce_menu_approval()
returns trigger language plpgsql security definer as $$
declare v_uid uuid := auth.uid(); v_role text;
begin
  if NEW.phase = 'approved' and OLD.phase is distinct from 'approved' then
    -- Entering approved → must be a designated approver.
    if not user_can_approve(NEW.id, 'menu') then
      raise exception 'Not authorized to approve this menu';
    end if;
  elsif OLD.phase = 'approved' and NEW.phase is distinct from 'approved' then
    -- Leaving approved → any internal/staff user may reopen it for edits.
    if v_uid is not null then
      select role into v_role from user_profiles where id = v_uid;
      if v_role not in ('admin', 'internal') then
        raise exception 'Not authorized to change this menu''s approval status';
      end if;
    end if;
  end if;
  return NEW;
end; $$;
drop trigger if exists enforce_menu_approval on menus;
create trigger enforce_menu_approval before update on menus
  for each row execute function trg_enforce_menu_approval();

create or replace function trg_enforce_edit_approval()
returns trigger language plpgsql security definer as $$
begin
  if (OLD.edit_status = 'pending_approval' and NEW.edit_status is distinct from 'pending_approval')
     or (NEW.edit_status = 'approved' and OLD.edit_status is distinct from 'approved') then
    if not user_can_approve(NEW.menu_id, 'edit') then
      raise exception 'Not authorized to approve or reject edits on this menu';
    end if;
  end if;
  return NEW;
end; $$;
drop trigger if exists enforce_edit_approval on menu_items;
create trigger enforce_edit_approval before update on menu_items
  for each row execute function trg_enforce_edit_approval();

-- ─── Push notification subscriptions ────────────────────────────────────────
-- One row per (user, device/browser). The Service Worker on each device
-- subscribes once and posts the resulting PushSubscription here. The
-- send-push edge function reads from this table to fan out a notification.
-- Endpoints are unique per (user, endpoint) to avoid duplicate inserts on
-- re-subscribe; a user can have many endpoints (laptop, phone, work browser).
create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth_key    text not null,
  user_agent  text,
  created_at  timestamptz default now(),
  last_seen   timestamptz default now(),
  unique (user_id, endpoint)
);
alter table push_subscriptions enable row level security;
-- Each user can manage their own subscriptions.
create policy "own_push_sub" on push_subscriptions for all using (user_id = auth.uid());

-- Fan-out trigger: when a notifications row is inserted, fire off the
-- send-push edge function. Async via pg_net so the insert isn't blocked
-- if the function is slow / down. Requires pg_net extension enabled in
-- the Supabase dashboard (Database → Extensions → pg_net).
create or replace function notify_push_on_insert()
returns trigger as $$
declare
  v_url  text := current_setting('app.settings.supabase_url', true);
  v_key  text := current_setting('app.settings.service_role_key', true);
begin
  -- If pg_net isn't available or settings are missing, no-op so inserts
  -- still succeed. Pushes can be retried by another path (e.g. cron sweep
  -- over unread notifications older than N minutes).
  if v_url is null or v_key is null then return new; end if;
  perform net.http_post(
    url     := v_url || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object('notification_id', new.id)
  );
  return new;
exception when others then
  -- Never block the original insert because the push attempt failed.
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_notify_push on notifications;
create trigger trg_notify_push
  after insert on notifications
  for each row execute function notify_push_on_insert();

-- ─── Helper function: refresh just the preview thumbnail ────────────────────
-- Called from the Menu Sync plugin when the user wants to re-export the Figma
-- frame's PNG (e.g. after manual layout tweaks) WITHOUT marking the menu as
-- newly synced. Leaves last_synced_at and any sync digest untouched so the
-- drift indicator stays honest about whether Menu Hub data was actually
-- pushed to Figma.
create or replace function update_menu_preview(
  p_menu_id     uuid,
  p_preview_url text
) returns void as $$
begin
  update menus
     set preview_image_url = p_preview_url
   where id = p_menu_id;
end;
$$ language plpgsql security definer;

-- Clear a menu's Figma sync state from the plugin (anon key) so unlinking a
-- frame in Figma also disconnects it in Menu Hub. SECURITY DEFINER like
-- mark_menu_synced. Menu content is untouched.
create or replace function disconnect_menu_figma(p_menu_id uuid)
returns void language plpgsql security definer as $$
begin
  update menus
     set last_synced_at = null,
         last_synced_frame_id = null,
         last_sync_digest = null
   where id = p_menu_id;
end;
$$;

-- ─── Helper function: mark a menu as freshly synced ─────────────────────────
-- Plugin calls this after each successful Sync to:
--   - bump last_synced_at
--   - stash the content fingerprint (digest) for drift detection
--   - update the preview thumbnail URL (optional)
--   - record the linked Figma frame id so the Sync chip can deep-link
-- Wrapped in SECURITY DEFINER so the anon-key plugin can bypass RLS for
-- exactly these four fields without granting broader menu write access.
create or replace function mark_menu_synced(
  p_menu_id           uuid,
  p_preview_url       text default null,
  p_content_digest    text default null,
  p_frame_id          text default null
) returns void as $$
begin
  update menus
     set last_synced_at        = now(),
         preview_image_url     = coalesce(p_preview_url,    preview_image_url),
         last_sync_digest      = coalesce(p_content_digest, last_sync_digest),
         last_synced_frame_id  = coalesce(p_frame_id,       last_synced_frame_id)
   where id = p_menu_id;
end;
$$ language plpgsql security definer;

-- ─── Helper function: log a sponsor change on a menu ───────────────────────
-- Called when a menu's active sponsor set changes. Writes one row to
-- edit_log with menu_item_id = null and field_changed = 'sponsor' so the
-- existing edit log UI can render it alongside item edits. SECURITY DEFINER
-- so internal users can log without needing direct insert rights on edit_log.
create or replace function log_sponsor_change(
  p_menu_id      uuid,
  p_sponsor_name text,
  p_action       text  -- 'added' or 'removed'
) returns void as $$
begin
  insert into edit_log (menu_item_id, menu_id, user_id, user_email, field_changed, old_value, new_value, phase_at_edit)
  values (
    null,
    p_menu_id,
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    'sponsor',
    case when p_action = 'removed' then p_sponsor_name else '' end,
    case when p_action = 'added'   then p_sponsor_name else '' end,
    (select phase from menus where id = p_menu_id)
  );
end;
$$ language plpgsql security definer;

-- ─── Menus: sponsor-approval columns ─────────────────────────────────────────
-- Per-menu flag so the team can mark whether a menu requires sign-off from
-- the sponsor before it goes to print. Surfaced as a chip in the menu header.
alter table menus add column if not exists requires_sponsor_approval boolean default false;
alter table menus add column if not exists sponsor_approved_at       timestamptz;
alter table menus add column if not exists sponsor_approved_by       uuid references auth.users(id);

-- ─── Notifications ──────────────────────────────────────────────────────────
-- Per-user inbox. A row is created when:
--   • An editor tags users on an item edit (kind = 'tagged_in_edit')
--   • An item the user edited gets approved/rejected/etc (kind = 'edit_resolved')
--   • Future: cascading "Notify for edits" on a series/event/menu fires
-- The reader UI flips `read_at` (visited inbox) or `archived_at` (dismissed).
create table if not exists notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null,                  -- 'tagged_in_edit' | 'edit_resolved' | future
  title         text not null,
  body          text,
  link_url      text,                            -- internal app path, e.g. /menus/{slug}
  context       jsonb default '{}',              -- { series_id, event_id, menu_id, menu_item_id, edit_log_id }
  triggered_by  uuid references auth.users(id) on delete set null,
  created_at    timestamptz default now(),
  read_at       timestamptz,
  archived_at   timestamptz
);
create index if not exists idx_notifications_user_unread on notifications(user_id, archived_at) where read_at is null;
create index if not exists idx_notifications_user_active on notifications(user_id, archived_at);

alter table notifications enable row level security;

-- Owner can read + update + delete their own notifications.
create policy "notif_own_select" on notifications for select using (user_id = auth.uid());
create policy "notif_own_update" on notifications for update using (user_id = auth.uid());
create policy "notif_own_delete" on notifications for delete using (user_id = auth.uid());

-- Admins can read everyone's (helpful for support / audits).
create policy "notif_admin_select" on notifications for select using (
  exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
);

-- Inserts: gated through the create_notification RPC below (SECURITY DEFINER)
-- so we don't have to grant general insert access on notifications to all users.

-- Auto-notify the original editor when their pending edit gets resolved
-- (approved or rejected). Fires on every menu_items.edit_status update.
-- Skips the case where the editor is also the approver (no point notifying
-- yourself about your own action).
create or replace function trg_notify_edit_resolved()
returns trigger as $$
declare
  v_outcome   text;
  v_menu_name text;
  v_menu_slug text;
begin
  if old.edit_status = 'pending_approval'
     and new.edit_status in ('active','approved','rejected')
     and new.last_edited_by is not null
     and new.last_edited_by <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  then
    v_outcome := case new.edit_status when 'approved' then 'approved' else 'rejected' end;
    select name, slug into v_menu_name, v_menu_slug from menus where id = new.menu_id;
    insert into notifications (user_id, kind, title, body, link_url, context, triggered_by)
    values (
      new.last_edited_by,
      'edit_resolved',
      'Your edit on ' || coalesce(new.title, 'a menu item') || ' was ' || v_outcome,
      coalesce(v_menu_name, 'A menu') || ' · ' || initcap(v_outcome),
      '/menus/' || coalesce(v_menu_slug, new.menu_id::text),
      jsonb_build_object(
        'menu_id', new.menu_id,
        'menu_item_id', new.id,
        'outcome', v_outcome
      ),
      auth.uid()
    );
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists notify_edit_resolved on menu_items;
create trigger notify_edit_resolved
  after update of edit_status on menu_items
  for each row
  execute function trg_notify_edit_resolved();

-- Prune archived notifications older than 30 days. Safe to run manually
-- (returns the number of rows deleted) or schedule via Supabase pg_cron:
--   select cron.schedule('prune-notifications', '0 3 * * *',
--     'select prune_old_notifications()');
create or replace function prune_old_notifications()
returns integer
language sql
security definer
as $$
  with deleted as (
    delete from notifications
     where archived_at is not null
       and archived_at < now() - interval '30 days'
    returning id
  )
  select count(*)::integer from deleted
$$;

-- Helper function: create a notification for ONE user (called per recipient).
create or replace function create_notification(
  p_user_id      uuid,
  p_kind         text,
  p_title        text,
  p_body         text,
  p_link_url     text,
  p_context      jsonb
) returns void as $$
begin
  insert into notifications (user_id, kind, title, body, link_url, context, triggered_by)
  values (p_user_id, p_kind, p_title, p_body, p_link_url, coalesce(p_context, '{}'::jsonb), auth.uid());
end;
$$ language plpgsql security definer;

-- Cascading "Notify for edits" — list of user ids defined at each level.
-- The resolver merges them top-down: brand ∪ series ∪ event ∪ menu, then
-- the per-edit form lets the editor add/remove people for that single edit.
-- A null column = "no entries at this level" (inherit only). An empty array
-- {} also = "no entries at this level".
alter table brands add column if not exists notify_user_ids uuid[] default '{}';
alter table series add column if not exists notify_user_ids uuid[] default '{}';
alter table events add column if not exists notify_user_ids uuid[] default '{}';
alter table menus  add column if not exists notify_user_ids uuid[] default '{}';

-- Resolve the effective notify list for a given menu by walking up the
-- brand → series → event → menu chain and unioning every non-empty
-- notify_user_ids array. Returns a deduplicated set.
create or replace function resolve_menu_notify_ids(p_menu_id uuid)
returns uuid[] as $$
declare
  v_result uuid[];
begin
  select array(
    select distinct unnest(ids) from (
      select b.notify_user_ids as ids from menus m
        join events e on e.id = m.event_id
        join series s on s.id = e.series_id
        join brands b on b.id = s.brand_id
       where m.id = p_menu_id
      union all
      select s.notify_user_ids from menus m
        join events e on e.id = m.event_id
        join series s on s.id = e.series_id
       where m.id = p_menu_id
      union all
      select e.notify_user_ids from menus m
        join events e on e.id = m.event_id
       where m.id = p_menu_id
      union all
      select m.notify_user_ids from menus m where m.id = p_menu_id
    ) sub
    where ids is not null
  ) into v_result;
  return coalesce(v_result, '{}');
end;
$$ language plpgsql security definer stable;

-- ─── Helper function: log an edit ────────────────────────────────────────────
create or replace function log_menu_item_edit(
  p_item_id     uuid,
  p_menu_id     uuid,
  p_field       text,
  p_old_value   text,
  p_new_value   text,
  p_phase       text
) returns void as $$
begin
  insert into edit_log (menu_item_id, menu_id, user_id, user_email, field_changed, old_value, new_value, phase_at_edit)
  values (
    p_item_id,
    p_menu_id,
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    p_field,
    p_old_value,
    p_new_value,
    p_phase
  );
end;
$$ language plpgsql security definer;

-- ─── AI review cache + custom rules (event AI review group) ──────────────────
-- menu_ai_reviews: cached AI review per menu = the still-unresolved AI findings
-- at the reviewed content (content_hash). Empty + matching hash = done.
create table if not exists menu_ai_reviews (
  menu_id uuid primary key references menus(id) on delete cascade,
  content_hash text, findings jsonb not null default '[]', reviewed_at timestamptz default now()
);
alter table menu_ai_reviews enable row level security;
create policy mar_read on menu_ai_reviews for select using (exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal')));
create policy mar_write on menu_ai_reviews for all using (exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal'))) with check (exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal')));

-- review_rules: custom AI-review rules per tier (cascade), optional category.
create table if not exists review_rules (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('brand','series','event','menu')),
  scope_id uuid not null, text text not null, category text,
  mode text not null default 'flag' check (mode in ('flag','edit')),
  created_by uuid, created_at timestamptz default now()
);
alter table review_rules enable row level security;
create policy rr_read on review_rules for select using (exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal')));
create policy rr_write on review_rules for all using (exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal'))) with check (exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal')));

-- activity_messages: unified activity / chat thread per menu or event. Threaded,
-- @mentions, pin, priority, resolve. Absorbed the old menu_comments feedback.
create table if not exists activity_messages (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('menu','event')),
  scope_id uuid not null, parent_id uuid references activity_messages(id) on delete cascade,
  user_id uuid, body text not null, mentions uuid[] default '{}',
  pinned boolean default false, priority boolean default false,
  resolved_at timestamptz, resolved_by uuid, created_at timestamptz default now()
);
alter table activity_messages enable row level security;
create policy am_read on activity_messages for select using (auth.uid() is not null);
create policy am_insert on activity_messages for insert with check (user_id = auth.uid());
create policy am_update on activity_messages for update using (user_id = auth.uid() or exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal')));
create policy am_delete on activity_messages for delete using (user_id = auth.uid() or exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal')));

-- Activity reactions (per-user emoji on a message) + edit tracking.
create table if not exists activity_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references activity_messages(id) on delete cascade,
  user_id uuid, emoji text not null, created_at timestamptz default now(),
  unique (message_id, user_id, emoji)
);
alter table activity_reactions enable row level security;
create policy ar_read on activity_reactions for select using (auth.uid() is not null);
create policy ar_insert on activity_reactions for insert with check (user_id = auth.uid());
create policy ar_delete on activity_reactions for delete using (user_id = auth.uid());
alter table activity_messages add column if not exists edited_at timestamptz;

-- ─── 7-stage phase lifecycle + print deliverable links ──────────────────────
-- Menus and events both use: build → proof → edits → approved → exported →
-- complete → archived. "Edits" is also auto-shown (red badge) when a menu has
-- unresolved edits/feedback, layered over its stored phase.
alter table menus  drop constraint if exists menus_phase_check;
alter table menus  add  constraint menus_phase_check  check (phase in ('build','proof','edits','approved','exported','complete','archived'));
alter table events drop constraint if exists events_phase_check;
alter table events add  constraint events_phase_check check (phase in ('build','proof','edits','approved','exported','complete','archived'));
alter table menus  add column if not exists print_file_url   text;  -- link to the final print file for this menu
alter table menus  add column if not exists print_preview_url text;  -- rendered PNG/JPG of the print PDF (page 1); preferred preview once complete
alter table menus  add column if not exists quantity         integer; -- print quantity, editable any time (mirrored into order forms)

-- Set a menu's quantity without granting broad UPDATE on menus (production has
-- no menus-update policy). Admin/internal/production only.
create or replace function public.set_menu_quantity(p_menu_id uuid, p_quantity integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.user_profiles where id = auth.uid() and role = any (array['admin','internal','production'])) then
    raise exception 'not authorized';
  end if;
  update public.menus set quantity = p_quantity where id = p_menu_id;
end $$;
grant execute on function public.set_menu_quantity(uuid, integer) to authenticated;

-- Re-fetch a menu's print preview from its PDF (clear cache + re-fire render).
create or replace function public.refresh_print_preview(p_menu_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.user_profiles where id = auth.uid() and role = any (array['admin','internal','production'])) then
    raise exception 'not authorized';
  end if;
  update public.menus set print_preview_url = null, print_file_url = print_file_url where id = p_menu_id;
end $$;
grant execute on function public.refresh_print_preview(uuid) to authenticated;
-- NOTE: menus_stamp_updated_at_skip_sync_meta() also skips 'quantity' and
-- 'print_preview_url' so those never mark a menu "needs sync".
alter table events add column if not exists print_folder_url text;  -- link to the event's print-files folder

-- Auto-generate the print preview: when a menu becomes complete with a direct
-- (non-folder) print file, fire the Netlify background function that renders
-- page 1 → JPEG and stores it (which sets print_preview_url). Uses pg_net.
-- The secret below matches PREVIEW_HOOK_SECRET in the Netlify env; the applied
-- migration has the real value (kept out of source).
create or replace function public.trigger_print_preview() returns trigger
language plpgsql security definer as $$
declare need boolean;
begin
  if TG_OP = 'INSERT' then
    need := true;
  else
    need := (OLD.phase is distinct from NEW.phase) or (OLD.print_file_url is distinct from NEW.print_file_url);
  end if;
  if NEW.phase = 'complete'
     and NEW.print_file_url is not null and NEW.print_file_url <> ''
     and NEW.print_file_url not like '%/scl/fo/%'
     and (need or NEW.print_preview_url is null)
  then
    perform net.http_post(
      url := 'https://fcmenus.netlify.app/.netlify/functions/render-print-preview-background',
      body := jsonb_build_object('menuId', NEW.id::text, 'printFileUrl', NEW.print_file_url, 'secret', '<PREVIEW_HOOK_SECRET>'),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 8000
    );
  end if;
  return NEW;
end;
$$;
drop trigger if exists print_preview_on_complete on public.menus;
create trigger print_preview_on_complete
  after insert or update of phase, print_file_url on public.menus
  for each row execute function public.trigger_print_preview();

-- ─── Role-based approval rosters + per-menu sign-offs ────────────────────────
-- Replaces the brand→series→event cascade. Per event×role (proofing/sponsorship):
-- a roster of REQUIRED approvers, one flagged is_owner. Events inherit the
-- series default per role unless they have their own rows. A role's gate clears
-- only when every required approver has a menu_signoffs row for that menu.
create table if not exists series_approval_roles (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references series(id) on delete cascade,
  role text not null check (role in ('proofing','sponsorship')),
  user_id uuid not null, is_owner boolean default false, created_at timestamptz default now(),
  unique (series_id, role, user_id)
);
create table if not exists event_approval_roles (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  role text not null check (role in ('proofing','sponsorship')),
  user_id uuid not null, is_owner boolean default false, created_at timestamptz default now(),
  unique (event_id, role, user_id)
);
create table if not exists menu_signoffs (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references menus(id) on delete cascade,
  role text not null check (role in ('proofing','sponsorship')),
  user_id uuid not null, ai_reviewed boolean default false, note text, signed_at timestamptz default now(),
  unique (menu_id, role, user_id)
);
alter table events add column if not exists menus_freeze_at timestamptz;
-- RLS: rosters read-all / write admin+internal; signoffs read-all / own-row or admin.

-- Re-verify loop: content change to an APPROVED menu's items reopens it to
-- 'edits' and clears its proofing sign-offs (so plugin pull-backs / late edits
-- can't ship unverified). See reverify_approved_menu() + trg_reverify_approved_menu.

-- ─── Notification preferences + server-side fan-out ─────────────────────────
-- notification_prefs(user_id, all_edits, all_status, comments): per-user global
-- subscriptions. Triggers fan out into notifications: notify_menu_status (phase
-- change → all_status subs), notify_item_edit (menu_items content change/add/
-- remove → all_edits subs), notify_activity (activity_messages → comments subs +
-- always @mentioned). menu_link() builds the deep link. @mentions + per-menu
-- 'notify for edits' tags always notify regardless of prefs.

-- Sponsor row wrap setting (1-3 lines, evenly spaced) for the bulk sponsor tool.
alter table menus add column if not exists sponsor_max_lines int default 1 check (sponsor_max_lines between 1 and 3);

-- Approval mode per role roster: 'all' (every approver must sign) or 'any' (one
-- is enough). Added 2026-06; default 'all' preserves prior unanimous behavior.
alter table event_approval_roles  add column if not exists approval_mode text not null default 'all' check (approval_mode in ('all','any'));
alter table series_approval_roles add column if not exists approval_mode text not null default 'all' check (approval_mode in ('all','any'));

-- Per-approver "required" flag (supersedes approval_mode above). If a role has
-- any required approvers, all of them must sign; if none are required, any one
-- approver is enough. Default true preserves prior "everyone signs" behavior.
alter table event_approval_roles  add column if not exists required boolean not null default true;
alter table series_approval_roles add column if not exists required boolean not null default true;

-- Prep/print folder links (event) + optional prep/print file links (menu) +
-- approval lock. Exported sets the prep folder; Complete sets the print folder.
-- A menu's prep file is hidden once a print file is added. `locked` is set true
-- on approval; the Menu Sync plugin refuses to overwrite a locked menu.
alter table events add column if not exists prep_folder_url text;
alter table menus  add column if not exists prep_file_url text;
alter table menus  add column if not exists locked boolean not null default false;

-- Departments a user belongs to (multi); drives the My Tasks view + phase
-- notifications. Admins see all. Values: sponsorship, food_bev, design.
alter table user_profiles add column if not exists departments text[] not null default '{}';

-- ─── Department phase notifications ─────────────────────────────────────────
-- Notify a whole department when their phase opens. menu_path() builds the deep
-- link; notify_department() inserts one notification per user in the dept
-- (excluding the actor). Triggers: new menu → Sponsorship; sponsors checked off
-- → Food & Beverage; approved → Design; complete → Food & Beverage.
create or replace function menu_path(p_menu_id uuid)
returns text language sql stable as $$
  select '/brands/' || b.slug || '/series/' || s.slug || '/events/' || e.slug || '/menus/' || m.slug
  from menus m join events e on e.id = m.event_id
  join series s on s.id = e.series_id join brands b on b.id = s.brand_id
  where m.id = p_menu_id;
$$;
create or replace function notify_department(p_dept text, p_kind text, p_title text, p_body text, p_link text, p_menu_id uuid, p_event_id uuid)
returns void language plpgsql security definer as $$
begin
  insert into notifications (user_id, kind, title, body, link_url, context, triggered_by)
  select up.id, p_kind, p_title, p_body, p_link,
         jsonb_build_object('menu_id', p_menu_id, 'event_id', p_event_id),
         nullif(coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid), '00000000-0000-0000-0000-000000000000'::uuid)
  from user_profiles up
  where p_dept = any(up.departments)
    and up.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
end;
$$;
-- (trigger functions trg_notify_menu_added / _sponsors_checked / _menu_phase_dept
--  + their triggers are applied via the SQL editor — see migration notes.)

-- Admins can update ANY user's profile (departments, capabilities, styles).
-- Without this, only the own_profile (id = auth.uid()) policy applied, so admin
-- edits to other users silently affected 0 rows. is_admin() is SECURITY DEFINER
-- so the check doesn't re-trigger RLS on user_profiles.
drop policy if exists admin_update_profiles on user_profiles;
create policy admin_update_profiles on user_profiles
  for update using (is_admin()) with check (is_admin());

-- Notification de-dup: superseding prior UNREAD notifications for the same menu
-- so back-and-forth status changes don't pile up. (Applied live 2026-07.)
create or replace function notify_menu_status() returns trigger language plpgsql security definer as $$
declare lnk text;
begin
  if NEW.phase is distinct from OLD.phase then
    lnk := menu_link(NEW.id);
    delete from notifications where kind='status_change' and (context->>'menu_id')=NEW.id::text and read_at is null and archived_at is null;
    insert into notifications (user_id, kind, title, body, link_url, context)
    select p.user_id, 'status_change', NEW.name || ' → ' || NEW.phase, 'Status changed to ' || NEW.phase || '.', lnk,
           jsonb_build_object('menu_id', NEW.id, 'event_id', NEW.event_id)
    from notification_prefs p where p.all_status = true;
  end if;
  return NEW;
end $$;
create or replace function notify_department(p_dept text, p_kind text, p_title text, p_body text, p_link text, p_menu_id uuid, p_event_id uuid)
returns void language plpgsql security definer as $$
begin
  delete from notifications n using user_profiles up
   where n.user_id = up.id and p_dept = any(up.departments) and n.kind = p_kind
     and (n.context->>'menu_id') = p_menu_id::text and n.read_at is null and n.archived_at is null;
  insert into notifications (user_id, kind, title, body, link_url, context, triggered_by)
  select up.id, p_kind, p_title, p_body, p_link, jsonb_build_object('menu_id', p_menu_id, 'event_id', p_event_id),
         nullif(coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid), '00000000-0000-0000-0000-000000000000'::uuid)
  from user_profiles up where p_dept = any(up.departments) and up.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
end $$;

-- Configurable departments (admin-managed). The 3 built-ins are seeded; admins
-- can edit them and add more. permissions = capability keys members inherit
-- (stage 2), phases = lifecycle phases they own. (Applied live 2026-07.)
create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  key text unique not null, label text not null, blurb text,
  permissions text[] not null default '{}', phases text[] not null default '{}',
  sort_order int default 0, built_in boolean default false, created_at timestamptz default now()
);
alter table departments enable row level security;
drop policy if exists departments_read on departments;
create policy departments_read on departments for select using (auth.uid() is not null);
drop policy if exists departments_admin on departments;
create policy departments_admin on departments for all using (is_admin()) with check (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- Preview share links ("Send previews" → public review pieces). A share snapshots
-- {name, category, size, image, printFile} per menu so the public /share/:id
-- gallery needs no access to the RLS-protected menus table. Toggles: is_public
-- (private = login required), show_print_files, allow_comments.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.menu_preview_shares (
  id uuid primary key default gen_random_uuid(),
  title text,
  items jsonb not null default '[]'::jsonb,
  is_public boolean not null default true,
  show_print_files boolean not null default false,
  allow_comments boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
-- Order-form variant: kind='order' snapshots quantities in items[].quantity and
-- renders a printable order via `layout` ('gallery' | 'list' | 'both').
alter table public.menu_preview_shares add column if not exists kind   text not null default 'preview';
alter table public.menu_preview_shares add column if not exists layout text;
alter table public.menu_preview_shares add column if not exists notes  text;
alter table public.menu_preview_shares add column if not exists meta   jsonb not null default '{}'::jsonb; -- order: { eventId, eventDate, eventLocation, neededBy, eventIcon }
alter table public.menu_preview_shares add column if not exists is_live boolean not null default false; -- order: reflect current menu quantities (else frozen snapshot)

-- Staff (admin/internal/production) may edit ANY order form — the library lets
-- you open and revise forms made by others. Preview shares stay owner-only
-- (the base "update own shares" policy still applies to those).
drop policy if exists "staff update order shares" on public.menu_preview_shares;
create policy "staff update order shares" on public.menu_preview_shares
  for update to authenticated
  using (kind = 'order' and exists (select 1 from public.user_profiles where id = auth.uid() and role = any (array['admin','internal','production'])))
  with check (kind = 'order');
drop policy if exists "staff delete order shares" on public.menu_preview_shares;
create policy "staff delete order shares" on public.menu_preview_shares
  for delete to authenticated
  using (kind = 'order' and exists (select 1 from public.user_profiles where id = auth.uid() and role = any (array['admin','internal','production'])));
alter table public.menu_preview_shares add column if not exists is_live boolean not null default false; -- order: reflect menus' current quantities (via items[].menuId) vs frozen snapshot
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'menu_preview_shares_kind_check') then
    alter table public.menu_preview_shares add constraint menu_preview_shares_kind_check check (kind in ('preview','order'));
  end if;
end $$;
alter table public.menu_preview_shares enable row level security;
drop policy if exists "read public shares" on public.menu_preview_shares;
create policy "read public shares" on public.menu_preview_shares for select using (is_public = true);
drop policy if exists "auth read shares" on public.menu_preview_shares;
create policy "auth read shares" on public.menu_preview_shares for select to authenticated using (true);
drop policy if exists "insert own shares" on public.menu_preview_shares;
create policy "insert own shares" on public.menu_preview_shares for insert to authenticated with check (auth.uid() = created_by);
drop policy if exists "update own shares" on public.menu_preview_shares;
create policy "update own shares" on public.menu_preview_shares for update to authenticated using (auth.uid() = created_by);
drop policy if exists "delete own shares" on public.menu_preview_shares;
create policy "delete own shares" on public.menu_preview_shares for delete to authenticated using (auth.uid() = created_by);

create table if not exists public.menu_preview_share_comments (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.menu_preview_shares(id) on delete cascade,
  menu_index int,
  author_name text,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_share_comments_share on public.menu_preview_share_comments(share_id);
alter table public.menu_preview_share_comments enable row level security;
drop policy if exists "read share comments" on public.menu_preview_share_comments;
create policy "read share comments" on public.menu_preview_share_comments for select using (
  exists (select 1 from public.menu_preview_shares s where s.id = share_id and s.is_public = true));
drop policy if exists "auth read share comments" on public.menu_preview_share_comments;
create policy "auth read share comments" on public.menu_preview_share_comments for select to authenticated using (true);
drop policy if exists "insert share comments" on public.menu_preview_share_comments;
create policy "insert share comments" on public.menu_preview_share_comments for insert with check (
  exists (select 1 from public.menu_preview_shares s
    where s.id = share_id and s.allow_comments = true and (s.is_public = true or auth.role() = 'authenticated')));
-- The share's creator can delete feedback on their own shares (moderation).
drop policy if exists "owner delete share comments" on public.menu_preview_share_comments;
create policy "owner delete share comments" on public.menu_preview_share_comments for delete to authenticated using (
  exists (select 1 from public.menu_preview_shares s
    where s.id = menu_preview_share_comments.share_id and s.created_by = auth.uid()));
