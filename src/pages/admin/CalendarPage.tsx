import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { CalendarDays } from 'lucide-react';
import { Card, CardHeader, EmptyState, Spinner } from '@/components/ui';
import { MonthGrid } from '@/components/MonthGrid';
import { StatusBadge } from '@/components/PaymentBadge';
import { useQuotes, useSession } from '@/lib/api';
import { fmtDate, inr, cn } from '@/lib/format';
import { freeWindows, occupancyEntries, rangesText, timeText, toMinutes } from '@/lib/booking';
import { quoteDates } from '@/lib/pricing';
import type { Quote, TimeRange } from '@/lib/types';

type Entry = { quote: Quote; range: TimeRange; timeKnown: boolean; booked: boolean };
const STRIPE = { backgroundImage: 'repeating-linear-gradient(45deg,#647DA8,#647DA8 3px,#3c4d6b 3px,#3c4d6b 6px)' } as const;

function DayBar({ list, tall = false }: { list: Entry[]; tall?: boolean }) {
  return (
    <span className={cn('relative block w-full overflow-hidden rounded-sm bg-input', tall ? 'h-3' : 'h-1.5')} aria-hidden="true">
      {list.map((e) => {
        const from = toMinutes(e.range.start) ?? 0;
        const to = toMinutes(e.range.end) ?? 1440;
        return <i key={`${e.quote.reference}-${e.range.start}`} className={cn('absolute inset-y-0 block', e.booked && 'bg-gold')} style={{ left: `${(from / 1440) * 100}%`, width: `${Math.max(3, ((to - from) / 1440) * 100)}%`, ...(e.booked ? {} : STRIPE) }} />;
      })}
    </span>
  );
}

export function CalendarPage() {
  const { data: quotes = [], isLoading } = useQuotes();
  const { isAdmin } = useSession();
  const [selected, setSelected] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const map: Record<string, Entry[]> = {};
    quotes.filter((q) => q.status !== 'archived').forEach((q) => {
      occupancyEntries(quoteDates(q.customer), q.customer.eventSlots).forEach((e) => {
        map[e.date] = [...(map[e.date] ?? []), { quote: q, range: e.range, timeKnown: e.timeKnown, booked: q.status === 'confirmed' }];
      });
    });
    return map;
  }, [quotes]);

  if (isLoading) return <Spinner label="Loading calendar" />;
  const list = selected ? byDate[selected] ?? [] : [];
  const bookedRanges = list.filter((e) => e.booked).map((e) => e.range);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader title="Venue calendar" subtitle="Gold bars are confirmed bookings, striped bars are open enquiries." />
        <div className="p-4 sm:p-6">
          <MonthGrid renderDay={(iso, today) => {
            const entries = byDate[iso] ?? [];
            const booked = entries.filter((e) => e.booked);
            const active = selected === iso;
            return (
              <button type="button" onClick={() => setSelected(iso)} aria-label={`${fmtDate(iso)}: ${entries.length} entries`}
                className={cn('flex h-[74px] w-full flex-col justify-between rounded-xl border p-2 text-left transition-colors sm:h-[92px]',
                  active ? 'border-gold bg-gold/10' : 'border-border/70 bg-input/40 hover:border-steel-blue hover:bg-surface-hover')}>
                <span className="flex items-center justify-between">
                  <span className={cn('grid size-6 place-items-center rounded-full text-xs font-semibold', today ? 'bg-gold text-text-on-gold' : 'text-text')}>{Number(iso.slice(8))}</span>
                  {entries.length > 0 && <span className="text-[10px] font-semibold text-text-secondary">{booked.length > 0 ? `${booked.length} booked` : `${entries.length} enq.`}</span>}
                </span>
                {entries.length > 0 ? <DayBar list={entries} /> : <span />}
              </button>
            );
          }} />
        </div>
      </Card>

      <Card className="h-fit xl:sticky xl:top-24">
        <CardHeader title={selected ? fmtDate(selected, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Pick a date'} subtitle={selected ? `${list.length} entr${list.length === 1 ? 'y' : 'ies'}` : 'Select a day to see its bookings'} />
        {!selected ? <EmptyState icon={<CalendarDays />} title="No date selected" text="Click any day in the calendar." /> : (
          <div className="space-y-4 p-5">
            <div><DayBar list={list} tall /><div className="mt-1 flex justify-between text-[10px] text-text-disabled"><span>12 AM</span><span>12 PM</span><span>12 AM</span></div></div>
            <p className="rounded-xl bg-input px-3 py-2.5 text-xs text-text-secondary">
              {bookedRanges.length === 0 ? 'Whole day is free for new bookings.' : <>Free: <span className="font-medium text-success">{rangesText(freeWindows(bookedRanges), true) || 'fully booked'}</span></>}
            </p>
            {list.length === 0 ? <p className="text-sm text-text-secondary">No bookings or enquiries on this day.</p> : (
              <ul className="space-y-2.5">
                {list.map((e) => (
                  <li key={`${e.quote.reference}-${e.range.start}`}>
                    <Link href={`/admin/quotes/${encodeURIComponent(e.quote.reference)}`} className="block rounded-xl border border-border bg-input/50 p-3.5 transition-colors hover:border-gold/60">
                      <div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold text-text">{e.quote.customer.name}</p><StatusBadge status={e.quote.status} /></div>
                      <p className="mt-1 text-xs text-text-secondary">{e.quote.customer.eventType} · {e.timeKnown ? timeText(e.range) : 'Time not set (whole day held)'}</p>
                      <p className="mt-1 text-xs text-text-disabled">{e.quote.reference} · {e.quote.customer.guests} guests{isAdmin ? ` · ${inr(e.quote.pricing.grandTotal)}` : ''}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
