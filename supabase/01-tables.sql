-- ============================================================================
-- Eventora OS — SQL file 1 of 4: all tables (including activity_log, staff_users, bill_counters)
-- Supabase → SQL Editor → New query → paste this whole file → Run. Safe to run again.
-- Run the files in order: 01, 02, 03, then 04-check.sql.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- Tables ----
create table if not exists public.catalog (
  id text primary key,
  categories jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  customer_name text not null,
  mobile text not null,
  event_type text not null,
  event_date date not null,
  guests integer not null check (guests > 0),
  customer_gst_number text,
  hall text not null default 'Eventora',
  services jsonb not null default '[]'::jsonb,
  pricing jsonb not null,
  status text not null default 'new' check (status in ('new', 'contacted', 'confirmed', 'archived')),
  created_at timestamptz not null default now()
);
create index if not exists quotes_created_at_idx on public.quotes (created_at desc);
create index if not exists quotes_event_date_idx on public.quotes (event_date);
create index if not exists quotes_status_idx on public.quotes (status);

-- Business profile ('business') and payment account details ('payment').
create table if not exists public.app_settings (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Employees: they sign in with a normal Supabase user, then are listed here (see supabase/add-employee.sql).
create table if not exists public.staff_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Everything that happens: bills created / edited / deleted, payments received / cancelled, bookings...
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_email text,
  actor_role text,
  action text not null,
  reference text,
  title text not null,
  detail text,
  data jsonb not null default '{}'::jsonb
);
create index if not exists activity_log_at_idx on public.activity_log (at desc);

-- One row per day: the last bill number handed out that day. Numbers are never given out twice, even if the bill is deleted.
create table if not exists public.bill_counters (
  day date primary key,
  last_seq integer not null
);

