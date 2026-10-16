import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatTimeShort, freeWindows, occupancyEntries, timeText, toMinutes, type TimeRange } from '@/lib/booking';
import { formatEventDates, quoteEventDates, type Quote } from '@/lib/supabase-queries';

type DayEntry = { quote: Quote; range: TimeRange; timeKnown: boolean; booked: boolean };

const pad = (value: number) => String(value).padStart(2, '0');
const isoOf = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`;
const STRIPE = { backgroundImage: 'repeating-linear-gradient(45deg,#f3dfaa,#f3dfaa 4px,#fbefc9 4px,#fbefc9 8px)' } as const;

// Thin bar for one day (12 AM on the left, 12 AM on the right) with the booked hours coloured in.
function DayBar({ list, tall = false }: { list: DayEntry[]; tall?: boolean }) {
  return (
    <span className={`relative block w-full overflow-hidden rounded-sm bg-[#eee6d9] ${tall ? 'h-3' : 'h-1.5'}`} aria-hidden="true">
      {list.map((entry) => {
        const from = toMinutes(entry.range.start) ?? 0;
        const to = toMinutes(entry.range.end) ?? 1440;
        return (
          <i
            key={`${entry.quote.reference}-${entry.range.start}`}
            className={`absolute inset-y-0 block ${entry.booked ? 'bg-[#864936]' : ''}`}
            style={{ left: `${(from / 1440) * 100}%`, width: `${Math.max(2, ((to - from) / 1440) * 100)}%`, ...(entry.booked ? {} : STRIPE) }}
            data-state={entry.booked ? 'booked' : 'enquiry'}
          />
        );
      })}
    </span>
  );
}

