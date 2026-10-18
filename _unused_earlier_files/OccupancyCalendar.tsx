import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cx } from './ui';
import { formatTimeShort, freeWindows, isFullDayBooked, occupancyEntries, rangesText, timeText, toMinutes } from '@/lib/booking';
import { fmtDate, isoToday } from '@/lib/format';
import type { Quote, TimeRange } from '@/lib/types';

type Entry = { quote: Quote; range: TimeRange; timeKnown: boolean; booked: boolean };
const pad = (n: number) => String(n).padStart(2, '0');
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function DayBar({ list, tall }: { list: Entry[]; tall?: boolean }) {
  return (
    <span className={cx('relative block w-full overflow-hidden rounded-sm bg-border/60', tall ? 'h-3' : 'h-1.5')} aria-hidden="true">
      {list.map((e) => {
        const from = toMinutes(e.range.start) ?? 0; const to = toMinutes(e.range.end) ?? 1440;
        return <i key={`${e.quote.reference}-${e.range.start}`} className={cx('absolute inset-y-0 block', e.booked ? 'bg-gold' : 'bg-info/60')} style={{ left: `${(from / 1440) * 100}%`, width: `${Math.max(2, ((to - from) / 1440) * 100)}%` }} />;
      })}
    </span>
  );
}

/** Month view: gold bars are confirmed bookings, blue bars are open enquiries on the same date. */
export function OccupancyCalendar({ quotes, onOpenQuote }: { quotes: Quote[]; onOpenQuote: (reference: string) => void }) {
  const [view, setView] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [selected, setSelected] = useState<string | null>(isoToday());
  const year = view.getFullYear(); const month = view.getMonth();
  const today = isoToday();

  const byDate = useMemo(() => {
    const map = new Map<string, Entry[]>();
    quotes.filter((q) => q.status !== 'archived').forEach((q) => {
      occupancyEntries(q.customer.eventDates, q.customer.eventSlots).forEach((e) => {
        map.set(e.date, [...(map.get(e.date) ?? []), { quote: q, range: e.range, timeKnown: e.timeKnown, booked: q.status === 'confirmed' }]);
      });
    });
    return map;
  }, [quotes]);

  const first = new Date(year, month, 1).getDay(); const count = new Date(year, month + 1, 0).getDate();
  const cells = [...Array.from({ length: first }, () => null), ...Array.from({ length: count }, (_, i) => `${year}-${pad(month + 1)}-${pad(i + 1)}`)];
  const dayList = selected ? byDate.get(selected) ?? [] : [];
  const bookedRanges = dayList.filter((e) => e.booked).map((e) => e.range);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{view.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h3>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Previous month" onClick={() => setView(new Date(year, month - 1, 1))} className="grid size-9 place-items-center rounded-lg border border-border hover:bg-surface-hover"><ChevronLeft size={16} /></button>
            <button type="button" onClick={() => { const n = new Date(); setView(new Date(n.getFullYear(), n.getMonth(), 1)); setSelected(today); }} className="h-9 rounded-lg border border-border px-3 text-xs hover:bg-surface-hover">Today</button>
            <button type="button" aria-label="Next month" onClick={() => setView(new Date(year, month + 1, 1))} className="grid size-9 place-items-center rounded-lg border border-border hover:bg-surface-hover"><ChevronRight size={16} /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium text-text-disabled">{WEEK.map((w) => <span key={w}>{w}</span>)}</div>
        <div className="mt-1.5 grid grid-cols-7 gap-1.5">
          {cells.map((iso, i) => {
            if (!iso) return <span key={`b${i}`} />;
            const list = byDate.get(iso) ?? [];
            const booked = list.filter((e) => e.booked);
            const full = isFullDayBooked(booked.map((e) => e.range));
            return (
              <button key={iso} type="button" onClick={() => setSelected(iso)} aria-label={`${fmtDate(iso)}: ${booked.length} booked, ${list.length - booked.length} enquiries`}
                className={cx('flex min-h-[68px] flex-col justify-between rounded-xl border p-1.5 text-left transition-colors sm:min-h-[84px] sm:p-2',
                  selected === iso ? 'border-gold bg-gold/10' : 'border-border bg-surface hover:bg-surface-hover', iso === today && selected !== iso && 'border-gold/50')}>
                <span className="flex items-center justify-between">
                  <span className={cx('text-xs font-semibold', iso === today ? 'text-gold' : 'text-text')}>{Number(iso.slice(8))}</span>
                  {list.length > 0 && <span className={cx('rounded-full px-1.5 text-[10px] font-bold', full ? 'bg-error-bg text-error' : booked.length ? 'bg-gold/20 text-gold' : 'bg-info/15 text-info')}>{list.length}</span>}
                </span>
                {list.length > 0 && <DayBar list={list} />}
              </button>
            );
          })}
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-text-disabled">
          <span className="flex items-center gap-1.5"><i className="h-1.5 w-4 rounded-sm bg-gold" />Booked</span>
          <span className="flex items-center gap-1.5"><i className="h-1.5 w-4 rounded-sm bg-info/60" />Enquiry (not booked)</span>
          <span>Each bar spans 12 AM → 12 AM</span>
        </p>
      </div>

      <aside className="rounded-2xl border border-border bg-surface p-4 lg:sticky lg:top-24 lg:self-start">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">Selected day</p>
        <h3 className="mt-1 text-base font-semibold">{selected ? fmtDate(selected, true) : 'Pick a date'}</h3>
        {selected && <DayBar list={dayList} tall />}
        {selected && (
          <p className="mt-2 text-xs text-text-secondary">
            {isFullDayBooked(bookedRanges) ? 'Fully booked.' : bookedRanges.length ? `Free: ${rangesText(freeWindows(bookedRanges), true) || 'none'}` : 'No confirmed bookings: the whole day is free.'}
          </p>
        )}
        <ul className="mt-4 space-y-2">
          {dayList.length === 0 && <li className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-text-disabled">Nothing scheduled.</li>}
          {dayList.map((e) => (
            <li key={`${e.quote.reference}-${e.range.start}`}>
              <button type="button" onClick={() => onOpenQuote(e.quote.reference)} className="w-full rounded-xl border border-border bg-input/50 p-3 text-left hover:border-gold/60">
                <span className="flex items-center justify-between gap-2">
                  <strong className="truncate text-sm">{e.quote.customer.name}</strong>
                  <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold', e.booked ? 'bg-gold/15 text-gold' : 'bg-info/15 text-info')}>{e.booked ? 'Booked' : 'Enquiry'}</span>
                </span>
                <span className="mt-1 block text-xs text-text-secondary">{e.quote.customer.eventType} · {e.timeKnown ? timeText(e.range, true) : 'time not set'} · {e.quote.customer.guests} guests</span>
                <span className="mt-0.5 block text-[11px] text-text-disabled">Bill {e.quote.reference}{e.timeKnown ? '' : ` · holds whole day (${formatTimeShort('00:00')}–12 AM)`}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
