create extension if not exists pgcrypto;

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
  hall text not null default 'Swagattam Party Lawns',
  services jsonb not null default '[]'::jsonb,
  pricing jsonb not null,
  status text not null default 'new' check (status in ('new', 'contacted', 'confirmed', 'archived')),
  created_at timestamptz not null default now()
);

create index if not exists quotes_created_at_idx on public.quotes (created_at desc);
create index if not exists quotes_event_date_idx on public.quotes (event_date);