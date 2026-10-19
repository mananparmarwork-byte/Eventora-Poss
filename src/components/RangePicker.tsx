import { CalendarRange } from 'lucide-react';
import { Select } from './ui';
import { PRESETS, resolveRange, type Gran, type Preset, type RangeState } from '@/lib/range';
import { cn, todayISO } from '@/lib/format';

const GRANS: { id: Gran; label: string }[] = [{ id: 'auto', label: 'Auto' }, { id: 'day', label: 'Daily' }, { id: 'week', label: 'Weekly' }, { id: 'month', label: 'Monthly' }];

const dateBox = 'h-10 w-[9.5rem] rounded-xl border border-border bg-input px-3 text-sm text-text hover:border-steel-blue/70 focus:border-gold focus:outline-none';

/** Choose the period (today, last 30 days, a month, your own dates...) and, optionally, how it is grouped (daily / weekly / monthly). */
export function RangePicker({ value, onChange, earliest, grouping = true, className }: { value: RangeState; onChange: (v: RangeState) => void; earliest?: string; grouping?: boolean; className?: string }) {
  const r = resolveRange(value, earliest);
  const set = (patch: Partial<RangeState>) => onChange({ ...value, ...patch });
  const onPreset = (preset: Preset) => (preset === 'custom' ? set({ preset, from: value.from || r.from, to: value.to || r.to }) : set({ preset }));
  return (
    <div className={cn('flex flex-wrap items-center gap-2.5', className)}>
      <div className="relative">
        <CalendarRange size={15} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-gold" />
        <Select value={value.preset} onChange={(e) => onPreset(e.target.value as Preset)} className="h-10 w-48 pl-9" aria-label="Report period">
          {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </Select>
      </div>
      {value.preset === 'custom' && (
        <>
          <input type="date" aria-label="From date" className={dateBox} value={value.from || r.from} max={value.to || todayISO()} onChange={(e) => set({ from: e.target.value })} />
          <span className="text-xs text-text-disabled">to</span>
          <input type="date" aria-label="To date" className={dateBox} value={value.to || r.to} min={value.from || undefined} onChange={(e) => set({ to: e.target.value })} />
        </>
      )}
      {grouping && (
        <Select value={value.gran} onChange={(e) => set({ gran: e.target.value as Gran })} className="h-10 w-32" aria-label="Group by">
          {GRANS.map((g) => <option key={g.id} value={g.id}>{g.id === 'auto' ? `By ${r.gran}` : g.label}</option>)}
        </Select>
      )}
      <span className="text-xs text-text-secondary">{r.label}</span>
    </div>
  );
}
