-- ============================================================================
-- Eventora OS — complete database setup for Supabase.
-- Run this ONE file in Supabase → SQL Editor. It is safe to run again.
-- Then create your admin user (see the bottom of this file).
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

-- -------------------------------------------------------------- Admin check --
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------- Security ---
alter table public.catalog enable row level security;
alter table public.quotes enable row level security;
alter table public.app_settings enable row level security;
alter table public.admin_users enable row level security;

grant select on public.catalog to anon, authenticated;
grant insert, update on public.catalog to authenticated;
grant insert on public.quotes to anon, authenticated;
grant select, update, delete on public.quotes to authenticated;
grant select on public.app_settings to anon, authenticated;
grant insert, update on public.app_settings to authenticated;
grant select on public.admin_users to authenticated;

-- catalog: everyone reads, admins write
drop policy if exists "catalog readable" on public.catalog;
create policy "catalog readable" on public.catalog for select using (true);
drop policy if exists "catalog admin write" on public.catalog;
create policy "catalog admin write" on public.catalog for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- quotes: the public estimator may submit, only admins read / change / delete
drop policy if exists "visitors can submit quotes" on public.quotes;
create policy "visitors can submit quotes" on public.quotes for insert to anon, authenticated with check (true);
drop policy if exists "admins read quotes" on public.quotes;
create policy "admins read quotes" on public.quotes for select to authenticated using (public.is_admin());
drop policy if exists "admins update quotes" on public.quotes;
create policy "admins update quotes" on public.quotes for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins delete quotes" on public.quotes;
create policy "admins delete quotes" on public.quotes for delete to authenticated using (public.is_admin());

-- settings: the business profile is public (printed on bills), payment details are admin-only
drop policy if exists "business profile readable" on public.app_settings;
create policy "business profile readable" on public.app_settings for select to anon, authenticated using (id = 'business' or public.is_admin());
drop policy if exists "settings admin insert" on public.app_settings;
create policy "settings admin insert" on public.app_settings for insert to authenticated with check (public.is_admin());
drop policy if exists "settings admin update" on public.app_settings;
create policy "settings admin update" on public.app_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage admin list" on public.admin_users;
create policy "admins manage admin list" on public.admin_users for select to authenticated using (public.is_admin());

-- ------------------------------------------------------ Booked dates & times -
-- Lets the public estimator see WHICH dates/hours are already taken (no names, phones or prices are shared).
create or replace function public.booked_times()
returns table (booked_date date, start_time text, end_time text)
language sql stable security definer set search_path = public as $$
  select d.key::date, d.value->>'start', d.value->>'end'
  from public.quotes q, lateral jsonb_each(coalesce(q.pricing->'eventSlots', '{}'::jsonb)) d
  where q.status = 'confirmed'
    and jsonb_typeof(d.value) = 'object'
    and coalesce(d.value->>'start', '') ~ '^[0-9]{1,2}:[0-9]{2}$'
    and coalesce(d.value->>'end', '') ~ '^[0-9]{1,2}:[0-9]{2}$'
  union all
  -- confirmed bills whose date has no time saved: the whole day counts as booked
  select ed::date, '00:00', '24:00'
  from public.quotes q,
       lateral jsonb_array_elements_text(coalesce(q.pricing->'eventDates', to_jsonb(array[q.event_date::text]))) ed
  where q.status = 'confirmed'
    and not coalesce(
      jsonb_typeof(q.pricing->'eventSlots'->ed) = 'object'
      and coalesce(q.pricing->'eventSlots'->ed->>'start', '') ~ '^[0-9]{1,2}:[0-9]{2}$'
      and coalesce(q.pricing->'eventSlots'->ed->>'end', '') ~ '^[0-9]{1,2}:[0-9]{2}$', false)
$$;
revoke all on function public.booked_times() from public;
grant execute on function public.booked_times() to anon, authenticated;

-- ---------------------------------------- Optional: import payment account --
-- If you used the old estimator, copy its payment settings across (does nothing otherwise).
do $$
begin
  if to_regclass('public.payment_settings') is not null then
    insert into public.app_settings (id, data)
    select 'payment', jsonb_build_object('upiId', upi_id, 'payeeName', payee_name, 'bankName', bank_name,
           'accountHolder', account_holder, 'accountNumber', account_number, 'ifsc', ifsc, 'branch', branch)
    from public.payment_settings where id = 'default'
    on conflict (id) do nothing;
  end if;
end $$;

-- ============================================================================
-- CREATE YOUR ADMIN LOGIN
-- 1) Supabase → Authentication → Users → "Add user" (email + password).
-- 2) Run this, replacing the email with the one you just created:
--
--    insert into public.admin_users (user_id)
--    select id from auth.users where email = 'you@example.com'
--    on conflict do nothing;
-- ============================================================================
