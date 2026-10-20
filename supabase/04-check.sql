-- Eventora OS — SQL file 4: check. Run it after 01, 02 and 03. Every row should say OK.
select 'table ' || t as item, case when to_regclass('public.' || t) is not null then 'OK' else 'MISSING - run 01-tables.sql' end as status
from unnest(array['catalog','quotes','app_settings','admin_users','staff_users','activity_log','bill_counters']) t
union all
select 'function ' || f, case when exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = f) then 'OK' else 'MISSING - run 02 / 03' end
from unnest(array['is_admin','is_staff','my_role','staff_can','activity_stamp','enforce_staff_rules','_next_number','peek_bill_number','set_next_bill_number','create_quote','booked_times']) f
union all
select 'owner login: mp1072005@gmail.com', case when exists (select 1 from public.admin_users a join auth.users u on u.id = a.user_id where u.email = 'mp1072005@gmail.com') then 'OK' else 'NOT OWNER - run make-admin.sql with this email' end;

-- Make the cache refresh so the app sees the new tables and functions straight away:
notify pgrst, 'reload schema';
