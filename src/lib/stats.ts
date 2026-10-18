import { quoteDates, quotePaymentState } from './pricing';
import { monthKey, todayISO } from './format';
import type { Quote } from './types';

export function lastMonths(count: number): string[] {
  const out: string[] = [];
  const d = new Date(); d.setDate(1);
  for (let i = count - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export const shortMonth = (key: string) => new Date(`${key}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short' });

/** Payments received per month. Bills with an advance typed on the bill (no payment log) count on the day they were created. */
export function revenueByMonth(quotes: Quote[], months: string[]): number[] {
  const totals: Record<string, number> = {};
  quotes.forEach((q) => {
    const log = q.pricing.payments ?? [];
    const logged = log.reduce((a, p) => a + p.amount, 0);
    log.forEach((p) => { const k = monthKey(p.paidAt); totals[k] = (totals[k] ?? 0) + p.amount; });
    const received = quotePaymentState(q.pricing).received;
    if (received > logged) { const k = monthKey(q.createdAt); totals[k] = (totals[k] ?? 0) + (received - logged); }
  });
  return months.map((m) => totals[m] ?? 0);
}

export const countByMonth = (quotes: Quote[], months: string[], pick: (q: Quote) => boolean) =>
  months.map((m) => quotes.filter((q) => pick(q) && monthKey(q.createdAt) === m).length);

export function upcoming(quotes: Quote[], limit = 6) {
  const today = todayISO();
  return quotes
    .filter((q) => q.status !== 'archived')
    .map((q) => ({ quote: q, next: quoteDates(q.customer).filter((d) => d >= today).sort()[0] }))
    .filter((x): x is { quote: Quote; next: string } => Boolean(x.next))
    .sort((a, b) => a.next.localeCompare(b.next))
    .slice(0, limit);
}

export type Activity = { id: string; at: string; kind: 'enquiry' | 'payment' | 'booked'; title: string; detail: string; reference: string };

export function activityFeed(quotes: Quote[], limit = 8): Activity[] {
  const items: Activity[] = [];
  quotes.forEach((q) => {
    items.push({ id: `e-${q.id}`, at: q.createdAt, kind: 'enquiry', title: 'New quotation created', detail: `${q.customer.name} · ${q.customer.eventType}`, reference: q.reference });
    (q.pricing.payments ?? []).forEach((p) => items.push({ id: `p-${p.id}`, at: p.paidAt, kind: 'payment', title: 'Payment received', detail: `${q.customer.name} · ${p.method.toUpperCase()} ₹${Math.round(p.amount).toLocaleString('en-IN')}`, reference: q.reference }));
  });
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
