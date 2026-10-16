-- Run this ONCE in Supabase -> SQL Editor (safe to run again).
-- It lets a signed-in admin tick "Booked" on a saved estimate.
-- Only the "status" column can be changed; nothing else on a saved bill becomes editable.

grant update (status) on public.quotes to authenticated;

drop policy if exists "admins can update quotes" on public.quotes;
create policy "admins can update quotes"
  on public.quotes for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
