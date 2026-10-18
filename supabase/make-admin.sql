-- Step 3 of the setup: make a user an admin.
-- 1) Supabase → Authentication → Users → "Add user" (email + password, tick "Auto confirm").
-- 2) Put that email below and run this file in the SQL Editor.
insert into public.admin_users (user_id)
select id from auth.users where email = 'YOUR-EMAIL@example.com'
on conflict do nothing;
