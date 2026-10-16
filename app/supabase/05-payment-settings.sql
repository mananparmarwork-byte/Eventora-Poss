-- Run this ONCE in Supabase -> SQL Editor (safe to run again).
-- It creates a private place to keep your payment account details (UPI ID and optional bank details)
-- so they are the same on every phone / computer you sign in from.
-- Only signed-in admins can read or change them. Visitors cannot see anything here.

create table if not exists public.payment_settings (
  id text primary key default 'default',
  upi_id text not null default '',
  payee_name text not null default '',
  bank_name text not null default '',
  account_holder text not null default '',
  account_number text not null default '',
  ifsc text not null default '',
  branch text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.payment_settings enable row level security;

grant select, insert, update on public.payment_settings to authenticated;

drop policy if exists "admins can read payment settings" on public.payment_settings;
create policy "admins can read payment settings"
  on public.payment_settings for select
  to authenticated
  using (public.is_admin());

drop policy if exists "admins can add payment settings" on public.payment_settings;
create policy "admins can add payment settings"
  on public.payment_settings for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "admins can change payment settings" on public.payment_settings;
create policy "admins can change payment settings"
  on public.payment_settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
