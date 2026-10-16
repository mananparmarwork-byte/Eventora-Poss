-- FIX — resolves "403 Forbidden" errors on the catalog/quotes tables.
--
-- Row Level Security policies (rls.sql) control WHICH rows a role can see or
-- change, but Postgres also requires a separate, lower-level GRANT before a
-- role can touch a table at all. If that grant is missing, every request is
-- rejected with 403 even though the RLS policy itself is correct.
--
-- Safe to run anytime, including repeatedly — GRANT is idempotent.

grant usage on schema public to anon, authenticated;

-- catalog: anyone can read; only admins can add/change (enforced by RLS on top)
grant select on public.catalog to anon, authenticated;
grant insert, update on public.catalog to authenticated;

-- quotes: anyone can submit; only admins can read/delete (enforced by RLS on top)
grant insert on public.quotes to anon, authenticated;
grant select, delete on public.quotes to authenticated;

-- admin allowlist: only admins manage it (enforced by RLS on top)
grant select, insert, update, delete on public.admin_users to authenticated;

grant execute on function public.is_admin() to anon, authenticated;
