import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { isoOf, todayISO, cn } from '@/lib/format';

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function monthCells(year: number, month0: number) {
  const first = new Date(year, month0, 1).getDay();
  const days = new Date(year, month0 + 1, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: first }, () => null);
  for (let d = 1; d <= days; d++) cells.push(isoOf(year, month0, d));
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function MonthNav({ year, month0, onChange, label }: { year: number; month0: number; onChange: (y: number, m: number) => void; label?: ReactNode }) {
  const title = new Date(year, month0, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const go = (delta: number) => { const d = new Date(year, month0 + delta, 1); onChange(d.getFullYear(), d.getMonth()); };
  return (
    <div className="flex items-center justify-between gap-3">
      <button type="button" onClick={() => go(-1)} aria-label="Previous month" className="grid size-9 place-items-center rounded-xl border border-border text-text-secondary hover:bg-surface-hover hover:text-text"><ChevronLeft size={16} /></button>
      <div className="text-center"><p className="font-display text-lg font-semibold text-text">{title}</p>{label}</div>
      <button type="button" onClick={() => go(1)} aria-label="Next month" className="grid size-9 place-items-center rounded-xl border border-border text-text-secondary hover:bg-surface-hover hover:text-text"><ChevronRight size={16} /></button>
    </div>
  );
}

/** Generic month grid; the caller decides what each day looks like. */
export function MonthGrid({ renderDay, initial }: { renderDay: (iso: string, today: boolean) => ReactNode; initial?: string }) {
  const start = initial ? new Date(`${initial}T00:00:00`) : new Date();
  const [view, setView] = useState({ y: start.getFullYear(), m: start.getMonth() });
  const today = todayISO();
  return (
    <div>
      <MonthNav year={view.y} month0={view.m} onChange={(y, m) => setView({ y, m })} />
      <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-text-disabled">
        {WEEKDAYS.map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1.5">
        {monthCells(view.y, view.m).map((iso, i) => (iso ? <div key={iso} className={cn(iso === today && 'rounded-xl')}>{renderDay(iso, iso === today)}</div> : <div key={`e${i}`} />))}
      </div>
    </div>
  );
}
