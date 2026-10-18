import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, X } from 'lucide-react';
import { cx, Button } from './ui';
import { durationText, formatTimeShort, isFullDayBooked, rangesOverlap, rangesText, timeText } from '@/lib/booking';
import { fmtDate, isoToday, localISO } from '@/lib/format';
import type { EventSlots, TimeRange } from '@/lib/types';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const pad = (n: number) => String(n).padStart(2, '0');

export function DateTimePicker({ dates, slots, booked, error, onChange, allowPast = [] }: {
  dates: string[]; slots: EventSlots; booked: Record<string, TimeRange[]>; error?: string; allowPast?: string[];
  onChange: (dates: string[], slots: EventSlots) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => { const d = dates[0] ? new Date(`${dates[0]}T00:00:00`) : new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const today = isoToday();
  const year = view.getFullYear(); const month = view.getMonth();
  const cells = useMemo(() => {
    const first = new Date(year, month, 1).getDay(); const count = new Date(year, month + 1, 0).getDate();
    return [...Array.from({ length: first }, () => null), ...Array.from({ length: count }, (_, i) => `${year}-${pad(month + 1)}-${pad(i + 1)}`)];
  }, [year, month]);

  const toggle = (iso: string) => {
    if (dates.includes(iso)) {
      const next = { ...slots }; delete next[iso];
      onChange(dates.filter((d) => d !== iso), next);
    } else onChange([...dates, iso].sort(), { ...slots, [iso]: slots[iso] ?? { start: '', end: '' } });
  };
  const setTime = (iso: string, patch: Partial<TimeRange>) => onChange(dates, { ...slots, [iso]: { start: '', end: '', ...slots[iso], ...patch } });

  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} className={cx('flex h-10 w-full items-center justify-between gap-2 rounded-xl border bg-input px-3.5 text-left text-sm', error ? 'border-error' : 'border-border hover:border-text-disabled')} aria-expanded={open}>
        <span className="flex items-center gap-2 truncate"><CalendarDays size={16} className="text-gold" />{dates.length ? `${dates.length} date${dates.length > 1 ? 's' : ''} selected` : <span className="text-text-disabled">Choose event date(s)</span>}</span>
        <ChevronRight size={16} className={cx('text-text-disabled transition-transform', open && 'rotate-90')} />
      </button>
      {error && <p role="alert" className="mt-1.5 text-xs text-error">{error}</p>}

      {open && (
        <div className="fade-up mt-2 rounded-2xl border border-border bg-surface p-3 shadow-xl sm:max-w-sm">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" aria-label="Previous month" onClick={() => setView(new Date(year, month - 1, 1))} className="grid size-8 place-items-center rounded-lg hover:bg-surface-hover"><ChevronLeft size={16} /></button>
            <span className="text-sm font-semibold">{view.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span>
            <button type="button" aria-label="Next month" onClick={() => setView(new Date(year, month + 1, 1))} className="grid size-8 place-items-center rounded-lg hover:bg-surface-hover"><ChevronRight size={16} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-text-disabled">{WEEKDAYS.map((w, i) => <span key={i}>{w}</span>)}</div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((iso, i) => {
              if (!iso) return <span key={`b${i}`} />;
              const past = iso < today && !allowPast.includes(iso);
              const selected = dates.includes(iso);
              const taken = booked[iso] ?? [];
              const full = isFullDayBooked(taken);
              return (
                <button key={iso} type="button" disabled={past || (full && !selected)} onClick={() => toggle(iso)} aria-pressed={selected}
                  aria-label={`${fmtDate(iso)}${taken.length ? ' (has bookings)' : ''}`}
                  className={cx('relative grid aspect-square place-items-center rounded-lg text-xs transition-colors',
                    selected ? 'bg-gold font-bold text-text-on-gold' : full ? 'bg-error-bg text-error line-through' : 'text-text hover:bg-surface-hover',
                    past && 'cursor-not-allowed opacity-30', iso === today && !selected && 'ring-1 ring-gold/60')}>
                  {Number(iso.slice(8))}
                  {taken.length > 0 && !full && !selected && <i className="absolute bottom-1 size-1 rounded-full bg-warning" />}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-text-disabled">
            <span className="flex items-center gap-3"><span className="flex items-center gap-1"><i className="size-1.5 rounded-full bg-warning" />part booked</span><span className="flex items-center gap-1"><i className="size-2 rounded bg-error-bg ring-1 ring-error/50" />full</span></span>
            <span className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => onChange([], {})}>Clear</Button><Button size="sm" variant="gold" onClick={() => setOpen(false)}>Done</Button></span>
          </div>
        </div>
      )}

      {dates.length > 0 && (
        <ul className="mt-3 space-y-2">
          {dates.map((d) => {
            const r = slots[d] ?? { start: '', end: '' };
            const taken = booked[d] ?? [];
            const clash = taken.filter((t) => rangesOverlap(r, t));
            return (
              <li key={d} className="rounded-xl border border-border bg-input/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{fmtDate(d, true)}</span>
                  <button type="button" onClick={() => toggle(d)} aria-label={`Remove ${fmtDate(d)}`} className="rounded-md p-1 text-text-disabled hover:bg-surface-hover hover:text-text"><X size={14} /></button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="block"><span className="mb-1 flex items-center gap-1 text-[11px] text-text-secondary"><Clock size={11} />From</span>
                    <input type="time" value={r.start} onChange={(e) => setTime(d, { start: e.target.value })} className="h-9 w-full rounded-lg border border-border bg-input px-2.5 text-sm focus:border-gold focus:outline-none" /></label>
                  <label className="block"><span className="mb-1 flex items-center gap-1 text-[11px] text-text-secondary"><Clock size={11} />Till</span>
                    <input type="time" value={r.end} onChange={(e) => setTime(d, { end: e.target.value })} className="h-9 w-full rounded-lg border border-border bg-input px-2.5 text-sm focus:border-gold focus:outline-none" /></label>
                </div>
                <p className={cx('mt-2 text-[11px]', clash.length ? 'text-error' : 'text-text-disabled')}>
                  {clash.length ? `Clashes with an existing booking: ${rangesText(clash, true)}`
                    : timeText(r) ? `${timeText(r)} · ${durationText(r) || 'check end time'}`
                    : taken.length ? `Already booked: ${taken.map((t) => `${formatTimeShort(t.start)}–${formatTimeShort(t.end)}`).join(', ')}` : 'Set the start and end time'}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
