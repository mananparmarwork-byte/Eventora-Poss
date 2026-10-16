create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.catalog enable row level security;
alter table public.quotes enable row level security;
alter table public.admin_users enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

drop policy if exists "catalog is public to read" on public.catalog;
create policy "catalog is public to read"
  on public.catalog for select
  using (true);

drop policy if exists "catalog admins can write" on public.catalog;
create policy "catalog admins can write"
  on public.catalog for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "visitors can submit quotes" on public.quotes;
create policy "visitors can submit quotes"
  on public.quotes for insert
  to anon, authenticated
  with check (true);

drop policy if exists "admins can read quotes" on public.quotes;
create policy "admins can read quotes"
  on public.quotes for select
  to authenticated
  using (public.is_admin());

drop policy if exists "admins can delete quotes" on public.quotes;
create policy "admins can delete quotes"
  on public.quotes for delete
  to authenticated
  using (public.is_admin());

drop policy if exists "admins can manage admin allowlist" on public.admin_users;
create policy "admins can manage admin allowlist"
  on public.admin_users for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());