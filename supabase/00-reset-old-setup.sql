-- RESET — run this ONCE, before schema.sql, ONLY if you already ran the
-- earlier reconstructed SQL against this Supabase project.
--
-- WARNING: this deletes the catalog and quotes tables and everything in them.
-- Only run it if you have no real customer quotes saved yet.
--
-- After running this, run in order:
--   1. supabase/schema.sql
--   2. supabase/rls.sql
--   3. supabase/seed.sql

drop trigger if exists trg_catalog_updated_at on public.catalog;
drop function if exists public.set_catalog_updated_at();

drop table if exists public.quotes cascade;
drop table if exists public.catalog cascade;
drop table if exists public.admin_users cascade;

drop function if exists public.is_admin();
