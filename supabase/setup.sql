-- ============================================================================
-- Eventora OS — complete database setup for Supabase.
-- Run this ONE file in Supabase → SQL Editor. It is safe to run again (run it again after every update).
-- Then create your owner login (bottom of this file) and, if you want, employee logins (supabase/add-employee.sql).
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

-- -------------------------------------------------------------- Admin check --
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_users where user_id = auth.uid() and active);
$$;
revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to anon, authenticated;

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then 'admin' when public.is_staff() then 'staff' else 'none' end;
$$;
revoke all on function public.my_role() from public;
grant execute on function public.my_role() to anon, authenticated;

-- What an employee may do (switches in Settings → Team). Everything is allowed until the owner turns it off.
create or replace function public.staff_can(perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (data ->> perm)::boolean from public.app_settings where id = 'permissions'), true);
$$;
revoke all on function public.staff_can(text) from public;
grant execute on function public.staff_can(text) to authenticated;

-- ---------------------------------------------------------------- Security ---
alter table public.catalog enable row level security;
alter table public.quotes enable row level security;
alter table public.app_settings enable row level security;
alter table public.admin_users enable row level security;
alter table public.staff_users enable row level security;
alter table public.activity_log enable row level security;
alter table public.bill_counters enable row level security;

grant select on public.catalog to anon, authenticated;
grant insert, update on public.catalog to authenticated;
-- Bills are only created through create_quote() below (that is what hands out the bill number), never by a direct insert.
revoke insert on public.quotes from anon, authenticated;
grant select, update, delete on public.quotes to authenticated;
grant select on public.app_settings to anon, authenticated;
grant insert, update on public.app_settings to authenticated;
grant select on public.admin_users to authenticated;
grant select, update on public.staff_users to authenticated;
grant select, insert, delete on public.activity_log to authenticated;
revoke all on public.bill_counters from anon, authenticated;

-- catalog: everyone reads, owner writes
drop policy if exists "catalog readable" on public.catalog;
create policy "catalog readable" on public.catalog for select using (true);
drop policy if exists "catalog admin write" on public.catalog;
create policy "catalog admin write" on public.catalog for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- quotes: owner and employees read; the owner changes anything; employees only what the owner allows (see the trigger below)
drop policy if exists "visitors can submit quotes" on public.quotes;
drop policy if exists "admins read quotes" on public.quotes;
create policy "team read quotes" on public.quotes for select to authenticated using (public.is_admin() or public.is_staff());
drop policy if exists "admins update quotes" on public.quotes;
drop policy if exists "team update quotes" on public.quotes;
create policy "team update quotes" on public.quotes for update to authenticated using (public.is_admin() or public.is_staff()) with check (public.is_admin() or public.is_staff());
drop policy if exists "admins delete quotes" on public.quotes;
drop policy if exists "team delete quotes" on public.quotes;
create policy "team delete quotes" on public.quotes for delete to authenticated using (public.is_admin() or (public.is_staff() and public.staff_can('deleteBills')));

-- settings: business profile is public (printed on bills). Employees also read payment details, permissions and numbering. The owner writes everything.
drop policy if exists "business profile readable" on public.app_settings;
drop policy if exists "settings readable" on public.app_settings;
create policy "settings readable" on public.app_settings for select to anon, authenticated
  using (id = 'business' or public.is_admin() or (public.is_staff() and id in ('payment', 'permissions', 'numbering')));
drop policy if exists "settings admin insert" on public.app_settings;
create policy "settings admin insert" on public.app_settings for insert to authenticated with check (public.is_admin());
drop policy if exists "settings admin update" on public.app_settings;
create policy "settings admin update" on public.app_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage admin list" on public.admin_users;
create policy "admins manage admin list" on public.admin_users for select to authenticated using (public.is_admin());
drop policy if exists "admins read staff" on public.staff_users;
create policy "admins read staff" on public.staff_users for select to authenticated using (public.is_admin());
drop policy if exists "admins update staff" on public.staff_users;
create policy "admins update staff" on public.staff_users for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- activity: owner and employees can add lines, only the owner can read or delete them. Nobody can edit a line.
drop policy if exists "team add activity" on public.activity_log;
create policy "team add activity" on public.activity_log for insert to authenticated with check (public.is_admin() or public.is_staff());
drop policy if exists "admins read activity" on public.activity_log;
create policy "admins read activity" on public.activity_log for select to authenticated using (public.is_admin());
drop policy if exists "admins delete activity" on public.activity_log;
create policy "admins delete activity" on public.activity_log for delete to authenticated using (public.is_admin());

-- Who did it and when is always filled in by the database, so it cannot be faked from the browser.
create or replace function public.activity_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.at := now();
  if auth.uid() is null then new.actor_email := null; new.actor_role := 'public';
  else new.actor_email := auth.jwt() ->> 'email'; new.actor_role := public.my_role(); end if;
  return new;
end $$;
drop trigger if exists activity_stamp_trg on public.activity_log;
create trigger activity_stamp_trg before insert on public.activity_log for each row execute function public.activity_stamp();

