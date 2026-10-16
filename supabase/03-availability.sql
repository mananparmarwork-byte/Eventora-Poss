-- Run this ONCE in Supabase -> SQL Editor (safe to run again).
-- It lets the estimator page see WHICH DATES AND TIME SLOTS are already booked,
-- so they show as occupied for the next customer.
-- It returns only dates and slot names of bills ticked "Booked". No names, phone numbers or prices are shared.

create or replace function public.booked_slots()
returns table (booked_date date, booked_slots text[])
language sql
stable
security definer
set search_path = public
as $$
  -- bills that have time slots saved
  select d.key::date,
         array(select jsonb_array_elements_text(d.value))
  from public.quotes q,
       lateral jsonb_each(coalesce(q.pricing->'eventSlots', '{}'::jsonb)) d
  where q.status = 'confirmed'
    and jsonb_typeof(d.value) = 'array'
    and jsonb_array_length(d.value) > 0
  union all
  -- older confirmed bills without time slots: the whole day is treated as booked
  select ed::date,
         array['morning','afternoon','evening','night']
  from public.quotes q,
       lateral jsonb_array_elements_text(coalesce(q.pricing->'eventDates', to_jsonb(array[q.event_date::text]))) ed
  where q.status = 'confirmed'
    and coalesce(jsonb_array_length(q.pricing->'eventSlots'->ed), 0) = 0
$$;

revoke all on function public.booked_slots() from public;
grant execute on function public.booked_slots() to anon, authenticated;
