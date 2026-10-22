-- ============================================================================
-- Eventora OS — SECURITY & TEAM upgrade (file 06). Run AFTER 02 and 05. Safe to run again. Nothing is deleted or reset.
--
-- What changes:
--  1. The app is login-only: visitors (not signed in) can read NOTHING and save NOTHING (catalog, settings, calendar, bills).
--  2. Employees can NEVER delete bills. Only the owner can (enforced by the database, not just hidden buttons).
--  3. Every new bill remembers who created it (created_by). New employee switch: "See all bills" — when off, an employee
--     sees only the bills they made themselves.
--  4. Two-step verification (authenticator app / TOTP): once an owner or employee turns it on, the database refuses their
--     access until they have entered the code in that session.
--  5. An employee cannot re-assign a bill to themselves (created_by is locked).
--
-- Employee accounts (add / delete / reset password) are handled by the "manage-staff" Edge Function, so no SQL is needed per employee.
-- See SETUP-TEAM-AND-SECURITY.md for the one-time deploy.
-- ============================================================================

do $$
begin
  if to_regprocedure('public.create_quote(jsonb,text)') is null or to_regprocedure('public.my_role()') is null then
    raise exception 'Run 02-roles-and-security.sql and 05-fix-create-quote.sql first. Nothing was changed.';
  end if;
end $$;

-- 1) Who created each bill.
alter table public.quotes add column if not exists created_by uuid;
alter table public.quotes add column if not exists created_by_email text;
create index if not exists quotes_created_by_idx on public.quotes (created_by);

-- 2) Two-step verification gate. TRUE when the user has no verified authenticator, or has already entered the code in this session.
create or replace function public._aal_ok()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified');
$$;
revoke all on function public._aal_ok() from public;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid()) and public._aal_ok();
$$;
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_users where user_id = auth.uid() and active) and public._aal_ok();
$$;

-- 3) Visitors see nothing.
revoke select on public.catalog from anon;
revoke select on public.app_settings from anon;

drop policy if exists "catalog readable" on public.catalog;
create policy "catalog readable" on public.catalog for select to authenticated using (public.is_admin() or public.is_staff());

drop policy if exists "settings readable" on public.app_settings;
create policy "settings readable" on public.app_settings for select to authenticated
  using (public.is_admin() or (public.is_staff() and id in ('business', 'payment', 'permissions', 'numbering')));

-- 4) Bills: employees read all bills or only their own (owner's switch); only the OWNER can delete.
drop policy if exists "team read quotes" on public.quotes;
create policy "team read quotes" on public.quotes for select to authenticated
  using (public.is_admin() or (public.is_staff() and (public.staff_can('viewAllBills') or created_by = auth.uid())));

drop policy if exists "team delete quotes" on public.quotes;
drop policy if exists "owner delete quotes" on public.quotes;
create policy "owner delete quotes" on public.quotes for delete to authenticated using (public.is_admin());

-- 5) Employee limits (same as before + the creator of a bill can never be changed by an employee).
create or replace function public.enforce_staff_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare keep text[] := array['payments', 'advancePaid', 'advanceAmount', 'balanceDue'];
begin
  if public.is_admin() then return new; end if;
  if not public.is_staff() then raise exception 'You do not have access.'; end if;
  if new.reference is distinct from old.reference then raise exception 'The bill number cannot be changed.'; end if;
  if new.created_by is distinct from old.created_by or new.created_by_email is distinct from old.created_by_email then
    raise exception 'Who created the bill cannot be changed.';
  end if;
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

-- 6) Calendar: only signed-in team members get booked times.
create or replace function public.booked_times()
returns table (booked_date date, start_time text, end_time text)
language sql stable security definer set search_path = public as $$
  select d.key::date, d.value->>'start', d.value->>'end'
  from public.quotes q, lateral jsonb_each(coalesce(q.pricing->'eventSlots', '{}'::jsonb)) d
  where public.my_role() in ('admin', 'staff')
    and q.status = 'confirmed'
    and jsonb_typeof(d.value) = 'object'
    and coalesce(d.value->>'start', '') ~ '^[0-9]{1,2}:[0-9]{2}$'
    and coalesce(d.value->>'end', '') ~ '^[0-9]{1,2}:[0-9]{2}$'
  union all
  select ed::date, '00:00', '24:00'
  from public.quotes q,
       lateral jsonb_array_elements_text(coalesce(q.pricing->'eventDates', to_jsonb(array[q.event_date::text]))) ed
  where public.my_role() in ('admin', 'staff')
    and q.status = 'confirmed'
    and not coalesce(
      jsonb_typeof(q.pricing->'eventSlots'->ed) = 'object'
      and coalesce(q.pricing->'eventSlots'->ed->>'start', '') ~ '^[0-9]{1,2}:[0-9]{2}$'
      and coalesce(q.pricing->'eventSlots'->ed->>'end', '') ~ '^[0-9]{1,2}:[0-9]{2}$', false)
$$;
revoke all on function public.booked_times() from public;
revoke all on function public.booked_times() from anon;
grant execute on function public.booked_times() to authenticated;

-- 7) create_quote now also records who created the bill.
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

  insert into public.quotes (reference, customer_name, mobile, event_type, event_date, guests, customer_gst_number, hall, services, pricing, status, created_by, created_by_email)
  values (ref, btrim(p ->> 'customer_name'), btrim(p ->> 'mobile'), btrim(p ->> 'event_type'), v_date, v_guests,
          coalesce(p ->> 'customer_gst_number', ''), coalesce(nullif(btrim(p ->> 'hall'), ''), 'Eventora'),
          coalesce(p -> 'services', '[]'::jsonb), p -> 'pricing', 'new', auth.uid(), auth.jwt() ->> 'email');

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

revoke all on function public.create_quote(jsonb, text) from public;
revoke all on function public.create_quote(jsonb, text) from anon;
grant execute on function public.create_quote(jsonb, text) to authenticated;
revoke insert on public.quotes from anon, authenticated;

notify pgrst, 'reload schema';

-- Check — every row should say OK.
select 'visitors cannot read bills' as item, case when has_table_privilege('anon','public.quotes','SELECT') then 'PROBLEM' else 'OK' end as status
union all select 'visitors cannot read settings', case when has_table_privilege('anon','public.app_settings','SELECT') then 'PROBLEM' else 'OK' end
union all select 'visitors cannot read catalog', case when has_table_privilege('anon','public.catalog','SELECT') then 'PROBLEM' else 'OK' end
union all select 'visitors cannot save bills', case when has_function_privilege('anon','public.create_quote(jsonb,text)','EXECUTE') then 'PROBLEM' else 'OK' end
union all select 'visitors cannot see booked times', case when has_function_privilege('anon','public.booked_times()','EXECUTE') then 'PROBLEM' else 'OK' end
union all select 'only owner can delete bills', case when (select count(*) from pg_policies where tablename='quotes' and cmd='DELETE' and qual like '%is_admin()%' and qual not like '%is_staff%') = 1 then 'OK' else 'PROBLEM' end
union all select 'column quotes.created_by', case when exists (select 1 from information_schema.columns where table_schema='public' and table_name='quotes' and column_name='created_by') then 'OK' else 'MISSING' end
union all select 'RLS enabled on quotes', case when (select relrowsecurity from pg_class where oid='public.quotes'::regclass) then 'OK' else 'PROBLEM' end;
