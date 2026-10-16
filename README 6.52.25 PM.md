# Swagattam — Event Estimator (GitHub Pages)

This repository now contains **only the estimator** (the landing page `site/` has been removed).

- `app/` — Event Estimate Studio (customer estimator + admin panel)
  - `/111` customer estimator
  - `/999` admin panel
- `supabase/` — database setup SQL (same files as `app/supabase/`)
- `.github/workflows/deploy.yml` — builds `app/` and deploys it to GitHub Pages on every push to `main`

## Local development
```bash
cd app && npm install && npm run dev
```

## Required GitHub configuration
**Settings → Pages → Source:** GitHub Actions

**Settings → Secrets and variables → Actions → Variables:**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `CUSTOM_DOMAIN` (optional)

## Supabase
Run `schema.sql`, `rls.sql`, then the numbered files `01` … `06` in order (`seed.sql` optional) in the Supabase SQL editor.
