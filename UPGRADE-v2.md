# Eventora OS — update v2 (what changed and how to switch it on)

## 1. Do these steps once
1. **Supabase → SQL Editor → run the new `supabase/setup.sql`** (it is safe to run again; nothing is deleted).
2. Push this code to GitHub as usual (the deploy workflow rebuilds the site).
3. Open **Settings → Bill numbers** and check the prefix / first number (default `EV` and `1001`).
4. Add employees: **Settings → Team → Add an employee** shows the exact two steps (create the user in Supabase, then run one SQL line).
   *Hostinger users:* first run `hostinger-api/upgrade-v2.sql` in phpMyAdmin, upload the new `hostinger-api/index.php`; employees are then created inside Settings → Team.

## 2. What is new
**Dashboard (owner)**
- Report period on Overview: today, 7/30 days, this/last month, 3/6/12 months, this year, all time or your own dates, grouped daily / weekly / monthly. It drives the KPI cards (with "vs previous period"), the chart (revenue / quotations / booked events, line or bars) and Recent activity.
- Reports page uses the same period picker (by event date or by date the bill was made).
- **Recent activity** now records: bill created, edited (before → after for every changed field), deleted (with bill number, customer, total and amount already received), booked / released, payment received (amount, Cash/UPI/Bank, UPI transaction ID, who), payment cancelled, UPI payment request sent, settings changes. Click any line for full details. **Activity** page = full history with filters (type, person, search, period) and CSV export.
- **Auto-delete:** Settings → Activity (never, 7, 15, 30, 60, 90, 180, 365 days or your own number, plus "delete older now"). Only the activity list is cleaned; bills and payments are never touched.
- Bills and payments made before this update still appear (marked "imported").

**Employees**
- They see only: New bill, Bills & payments (record payments), Calendar (dates and free time). Overview, Activity, Reports, Catalog and Settings are owner-only (also enforced by the database).
- Owner switches in Settings → Team: delete bills, edit bills, cancel payments, mark booked, give discounts (all on by default). Everything they do is logged with their email; the time and name are stamped by the database and cannot be faked.

**Bill numbers**
- Format `EV-201026-1001` = prefix – date (DDMMYY) – running number. The number is filled in automatically; employees cannot type or change it.
- The running number restarts at the first number every new day (India time) and only goes up during the day. If 1003 is deleted the next bill is 1004. A bill number can never change after the bill is made.
- Owner can type their own number on a new bill, change prefix / first number, and set today's next number (Settings → Bill numbers).
- The date is part of the number because the database needs every bill number to be unique across days.

**Time picker**
- The native time box is gone. Tapping From / Till opens a round clock (same size and look on phone and laptop): tap or drag the hour, then the minutes, choose AM/PM, OK.

## 3. Honest notes
- This update was written without access to npm, so it was **not built or run**. I type-checked logic with stubs and ran tests on the period maths, stats, edit-diff and activity-merge code, but not the screens. Run `npm install && npm run build` and click through once; expect a small fix or two.
- The public estimator (the page without login) can still save an enquiry; it gets a proper numbered bill like everyone else and is logged as "Customer (public estimator)".
- Activity lines for edits, deletions and payments are written by the app after the action succeeds; bill creation is written by the database itself. Employees cannot read, edit or delete activity.
- A bill number "Advance paid" typed on the bill form while creating it is not a separate payment line (same as before); payments taken in the Payments panel are fully logged.
