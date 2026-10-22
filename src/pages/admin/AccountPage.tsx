import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { KeyRound, Loader2, LogOut, ShieldCheck, Smartphone } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Field, Input, useUi } from '@/components/ui';
import { accountApi, signOut, useSession } from '@/lib/api';

/** Same rule the server enforces for employee passwords. */
export function passwordProblem(pw: string): string {
  if (pw.length < 10) return 'Use at least 10 characters.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Use at least one letter and one number.';
  return '';
}

export function AccountPage() {
  const { session } = useSession();
  const { toast, confirm } = useUi();
  const [, navigate] = useLocation();
  const api = accountApi();

  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const pwErr = pw ? passwordProblem(pw) : '';

  const [mfaOn, setMfaOn] = useState<boolean | null>(null);
  const [factorId, setFactorId] = useState('');
  const [enroll, setEnroll] = useState<{ factorId: string; qrSvg: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);

  useEffect(() => {
    if (!api.mfa) return;
    api.mfa.status().then((s) => { setMfaOn(s.enabled); setFactorId(s.factorId); }).catch(() => setMfaOn(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changePassword = async () => {
    if (!api.changePassword) return;
    if (pwErr || pw !== pw2) return;
    setPwBusy(true);
    try { await api.changePassword(pw); toast('Password changed.'); setPw(''); setPw2(''); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not change the password.', 'error'); }
    finally { setPwBusy(false); }
  };

  const startMfa = async () => {
    if (!api.mfa) return;
    setMfaBusy(true);
    try { setEnroll(await api.mfa.enroll()); setCode(''); } catch (e) { toast(e instanceof Error ? e.message : 'Could not start setup.', 'error'); }
    finally { setMfaBusy(false); }
  };
  const confirmMfa = async () => {
    if (!api.mfa || !enroll) return;
    setMfaBusy(true);
    try { await api.mfa.confirm(enroll.factorId, code); setMfaOn(true); setFactorId(enroll.factorId); setEnroll(null); toast('Two-step verification is on. You will be asked for a code each time you sign in.'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Wrong code.', 'error'); }
    finally { setMfaBusy(false); }
  };
  const disableMfa = async () => {
    if (!api.mfa) return;
    if (!(await confirm({ title: 'Turn off two-step verification?', text: 'Your account will be protected by the password only.', confirmLabel: 'Turn off', danger: true }))) return;
    setMfaBusy(true);
    try { await api.mfa.disable(factorId); setMfaOn(false); setFactorId(''); toast('Two-step verification is off.', 'info'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not turn it off.', 'error'); }
    finally { setMfaBusy(false); }
  };
  const everywhere = async () => {
    if (!(await confirm({ title: 'Sign out on all devices?', text: 'Every phone and computer signed in as you will need the password again, including this one.', confirmLabel: 'Sign out everywhere' }))) return;
    try { await (api.signOutEverywhere ? api.signOutEverywhere() : signOut()); } catch { /* the session may already be gone */ }
    navigate('/login');
  };

  return (
    <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Change password" subtitle={session?.email} />
        {api.changePassword ? (
          <div className="space-y-4 p-5">
            <Field label="New password" hint="10+ characters, with a letter and a number" error={pwErr}><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
            <Field label="Repeat new password" error={pw2 && pw !== pw2 ? 'The two passwords are different.' : ''}><Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
            <Button variant="gold" className="w-full" onClick={() => void changePassword()} disabled={pwBusy || !pw || Boolean(pwErr) || pw !== pw2}>{pwBusy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Change password</Button>
          </div>
        ) : <p className="p-5 text-sm text-text-secondary">Password changes are not available on this database.</p>}
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Two-step verification" subtitle="A 6-digit code from an authenticator app, asked at every sign-in" action={mfaOn === null ? null : <Badge tone={mfaOn ? 'success' : 'neutral'}>{mfaOn ? 'On' : 'Off'}</Badge>} />
          {!api.mfa ? <p className="p-5 text-sm text-text-secondary">Not available on this database.</p> : (
            <div className="space-y-4 p-5">
              {enroll ? (
                <>
                  <ol className="list-decimal space-y-1 pl-5 text-xs text-text-secondary">
                    <li>Install Google Authenticator, Microsoft Authenticator or Authy on your phone.</li>
                    <li>Scan this code (or type the key under it).</li>
                    <li>Enter the 6-digit number the app shows.</li>
                  </ol>
                  <div className="mx-auto w-44 rounded-xl bg-white p-2"><img src={enroll.qrSvg} alt="Authenticator QR code" className="w-full" /></div>
                  <p className="break-all text-center font-mono text-xs text-text-secondary">{enroll.secret}</p>
                  <Field label="6-digit code"><Input inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" /></Field>
                  <div className="flex gap-3">
                    <Button variant="ghost" onClick={() => setEnroll(null)}>Cancel</Button>
                    <Button variant="gold" className="flex-1" onClick={() => void confirmMfa()} disabled={mfaBusy || code.replace(/\s/g, '').length < 6}>{mfaBusy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Turn on</Button>
                  </div>
                </>
              ) : mfaOn ? (
                <>
                  <p className="text-sm text-text-secondary">Your account is protected. Even with your password, nobody can open the data without the code. If you lose your phone, ask the owner (or, for the owner, remove the factor in Supabase → Authentication → Users).</p>
                  <Button variant="danger" onClick={() => void disableMfa()} disabled={mfaBusy}>Turn off</Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-text-secondary">Strongly recommended for the owner. Once on, the database itself refuses access until the code is entered.</p>
                  <Button variant="gold" onClick={() => void startMfa()} disabled={mfaBusy || mfaOn === null}>{mfaBusy ? <Loader2 size={15} className="animate-spin" /> : <Smartphone size={15} />} Set up</Button>
                </>
              )}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Sessions" subtitle="Signed in somewhere you don’t trust?" />
          <div className="space-y-3 p-5">
            <p className="text-xs text-text-secondary">You are signed out automatically after 30 minutes without activity.</p>
            <Button variant="outline" onClick={() => void everywhere()}><LogOut size={15} /> Sign out on all devices</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
