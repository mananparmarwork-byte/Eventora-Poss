-- ============================================================================
-- Eventora OS — FIX: "Could not find the function public.create_quote(p, p_reference) in the schema cache"
--
-- Why it happened: the app saves a quotation by calling the database function
--   public.create_quote(p jsonb, p_reference text)
-- but that function was never created in your live Supabase project (the SQL files were only partly run).
-- Your live `quotes` table is also missing the column `customer_gst_number`, which the app writes and reads.
--
-- What this file does (and does NOT do):
--   * ADDS the missing column (existing rows and data are untouched; nothing is dropped, reset or rewritten).
--   * Creates bill_counters / activity_log ONLY IF they do not exist yet.
--   * Creates/replaces the helper functions and create_quote().
--   * Does NOT disable RLS, does NOT add any insert policy, does NOT touch existing policies, does NOT use the service-role key.
--   * Direct inserts into `quotes` stay blocked for everybody. Rows can only be created through create_quote().
--
-- Prerequisite: 02-roles-and-security.sql must already be applied (your RLS policies show it was). This file checks that
-- and stops with a clear message if not.
--
-- How to run: Supabase → SQL Editor → New query → paste this whole file → Run. It is safe to run again.
-- ============================================================================

-- 0) Safety check: the role helpers from file 02 must exist.
do $$
begin
  if to_regprocedure('public.my_role()') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.is_staff()') is null then
    raise exception 'Run supabase/02-roles-and-security.sql first (my_role / is_admin / is_staff are missing). Nothing was changed.';
  end if;
  if to_regclass('public.quotes') is null then
    raise exception 'public.quotes does not exist. Run supabase/01-tables.sql first. Nothing was changed.';
  end if;
end $$;

-- 1) The missing column (the app writes and reads it; the employee-rules trigger compares it).
alter table public.quotes add column if not exists customer_gst_number text;

-- 2) Tables that create_quote() needs. No-ops if they already exist.
create table if not exists public.bill_counters (
  day date primary key,
  last_seq integer not null
);
alter table public.bill_counters enable row level security;
revoke all on public.bill_counters from anon, authenticated;

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
alter table public.activity_log enable row level security;

-- 3) Bill-number helpers (identical to 03-bill-numbers-and-calendar.sql).
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

