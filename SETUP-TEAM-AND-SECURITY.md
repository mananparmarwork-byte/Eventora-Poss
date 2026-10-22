# Eventora OS — Team accounts & security (one-time setup)

After this, the owner adds, deletes and resets employee logins **inside the app** (Settings → Team). No SQL per employee.

## Step 1 — Database (SQL Editor, run in this order, once each)
1. `supabase/02-roles-and-security.sql` (already done) → 2. `supabase/05-fix-create-quote.sql` → 3. `supabase/06-team-and-security.sql`.
   Every row of the result table must say **OK**. (Do not re-run 02 after 06; if you do, run 06 again.)

## Step 2 — Deploy the employee service (once)
It holds the secret key on Supabase's server, so the key is never in the website.
1. Supabase Dashboard → **Edge Functions** → **Deploy a new function** (editor).
2. Name: `manage-staff` (exactly).
3. Paste the whole file `supabase/functions/manage-staff/index.ts` → **Deploy**.
   (CLI alternative: `supabase functions deploy manage-staff`.)
Nothing else to configure; Supabase supplies the keys automatically.

## Step 3 — Supabase dashboard security switches (Authentication)
- **Sign In / Providers → turn OFF "Allow new users to sign up"** (only the owner creates accounts).
- Keep **Email provider → Confirm email** ON (accounts made by the owner are pre-verified).
- **Password strength**: minimum length 10, require letters and digits; turn on leaked-password protection if your plan has it.
- **Multi-factor → TOTP** enabled (default on).
- Optional: Attack protection → CAPTCHA; shorter JWT expiry (Settings → JWT).

## Step 4 — Owner: turn on two-step verification
Sign in → **My account → Two-step verification → Set up**, scan with Google/Microsoft Authenticator.
From then on the database itself refuses the owner's access until the code is entered. Employees can do the same on their own My account page.
If the owner loses the phone: Supabase → Authentication → Users → the owner → remove the factor.

## What is enforced where
| Rule | Enforced by |
|---|---|
| Nothing visible or savable without signing in | database (anon has no rights), app login gate |
| Employees can never delete bills | database policy (owner only) — no switch exists |
| Employee sees only own bills (switch "See bills made by others") | database policy |
| Who created each bill is recorded and locked | database trigger |
| Add / delete / reset employees | Edge Function, owner + 2-step checked server-side |
| 2-step verification | database (`aal2` required once a factor is verified) |
| Auto sign-out after 30 min idle, "sign out on all devices", 5 wrong passwords → 30 s pause | app |

Not included: email one-time codes / magic links (they need your own email sender set up in Supabase); the authenticator-app step above is the second factor instead.
