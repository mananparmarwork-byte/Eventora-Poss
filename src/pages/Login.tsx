import { useState, type FormEvent } from 'react';
import { Link, Redirect, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock } from 'lucide-react';
import { Brand } from '@/components/Logo';
import { Button, Field, Input } from '@/components/ui';
import { keys, signIn, useSession } from '@/lib/api';

export function Login() {
  const { session, loading } = useSession();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && session) return <Redirect to="/admin" />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await signIn(email.trim(), password); await qc.refetchQueries({ queryKey: keys.session }); navigate('/admin'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not sign in.'); }
    finally { setBusy(false); }
  };

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-page px-4 py-10">
      <div className="pointer-events-none absolute -top-40 left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-gold/[0.06] blur-3xl" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center"><Brand subtitle="Venue & event operations" /></div>
        <form onSubmit={submit} className="fade-up rounded-3xl border border-border bg-surface p-8 card-glow">
          <div className="mb-6 flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-gold/12 text-gold"><Lock size={20} /></span>
            <div><h1 className="font-display text-2xl font-semibold text-text">Sign in</h1><p className="text-xs text-text-secondary">Admin workspace</p></div>
          </div>
          <div className="space-y-4">
            <Field label="Email" required><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required /></Field>
            <Field label="Password" required error={error}><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
          </div>
          <Button type="submit" variant="gold" size="lg" className="mt-6 w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
        </form>
        <Link href="/" className="mt-6 flex items-center justify-center gap-2 text-sm text-text-secondary hover:text-gold"><ArrowLeft size={14} /> Back to the estimator</Link>
      </div>
    </main>
  );
}