-- 4) create_quote — the function the app calls:  rpc('create_quote', { p: {...}, p_reference: text|null })
--    * SECURITY DEFINER so the owner/employees can create a bill WITHOUT any insert policy on `quotes`. Visitors cannot save at all.
--    * The bill number is handed out by the server. Only the owner (admin) may pass their own number.
--    * Only a signed-in OWNER or active EMPLOYEE can save; everyone else gets an error.
--    * Status is always 'new' (the browser cannot choose it). The role is read from the database, never from the request.
--    * The bill row and its "bill created" activity line are written in ONE transaction: both happen or neither does.
--    * Bad input raises a readable error instead of saving a half-empty bill.
create or replace function public.create_quote(p jsonb, p_reference text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  ref text;
  caller_role text := public.my_role();
  v_guests integer;
  v_date date;
  v_total numeric;
begin
  -- Only a signed-in owner or active employee may save. Visitors (anon) and logged-in users with no role are refused.
  if caller_role not in ('admin', 'staff') then raise exception 'Please sign in as the owner or an employee to save a quotation.' using errcode = '42501'; end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Quotation details are missing.'; end if;
  if coalesce(btrim(p ->> 'customer_name'), '') = '' then raise exception 'Customer name is required.'; end if;
  if coalesce(btrim(p ->> 'mobile'), '') = '' then raise exception 'Mobile number is required.'; end if;
  if coalesce(btrim(p ->> 'event_type'), '') = '' then raise exception 'Event type is required.'; end if;
  if jsonb_typeof(p -> 'pricing') is distinct from 'object' then raise exception 'Pricing details are missing.'; end if;
  if p ? 'services' and jsonb_typeof(p -> 'services') <> 'array' then raise exception 'Services must be a list.'; end if;
  begin
    v_date := (p ->> 'event_date')::date;
    v_guests := (p ->> 'guests')::integer;
    v_total := coalesce((p -> 'pricing' ->> 'grandTotal')::numeric, 0);
  exception when others then
    raise exception 'Event date, guest count or total is not valid.';
  end;
  if v_date is null then raise exception 'Event date is required.'; end if;
  if v_guests is null or v_guests <= 0 then raise exception 'Guests must be more than zero.'; end if;

  if p_reference is not null and btrim(p_reference) <> '' and caller_role = 'admin' then ref := btrim(p_reference);
  else ref := public._next_number(true); end if;

  insert into public.quotes (reference, customer_name, mobile, event_type, event_date, guests, customer_gst_number, hall, services, pricing, status)
  values (ref, btrim(p ->> 'customer_name'), btrim(p ->> 'mobile'), btrim(p ->> 'event_type'), v_date, v_guests,
          coalesce(p ->> 'customer_gst_number', ''), coalesce(nullif(btrim(p ->> 'hall'), ''), 'Eventora'),
          coalesce(p -> 'services', '[]'::jsonb), p -> 'pricing', 'new');

  insert into public.activity_log (action, reference, title, detail, data)
  values ('bill.created', ref, 'Bill ' || ref || ' created',
          (p ->> 'customer_name') || ' · ' || (p ->> 'event_type') || ' · total ₹' || to_char(round(v_total), 'FM99,99,99,99,99,990'),
          jsonb_build_object('customer', p ->> 'customer_name', 'mobile', p ->> 'mobile', 'eventType', p ->> 'event_type',
            'guests', v_guests, 'total', v_total,
            'dates', (select string_agg(x, ', ' order by x) from jsonb_array_elements_text(
                       case when jsonb_typeof(p -> 'pricing' -> 'eventDates') = 'array' then p -> 'pricing' -> 'eventDates'
                            else jsonb_build_array(p ->> 'event_date') end) x)));
  return ref;
end $$;

-- Execution rights: signed-in users only (and the function itself re-checks for owner/employee). Visitors (anon) cannot call it.
-- Nobody gets insert rights on the table itself.
revoke all on function public.create_quote(jsonb, text) from public;
revoke all on function public.create_quote(jsonb, text) from anon;
grant execute on function public.create_quote(jsonb, text) to authenticated;
revoke insert on public.quotes from anon, authenticated;

-- 5) Tell the API (PostgREST) to reload, otherwise it keeps saying "not found in the schema cache".
notify pgrst, 'reload schema';

-- 6) Check — every row should say OK.
select 'function create_quote(jsonb, text)' as item,
       case when to_regprocedure('public.create_quote(jsonb,text)') is not null then 'OK' else 'MISSING' end as status
union all select 'column quotes.customer_gst_number',
       case when exists (select 1 from information_schema.columns where table_schema='public' and table_name='quotes' and column_name='customer_gst_number') then 'OK' else 'MISSING' end
union all select 'table bill_counters', case when to_regclass('public.bill_counters') is not null then 'OK' else 'MISSING' end
union all select 'table activity_log', case when to_regclass('public.activity_log') is not null then 'OK' else 'MISSING' end
union all select 'anon cannot run create_quote',
       case when has_function_privilege('anon', 'public.create_quote(jsonb,text)', 'EXECUTE') then 'PROBLEM - anon can execute' else 'OK' end
union all select 'anon cannot insert into quotes directly',
       case when has_table_privilege('anon', 'public.quotes', 'INSERT') then 'PROBLEM - run: revoke insert on public.quotes from anon' else 'OK' end
union all select 'RLS enabled on quotes',
       case when (select relrowsecurity from pg_class where oid = 'public.quotes'::regclass) then 'OK' else 'PROBLEM - RLS is off' end;