// Big month calendar showing which hours of the hall are booked (confirmed bills) or only enquiries (saved, not ticked as booked).
export function OccupancyCalendar({ quotes, onOpenQuote }: { quotes: Quote[]; onOpenQuote: (reference: string) => void }) {
  const now = new Date();
  const todayISO = isoOf(now.getFullYear(), now.getMonth(), now.getDate());
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showEnquiries, setShowEnquiries] = useState(true);

  const byDay = useMemo(() => {
    const map = new Map<string, DayEntry[]>();
    quotes.forEach((quote) => {
      if (quote.status === 'archived') return;
      const booked = quote.status === 'confirmed';
      if (!booked && !showEnquiries) return;
      occupancyEntries(quoteEventDates(quote.customer), quote.customer.eventSlots).forEach((entry) => {
        map.set(entry.date, [...(map.get(entry.date) ?? []), { quote, range: entry.range, timeKnown: entry.timeKnown, booked }].sort((a, b) => (toMinutes(a.range.start) ?? 0) - (toMinutes(b.range.start) ?? 0)));
      });
    });
    return map;
  }, [quotes, showEnquiries]);

  const { year, month } = view;
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => isoOf(year, month, index + 1)),
  ];
  const monthPrefix = `${year}-${pad(month + 1)}`;
  const monthDays = Array.from(byDay.entries()).filter(([date]) => date.startsWith(monthPrefix));
  const bookedDays = monthDays.filter(([, list]) => list.some((entry) => entry.booked)).length;
  const enquiryDays = monthDays.filter(([, list]) => !list.some((entry) => entry.booked) && list.length).length;

  const selectedEntries = selectedDay ? byDay.get(selectedDay) ?? [] : [];
  const freeTimes = selectedDay ? freeWindows(selectedEntries.map((entry) => entry.range)) : [];

  return (
    <section className="admin-panel mt-8 rounded-2xl border border-[#e3d8c9] bg-[#fffdf8] p-4 shadow-[0_14px_40px_rgba(98,67,36,.035)] sm:p-6" data-testid="section-occupancy">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#eee6d9] pb-4">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#9a5b47]">Hall occupancy</p>
          <h2 className="mt-2 flex items-center gap-2 font-serif text-2xl font-semibold text-[#263b31]"><CalendarDays size={22} className="text-[#9a5b47]" /> Booking calendar</h2>
          <p className="mt-1 text-sm text-[#7a776e]">The date and the From – Till time come from the saved estimates. Tick “Booked” on a bill to confirm it here.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setView({ year: now.getFullYear(), month: now.getMonth() })} className="admin-secondary" data-testid="button-calendar-today">Today</button>
          <button type="button" onClick={() => setView(month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 })} className="icon-button" aria-label="Previous month" data-testid="button-calendar-prev"><ChevronLeft size={18} /></button>
          <strong className="min-w-[140px] text-center font-serif text-lg text-[#263b31]" data-testid="text-calendar-month">{new Date(year, month, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</strong>
          <button type="button" onClick={() => setView(month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 })} className="icon-button" aria-label="Next month" data-testid="button-calendar-next"><ChevronRight size={18} /></button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#5f655e]">
        <span className="flex items-center gap-2"><i className="inline-block h-3 w-5 rounded-sm bg-[#864936]" /> Booked</span>
        <span className="flex items-center gap-2"><i className="inline-block h-3 w-5 rounded-sm" style={STRIPE} /> Enquiry (saved, not booked)</span>
        <span className="flex items-center gap-2"><i className="inline-block h-3 w-5 rounded-sm bg-[#eee6d9]" /> Free</span>
        <span className="text-[#8b887f]">Bar = the day from 12 AM to 12 AM</span>
        <label className="ml-auto flex cursor-pointer items-center gap-2 font-semibold">
          <input type="checkbox" checked={showEnquiries} onChange={(e) => setShowEnquiries(e.target.checked)} className="size-4 accent-[#864936]" data-testid="input-show-enquiries" />
          Show enquiries
        </label>
      </div>
      <p className="mt-2 text-xs font-semibold text-[#5f655e]" data-testid="text-calendar-summary">This month: {bookedDays} booked day{bookedDays === 1 ? '' : 's'}{showEnquiries ? ` · ${enquiryDays} day${enquiryDays === 1 ? '' : 's'} with enquiries only` : ''}</p>

      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold uppercase tracking-[0.1em] text-[#8b887f]">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day} className="py-1">{day}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((iso, index) => {
              if (!iso) return <span key={`blank-${index}`} />;
              const list = byDay.get(iso) ?? [];
              const past = iso < todayISO;
              const hasBooked = list.some((entry) => entry.booked);
              const shown = list.slice(0, 2);
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setSelectedDay(selectedDay === iso ? null : iso)}
                  className={`min-h-[104px] rounded-xl border p-2 text-left align-top transition hover:border-[#864936] ${selectedDay === iso ? 'border-[#864936] ring-2 ring-[#864936]/25' : hasBooked ? 'border-[#d9b8aa]' : 'border-[#e8dfd1]'} ${past ? 'opacity-60' : ''} bg-white`}
                  data-testid={`calendar-day-${iso}`}
                >
                  <span className="flex items-center justify-between">
                    <span className={`text-sm font-bold ${iso === todayISO ? 'grid size-6 place-items-center rounded-full bg-[#263b31] text-white' : 'text-[#263b31]'}`}>{Number(iso.slice(8))}</span>
                    {list.length > 0 && <span className="text-[10px] font-bold text-[#864936]">{list.length}</span>}
                  </span>
                  <span className="mt-1.5 block" data-testid={`calendar-bar-${iso}`}><DayBar list={list} /></span>
                  {shown.map((entry) => (
                    <span key={`${entry.quote.reference}-${entry.range.start}`} className={`mt-1 block truncate text-[10px] font-semibold leading-tight ${entry.booked ? 'text-[#864936]' : 'text-[#8a6a1f]'}`} data-testid={`calendar-time-${iso}-${entry.quote.reference}`}>
                      {entry.timeKnown ? `${formatTimeShort(entry.range.start)}–${formatTimeShort(entry.range.end)}` : 'Time not set'} · {entry.quote.customer.name}
                    </span>
                  ))}
                  {list.length > shown.length && <span className="mt-1 block text-[10px] font-semibold text-[#8b887f]">+{list.length - shown.length} more</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {selectedDay && (
        <div className="mt-4 rounded-xl border border-[#d8cbb9] bg-[#f8f2e7] p-4" data-testid="panel-calendar-day">
          <h3 className="font-serif text-lg font-semibold text-[#263b31]">{formatEventDates([selectedDay])}</h3>
          {selectedEntries.length === 0 ? (
            <p className="mt-2 text-sm text-[#5f655e]">Nothing on this date. The whole day is free.</p>
          ) : (
            <>
              <div className="mt-3 divide-y divide-[#e5dac8]">
                {selectedEntries.map((entry) => (
                  <div key={entry.quote.reference} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                    <div>
                      <strong className="text-[#2e4437]">{entry.quote.customer.name}</strong>
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] ${entry.booked ? 'bg-[#864936] text-white' : 'bg-[#f3dfaa] text-[#6a4b12]'}`}>{entry.booked ? 'Booked' : 'Enquiry'}</span>
                      <span className="mt-0.5 block text-xs text-[#5f655e]"><strong className="text-[#864936]">{entry.timeKnown ? timeText(entry.range) : 'Time not set on this bill (whole day held)'}</strong> · {entry.quote.customer.eventType} · Bill {entry.quote.reference}</span>
                    </div>
                    <button type="button" onClick={() => onOpenQuote(entry.quote.reference)} className="admin-secondary" data-testid={`button-calendar-open-${entry.quote.reference}`}>Open bill</button>
                  </div>
                ))}
              </div>
              <div className="mt-3"><DayBar list={selectedEntries} tall /><span className="mt-1 flex justify-between text-[10px] text-[#8b887f]"><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>12 AM</span></span></div>
              <p className="mt-2 text-xs font-semibold text-[#5f655e]" data-testid="text-calendar-free">Free times: {freeTimes.length ? freeTimes.map((range) => timeText(range)).join(', ') : 'none, the day is full'}</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
