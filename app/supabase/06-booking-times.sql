-- Run this ONCE in Supabase -> SQL Editor (safe to run again).
-- Booking times are now a custom "From - Till" time for each date instead of fixed Morning / Evening slots.
-- This function lets the estimator page see WHICH DATES AND HOURS are already booked, so they cannot be double booked.
-- It returns only the date and the start/end time of bills ticked "Booked". No names, phone numbers or prices are shared.
-- The old booked_slots() function is left in place, so nothing breaks while the new site version is being deployed.

create or replace function public.booked_times()
returns table (booked_date date, start_time text, end_time text)
language sql
stable
security definer
set search_path = public
as $$
  -- bills saved with a From - Till time: {"2026-12-05": {"start": "18:00", "end": "23:30"}}
  select d.key::date, d.value->>'start', d.value->>'end'
  from public.quotes q,
       lateral jsonb_each(coalesce(q.pricing->'eventSlots', '{}'::jsonb)) d
  where q.status = 'confirmed'
    and jsonb_typeof(d.value) = 'object'
    and coalesce(d.value->>'start', '') ~ '^[0-9]{1,2}:[0-9]{2}$'
    and coalesce(d.value->>'end', '') ~ '^[0-9]{1,2}:[0-9]{2}$'
  union all
  -- bills saved earlier with the old Morning / Evening slots are converted to a time range
  select d.key::date,
         case when d.value ? 'morning' or d.value ? 'afternoon' then '08:00' else '16:00' end,
         case when d.value ? 'evening' or d.value ? 'night' or d.value ? 'afternoon' then '23:00' else '14:00' end
  from public.quotes q,
       lateral jsonb_each(coalesce(q.pricing->'eventSlots', '{}'::jsonb)) d
  where q.status = 'confirmed'
    and jsonb_typeof(d.value) = 'array'
    and jsonb_array_length(d.value) > 0
  union all
  -- confirmed bills of any date that has no time saved: the whole day is treated as booked
  select ed::date, '00:00', '24:00'
  from public.quotes q,
       lateral jsonb_array_elements_text(coalesce(q.pricing->'eventDates', to_jsonb(array[q.event_date::text]))) ed
  where q.status = 'confirmed'
    and not coalesce(
      (jsonb_typeof(q.pricing->'eventSlots'->ed) = 'object'
         and coalesce(q.pricing->'eventSlots'->ed->>'start', '') ~ '^[0-9]{1,2}:[0-9]{2}$'
         and coalesce(q.pricing->'eventSlots'->ed->>'end', '') ~ '^[0-9]{1,2}:[0-9]{2}$')
      or (jsonb_typeof(q.pricing->'eventSlots'->ed) = 'array' and jsonb_array_length(q.pricing->'eventSlots'->ed) > 0),
      false)
$$;

revoke all on function public.booked_times() from public;
grant execute on function public.booked_times() to anon, authenticated;
