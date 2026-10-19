-- Add an employee (they can create bills, take payments, and see the calendar; everything they do is logged).
-- 1) Supabase → Authentication → Users → "Add user": their email + a password, tick "Auto confirm".
-- 2) Put the same email below and run this in the SQL Editor.
-- To switch someone off later: Eventora → Settings → Team → toggle, or:  update public.staff_users set active = false where email = '...';
insert into public.staff_users (user_id, email)
select id, email from auth.users where email = 'EMPLOYEE-EMAIL@example.com'
on conflict (user_id) do update set active = true;
