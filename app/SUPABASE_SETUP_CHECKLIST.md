# Supabase setup checklist

- [ ] Create a Supabase project
- [ ] Configure `VITE_SUPABASE_URL`
- [ ] Configure `VITE_SUPABASE_ANON_KEY`
- [ ] Run `supabase/schema.sql`
- [ ] Run `supabase/rls.sql`
- [ ] Load the catalog seed into `public.catalog` (the app can also start from its bundled catalog)
- [ ] Create an Auth user for each administrator
- [ ] Add each administrator's Auth user ID to `public.admin_users`
- [ ] Confirm anonymous visitors can insert a quote
- [ ] Confirm anonymous visitors cannot read or delete quotes
- [ ] Confirm an allowlisted administrator can open `/999`
- [ ] Confirm a non-allowlisted Auth user cannot use admin data
- [ ] Build the frontend
- [ ] Push the export to GitHub
- [ ] Enable GitHub Pages with GitHub Actions
- [ ] Add the Supabase variables to the GitHub Actions environment
- [ ] Test `/111` in production
- [ ] Test `/999` sign-in and sign-out in production
- [ ] Test quote saving, catalog editing, and quote deletion
## Booking times (From – Till)

Run `supabase/06-booking-times.sql` once in the Supabase SQL Editor. It lets the estimator see which hours are already
booked (custom From – Till time per date, replacing the old Morning / Evening slots). Older bills are converted automatically.
