# Swagattam Event Estimator — GitHub Pages export

This folder is the standalone GitHub Pages + Supabase export of the Swagattam event estimator.

## Routes

- `/` intentionally shows the 404 page.
- `/111` is the customer estimator.
- `/999` is the protected operations workspace.

The exported frontend is static. It does not require the Replit server, Express, Node API routes, or a Replit database at runtime.

## Local setup

```bash
cp .env.example .env.local
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

## Production build

For a repository named `swagattam-estimator`, set `VITE_BASE_PATH=/swagattam-estimator/` in the GitHub Actions environment. For a custom domain at the repository root, use `VITE_BASE_PATH=/`.

```bash
npm run build
npm run preview
```

The build copies `dist/index.html` to `dist/404.html`, which lets GitHub Pages boot the SPA when a visitor opens `/111` or `/999` directly.

## Supabase

Run `supabase/schema.sql`, then `supabase/rls.sql`. Create an Auth user for each administrator and add the user's UUID to `public.admin_users`. The exact database and security model is documented in `README_FOR_CHATGPT.md`.

## Archive

`migration-backup/` is reference-only. It contains the original Replit/Express/Drizzle implementation. The active frontend never imports or executes anything from that folder.