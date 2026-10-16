import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Clock3 } from 'lucide-react';
import { formatTime, toMinutes } from '@/lib/booking';

// Round (analog) clock time picker. The field shows the chosen time; tapping it opens a clock face:
// first tap/drag the hour, then the minutes, choose AM / PM and press OK.
// Value is 24-hour "HH:MM" text, the same format the booking system already saves.

const CENTER = 120;
const NUMBER_RADIUS = 92;
const HAND_RADIUS = 80;
const pad = (n: number) => String(n).padStart(2, '0');

function polar(angleDeg: number, radius: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) };
}

type Props = {
  value: string;
  onChange: (time: string) => void;
  ariaLabel: string;
  testId?: string;
  invalid?: boolean;
  /** Shown on the clock the first time, when no time has been chosen yet (24-hour "HH:MM"). */
  defaultValue?: string;
  /** For "Till" fields: choosing 12:00 AM means midnight at the END of the day (24:00), not the start. */
  endOfDay?: boolean;
  title?: string;
};

export function ClockTimePicker({ value, onChange, ariaLabel, testId, invalid, defaultValue = '18:00', endOfDay = false, title = 'Select time' }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'hour' | 'minute'>('hour');
  const [hour12, setHour12] = useState(6);
  const [minute, setMinute] = useState(0);
  const [pm, setPm] = useState(true);
  const faceRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const openPicker = () => {
    const total = toMinutes(value) ?? toMinutes(defaultValue) ?? 18 * 60;
    const h24 = Math.floor(total / 60) % 24;
    setHour12(h24 % 12 === 0 ? 12 : h24 % 12);
    setMinute(total % 60);
    setPm(h24 >= 12);
    setMode('hour');
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [open]);

  const pick = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = faceRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const angle = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    if (mode === 'hour') {
      const h = Math.round(angle / 30) % 12;
      setHour12(h === 0 ? 12 : h);
    } else {
      setMinute(Math.round(angle / 6) % 60);
    }
  };

  const onDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    pick(event);
  };
  const onMove = (event: ReactPointerEvent<SVGSVGElement>) => { if (dragging.current) pick(event); };
  const onUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    pick(event);
    if (mode === 'hour') setMode('minute');
  };

  const confirm = () => {
    const h24 = (hour12 % 12) + (pm ? 12 : 0);
    let result = `${pad(h24)}:${pad(minute)}`;
    if (endOfDay && h24 === 0 && minute === 0) result = '24:00';
    onChange(result);
    setOpen(false);
  };

  const handAngle = mode === 'hour' ? (hour12 % 12) * 30 : minute * 6;
  const hand = polar(handAngle, HAND_RADIUS);
  const minuteOnLabel = minute % 5 === 0;
  const label = formatTime(value);

  const dialog = open && (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1c2a22]/55 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }} data-testid={testId ? `${testId}-dialog` : undefined}>
      <div role="dialog" aria-modal="true" aria-label={ariaLabel} className="w-full max-w-[320px] rounded-3xl bg-[#fffdf8] p-5 shadow-[0_24px_70px_rgba(38,59,49,0.35)]">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#8b887f]">{title}</p>
        <div className="mt-2 flex items-center justify-center gap-3">
          <div className="flex items-center font-mono text-5xl font-bold leading-none">
            <button type="button" onClick={() => setMode('hour')} className={`rounded-xl px-2.5 py-2 transition ${mode === 'hour' ? 'bg-[#864936] text-white' : 'bg-[#f6efe4] text-[#263b31]'}`} aria-label="Choose hour" data-testid="clock-hour">{pad(hour12)}</button>
            <span className="px-1 text-[#263b31]">:</span>
            <button type="button" onClick={() => setMode('minute')} className={`rounded-xl px-2.5 py-2 transition ${mode === 'minute' ? 'bg-[#864936] text-white' : 'bg-[#f6efe4] text-[#263b31]'}`} aria-label="Choose minutes" data-testid="clock-minute">{pad(minute)}</button>
          </div>
          <div className="flex flex-col overflow-hidden rounded-xl border border-[#e0d3c1] text-sm font-bold">
            <button type="button" onClick={() => setPm(false)} aria-pressed={!pm} className={`px-3 py-2 ${!pm ? 'bg-[#864936] text-white' : 'text-[#5f655e]'}`} data-testid="clock-am">AM</button>
            <button type="button" onClick={() => setPm(true)} aria-pressed={pm} className={`px-3 py-2 ${pm ? 'bg-[#864936] text-white' : 'text-[#5f655e]'}`} data-testid="clock-pm">PM</button>
          </div>
        </div>

        <svg ref={faceRef} viewBox="0 0 240 240" className="mx-auto mt-4 aspect-square w-full max-w-[250px] touch-none select-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { dragging.current = false; }} role="img" aria-label={`Clock face, choose the ${mode}`} data-testid="clock-face">
          <circle cx={CENTER} cy={CENTER} r="118" fill="#f6efe4" stroke="#e0d3c1" strokeWidth="2" />
          <line x1={CENTER} y1={CENTER} x2={hand.x} y2={hand.y} stroke="#864936" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx={CENTER} cy={CENTER} r="4.5" fill="#864936" />
          <circle cx={hand.x} cy={hand.y} r="19" fill="#864936" />
          {mode === 'minute' && !minuteOnLabel && <circle cx={hand.x} cy={hand.y} r="3" fill="#fffdf8" />}
          {Array.from({ length: 12 }, (_, i) => {
            const num = mode === 'hour' ? (i === 0 ? 12 : i) : i * 5;
            const selected = mode === 'hour' ? num === hour12 : minuteOnLabel && num === minute;
            const point = polar(i * 30, NUMBER_RADIUS);
            return (
              <text key={i} x={point.x} y={point.y} textAnchor="middle" dominantBaseline="central" className="pointer-events-none" fontSize="15" fontWeight="600" fill={selected ? '#ffffff' : '#263b31'}>
                {mode === 'hour' ? num : pad(num)}
              </text>
            );
          })}
        </svg>
        <p className="mt-1 text-center text-[11px] text-[#8b887f]">{mode === 'hour' ? 'Tap or drag to choose the hour' : 'Tap or drag to choose the minutes'}</p>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2 text-sm font-bold text-[#864936] hover:bg-[#f6efe4]" data-testid="clock-cancel">Cancel</button>
          <button type="button" onClick={confirm} className="rounded-xl bg-[#864936] px-5 py-2 text-sm font-bold text-white" data-testid="clock-ok">OK</button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button type="button" onClick={openPicker} aria-label={ariaLabel} aria-haspopup="dialog" className={`field-control flex h-11 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-sm font-semibold ${invalid ? 'border-[#d9958a]' : ''}`} data-testid={testId}>
        <span className={label ? 'text-[#263b31]' : 'font-normal text-[#9b988f]'}>{label || 'Select time'}</span>
        <Clock3 size={16} className="shrink-0 text-[#9a5b47]" />
      </button>
      {dialog && createPortal(dialog, document.body)}
    </>
  );
}
