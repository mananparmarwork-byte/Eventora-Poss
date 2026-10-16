-- Run this ONCE in Supabase -> SQL Editor (safe to run again).
-- It lets a signed-in admin (1) edit a saved bill with the new Edit button and
-- (2) add / change the advance payment on a saved bill.
-- Only signed-in admins can do this; visitors still cannot change anything.

grant update (customer_name, mobile, event_type, event_date, guests, customer_gst_number, hall, services, pricing, status)
  on public.quotes to authenticated;

drop policy if exists "admins can update quotes" on public.quotes;
create policy "admins can update quotes"
  on public.quotes for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
