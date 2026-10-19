import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ArrowDownRight, ArrowUpRight, BarChart3, CalendarCheck, CalendarDays, FilePlus2, IndianRupee, LineChart, Plus, TrendingUp, Users, Wallet } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, Select, Sparkline, Spinner } from '@/components/ui';
import { StatusBadge } from '@/components/PaymentBadge';
import { RangePicker } from '@/components/RangePicker';
import { ActivityList } from '@/components/ActivityList';
import { useActivitySettings, usePurgeActivity, useQuotes } from '@/lib/api';
import { ACTIVITY_FILTERS, actorLabel, matchesFilter, type ActivityFilter } from '@/lib/activity';
import { cn, fmtDate, inr, inrCompact } from '@/lib/format';
import { quotePaymentState } from '@/lib/pricing';
import { loadRange, previousPeriod, resolveRange, saveRange, inPeriod, type RangeState } from '@/lib/range';
import { delta, earliestDate, greeting, seriesFor, totalsForPeriod, upcoming, type Metric } from '@/lib/stats';
import { useActivityFeed } from '@/lib/useFeed';
import { timeText } from '@/lib/booking';

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[11px] text-text-secondary">new</span>;
  if (value === 0) return <span className="text-[11px] text-text-disabled">no change</span>;
  const up = value > 0;
  return <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-semibold', up ? 'text-success' : 'text-error')}>{up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{Math.abs(value)}%</span>;
}

function Kpi({ icon, label, value, note, series, color, change }: { icon: React.ReactNode; label: string; value: string; note?: string; series?: number[]; color?: string; change?: number | null }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="grid size-10 place-items-center rounded-xl bg-surface-hover text-gold">{icon}</span>
        <span className="flex flex-col items-end gap-0.5 text-right">{change !== undefined && <Delta value={change} />}{note && <span className="text-[11px] text-text-secondary">{note}</span>}</span>
      </div>
      <p className="mt-4 text-xs text-text-secondary">{label}</p>
      <p className="mt-1 text-[28px] font-semibold leading-none tracking-tight text-text tabular">{value}</p>
      {series && <div className="mt-3"><Sparkline values={series} color={color} /></div>}
    </Card>
  );
}

const METRICS: { id: Metric; label: string; money: boolean }[] = [
  { id: 'revenue', label: 'Revenue collected', money: true },
  { id: 'quotations', label: 'Quotations', money: false },
  { id: 'booked', label: 'Booked events', money: false },
];

function TrendChart({ labels, values, kind, money, name }: { labels: string[]; values: number[]; kind: 'line' | 'bar'; money: boolean; name: string }) {
  const W = 640, H = 230, pl = 46, pb = 30, pt = 12, pr = 10;
  const max = Math.max(...values, 1);
  const step = money ? (max > 1e6 ? 1e6 : max > 2e5 ? 1e5 : max > 4e4 ? 2e4 : max > 1e4 ? 5e3 : 1e3) : max > 20 ? 10 : max > 8 ? 5 : 2;
  const niceMax = Math.max(step, Math.ceil(max / step) * step);
  const n = values.length;
  const x = (i: number) => (kind === 'bar' ? pl + ((i + 0.5) / n) * (W - pl - pr) : pl + (i / Math.max(1, n - 1)) * (W - pl - pr));
  const y = (v: number) => pt + (1 - v / niceMax) * (H - pt - pb);
  const fmtV = (v: number) => (money ? inrCompact(v).replace('₹', '') : String(Math.round(v)));
  const ticks = [0, 0.5, 1].map((t) => t * niceMax);
  const every = Math.max(1, Math.ceil(n / 8));
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const bw = Math.max(2, Math.min(34, ((W - pl - pr) / n) * 0.62));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-60 w-full" role="img" aria-label={`${name} over time`}>
      <defs><linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E6B84A" stopOpacity=".35" /><stop offset="1" stopColor="#E6B84A" stopOpacity="0" /></linearGradient></defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} stroke="#33415A" strokeDasharray="3 5" strokeWidth="1" />
          <text x={pl - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#8D9AB0">{fmtV(t)}</text>
        </g>
      ))}
      {kind === 'line' && n > 1 && <path d={`${line} L${x(n - 1)} ${H - pb} L${x(0)} ${H - pb} Z`} fill="url(#trend-fill)" />}
      {kind === 'line' && <path d={line} fill="none" stroke="#E6B84A" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
      {values.map((v, i) => (
        <g key={i}>
          {kind === 'bar'
            ? <rect x={x(i) - bw / 2} y={y(v)} width={bw} height={Math.max(v > 0 ? 2 : 0, H - pb - y(v))} rx="3" fill="#E6B84A" opacity={v > 0 ? 0.95 : 0.25}><title>{`${labels[i]}: ${money ? inr(v) : v}`}</title></rect>
            : <circle cx={x(i)} cy={y(v)} r={n > 40 ? 2.5 : 4} fill="#0D1424" stroke="#E6B84A" strokeWidth="2"><title>{`${labels[i]}: ${money ? inr(v) : v}`}</title></circle>}
          {i % every === 0 && <text x={x(i)} y={H - 9} textAnchor="middle" fontSize="11" fill="#B8C2D4">{labels[i]}</text>}
        </g>
      ))}
    </svg>
  );
}