-- Employee limits, enforced by the database (the owner is never limited).
create or replace function public.enforce_staff_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare keep text[] := array['payments', 'advancePaid', 'advanceAmount', 'balanceDue'];
begin
  if public.is_admin() then return new; end if;
  if not public.is_staff() then raise exception 'You do not have access.'; end if;
  if new.reference is distinct from old.reference then raise exception 'The bill number cannot be changed.'; end if;
  if new.status is distinct from old.status and not public.staff_can('markBooked') then
    raise exception 'Employees are not allowed to mark bills as booked or release them.';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(old.pricing -> 'payments', '[]'::jsonb)) o
             where not exists (select 1 from jsonb_array_elements(coalesce(new.pricing -> 'payments', '[]'::jsonb)) n where n ->> 'id' = o ->> 'id'))
     and not public.staff_can('removePayments') then
    raise exception 'Employees are not allowed to remove payments.';
  end if;
  if (new.customer_name, new.mobile, new.event_type, new.event_date, new.guests, new.customer_gst_number, new.hall, new.services, new.pricing - keep)
     is distinct from
     (old.customer_name, old.mobile, old.event_type, old.event_date, old.guests, old.customer_gst_number, old.hall, old.services, old.pricing - keep)
     and not public.staff_can('editBills') then
    raise exception 'Employees are not allowed to edit bills.';
  end if;
  return new;
end $$;
drop trigger if exists enforce_staff_rules_trg on public.quotes;
create trigger enforce_staff_rules_trg before update on public.quotes for each row execute function public.enforce_staff_rules();

-- ----------------------------------------------------------- Bill numbers ----
-- Format: PREFIX-DDMMYY-NUMBER, e.g. EV-201026-1001. The number starts again at the "start" value every new day (India time)
-- and only ever goes up during the day, even when a bill is deleted. The owner sets prefix / start in Settings → Billing.
create or replace function public._next_number(consume boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  d date := (now() at time zone 'Asia/Kolkata')::date;
  cfg jsonb; pfx text; st integer; seq integer; ref text;
begin
  select data into cfg from public.app_settings where id = 'numbering';
  pfx := coalesce(nullif(regexp_replace(coalesce(cfg ->> 'prefix', ''), '[^A-Za-z0-9]', '', 'g'), ''), 'EV');
  st := coalesce(nullif(cfg ->> 'start', '')::integer, 1001);
  if consume then
    insert into public.bill_counters (day, last_seq) values (d, st - 1) on conflict (day) do nothing;
    select last_seq into seq from public.bill_counters where day = d for update;
  else
    select coalesce((select last_seq from public.bill_counters where day = d), st - 1) into seq;
  end if;
  loop
    seq := seq + 1;
    ref := pfx || '-' || to_char(d, 'DDMMYY') || '-' || seq;
    exit when not exists (select 1 from public.quotes where reference = ref);
  end loop;
  if consume then update public.bill_counters set last_seq = seq where day = d; end if;
  return ref;
end $$;
revoke all on function public._next_number(boolean) from public;

create or replace function public.peek_bill_number()
returns text language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() not in ('admin', 'staff') then return null; end if;
  return public._next_number(false);
end $$;
revoke all on function public.peek_bill_number() from public;
grant execute on function public.peek_bill_number() to authenticated;

create or replace function public.set_next_bill_number(n integer)
returns void language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not public.is_admin() then raise exception 'Only the owner can change the bill number.'; end if;
  if n < 1 then raise exception 'The number must be 1 or more.'; end if;
  insert into public.bill_counters (day, last_seq) values (d, n - 1)
  on conflict (day) do update set last_seq = excluded.last_seq;
end $$;
revoke all on function public.set_next_bill_number(integer) from public;
grant execute on function public.set_next_bill_number(integer) to authenticated;

-- Creates a bill, gives it its number and writes the "bill created" line, all in one step.
-- The owner may pass a number of their own; everyone else (employees, the public estimator) always gets the next one.
create or replace function public.create_quote(p jsonb, p_reference text default null)
returns text language plpgsql security definer set search_path = public as $$
declare ref text; caller_role text := public.my_role();
begin
  if p_reference is not null and btrim(p_reference) <> '' and caller_role = 'admin' then ref := btrim(p_reference);
  else ref := public._next_number(true); end if;

  insert into public.quotes (reference, customer_name, mobile, event_type, event_date, guests, customer_gst_number, hall, services, pricing, status)
  values (ref, p ->> 'customer_name', p ->> 'mobile', p ->> 'event_type', (p ->> 'event_date')::date, (p ->> 'guests')::integer,
          coalesce(p ->> 'customer_gst_number', ''), coalesce(p ->> 'hall', 'Eventora'), coalesce(p -> 'services', '[]'::jsonb), p -> 'pricing', 'new');

  insert into public.activity_log (action, reference, title, detail, data)
  values ('bill.created', ref, 'Bill ' || ref || ' created',
          (p ->> 'customer_name') || ' · ' || (p ->> 'event_type') || ' · total ₹' || to_char(round(coalesce((p -> 'pricing' ->> 'grandTotal')::numeric, 0)), 'FM99,99,99,990'),
          jsonb_build_object('customer', p ->> 'customer_name', 'mobile', p ->> 'mobile', 'eventType', p ->> 'event_type',
            'guests', (p ->> 'guests')::integer, 'total', coalesce((p -> 'pricing' ->> 'grandTotal')::numeric, 0),
            'dates', (select string_agg(x, ', ' order by x) from jsonb_array_elements_text(coalesce(p -> 'pricing' -> 'eventDates', jsonb_build_array(p ->> 'event_date'))) x)));
  return ref;
end $$;
revoke all on function public.create_quote(jsonb, text) from public;
grant execute on function public.create_quote(jsonb, text) to anon, authenticated;

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
