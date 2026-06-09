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
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  full_name     text,
  avatar_url    text,
  role          text default 'external'
                check (role in ('admin', 'internal', 'external')),
  brand_access  uuid[] default '{}',  -- brand IDs this user can access (empty = all for admin)
  created_at    timestamptz default now()
);

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
create policy "internal_items_rw" on menu_items for all using (
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
-- tagged for edit notifications.
create policy "internal_read_profiles" on user_profiles for select using (
  exists (select 1 from user_profiles up where up.id = auth.uid() and up.role in ('admin','internal'))
);

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