export function Overview() {
  const { data: quotes = [], isLoading, error } = useQuotes();
  const { entries, isLoading: feedLoading, retention } = useActivityFeed(true);
  const { activitySettings } = useActivitySettings(true);
  const purge = usePurgeActivity();
  const [range, setRange] = useState<RangeState>(() => loadRange('overview'));
  const [metric, setMetric] = useState<Metric>('revenue');
  const [kind, setKind] = useState<'line' | 'bar'>('line');
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [actor, setActor] = useState('all');

  const changeRange = (r: RangeState) => { setRange(r); saveRange('overview', r); };

  // Auto-delete: once per visit, remove log lines older than the days the owner chose in Settings → Activity.
  const days = activitySettings.retentionDays;
  useEffect(() => {
    if (!(days > 0)) return;
    const cut = new Date(); cut.setDate(cut.getDate() - days); cut.setHours(0, 0, 0, 0);
    purge.mutate(cut.toISOString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const r = useMemo(() => resolveRange(range, earliestDate(quotes)), [range, quotes]);
  const prev = useMemo(() => previousPeriod(r), [r]);
  const now = useMemo(() => totalsForPeriod(quotes, r), [quotes, r]);
  const before = useMemo(() => totalsForPeriod(quotes, prev), [quotes, prev]);
  const rev = useMemo(() => seriesFor(quotes, r, 'revenue'), [quotes, r]);
  const qs = useMemo(() => seriesFor(quotes, r, 'quotations'), [quotes, r]);
  const bk = useMemo(() => seriesFor(quotes, r, 'booked'), [quotes, r]);
  const chartVals = metric === 'revenue' ? rev : metric === 'quotations' ? qs : bk;
  const meta = METRICS.find((m) => m.id === metric) ?? METRICS[0];

  const actors = useMemo(() => Array.from(new Set(entries.map(actorLabel))).sort(), [entries]);
  const feed = useMemo(() => entries.filter((a) => inPeriod(a.at, r) && matchesFilter(a, filter) && (actor === 'all' || actorLabel(a) === actor)), [entries, r, filter, actor]);
  const existing = useMemo(() => new Set(quotes.map((q) => q.reference)), [quotes]);

  if (isLoading) return <Spinner label="Loading your workspace" />;
  if (error) return <Card className="p-8 text-center text-sm text-error">Could not load data: {(error as Error).message}</Card>;

  const booked = quotes.filter((q) => q.status === 'confirmed');
  const outstanding = booked.reduce((a, q) => a + quotePaymentState(q.pricing).balance, 0);
  const soon = upcoming(quotes, 6);
  const next30 = upcoming(quotes, 500).filter((x) => new Date(`${x.next}T00:00:00`).getTime() - Date.now() < 30 * 864e5).length;
  const total = chartVals.reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h2 className="font-display text-3xl font-semibold text-text">{greeting()}</h2>
          <p className="mt-1 text-sm text-text-secondary">Here is your venue performance at a glance.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/admin/new"><Button variant="gold"><Plus size={16} /> New Booking</Button></Link>
          <Link href="/admin/calendar"><Button variant="outline"><CalendarDays size={16} /> View Calendar</Button></Link>
        </div>
      </div>

      <Card className="p-4">
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">Report period</p>
        <RangePicker value={range} onChange={changeRange} earliest={earliestDate(quotes)} />
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={<Users size={19} />} label="Total quotations" value={String(now.quotations)} series={qs} change={delta(now.quotations, before.quotations)} note="vs previous period" />
        <Kpi icon={<CalendarCheck size={19} />} label="Booked events" value={String(now.booked)} series={bk} color="#4F9B73" change={delta(now.booked, before.booked)} note={`${next30} in next 30 days`} />
        <Kpi icon={<IndianRupee size={19} />} label="Revenue collected" value={inrCompact(now.revenue)} series={rev} change={delta(now.revenue, before.revenue)} note="vs previous period" />
        <Kpi icon={<Wallet size={19} />} label="Outstanding balance" value={inrCompact(outstanding)} note="on all booked events, today" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title={meta.label}
            subtitle={`${r.label} · by ${r.gran}`}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Select value={metric} onChange={(e) => setMetric(e.target.value as Metric)} className="h-9 w-44 text-xs" aria-label="What to chart">{METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select>
                <div className="flex overflow-hidden rounded-xl border border-border" role="group" aria-label="Chart type">
                  {([['line', LineChart, 'Line'], ['bar', BarChart3, 'Bars']] as const).map(([id, Icon, label]) => (
                    <button key={id} type="button" aria-label={label} aria-pressed={kind === id} onClick={() => setKind(id)} className={cn('grid size-9 place-items-center transition-colors', kind === id ? 'bg-gold text-text-on-gold' : 'text-text-secondary hover:bg-surface-hover')}><Icon size={15} /></button>
                  ))}
                </div>
                <span className="inline-flex items-center gap-1 text-xs text-gold"><TrendingUp size={14} /> {meta.money ? inrCompact(total) : total} total</span>
              </div>
            }
          />
          <div className="px-3 py-4 sm:px-5"><TrendChart labels={r.buckets.map((b) => b.label)} values={chartVals} kind={kind} money={meta.money} name={meta.label} /></div>
        </Card>

        <Card className="flex flex-col">
          <CardHeader title="Recent activity" subtitle={r.label}
            action={<Link href="/admin/activity" className="inline-flex items-center gap-1 text-xs text-gold hover:underline">View all <ArrowUpRight size={13} /></Link>} />
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3">
            {ACTIVITY_FILTERS.map((f) => (
              <button key={f.id} type="button" onClick={() => setFilter(f.id)} className={cn('rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors', filter === f.id ? 'bg-gold text-text-on-gold' : 'bg-input text-text-secondary hover:text-text')}>{f.label}</button>
            ))}
            {actors.length > 1 && <Select value={actor} onChange={(e) => setActor(e.target.value)} className="ml-auto h-8 w-40 text-[11px]" aria-label="Filter by person"><option value="all">Everyone</option>{actors.map((a) => <option key={a} value={a}>{a}</option>)}</Select>}
          </div>
          {feedLoading ? <Spinner label="Loading activity" /> : feed.length === 0 ? <EmptyState icon={<FilePlus2 />} title="Nothing in this period" text="Bills, payments, edits and deletions show up here." /> : (
            <div className="max-h-[560px] overflow-y-auto"><ActivityList items={feed.slice(0, 40)} existing={existing} /></div>
          )}
          {retention > 0 && <p className="border-t border-border/60 px-5 py-2.5 text-[11px] text-text-disabled">Activity older than {retention} day{retention === 1 ? '' : 's'} is deleted automatically.</p>}
        </Card>
      </div>

      <Card>
        <CardHeader title="Upcoming events" subtitle="The next dates on your calendar" action={<Link href="/admin/quotes" className="inline-flex items-center gap-1 text-xs text-gold hover:underline">All quotations <ArrowUpRight size={13} /></Link>} />
        {soon.length === 0 ? <EmptyState icon={<CalendarDays />} title="No upcoming events" text="Create a booking to see it here." action={<Link href="/admin/new"><Button variant="gold"><Plus size={16} /> New Booking</Button></Link>} /> : (
          <ul className="divide-y divide-border/60">
            {soon.map(({ quote, next }) => (
              <li key={quote.id}>
                <Link href={`/admin/quotes/${encodeURIComponent(quote.reference)}`} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-hover">
                  <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-input text-center leading-none"><span><span className="block text-base font-semibold text-gold">{next.slice(8)}</span><span className="block text-[10px] uppercase text-text-secondary">{fmtDate(next, { month: 'short' })}</span></span></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-text">{quote.customer.eventType} · {quote.customer.name}</span><span className="block truncate text-xs text-text-secondary">{timeText(quote.customer.eventSlots?.[next]) || 'Time not set'} · {quote.customer.guests} guests · {quote.reference}</span></span>
                  <span className="hidden text-sm font-semibold text-text tabular sm:block">{inr(quote.pricing.grandTotal)}</span>
                  <StatusBadge status={quote.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
