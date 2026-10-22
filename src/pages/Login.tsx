import { useState, type FormEvent } from 'react';
import { Redirect, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Lock, ShieldCheck } from 'lucide-react';
import { Brand } from '@/components/Logo';
import { Button, Field, Input } from '@/components/ui';
import { keys, signIn, signOut, useSession, verifyMfa } from '@/lib/api';
import { MfaRequiredError } from '@/lib/backend';

const MAX_TRIES = 5;
const LOCK_SECONDS = 30;

export function Login() {
  const { session, loading, isAdmin } = useSession();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [factorId, setFactorId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fails, setFails] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);

  if (!loading && session) return <Redirect to={isAdmin ? '/admin' : '/admin/new'} />;

  const done = async (role: 'admin' | 'staff') => { await qc.refetchQueries({ queryKey: keys.session }); navigate(role === 'admin' ? '/admin' : '/admin/new'); };
  const fail = (message: string) => {
    const n = fails + 1;
    setFails(n);
    if (n >= MAX_TRIES) { setLockedUntil(Date.now() + LOCK_SECONDS * 1000); setFails(0); setError(`Too many tries. Wait ${LOCK_SECONDS} seconds and try again.`); }
    else setError(message);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (Date.now() < lockedUntil) { setError(`Too many tries. Wait ${Math.ceil((lockedUntil - Date.now()) / 1000)} seconds.`); return; }
    setBusy(true); setError('');
    try {
      if (factorId) { const s = await verifyMfa(factorId, code); await done(s.role); }
      else { const s = await signIn(email.trim(), password); await done(s.role); }
    } catch (err) {
      if (err instanceof MfaRequiredError) { setFactorId(err.factorId); setCode(''); }
      else fail(err instanceof Error ? err.message : 'Could not sign in.');
    } finally { setBusy(false); }
  };

  const cancelMfa = async () => { setFactorId(''); setCode(''); setPassword(''); setError(''); try { await signOut(); } catch { /* ignore */ } };

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-page px-4 py-10">
      <div className="pointer-events-none absolute -top-40 left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-gold/[0.06] blur-3xl" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center"><Brand subtitle="Venue & event operations" /></div>
        <form onSubmit={submit} className="fade-up rounded-3xl border border-border bg-surface p-8 card-glow">
          <div className="mb-6 flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-gold/12 text-gold">{factorId ? <ShieldCheck size={20} /> : <Lock size={20} />}</span>
            <div>
              <h1 className="font-display text-2xl font-semibold text-text">{factorId ? 'Two-step verification' : 'Sign in'}</h1>
              <p className="text-xs text-text-secondary">{factorId ? 'Open your authenticator app' : 'Owner & employee workspace · invitation only'}</p>
            </div>
          </div>
          {factorId ? (
            <Field label="6-digit code" required error={error}><Input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" autoFocus required /></Field>
          ) : (
            <div className="space-y-4">
              <Field label="Email" required><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required /></Field>
              <Field label="Password" required error={error}><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            </div>
          )}
          <Button type="submit" variant="gold" size="lg" className="mt-6 w-full" disabled={busy}>{busy ? 'Please wait…' : factorId ? 'Verify and sign in' : 'Sign in'}</Button>
          {factorId && <button type="button" onClick={() => void cancelMfa()} className="mt-4 w-full text-center text-xs text-text-secondary hover:text-gold">Cancel and go back</button>}
        </form>
        <p className="mt-6 text-center text-xs text-text-disabled">Accounts are created by the owner. There is no public sign-up.</p>
      </div>
    </main>
  );
}
