-- ============================================================================
-- Eventora OS — SQL file 3 of 4: bill numbers, create_quote, booked dates for the calendar
-- Supabase → SQL Editor → New query → paste this whole file → Run. Safe to run again.
-- ============================================================================

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

