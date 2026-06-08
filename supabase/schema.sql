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
-- Internal users can also update edit_log (to archive / add reviewer notes / redact own).
create policy "internal_update_log" on edit_log for update using (
  exists (select 1 from user_profiles where id = auth.uid() and role in ('admin','internal'))
);

-- All users: read their own profile
create policy "own_profile" on user_profiles for all using (id = auth.uid());
create policy "admin_read_profiles" on user_profiles for select using (
  exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
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
