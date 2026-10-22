// Eventora OS — Edge Function "manage-staff"
// Lets the OWNER add, delete and reset the password of employee logins from inside the app (no SQL, no dashboard).
// It runs on Supabase's servers, where the service-role key lives (SUPABASE_SERVICE_ROLE_KEY is injected automatically
// and is NEVER sent to the browser). Every call is checked: the caller must be a signed-in owner (is_admin(), which also
// enforces two-step verification when the owner has turned it on).
//
// Deploy once: Supabase Dashboard → Edge Functions → "Deploy a new function" → name it  manage-staff  → paste this file → Deploy.
// (or CLI:  supabase functions deploy manage-staff)

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*', // the call is protected by the signed-in owner's token, not by the origin
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** At least 10 characters, with a letter and a digit. */
function passwordProblem(pw: unknown): string | null {
  if (typeof pw !== 'string' || pw.length < 10) return 'The password must be at least 10 characters.';
  if (pw.length > 72) return 'The password is too long (72 characters at most).';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'The password must contain at least one letter and one number.';
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !service) return json({ error: 'The function is not configured on the server.' }, 500);

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'Please sign in.' }, 401);

  // 1) Who is calling? Use the caller's own token, so the database decides (RLS + two-step verification).
  const caller = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: userData, error: userErr } = await caller.auth.getUser();
  if (userErr || !userData.user) return json({ error: 'Your session has expired. Please sign in again.' }, 401);
  const { data: isOwner, error: roleErr } = await caller.rpc('is_admin');
  if (roleErr || isOwner !== true) return json({ error: 'Only the owner can manage employees.' }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Bad request.' }, 400); }
  const action = String(body.action ?? '');

  // 2) From here on we use the service-role client (server only).
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const isAdminUser = async (id: string) => Boolean((await admin.from('admin_users').select('user_id').eq('user_id', id).maybeSingle()).data);
  const isStaffUser = async (id: string) => Boolean((await admin.from('staff_users').select('user_id').eq('user_id', id).maybeSingle()).data);

  try {
    if (action === 'create') {
      const email = String(body.email ?? '').trim().toLowerCase();
      if (!EMAIL.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
      const pwErr = passwordProblem(body.password);
      if (pwErr) return json({ error: pwErr }, 400);

      // The email is marked verified because the owner is vouching for it; the employee can never sign up on their own.
      const { data, error } = await admin.auth.admin.createUser({ email, password: String(body.password), email_confirm: true });
      if (error || !data.user) {
        const msg = error?.message ?? 'Could not create the login.';
        return json({ error: /already|registered|exists/i.test(msg) ? 'That email already has a login.' : msg }, 400);
      }
      const { error: insErr } = await admin.from('staff_users').insert({ user_id: data.user.id, email, active: true });
      if (insErr) {
        await admin.auth.admin.deleteUser(data.user.id); // do not leave a login without a role
        return json({ error: 'Could not save the employee: ' + insErr.message }, 400);
      }
      return json({ ok: true, id: data.user.id, email });
    }

    const id = String(body.id ?? '');
    if (!UUID.test(id)) return json({ error: 'Unknown employee.' }, 400);
    if (id === userData.user.id) return json({ error: 'You cannot do this to your own account.' }, 400);
    if (await isAdminUser(id)) return json({ error: 'That account is an owner. Owners cannot be changed here.' }, 403);
    if (!(await isStaffUser(id))) return json({ error: 'That person is not an employee.' }, 404);

    if (action === 'delete') {
      // Deleting the login also removes their staff row. Bills they created stay (created_by_email keeps the name).
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === 'resetPassword') {
      const pwErr = passwordProblem(body.password);
      if (pwErr) return json({ error: pwErr }, 400);
      const { error } = await admin.auth.admin.updateUserById(id, { password: String(body.password) });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Something went wrong.' }, 500);
  }
});
