import { Link, useLocation } from 'wouter';
import { ArrowUpRight, CalendarCheck, CalendarDays, FilePlus2, IndianRupee, Plus, TrendingUp, Users, Wallet } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, Sparkline, Spinner } from '@/components/ui';
import { StatusBadge } from '@/components/PaymentBadge';
import { useQuotes } from '@/lib/api';
import { fmtDate, fmtDateTime, inrCompact, inr } from '@/lib/format';
import { quotePaymentState } from '@/lib/pricing';
import { activityFeed, countByMonth, greeting, lastMonths, revenueByMonth, shortMonth, upcoming } from '@/lib/stats';
import { timeText } from '@/lib/booking';

function Kpi({ icon, label, value, note, series, color }: { icon: React.ReactNode; label: string; value: string; note?: string; series?: number[]; color?: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="grid size-10 place-items-center rounded-xl bg-surface-hover text-gold">{icon}</span>
        {note && <span className="text-[11px] text-text-secondary">{note}</span>}
      </div>
      <p className="mt-4 text-xs text-text-secondary">{label}</p>
      <p className="mt-1 text-[28px] font-semibold leading-none tracking-tight text-text tabular">{value}</p>
      {series && <div className="mt-3"><Sparkline values={series} color={color} /></div>}
    </Card>
  );
}

function RevenueChart({ months, values }: { months: string[]; values: number[] }) {
  const W = 640, H = 220, pl = 44, pb = 28, pt = 12, pr = 8;
  const max = Math.max(...values, 1);
  const niceMax = Math.ceil(max / 1e5) * 1e5 || 1e5;
  const x = (i: number) => pl + (i / Math.max(1, values.length - 1)) * (W - pl - pr);
  const y = (v: number) => pt + (1 - v / niceMax) * (H - pt - pb);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const ticks = [0, 0.5, 1].map((t) => t * niceMax);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full" role="img" aria-label="Revenue collected per month">
      <defs><linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E6B84A" stopOpacity=".35" /><stop offset="1" stopColor="#E6B84A" stopOpacity="0" /></linearGradient></defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} stroke="#33415A" strokeDasharray="3 5" strokeWidth="1" />
          <text x={pl - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#8D9AB0">{inrCompact(t).replace('₹', '')}</text>
        </g>
      ))}
      <path d={`${line} L${x(values.length - 1)} ${H - pb} L${x(0)} ${H - pb} Z`} fill="url(#rev-fill)" />
      <path d={line} fill="none" stroke="#E6B84A" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => (
        <g key={months[i]}>
          <circle cx={x(i)} cy={y(v)} r="4" fill="#0D1424" stroke="#E6B84A" strokeWidth="2"><title>{`${shortMonth(months[i])}: ${inr(v)}`}</title></circle>
          <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#B8C2D4">{shortMonth(months[i])}</text>
        </g>
      ))}
    </svg>
  );
}

export function Overview() {
  const { data: quotes = [], isLoading, error } = useQuotes();
  const [, navigate] = useLocation();
  if (isLoading) return <Spinner label="Loading your workspace" />;
  if (error) return <Card className="p-8 text-center text-sm text-error">Could not load data: {(error as Error).message}</Card>;

  const months = lastMonths(6);
  const revenue = revenueByMonth(quotes, months);
  const booked = quotes.filter((q) => q.status === 'confirmed');
  const collected = quotes.reduce((a, q) => a + quotePaymentState(q.pricing).received, 0);
  const outstanding = booked.reduce((a, q) => a + quotePaymentState(q.pricing).balance, 0);
  const soon = upcoming(quotes, 6);
  const next30 = upcoming(quotes, 500).filter((x) => new Date(`${x.next}T00:00:00`).getTime() - Date.now() < 30 * 864e5).length;
  const feed = activityFeed(quotes, 7);
  const monthRevenue = revenue[revenue.length - 1];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-display text-3xl font-semibold text-text">{greeting()}</h2>
          <p className="mt-1 text-sm text-text-secondary">Here is your venue performance at a glance.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/admin/new"><Button variant="gold"><Plus size={16} /> New Booking</Button></Link>
          <Link href="/admin/calendar"><Button variant="outline"><CalendarDays size={16} /> View Calendar</Button></Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={<Users size={19} />} label="Total quotations" value={String(quotes.length)} series={countByMonth(quotes, months, () => true)} note="6 months" />
        <Kpi icon={<CalendarCheck size={19} />} label="Booked events" value={String(booked.length)} series={countByMonth(quotes, months, (q) => q.status === 'confirmed')} color="#4F9B73" note={`${next30} in next 30 days`} />
        <Kpi icon={<IndianRupee size={19} />} label="Revenue collected" value={inrCompact(collected)} series={revenue} note={`${inrCompact(monthRevenue)} this month`} />
        <Kpi icon={<Wallet size={19} />} label="Outstanding balance" value={inrCompact(outstanding)} note="on booked events" series={undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Revenue collected" subtitle="Payments received over the last 6 months" action={<span className="inline-flex items-center gap-1 text-xs text-gold"><TrendingUp size={14} /> {inrCompact(revenue.reduce((a, b) => a + b, 0))} total</span>} />
          <div className="px-3 py-4 sm:px-5"><RevenueChart months={months} values={revenue} /></div>
        </Card>
        <Card>
          <CardHeader title="Recent activity" subtitle="Latest quotations and payments" />
          {feed.length === 0 ? <EmptyState icon={<FilePlus2 />} title="Nothing yet" text="Activity appears here as you create quotations." /> : (
            <ul className="divide-y divide-border/60">
              {feed.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => navigate(`/admin/quotes/${encodeURIComponent(a.reference)}`)} className="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-hover">
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${a.kind === 'payment' ? 'bg-success' : 'bg-gold'}`} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-text">{a.title}</span><span className="block truncate text-xs text-text-secondary">{a.detail}</span></span>
                    <span className="shrink-0 text-[11px] text-text-disabled">{fmtDateTime(a.at).split(',')[0]}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
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
