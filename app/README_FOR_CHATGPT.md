# ChatGPT handover: GitHub Pages + Supabase deployment

## Project overview

Swagattam Party Lawns Event Estimator lets a visitor enter event details, choose catering and event services, calculate GST and totals, print or copy the estimate, send it through WhatsApp, and save the quotation. The private operations route lets an authenticated administrator manage the service catalog and review, print, or delete saved quotations.

The public routes are intentionally narrow:

- `/` remains a 404 page.
- `/111` is the customer estimator.
- `/999` is the private admin workspace.

## Final architecture

```text
Visitor
  ↓
GitHub Pages static frontend
  ↓
Supabase browser client using the public anon key
  ↓
Supabase Postgres + Supabase Auth
```

There is no runtime dependency on the Replit API server. `migration-backup/` is an archive only and must not be imported or restored automatically.

## File structure

- `src/App.tsx` — route handling and the estimator UI.
- `src/pages/admin.tsx` — protected admin login and operations UI.
- `src/lib/catalog.ts` — catalog types and the bundled starter catalog used before Supabase is configured.
- `src/lib/supabase.ts` — browser-safe Supabase client created from Vite variables.
- `src/lib/supabase-queries.ts` — catalog and quote reads/writes plus Auth helpers.
- `public/` — static logo, favicon, and robots file.
- `supabase/schema.sql` — required Postgres tables and indexes.
- `supabase/rls.sql` — Row Level Security policies and admin allowlist helper.
- `supabase/seed.sql` — safe starter row for the catalog table.
- `.env.example` — required public frontend variables.
- `scripts/copy-404.mjs` — GitHub Pages SPA fallback preparation.
- `migration-backup/` — original server/database code for reference only.

## Supabase setup

1. Create a Supabase project.
2. In Project Settings → API, copy the Project URL and the public anon key.
3. Run `supabase/schema.sql` in the SQL Editor.
4. Run `supabase/rls.sql` in the SQL Editor.
5. Insert the bundled catalog into `public.catalog` if desired. The customer page starts from the bundled catalog until a row with `id = 'default'` exists. The admin can then save the catalog to Supabase.
6. In Authentication → Users, create an administrator account with email/password.
7. Copy the user's UUID and run:

   ```sql
   insert into public.admin_users (user_id)
   values ('AUTH_USER_UUID');
   ```

8. Never put a service-role key in the frontend or GitHub Actions client build.
9. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and the appropriate `VITE_BASE_PATH`.
10. Test the public estimator first, then test admin sign-in at `/999`.

## Database tables

### `catalog`

- `id` — primary key; the active catalog uses `default`.
- `categories` — JSON document containing categories, subcategories, and services.
- `updated_at` — last catalog update timestamp.

Public visitors may read the catalog. Only allowlisted authenticated administrators may insert or update it.

### `quotes`

- `id` — generated UUID.
- `reference` — bill number supplied by the estimator; unique.
- `customer_name`, `mobile`, `event_type`, `event_date`, `guests`, `customer_gst_number`, `hall` — inquiry details.
- `services` — JSON itemized services.
- `pricing` — JSON totals, GST, and per-guest values.
- `status` — `new`, `contacted`, `confirmed`, or `archived`.
- `created_at` — saved timestamp.

Visitors may insert quotes. Only allowlisted authenticated administrators may read or delete them. This prevents public visitors from browsing customer inquiries.

### `admin_users`

Contains the UUIDs of users allowed to use the operations workspace. It is intentionally separate from `auth.users`; Supabase Auth owns identities and this table owns the application allowlist.

## RLS policies

`public.is_admin()` is a `security definer` helper that checks the current Auth UUID against `admin_users`.

- Catalog reads are public because `/111` needs the active service list.
- Catalog writes require `is_admin()`.
- Quote inserts are allowed for anonymous and authenticated visitors because `/111` is a public inquiry form.
- Quote reads and deletes require `is_admin()`.
- The admin allowlist is not publicly readable or writable.

If a policy error occurs, check that the SQL was run in order and that the signed-in user's UUID exists in `admin_users`.

## Authentication

The `/999` route checks the persisted Supabase Auth session. If there is no session it renders an email/password sign-in form. Supabase persists and refreshes the browser session. Sign out calls `supabase.auth.signOut()` and returns to the login form. The database, not the route UI, enforces admin access through RLS.

Adding a user to `auth.users` alone is not enough. Add that user's UUID to `admin_users`.

## Frontend ↔ Supabase connections

- Customer estimator → `useGetCatalog()` → `catalog` row → active services are shown.
- Save estimate → `useCreateQuote()` → `quotes` insert/upsert → the saved quotation appears in the customer summary.
- Admin catalog edit → `useUpdateCatalog()` → `catalog` upsert → future estimator loads use the saved catalog.
- Admin quote list → `useListQuotes()` → protected `quotes` select → recent saved inquiries appear.
- Admin quote detail → `useGetQuote(reference)` → protected `quotes` select → itemized bill appears.
- Admin delete → `useDeleteQuote()` → protected `quotes` delete → the inquiry is removed.
- Admin sign-in/sign-out → Supabase Auth → persisted session controls the route UI and RLS identity.

## GitHub Pages deployment

1. Create a GitHub repository and upload the contents of this folder as the repository root.
2. Add a GitHub Actions workflow that runs on Ubuntu:

   ```yaml
   name: Deploy to GitHub Pages
   on:
     push:
       branches: [main]
   permissions:
     contents: read
     pages: write
     id-token: write
   jobs:
     build:
       runs-on: ubuntu-latest
       environment:
         name: github-pages
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: 22
             cache: npm
         - run: npm ci
         - run: npm run build
           env:
             VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}
             VITE_SUPABASE_ANON_KEY: ${{ vars.VITE_SUPABASE_ANON_KEY }}
             VITE_BASE_PATH: ${{ vars.VITE_BASE_PATH }}
         - uses: actions/upload-pages-artifact@v3
           with:
             path: dist
         - uses: actions/deploy-pages@v4
   ```

3. Add the three public build variables as GitHub Actions variables. The anon key is designed for browser use; do not add a service-role secret.
4. In repository Settings → Pages, select GitHub Actions.
5. Open `/111`, save a test estimate, sign in at `/999`, edit a harmless catalog description, and confirm the saved inquiry is visible.

## Troubleshooting

- **Blank page or broken assets:** set `VITE_BASE_PATH` to `/repo-name/` for a project site, or `/` for a custom domain.
- **404 on refresh:** confirm the build contains `dist/404.html`. The included build script creates it.
- **Supabase configuration message:** check that both Vite variables are present during the build, not only on the local machine.
- **RLS denied:** confirm the Auth user UUID is in `admin_users` and that `rls.sql` was run.
- **Quotes save but admin list is empty:** the visitor insert policy is working; check admin sign-in and the allowlist row.
- **Catalog is local only:** the estimator intentionally shows the bundled catalog when Supabase is not configured. Set the variables and save once from `/999` to persist it.
- **Auth redirect problems:** Supabase Auth is using email/password; no external OAuth redirect is required for this export.
- **Images do not load:** keep `swagattam-logo.webp` in `public/` and use the configured base path.

## ChatGPT handover instructions

You are assisting the user with deploying this project using GitHub Pages for the frontend and Supabase for backend functionality. Read this file first. Do not tell the user to use the Replit backend. Guide the user one step at a time and verify each step before moving to the next.

Treat `migration-backup/` as an archive of the original implementation. If a migrated feature stops working, inspect the corresponding backup file to understand the old behavior, then recreate the behavior in the GitHub Pages + Supabase architecture. Do not restore the old Replit backend automatically.