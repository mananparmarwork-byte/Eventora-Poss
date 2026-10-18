import type { EventSlots, TimeRange } from './types';

const DAY_END = 24 * 60;

export function toMinutes(time: string | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((time ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59 || h > 24 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

export function fromMinutes(total: number): string {
  const c = Math.max(0, Math.min(DAY_END, Math.round(total)));
  return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`;
}

export function formatTime(time: string | undefined): string {
  const total = toMinutes(time);
  if (total === null) return '';
  const h24 = Math.floor(total / 60) % 24;
  const m = total % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}
export const formatTimeShort = (time: string | undefined) => formatTime(time).replace(':00 ', ' ');

// Older bills used fixed slots (morning / evening...). They are converted to a range so nothing is lost.
const LEGACY: Record<string, TimeRange> = {
  morning: { start: '08:00', end: '14:00' },
  afternoon: { start: '08:00', end: '23:00' },
  evening: { start: '16:00', end: '23:00' },
  night: { start: '16:00', end: '23:00' },
};

export function normalizeRange(value: unknown): TimeRange {
  if (Array.isArray(value)) {
    const ranges = value.map((v) => LEGACY[String(v)]).filter(Boolean);
    if (!ranges.length) return { start: '', end: '' };
    return {
      start: ranges.reduce((a, r) => (r.start < a ? r.start : a), ranges[0].start),
      end: ranges.reduce((a, r) => (r.end > a ? r.end : a), ranges[0].end),
    };
  }
  if (value && typeof value === 'object') {
    const { start, end } = value as Partial<TimeRange>;
    return { start: typeof start === 'string' ? start : '', end: typeof end === 'string' ? end : '' };
  }
  return { start: '', end: '' };
}

export function normalizeEventSlots(raw: unknown): EventSlots {
  if (!raw || typeof raw !== 'object') return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).map(([d, v]) => [d, normalizeRange(v)]));
}

export const isRangeComplete = (r: unknown) => {
  const { start, end } = normalizeRange(r);
  return toMinutes(start) !== null && toMinutes(end) !== null;
};

export const isRangeValid = (r: unknown) => {
  const { start, end } = normalizeRange(r);
  const a = toMinutes(start);
  const b = toMinutes(end);
  return a !== null && b !== null && b > a;
};

export function timeText(range: unknown, short = false): string {
  const { start, end } = normalizeRange(range);
  if (!isRangeComplete({ start, end })) return '';
  if (toMinutes(start) === 0 && toMinutes(end) === DAY_END) return 'Whole day';
  const f = short ? formatTimeShort : formatTime;
  return `${f(start)} – ${f(end)}`;
}

export function durationText(range: unknown): string {
  const { start, end } = normalizeRange(range);
  const a = toMinutes(start);
  const b = toMinutes(end);
  if (a === null || b === null || b <= a) return '';
  const t = b - a;
  return [Math.floor(t / 60) ? `${Math.floor(t / 60)} hr` : '', t % 60 ? `${t % 60} min` : ''].filter(Boolean).join(' ');
}

export const hasAnySlots = (slots: EventSlots | undefined) => Boolean(slots && Object.values(slots).some((r) => isRangeComplete(r)));

export function scheduleLines(dates: string[], slots: EventSlots | undefined) {
  return dates.map((date) => ({ date, text: timeText(slots?.[date]) || 'Time not selected' }));
}

export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  const as = toMinutes(a.start), ae = toMinutes(a.end), bs = toMinutes(b.start), be = toMinutes(b.end);
  if (as === null || ae === null || bs === null || be === null) return false;
  return as < be && bs < ae;
}

export const WHOLE_DAY: TimeRange = { start: '00:00', end: '24:00' };
export type OccupancyEntry = { date: string; range: TimeRange; timeKnown: boolean };

/** Bills without a saved time hold the whole day. */
export function occupancyEntries(dates: string[], slots: EventSlots | undefined): OccupancyEntry[] {
  return dates.map((date) => {
    const range = normalizeRange(slots?.[date]);
    return isRangeValid(range) ? { date, range, timeKnown: true } : { date, range: { ...WHOLE_DAY }, timeKnown: false };
  });
}

export function mergeRanges(ranges: TimeRange[]) {
  const list = ranges
    .map((r) => ({ from: toMinutes(r.start), to: toMinutes(r.end) }))
    .filter((r): r is { from: number; to: number } => r.from !== null && r.to !== null && r.to > r.from)
    .sort((a, b) => a.from - b.from);
  const merged: { from: number; to: number }[] = [];
  list.forEach((r) => {
    const last = merged[merged.length - 1];
    if (last && r.from <= last.to) last.to = Math.max(last.to, r.to);
    else merged.push({ ...r });
  });
  return merged;
}

export function isFullDayBooked(ranges: TimeRange[]) {
  const m = mergeRanges(ranges);
  return m.length === 1 && m[0].from <= 0 && m[0].to >= DAY_END;
}

export function freeWindows(ranges: TimeRange[]): TimeRange[] {
  const free: TimeRange[] = [];
  let cursor = 0;
  mergeRanges(ranges).forEach((r) => {
    if (r.from > cursor) free.push({ start: fromMinutes(cursor), end: fromMinutes(r.from) });
    cursor = Math.max(cursor, r.to);
  });
  if (cursor < DAY_END) free.push({ start: fromMinutes(cursor), end: fromMinutes(DAY_END) });
  return free;
}

export const rangesText = (ranges: TimeRange[], short = false) => ranges.map((r) => timeText(r, short)).filter(Boolean).join(', ');

export type BookingConflict = { reference: string; name: string; date: string; range: TimeRange };

export function findConflicts(
  candidate: { reference: string; dates: string[]; slots: EventSlots | undefined },
  booked: { reference: string; name: string; dates: string[]; slots: EventSlots | undefined }[],
): BookingConflict[] {
  const wanted = occupancyEntries(candidate.dates, candidate.slots);
  const out: BookingConflict[] = [];
  booked.forEach((other) => {
    if (other.reference === candidate.reference) return;
    occupancyEntries(other.dates, other.slots).forEach((entry) => {
      const mine = wanted.find((w) => w.date === entry.date);
      if (mine && rangesOverlap(mine.range, entry.range)) out.push({ reference: other.reference, name: other.name, date: entry.date, range: entry.range });
    });
  });
  return out;
}
