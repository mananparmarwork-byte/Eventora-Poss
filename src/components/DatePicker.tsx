import { useState } from 'react';
import { CalendarDays, Clock, X } from 'lucide-react';
import { MonthGrid } from './MonthGrid';
import { Button } from './ui';
import { TimePicker } from './TimePicker';
import { cn, fmtDate, parseEventDates, todayISO } from '@/lib/format';
import { durationText, freeWindows, isFullDayBooked, isRangeComplete, isRangeValid, normalizeRange, rangesOverlap, rangesText } from '@/lib/booking';
import type { EventSlots, TimeRange } from '@/lib/types';

type Props = {
  value: string; // "YYYY-MM-DD,YYYY-MM-DD"
  slots: EventSlots;
  booked: Record<string, TimeRange[]>;
  error?: string;
  allowPast?: string[]; // dates that may stay selected even if past (editing an old bill)
  onChange: (value: string) => void;
  onSlotsChange: (slots: EventSlots) => void;
};

export function DatePicker({ value, slots, booked, error, allowPast = [], onChange, onSlotsChange }: Props) {
  const [open, setOpen] = useState(false);
  const dates = parseEventDates(value);
  const today = todayISO();

  const toggle = (iso: string) => {
    const next = dates.includes(iso) ? dates.filter((d) => d !== iso) : [...dates, iso].sort();
    onChange(next.join(','));
  };
  const setRange = (date: string, patch: Partial<TimeRange>) => onSlotsChange({ ...slots, [date]: { ...normalizeRange(slots[date]), ...patch } });

  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className={cn('flex h-11 w-full items-center gap-3 rounded-xl border bg-input px-3.5 text-left text-sm transition-colors', error ? 'border-error' : 'border-border hover:border-steel-blue/70')}>
        <CalendarDays size={16} className="text-gold" />
        <span className={dates.length ? 'text-text' : 'text-text-disabled'}>{dates.length ? `${dates.length} date${dates.length > 1 ? 's' : ''} selected` : 'Choose event date(s)'}</span>
      </button>
      {error && <p role="alert" className="mt-1.5 text-xs text-error">{error}</p>}

      {open && (
        <div className="fade-up mt-3 rounded-2xl border border-border bg-surface p-4">
          <MonthGrid renderDay={(iso) => {
            const taken = booked[iso] ?? [];
            const full = isFullDayBooked(taken);
            const past = iso < today && !allowPast.includes(iso);
            const on = dates.includes(iso);
            return (
              <button type="button" disabled={(full && !on) || past} onClick={() => toggle(iso)} title={full ? 'Fully booked' : taken.length ? `Booked: ${rangesText(taken, true)}` : undefined}
                className={cn('relative grid h-10 w-full place-items-center rounded-lg text-sm transition-colors',
                  on ? 'bg-gold font-semibold text-text-on-gold' : full ? 'bg-error-bg text-error line-through' : past ? 'text-text-disabled/40' : 'text-text hover:bg-surface-hover')}>
                {Number(iso.slice(8))}
                {taken.length > 0 && !full && !on && <span className="absolute bottom-1 size-1 rounded-full bg-warning" />}
              </button>
            );
          }} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3 text-[11px] text-text-secondary">
            <span className="flex flex-wrap items-center gap-3"><span className="flex items-center gap-1"><i className="size-2 rounded-full bg-warning" /> partly booked</span><span className="flex items-center gap-1"><i className="size-2 rounded-full bg-error" /> fully booked</span></span>
            <span className="flex gap-2">{dates.length > 0 && <button type="button" className="text-error hover:underline" onClick={() => onChange('')}>Clear</button>}<Button size="sm" variant="gold" onClick={() => setOpen(false)}>Done</Button></span>
          </div>
        </div>
      )}

      {dates.length > 0 && (
        <div className="mt-3 space-y-3">
          {dates.map((date) => {
            const range = normalizeRange(slots[date]);
            const complete = isRangeComplete(range);
            const valid = isRangeValid(range);
            const taken = booked[date] ?? [];
            const clash = complete && valid && taken.some((t) => rangesOverlap(range, t));
            return (
              <div key={date} className="rounded-xl border border-border bg-input/50 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-text">{fmtDate(date, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</p>
                  <button type="button" onClick={() => toggle(date)} aria-label={`Remove ${fmtDate(date)}`} className="grid size-7 place-items-center rounded-lg text-text-secondary hover:bg-surface-hover hover:text-error"><X size={14} /></button>
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-3">
                  <div><span className="mb-1 flex items-center gap-1 text-[11px] font-medium text-text-secondary"><Clock size={11} /> From</span><TimePicker label={`From · ${fmtDate(date, { day: '2-digit', month: 'short' })}`} value={range.start} fallback="18:00" onChange={(v) => setRange(date, { start: v })} /></div>
                  <div><span className="mb-1 flex items-center gap-1 text-[11px] font-medium text-text-secondary"><Clock size={11} /> Till</span><TimePicker label={`Till · ${fmtDate(date, { day: '2-digit', month: 'short' })}`} value={range.end} fallback={range.start || '23:00'} invalid={complete && !valid} onChange={(v) => setRange(date, { end: v })} /></div>
                </div>
                {complete && !valid && <p className="mt-2 text-xs text-error">End time must be after the start time.</p>}
                {valid && !clash && durationText(range) && <p className="mt-2 text-xs text-text-secondary">Duration: {durationText(range)}</p>}
                {clash && <p className="mt-2 text-xs text-error">Clashes with an existing booking ({rangesText(taken)}). Free: {rangesText(freeWindows(taken), true) || 'none'}.</p>}
                {!clash && taken.length > 0 && <p className="mt-2 text-xs text-warning">Already booked: {rangesText(taken)}. Free: {rangesText(freeWindows(taken), true) || 'none'}.</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
