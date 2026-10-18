# Eventora OS — Setup on GitHub + Supabase

The SQL files are in the `supabase/` folder of this zip:
- `supabase/setup.sql`      → run FIRST (creates all tables, security rules, booked-times function)
- `supabase/make-admin.sql` → run SECOND (makes your login an admin)

## Part 1 — Supabase
1. supabase.com → New project. Wait until it is ready.
2. SQL Editor → paste all of `supabase/setup.sql` → Run.
3. Authentication → Users → Add user → your email + password → tick "Auto confirm".
4. SQL Editor → open `supabase/make-admin.sql`, replace YOUR-EMAIL@example.com with that email → Run.
5. Project Settings → API → copy the **Project URL** and the **anon public key**.

## Part 2 — GitHub
1. Create a new repository.
2. Upload the files that are INSIDE the eventora-os folder (package.json and .github must be at the top level).
3. Settings → Secrets and variables → Actions → **Variables** → add:
   - VITE_SUPABASE_URL      = your Project URL
   - VITE_SUPABASE_ANON_KEY = your anon public key
4. Settings → Pages → Source = **GitHub Actions**.
5. Actions tab → wait for the green tick → open the link.

## Part 3 — First use
1. Open  your-link/#/login  and sign in with the email + password from Part 1.
2. Settings → fill in Business name, address, phone, GSTIN, upload your logo, add terms.
3. Settings → Payments → add your UPI ID and bank details.
4. Catalog → edit the starter services and prices to match your venue.
5. New booking → create your first quotation → download the PDF.

There is no demo data: the app starts empty and everything you enter is saved in your Supabase database.
If you see "Connect your database", the two variables in Part 2 step 3 are missing — add them and re-run the deploy.
