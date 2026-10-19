import { localISODate, pad2, todayISO } from './format';

export type Preset = 'today' | '7d' | '30d' | 'month' | 'lastMonth' | '3m' | '6m' | '12m' | 'year' | 'all' | 'custom';
export type Gran = 'auto' | 'day' | 'week' | 'month';
export type RangeState = { preset: Preset; from: string; to: string; gran: Gran };
export type Bucket = { key: string; label: string; from: string; to: string };
export type Resolved = { from: string; to: string; gran: 'day' | 'week' | 'month'; buckets: Bucket[]; label: string; days: number };

export const PRESETS: { id: Preset; label: string }[] = [
  { id: 'today', label: 'Today' }, { id: '7d', label: 'Last 7 days' }, { id: '30d', label: 'Last 30 days' },
  { id: 'month', label: 'This month' }, { id: 'lastMonth', label: 'Last month' }, { id: '3m', label: 'Last 3 months' },
  { id: '6m', label: 'Last 6 months' }, { id: '12m', label: 'Last 12 months' }, { id: 'year', label: 'This year' },
  { id: 'all', label: 'All time' }, { id: 'custom', label: 'Custom range' },
];
export const DEFAULT_RANGE: RangeState = { preset: '6m', from: '', to: '', gran: 'auto' };

const parse = (iso: string) => new Date(`${iso}T00:00:00`);
const addDays = (iso: string, n: number) => { const d = parse(iso); d.setDate(d.getDate() + n); return localISODate(d); };
const diffDays = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 864e5);
const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
const weekStart = (iso: string) => { const d = parse(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return localISODate(d); };

/** Local calendar date of any ISO date or timestamp. */
export const dayOf = (iso: string) => (iso.length === 10 ? iso : localISODate(new Date(iso)));

function bounds(s: RangeState, earliest?: string): { from: string; to: string } {
  const today = todayISO();
  const first = (n: number) => { const d = parse(today); d.setMonth(d.getMonth() - (n - 1), 1); return localISODate(d); };
  switch (s.preset) {
    case 'today': return { from: today, to: today };
    case '7d': return { from: addDays(today, -6), to: today };
    case '30d': return { from: addDays(today, -29), to: today };
    case 'month': return { from: monthStart(today), to: today };
    case 'lastMonth': { const f = first(2); const e = addDays(monthStart(today), -1); return { from: f, to: e }; }
    case '3m': return { from: first(3), to: today };
    case '6m': return { from: first(6), to: today };
    case '12m': return { from: first(12), to: today };
    case 'year': return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case 'all': return { from: earliest && earliest < today ? earliest : monthStart(today), to: today };
    default: {
      const f = /^\d{4}-\d{2}-\d{2}$/.test(s.from) ? s.from : addDays(today, -29);
      const t = /^\d{4}-\d{2}-\d{2}$/.test(s.to) ? s.to : today;
      return f <= t ? { from: f, to: t } : { from: t, to: f };
    }
  }
}

const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => parse(iso).toLocaleDateString('en-IN', o);

function makeBuckets(from: string, to: string, gran: 'day' | 'week' | 'month'): Bucket[] {
  const out: Bucket[] = [];
  if (gran === 'day') {
    for (let d = from; d <= to; d = addDays(d, 1)) out.push({ key: d, from: d, to: d, label: fmt(d, { day: 'numeric', month: 'short' }) });
  } else if (gran === 'week') {
    for (let w = weekStart(from); w <= to; w = addDays(w, 7)) {
      const end = addDays(w, 6);
      out.push({ key: w, from: w < from ? from : w, to: end > to ? to : end, label: fmt(w < from ? from : w, { day: 'numeric', month: 'short' }) });
    }
  } else {
    const d = parse(monthStart(from));
    while (localISODate(d) <= to) {
      const f = localISODate(d);
      const last = localISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
      out.push({ key: f.slice(0, 7), from: f < from ? from : f, to: last > to ? to : last, label: fmt(f, { month: 'short', year: d.getMonth() === 0 || out.length === 0 ? '2-digit' : undefined }) });
      d.setMonth(d.getMonth() + 1, 1);
    }
  }
  return out;
}

export function bucketKey(iso: string, gran: 'day' | 'week' | 'month') {
  const d = dayOf(iso);
  return gran === 'day' ? d : gran === 'week' ? weekStart(d) : d.slice(0, 7);
}

export function resolveRange(s: RangeState, earliest?: string): Resolved {
  const { from, to } = bounds(s, earliest);
  const days = diffDays(from, to) + 1;
  let gran: 'day' | 'week' | 'month' = s.gran === 'auto' ? (days <= 31 ? 'day' : days <= 120 ? 'week' : 'month') : s.gran;
  if (gran === 'day' && days > 92) gran = 'week';      // keep charts readable
  if (gran === 'week' && days > 800) gran = 'month';
  const label = from === to ? fmt(from, { day: 'numeric', month: 'short', year: 'numeric' }) : `${fmt(from, { day: 'numeric', month: 'short', year: 'numeric' })} – ${fmt(to, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  return { from, to, gran, buckets: makeBuckets(from, to, gran), label, days };
}

/** The period of the same length immediately before this one (for "vs previous period"). */
export function previousPeriod(r: Resolved): { from: string; to: string } {
  const to = addDays(r.from, -1);
  return { from: addDays(to, -(r.days - 1)), to };
}

export const inPeriod = (iso: string, p: { from: string; to: string }) => { const d = dayOf(iso); return d >= p.from && d <= p.to; };
export const isoMonthInput = (iso: string) => `${iso.slice(0, 4)}-${pad2(Number(iso.slice(5, 7)))}`;

const KEY = 'eventora-range-v1';
export function loadRange(scope: string): RangeState {
  try { const raw = window.localStorage.getItem(`${KEY}:${scope}`); if (raw) return { ...DEFAULT_RANGE, ...(JSON.parse(raw) as Partial<RangeState>) }; } catch { /* ignore */ }
  return DEFAULT_RANGE;
}
export function saveRange(scope: string, s: RangeState) { try { window.localStorage.setItem(`${KEY}:${scope}`, JSON.stringify(s)); } catch { /* ignore */ } }
