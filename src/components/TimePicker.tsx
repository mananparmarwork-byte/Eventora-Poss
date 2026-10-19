import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Clock } from 'lucide-react';
import { Button } from './ui';
import { formatTime, toMinutes } from '@/lib/booking';
import { cn } from '@/lib/format';

/**
 * A round analogue clock for choosing a time. It is drawn the same way on phones and laptops:
 * tap or drag on the dial to pick the hour, then the minutes, choose AM/PM, press OK.
 * Value is 24-hour "HH:MM" text (same as before), "" when nothing is chosen.
 */

const SIZE = 264;          // dial diameter in px (fixed so it looks identical everywhere)
const C = SIZE / 2;
const R_NUM = 100;         // radius of the number ring
const R_HAND = 100;
const pad = (n: number) => String(n).padStart(2, '0');

function polar(deg: number, r: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
}

type Mode = 'hour' | 'minute';

function Dial({ mode, hour12, minute, onPick, onDone }: { mode: Mode; hour12: number; minute: number; onPick: (v: number) => void; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const valueAt = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return null;
    const dx = e.clientX - (box.left + box.width / 2);
    const dy = e.clientY - (box.top + box.height / 2);
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    if (deg < 0) deg += 360;
    if (mode === 'hour') { const h = Math.round(deg / 30) % 12; return h === 0 ? 12 : h; }
    return Math.round(deg / 6) % 60;
  }, [mode]);

  const down = (e: PointerEvent<HTMLDivElement>) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); const v = valueAt(e); if (v !== null) onPick(v); };
  const move = (e: PointerEvent<HTMLDivElement>) => { if (!dragging.current) return; const v = valueAt(e); if (v !== null) onPick(v); };
  const up = () => { if (!dragging.current) return; dragging.current = false; onDone(); };

  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    if (mode === 'hour') onPick(((hour12 - 1 + step + 12) % 12) + 1);
    else onPick((minute + step + 60) % 60);
  };

  const deg = mode === 'hour' ? (hour12 % 12) * 30 : minute * 6;
  const tip = polar(deg, R_HAND);
  const labels = mode === 'hour' ? Array.from({ length: 12 }, (_, i) => i + 1) : Array.from({ length: 12 }, (_, i) => i * 5);
  const selectedLabel = mode === 'hour' ? hour12 : minute;
  const offLabel = mode === 'minute' && minute % 5 !== 0; // the hand is between two numbers: show a small dot at its tip

  return (
    <div
      ref={ref} role="slider" tabIndex={0} aria-label={mode === 'hour' ? 'Hour' : 'Minute'}
      aria-valuemin={mode === 'hour' ? 1 : 0} aria-valuemax={mode === 'hour' ? 12 : 59} aria-valuenow={mode === 'hour' ? hour12 : minute}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}
      className="relative mx-auto select-none rounded-full bg-input outline-none ring-1 ring-border focus-visible:ring-2 focus-visible:ring-gold"
      style={{ width: SIZE, height: SIZE, touchAction: 'none', cursor: 'pointer' }}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="pointer-events-none absolute inset-0" aria-hidden="true">
        {mode === 'minute' && Array.from({ length: 60 }, (_, i) => { const a = polar(i * 6, 119), b = polar(i * 6, i % 5 === 0 ? 112 : 115); return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#33415A" strokeWidth={i % 5 === 0 ? 1.5 : 1} />; })}
        <line x1={C} y1={C} x2={tip.x} y2={tip.y} stroke="#E6B84A" strokeWidth="2" strokeLinecap="round" />
        <circle cx={C} cy={C} r="4" fill="#E6B84A" />
        <circle cx={tip.x} cy={tip.y} r="21" fill="#E6B84A" />
        {offLabel && <circle cx={tip.x} cy={tip.y} r="3" fill="#080B12" />}
      </svg>
      {labels.map((n) => {
        const p = polar((mode === 'hour' ? n % 12 : n) * (mode === 'hour' ? 30 : 6), R_NUM);
        const on = n === selectedLabel && !offLabel;
        return (
          <span key={n} className={cn('pointer-events-none absolute grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center text-[15px] font-medium tabular', on ? 'text-text-on-gold' : 'text-text')} style={{ left: p.x, top: p.y }}>
            {mode === 'minute' ? pad(n) : n}
          </span>
        );
      })}
    </div>
  );
}

function ClockDialog({ value, fallback, title, onCancel, onOk }: { value: string; fallback: string; title: string; onCancel: () => void; onOk: (v: string) => void }) {
  const start = toMinutes(value) ?? toMinutes(fallback) ?? 18 * 60;
  const [h24, setH24] = useState(Math.floor(start / 60) % 24);
  const [minute, setMinute] = useState(start % 60);
  const [mode, setMode] = useState<Mode>('hour');
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const pm = h24 >= 12;

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onCancel(); if (e.key === 'Enter') onOk(`${pad(h24)}:${pad(minute)}`); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onCancel, onOk, h24, minute]);

  const setHour12 = (h: number) => setH24((pm ? 12 : 0) + (h % 12));
  const setAmPm = (toPm: boolean) => setH24((cur) => (cur % 12) + (toPm ? 12 : 0));

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-obsidian/75 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className="fade-up w-[320px] max-w-full rounded-3xl border border-border bg-surface p-5 shadow-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">{title}</p>
        <div className="mt-3 flex items-center justify-center gap-3">
          <div className="flex items-center gap-1 font-display text-5xl font-semibold tabular">
            <button type="button" onClick={() => setMode('hour')} className={cn('rounded-xl px-2 py-1 transition-colors', mode === 'hour' ? 'bg-gold/15 text-gold' : 'text-text-secondary hover:text-text')} aria-label="Choose hour">{pad(hour12)}</button>
            <span className="text-text-disabled">:</span>
            <button type="button" onClick={() => setMode('minute')} className={cn('rounded-xl px-2 py-1 transition-colors', mode === 'minute' ? 'bg-gold/15 text-gold' : 'text-text-secondary hover:text-text')} aria-label="Choose minutes">{pad(minute)}</button>
          </div>
          <div className="flex flex-col overflow-hidden rounded-xl border border-border text-sm font-semibold">
            {([['AM', false], ['PM', true]] as const).map(([label, isPm]) => (
              <button key={label} type="button" onClick={() => setAmPm(isPm)} className={cn('px-3 py-2 transition-colors', pm === isPm ? 'bg-gold text-text-on-gold' : 'text-text-secondary hover:bg-surface-hover')} aria-pressed={pm === isPm}>{label}</button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <Dial mode={mode} hour12={hour12} minute={minute} onPick={(v) => (mode === 'hour' ? setHour12(v) : setMinute(v))} onDone={() => { if (mode === 'hour') setMode('minute'); }} />
        </div>
        <p className="mt-3 text-center text-[11px] text-text-disabled">{mode === 'hour' ? 'Tap the hour on the clock' : 'Now tap the minutes'}</p>
        <div className="mt-4 flex justify-end gap-2.5">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="gold" onClick={() => onOk(`${pad(h24)}:${pad(minute)}`)}>OK</Button>
        </div>
      </div>
    </div>
  );
}

export function TimePicker({ value, onChange, label, fallback = '18:00', invalid }: { value: string; onChange: (v: string) => void; label: string; fallback?: string; invalid?: boolean }) {
  const [open, setOpen] = useState(false);
  const text = formatTime(value);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`${label}: ${text || 'not set'}`}
        className={cn('flex h-10 w-full items-center justify-between gap-2 rounded-xl border bg-input px-3.5 text-left text-sm transition-colors hover:border-steel-blue/70', invalid ? 'border-error' : 'border-border')}>
        <span className={text ? 'font-medium text-text' : 'text-text-disabled'}>{text || 'Set time'}</span>
        <Clock size={16} className="shrink-0 text-gold" />
      </button>
      {open && <ClockDialog value={value} fallback={fallback} title={label} onCancel={() => setOpen(false)} onOk={(v) => { onChange(v); setOpen(false); }} />}
    </>
  );
}
