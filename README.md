# Eventora OS
Quotations, bookings, payments and professional PDF billing for event venues. See `HANDOFF.md` for status and next steps.

```bash
npm install
cp .env.example .env   # then fill in your Supabase URL and anon key
npm run dev
npm run build      # outputs dist/
```
Admin dashboard: `/#/admin` · Public estimator: `/#/`
Database: run `supabase/setup.sql` in Supabase, then see HANDOFF.md §4.5.
