import { quoteDates, quotePaymentState } from './pricing';
import { todayISO } from './format';
import { bucketKey, dayOf, inPeriod, type Resolved } from './range';
import type { Quote } from './types';

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

/** Every rupee received, with the moment it was received. Advances typed on an old bill (no payment log) count on the day the bill was created. */
export function paymentEvents(quotes: Quote[]): { at: string; amount: number }[] {
  const out: { at: string; amount: number }[] = [];
  quotes.forEach((q) => {
    const log = q.pricing.payments ?? [];
    const logged = log.reduce((a, p) => a + p.amount, 0);
    log.forEach((p) => out.push({ at: p.paidAt, amount: p.amount }));
    const received = quotePaymentState(q.pricing).received;
    if (received > logged) out.push({ at: q.createdAt, amount: received - logged });
  });
  return out;
}

export function earliestDate(quotes: Quote[]): string | undefined {
  const all = [...quotes.map((q) => dayOf(q.createdAt)), ...paymentEvents(quotes).map((p) => dayOf(p.at))];
  return all.length ? all.sort()[0] : undefined;
}

export type Metric = 'revenue' | 'quotations' | 'booked';

export type PeriodStats = { quotations: number; booked: number; revenue: number };
export function totalsForPeriod(quotes: Quote[], p: { from: string; to: string }): PeriodStats {
  const made = quotes.filter((q) => inPeriod(q.createdAt, p));
  return {
    quotations: made.length,
    booked: made.filter((q) => q.status === 'confirmed').length,
    revenue: paymentEvents(quotes).filter((e) => inPeriod(e.at, p)).reduce((a, e) => a + e.amount, 0),
  };
}

/** One value per bucket for the chosen metric. */
export function seriesFor(quotes: Quote[], r: Resolved, metric: Metric): number[] {
  const index = new Map(r.buckets.map((b, i) => [b.key, i]));
  const values = r.buckets.map(() => 0);
  const put = (iso: string, amount: number) => {
    if (!inPeriod(iso, r)) return;
    const i = index.get(bucketKey(iso, r.gran));
    if (i !== undefined) values[i] += amount;
  };
  if (metric === 'revenue') paymentEvents(quotes).forEach((e) => put(e.at, e.amount));
  else quotes.filter((q) => metric === 'quotations' || q.status === 'confirmed').forEach((q) => put(q.createdAt, 1));
  return values;
}

export function upcoming(quotes: Quote[], limit = 6) {
  const today = todayISO();
  return quotes
    .filter((q) => q.status !== 'archived')
    .map((q) => ({ quote: q, next: quoteDates(q.customer).filter((d) => d >= today).sort()[0] }))
    .filter((x): x is { quote: Quote; next: string } => Boolean(x.next))
    .sort((a, b) => a.next.localeCompare(b.next))
    .slice(0, limit);
}

export const delta = (now: number, before: number): number | null => (before === 0 ? (now === 0 ? 0 : null) : Math.round(((now - before) / before) * 100));
