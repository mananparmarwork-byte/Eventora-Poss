// Booking times for hall bookings, shared by the estimator and the admin panel.
// Instead of fixed slots (Morning / Evening) the customer picks a start time and an end time for every date.
// Times are stored as 24-hour "HH:MM" text, e.g. { start: '18:00', end: '23:30' }.
export type TimeRange = { start: string; end: string };
// Kept under the old name because it is the field name saved with every bill (pricing.eventSlots).
// An incomplete range ({ start: '', end: '' }) means "time not chosen yet".
export type EventSlots = Record<string, TimeRange | undefined>;

const DAY_END = 24 * 60;

export function toMinutes(time: string | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec((time ?? '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes > 59 || hours > 24 || (hours === 24 && minutes > 0)) return null;
  return hours * 60 + minutes;
}

export function fromMinutes(total: number): string {
  const clamped = Math.max(0, Math.min(DAY_END, Math.round(total)));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

// "18:30" -> "6:30 PM"
export function formatTime(time: string | undefined): string {
  const total = toMinutes(time);
  if (total === null) return '';
  const hours24 = Math.floor(total / 60) % 24;
  const minutes = total % 60;
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${hours24 < 12 ? 'AM' : 'PM'}`;
}

// "18:00" -> "6 PM", "18:30" -> "6:30 PM" (short form used inside the small calendar boxes)
export function formatTimeShort(time: string | undefined): string {
  return formatTime(time).replace(':00 ', ' ');
}

// Bills saved with the old fixed slots (morning / afternoon / evening / night) are converted to a time range.
// "afternoon" overlapped both current slots, so it blocks 8 AM - 11 PM (safe against double booking).
const LEGACY_RANGES: Record<string, TimeRange> = {
  morning: { start: '08:00', end: '14:00' },
  afternoon: { start: '08:00', end: '23:00' },
  evening: { start: '16:00', end: '23:00' },
  night: { start: '16:00', end: '23:00' },
};

// Accepts a saved value in any format (new range, old list of slots, nothing) and returns a range.
export function normalizeRange(value: unknown): TimeRange {
  if (Array.isArray(value)) {
    const ranges = value.map((item) => LEGACY_RANGES[String(item)]).filter(Boolean);
    if (!ranges.length) return { start: '', end: '' };
    return {
      start: ranges.reduce((min, range) => (range.start < min ? range.start : min), ranges[0].start),
      end: ranges.reduce((max, range) => (range.end > max ? range.end : max), ranges[0].end),
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
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).map(([date, value]) => [date, normalizeRange(value)]));
}

export function isRangeComplete(range: unknown): boolean {
  const { start, end } = normalizeRange(range);
  return toMinutes(start) !== null && toMinutes(end) !== null;
}

// A usable booking has both times and ends after it starts.
export function isRangeValid(range: unknown): boolean {
  const { start, end } = normalizeRange(range);
  const from = toMinutes(start);
  const to = toMinutes(end);
  return from !== null && to !== null && to > from;
}

// "6:00 PM – 11:30 PM", or '' when the time has not been chosen.
export function timeText(range: unknown, short = false): string {
  const { start, end } = normalizeRange(range);
  if (!isRangeComplete({ start, end })) return '';
  if (toMinutes(start) === 0 && toMinutes(end) === DAY_END) return 'Whole day';
  const format = short ? formatTimeShort : formatTime;
  return `${format(start)} – ${format(end)}`;
}

// "5 hr 30 min"
export function durationText(range: unknown): string {
  const { start, end } = normalizeRange(range);
  const from = toMinutes(start);
  const to = toMinutes(end);
  if (from === null || to === null || to <= from) return '';
  const total = to - from;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return [hours ? `${hours} hr` : '', minutes ? `${minutes} min` : ''].filter(Boolean).join(' ');
}

export type ScheduleLine = { date: string; text: string };

export function scheduleLines(dates: string[], slots: EventSlots | undefined): ScheduleLine[] {
  return dates.map((date) => ({ date, text: timeText(slots?.[date]) || 'Time not selected' }));
}

export function hasAnySlots(slots: EventSlots | undefined): boolean {
  return Boolean(slots && Object.values(slots).some((range) => isRangeComplete(range)));
}

export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  const aStart = toMinutes(a.start);
  const aEnd = toMinutes(a.end);
  const bStart = toMinutes(b.start);
  const bEnd = toMinutes(b.end);
  if (aStart === null || aEnd === null || bStart === null || bEnd === null) return false;
  return aStart < bEnd && bStart < aEnd;
}

// Older saved bills have no time: treat them as holding the whole day, flagged as "time not set".
export const WHOLE_DAY: TimeRange = { start: '00:00', end: '24:00' };
export type OccupancyEntry = { date: string; range: TimeRange; timeKnown: boolean };

export function occupancyEntries(dates: string[], slots: EventSlots | undefined): OccupancyEntry[] {
  return dates.map((date) => {
    const range = normalizeRange(slots?.[date]);
    return isRangeValid(range) ? { date, range, timeKnown: true } : { date, range: { ...WHOLE_DAY }, timeKnown: false };
  });
}

// Joins overlapping or touching ranges: [8-12, 11-14] -> [8-14]. Used to find free gaps and fully booked days.
export function mergeRanges(ranges: TimeRange[]): { from: number; to: number }[] {
  const list = ranges
    .map((range) => ({ from: toMinutes(range.start), to: toMinutes(range.end) }))
    .filter((range): range is { from: number; to: number } => range.from !== null && range.to !== null && range.to > range.from)
    .sort((a, b) => a.from - b.from);
  const merged: { from: number; to: number }[] = [];
  list.forEach((range) => {
    const last = merged[merged.length - 1];
    if (last && range.from <= last.to) last.to = Math.max(last.to, range.to);
    else merged.push({ ...range });
  });
  return merged;
}

export function isFullDayBooked(ranges: TimeRange[]): boolean {
  const merged = mergeRanges(ranges);
  return merged.length === 1 && merged[0].from <= 0 && merged[0].to >= DAY_END;
}

// The gaps of the day that are not booked, e.g. "12:00 AM – 8:00 AM, 2:00 PM – 12:00 AM".
export function freeWindows(ranges: TimeRange[]): TimeRange[] {
  const free: TimeRange[] = [];
  let cursor = 0;
  mergeRanges(ranges).forEach((range) => {
    if (range.from > cursor) free.push({ start: fromMinutes(cursor), end: fromMinutes(range.from) });
    cursor = Math.max(cursor, range.to);
  });
  if (cursor < DAY_END) free.push({ start: fromMinutes(cursor), end: fromMinutes(DAY_END) });
  return free;
}

export function rangesText(ranges: TimeRange[], short = false): string {
  return ranges.map((range) => timeText(range, short)).filter(Boolean).join(', ');
}

export type BookingConflict = { reference: string; name: string; date: string; range: TimeRange };

// Which already-booked bills overlap with the given dates/times?
export function findConflicts(
  candidate: { reference: string; dates: string[]; slots: EventSlots | undefined },
  booked: { reference: string; name: string; dates: string[]; slots: EventSlots | undefined }[],
): BookingConflict[] {
  const wanted = occupancyEntries(candidate.dates, candidate.slots);
  const conflicts: BookingConflict[] = [];
  booked.forEach((other) => {
    if (other.reference === candidate.reference) return;
    occupancyEntries(other.dates, other.slots).forEach((entry) => {
      const mine = wanted.find((item) => item.date === entry.date);
      if (mine && rangesOverlap(mine.range, entry.range)) conflicts.push({ reference: other.reference, name: other.name, date: entry.date, range: entry.range });
    });
  });
  return conflicts;
}

const EVENT_TYPE_LABELS = ['wedding', 'reception', 'engagement', 'birthday', 'anniversary', 'corporate'];
const looseKey = (value: string) => value.toLowerCase().replace(/[^a-z]/g, '').replace(/s/g, '');

/**
 * Subcategory line shown under the category on a printed bill.
 * Hidden when it would only confuse: it names a different event type (e.g. "Engagement"
 * on a Corporate bill) or it just repeats the category ("Packages For Banquet Hall" /
 * "Package For Banquet Hall").
 */
export function printableSubcategory(subcategory: string | undefined | null, eventType: string | undefined | null, category?: string | null) {
  const sub = (subcategory ?? '').trim();
  if (!sub) return '';
  const subKey = sub.toLowerCase();
  if (EVENT_TYPE_LABELS.includes(subKey) && subKey !== (eventType ?? '').trim().toLowerCase()) return '';
  if (category && looseKey(category) === looseKey(sub)) return '';
  return sub;
}
