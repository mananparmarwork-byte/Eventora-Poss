import { useState } from 'react';
import { Link } from 'wouter';
import { Ban, CalendarCheck, ChevronDown, FilePlus2, IndianRupee, Pencil, Send, Settings, Trash2, Undo2, type LucideIcon } from 'lucide-react';
import { Badge } from './ui';
import { ACTION_META, actorLabel } from '@/lib/activity';
import { cn, fmtDateTime, inr } from '@/lib/format';
import type { ActivityAction, ActivityEntry } from '@/lib/types';

const ICONS: Record<ActivityAction, LucideIcon> = {
  'bill.created': FilePlus2, 'bill.updated': Pencil, 'bill.deleted': Trash2, 'bill.booked': CalendarCheck, 'bill.released': Undo2,
  'payment.received': IndianRupee, 'payment.removed': Ban, 'payment.request': Send, 'settings.changed': Settings,
};
const TONE: Record<string, string> = { success: 'bg-success-bg text-success', gold: 'bg-gold/15 text-gold', error: 'bg-error-bg text-error', info: 'bg-info/15 text-info', warning: 'bg-warning-bg text-warning' };

function Details({ a, exists }: { a: ActivityEntry; exists: boolean }) {
  const d = a.data;
  const rows: [string, string][] = [];
  if (a.reference) rows.push(['Bill number', a.reference]);
  if (d.customer) rows.push(['Customer', d.customer + (d.mobile ? ` · ${d.mobile}` : '')]);
  if (d.eventType) rows.push(['Event', d.eventType]);
  if (d.dates) rows.push(['Event dates', d.dates]);
  if (d.guests) rows.push(['Guests', String(d.guests)]);
  if (d.total !== undefined) rows.push(['Bill total', inr(d.total)]);
  if (d.amount !== undefined) rows.push(['Amount', inr(d.amount)]);
  if (d.method) rows.push(['Method', d.method.toUpperCase() + (d.kind ? ` · ${d.kind}` : '')]);
  if (d.txn) rows.push(['UPI / transaction ref', d.txn]);
  if (d.balance !== undefined) rows.push(['Balance after', inr(d.balance)]);
  if (d.received !== undefined && a.action === 'bill.deleted') rows.push(['Had been received', inr(d.received)]);
  rows.push(['Done by', actorLabel(a)]);
  rows.push(['Date & time', fmtDateTime(a.at)]);
  return (
    <div className="space-y-3 border-t border-border/50 bg-input/40 px-5 py-4 text-xs">
      {d.changes && d.changes.length > 0 && (
        <div>
          <p className="mb-1.5 font-semibold uppercase tracking-wide text-text-disabled">What changed</p>
          <ul className="divide-y divide-border/40 rounded-xl border border-border/60">
            {d.changes.map((c, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2">
                <span className="w-44 shrink-0 font-medium text-text">{c.label}</span>
                {c.from !== undefined && <span className="text-error line-through decoration-error/50">{c.from}</span>}
                {c.from !== undefined && c.to !== undefined && <span className="text-text-disabled">→</span>}
                {c.to !== undefined && <span className="text-success">{c.to}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {d.services && d.services.length > 0 && <p className="text-text-secondary"><span className="font-semibold text-text">Services on the bill: </span>{d.services.join(', ')}</p>}
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map(([k, v]) => <div key={k}><dt className="text-[10px] uppercase tracking-wide text-text-disabled">{k}</dt><dd className="mt-0.5 font-medium text-text">{v}</dd></div>)}
      </dl>
      {exists ? <Link href={`/admin/quotes/${encodeURIComponent(a.reference)}`} className="inline-block font-medium text-gold hover:underline">Open this bill</Link>
        : a.reference && a.action !== 'settings.changed' && <p className="text-text-disabled">This bill no longer exists.</p>}
    </div>
  );
}

/** One line per event; click a line to see every detail (amounts, UPI reference, before → after of an edit, who did it). */
export function ActivityList({ items, existing, showActor = true }: { items: ActivityEntry[]; existing: Set<string>; showActor?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul className="divide-y divide-border/60">
      {items.map((a) => {
        const meta = ACTION_META[a.action] ?? ACTION_META['settings.changed'];
        const Icon = ICONS[a.action] ?? Settings;
        const isOpen = open === a.id;
        return (
          <li key={a.id}>
            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : a.id)} className="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-hover">
              <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg', TONE[meta.tone])}><Icon size={15} /></span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium text-text">{a.title}</span>{a.legacy && <Badge>imported</Badge>}</span>
                <span className="mt-0.5 block text-xs text-text-secondary">{a.detail}</span>
                {showActor && <span className="mt-0.5 block text-[11px] text-text-disabled">by {actorLabel(a)}</span>}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1"><span className="text-[11px] text-text-disabled">{fmtDateTime(a.at)}</span><ChevronDown size={14} className={cn('text-text-disabled transition-transform', isOpen && 'rotate-180')} /></span>
            </button>
            {isOpen && <Details a={a} exists={existing.has(a.reference)} />}
          </li>
        );
      })}
    </ul>
  );
}
