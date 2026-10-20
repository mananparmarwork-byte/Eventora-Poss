-- ============================================================================
-- Eventora OS — SQL file 2 of 4: roles (owner / employee), permissions, security rules, activity stamping
-- Supabase → SQL Editor → New query → paste this whole file → Run. Safe to run again.
-- ============================================================================

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

