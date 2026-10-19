import { useEffect, useState } from 'react';
import { Copy, Loader2, Save, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Field, Input, Switch, useUi } from '@/components/ui';
import { canCreateStaff, useActivitySettings, useLogActivity, useNextBillNumber, useNumbering, usePermissions, usePurgeActivity, useSaveGeneric, useSetNextBillNumber, useStaff, useStaffActions } from '@/lib/api';
import { cn } from '@/lib/format';
import type { ActivityDraft, NumberingSettings, StaffPermissions } from '@/lib/types';

const changed = (title: string, detail: string): ActivityDraft => ({ action: 'settings.changed', reference: '', title, detail, data: {} });
const ddmmyy = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getFullYear()).slice(2)}`; };

/* ------------------------------------------------------------ Bill numbers --- */
export function BillingTab() {
  const { toast } = useUi();
  const log = useLogActivity();
  const { numbering, isLoading } = useNumbering();
  const save = useSaveGeneric('numbering');
  const next = useNextBillNumber(true);
  const setNext = useSetNextBillNumber();
  const [n, setN] = useState<NumberingSettings>(numbering);
  const [today, setToday] = useState('');
  useEffect(() => { if (!isLoading) setN(numbering); }, [isLoading, numbering]);

  const prefix = n.prefix.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6) || 'EV';
  const start = Math.max(1, Math.floor(Number(n.start) || 1001));
  const example = `${prefix}-${ddmmyy()}-${start}`;
  const submit = () => save.mutate({ prefix, start }, { onSuccess: () => { toast('Bill numbering saved. It applies from the next day; use "Today" below for today.'); void log(changed('Bill numbering changed', `Prefix ${numbering.prefix} → ${prefix}, first number of the day ${numbering.start} → ${start}`)); }, onError: (e) => toast(e.message, 'error') });
  const applyToday = () => {
    const v = Math.floor(Number(today));
    if (!v || v < 1) { toast('Enter the number the next bill should get.', 'error'); return; }
    setNext.mutate(v, { onSuccess: () => { toast(`The next bill today will use number ${v}.`); void log(changed('Today’s bill number changed', `Next bill number today set to ${v}`)); setToday(''); }, onError: (e) => toast(e.message, 'error') });
  };

  return (
    <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Bill numbers" subtitle="How every new bill is numbered" />
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Prefix" hint="letters / digits"><Input value={n.prefix} onChange={(e) => setN({ ...n, prefix: e.target.value.toUpperCase().slice(0, 6) })} /></Field>
            <Field label="First number of each day"><Input type="number" min={1} value={n.start} onChange={(e) => setN({ ...n, start: Number(e.target.value) })} inputMode="numeric" /></Field>
          </div>
          <div className="rounded-xl bg-input p-4 text-sm"><p className="text-xs text-text-secondary">Example, first bill of today</p><p className="mt-1 font-mono text-lg font-semibold text-gold">{example}</p></div>
          <ul className="list-disc space-y-1 pl-5 text-xs text-text-secondary">
            <li>Each day the number starts again from the first number above, and only goes up during the day.</li>
            <li>A deleted bill’s number is never used again — if bill …1003 is deleted, the next bill is …1004.</li>
            <li>The date is part of the number (DDMMYY), so numbers never clash between days.</li>
            <li>Employees cannot type or change the number — it is filled in for them.</li>
          </ul>
        </div>
        <div className="flex justify-end border-t border-border/70 px-5 py-4"><Button variant="gold" onClick={submit} disabled={save.isPending}>{save.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save numbering</Button></div>
      </Card>

      <Card className="h-fit">
        <CardHeader title="Today" subtitle="Change where today’s numbering continues" />
        <div className="space-y-4 p-5">
          <div className="rounded-xl bg-input p-4 text-sm"><p className="text-xs text-text-secondary">The next bill will be</p><p className="mt-1 font-mono text-lg font-semibold text-text">{next.data ?? '…'}</p></div>
          <Field label="Set the next number to" hint="e.g. 1050"><Input type="number" min={1} value={today} onChange={(e) => setToday(e.target.value)} inputMode="numeric" placeholder="1050" /></Field>
          <Button variant="outline" className="w-full" onClick={applyToday} disabled={setNext.isPending}>Use this number for the next bill</Button>
          <p className="text-xs text-text-disabled">When you make a bill yourself you can also type any bill number directly on the bill.</p>
        </div>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------- Team --- */
const PERMS: { key: keyof StaffPermissions; label: string; text: string }[] = [
  { key: 'deleteBills', label: 'Delete bills', text: 'The bill number stays used. Every deletion is logged.' },
  { key: 'editBills', label: 'Edit bills', text: 'Change customer, services, dates. The bill number can never change.' },
  { key: 'removePayments', label: 'Cancel received payments', text: 'Remove a payment that was recorded. Logged with the amount.' },
  { key: 'markBooked', label: 'Mark as booked / release booking', text: 'Blocks or frees the event dates.' },
  { key: 'discounts', label: 'Give discounts', text: 'Use the discount fields while making a bill.' },
];

export function TeamTab() {
  const { toast, confirm } = useUi();
  const log = useLogActivity();
  const { permissions } = usePermissions();
  const savePerms = useSaveGeneric('permissions');
  const staff = useStaff(true);
  const actions = useStaffActions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const api = canCreateStaff();

  const toggle = (key: keyof StaffPermissions, v: boolean) => {
    savePerms.mutate({ ...permissions, [key]: v }, { onSuccess: () => { void log(changed('Employee permissions changed', `${PERMS.find((p) => p.key === key)?.label}: ${v ? 'allowed' : 'not allowed'}`)); }, onError: (e) => toast(e.message, 'error') });
  };
  const create = () => {
    actions.create.mutate({ email: email.trim(), password }, { onSuccess: () => { toast('Employee login created.'); void log(changed('Employee added', email.trim())); setEmail(''); setPassword(''); }, onError: (e) => toast(e.message, 'error') });
  };
  const sql = `insert into public.staff_users (user_id, email)\nselect id, email from auth.users where email = '${email.trim() || 'EMPLOYEE-EMAIL@example.com'}'\non conflict (user_id) do update set active = true;`;
  const copy = async () => { try { await navigator.clipboard.writeText(sql); toast('SQL copied.'); } catch { toast('Copy is blocked in this browser.', 'error'); } };
  const switchActive = async (id: string, mail: string, active: boolean) => {
    if (!active && !(await confirm({ title: `Switch off ${mail}?`, text: 'They will not be able to sign in or see anything until you switch them on again.', confirmLabel: 'Switch off', danger: true }))) return;
    actions.setActive.mutate({ id, active }, { onSuccess: () => { toast(active ? 'Employee switched on.' : 'Employee switched off.', 'info'); void log(changed(active ? 'Employee switched on' : 'Employee switched off', mail)); }, onError: (e) => toast(e.message, 'error') });
  };

  return (
    <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="What employees can do" subtitle="Always allowed: make bills, take payments, see the calendar and estimate cost" />
        <div className="space-y-4 p-5">
          {PERMS.map((p) => <Switch key={p.key} checked={permissions[p.key]} onChange={(v) => toggle(p.key, v)} label={p.label} description={p.text} />)}
          <div className="gold-rule" />
          <p className="flex items-start gap-2 text-xs text-text-secondary"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-gold" /> Only you see Overview, Activity, Reports, Catalog and Settings. Employees never see them.</p>
        </div>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Employees" subtitle="People who can sign in with limited access" />
          {staff.isLoading ? <p className="p-5 text-sm text-text-secondary">Loading…</p> : staff.error ? <p className="p-5 text-sm text-error">{(staff.error as Error).message}. Run the latest supabase/setup.sql.</p> : (staff.data ?? []).length === 0 ? <p className="p-5 text-sm text-text-secondary">No employees yet.</p> : (
            <ul className="divide-y divide-border/60">
              {(staff.data ?? []).map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="min-w-0"><span className="block truncate text-sm font-medium text-text">{m.email}</span><Badge tone={m.active ? 'success' : 'neutral'} className="mt-1">{m.active ? 'Active' : 'Switched off'}</Badge></span>
                  <Switch checked={m.active} onChange={(v) => void switchActive(m.id, m.email, v)} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Add an employee" subtitle={api ? 'Creates their login right here' : 'Two quick steps in Supabase'} />
          <div className="space-y-4 p-5">
            <Field label="Employee email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" /></Field>
            {api ? (
              <>
                <Field label="Password" hint="at least 8 characters"><Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" /></Field>
                <Button variant="gold" className="w-full" onClick={create} disabled={actions.create.isPending || !email.trim() || password.length < 8}>{actions.create.isPending ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} Create employee login</Button>
              </>
            ) : (
              <>
                <ol className="list-decimal space-y-1.5 pl-5 text-xs text-text-secondary">
                  <li>Supabase → Authentication → Users → <strong className="text-text">Add user</strong> with this email and a password (tick “Auto confirm”).</li>
                  <li>Supabase → SQL Editor → run this, then the employee can sign in:</li>
                </ol>
                <pre className="overflow-x-auto rounded-xl bg-input p-3 font-mono text-[11px] text-text-secondary">{sql}</pre>
                <Button variant="outline" size="sm" onClick={copy}><Copy size={14} /> Copy SQL</Button>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Activity --- */
const PRESET_DAYS = [0, 7, 15, 30, 60, 90, 180, 365];

export function ActivityTab() {
  const { toast, confirm } = useUi();
  const log = useLogActivity();
  const { activitySettings, isLoading } = useActivitySettings(true);
  const save = useSaveGeneric('activity');
  const purge = usePurgeActivity();
  const [days, setDays] = useState(activitySettings.retentionDays);
  useEffect(() => { if (!isLoading) setDays(activitySettings.retentionDays); }, [isLoading, activitySettings.retentionDays]);
  const d = Math.max(0, Math.floor(Number(days) || 0));

  const submit = () => save.mutate({ retentionDays: d }, { onSuccess: () => { toast(d > 0 ? `Activity older than ${d} days will be deleted automatically.` : 'Activity will be kept until you delete it.'); void log(changed('Activity auto-delete changed', d > 0 ? `Delete after ${d} days` : 'Keep forever')); }, onError: (e) => toast(e.message, 'error') });
  const now = async () => {
    if (d < 1) { toast('Choose the number of days first.', 'error'); return; }
    if (!(await confirm({ title: `Delete activity older than ${d} days now?`, text: 'This permanently removes those lines from Recent activity. Your bills and payments are not touched.', confirmLabel: 'Delete now', danger: true }))) return;
    const cut = new Date(); cut.setDate(cut.getDate() - d); cut.setHours(0, 0, 0, 0);
    purge.mutate(cut.toISOString(), { onSuccess: (count) => toast(`${count} activity line${count === 1 ? '' : 's'} deleted.`, 'info'), onError: (e) => toast(e.message, 'error') });
  };

  return (
    <Card className="max-w-3xl">
      <CardHeader title="Auto-delete activity" subtitle="Keep the Recent activity list tidy" />
      <div className="space-y-5 p-5">
        <div>
          <p className="mb-2 text-xs font-medium text-text-secondary">Delete activity older than</p>
          <div className="flex flex-wrap gap-2">
            {PRESET_DAYS.map((p) => <button key={p} type="button" onClick={() => setDays(p)} className={cn('rounded-xl px-3.5 py-2 text-sm font-medium transition-colors', d === p ? 'bg-gold text-text-on-gold' : 'bg-input text-text-secondary hover:text-text')}>{p === 0 ? 'Never' : `${p} days`}</button>)}
          </div>
        </div>
        <Field label="Or type your own number of days" hint="0 = never delete" className="max-w-xs"><Input type="number" min={0} value={days} onChange={(e) => setDays(Number(e.target.value))} inputMode="numeric" /></Field>
        <p className="text-xs text-text-secondary">{d > 0 ? `Lines older than ${d} day${d === 1 ? '' : 's'} are removed each time you open the dashboard.` : 'Nothing is deleted automatically.'} Only the activity list is cleaned — bills and payments are never touched.</p>
      </div>
      <div className="flex flex-wrap justify-end gap-3 border-t border-border/70 px-5 py-4">
        <Button variant="danger" onClick={now} disabled={purge.isPending}><Trash2 size={15} /> Delete older now</Button>
        <Button variant="gold" onClick={submit} disabled={save.isPending}>{save.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save</Button>
      </div>
    </Card>
  );
}
