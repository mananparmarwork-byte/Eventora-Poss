export const inr = (amount: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0);

export const inrPrecise = (amount: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);

export const num = (amount: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0);

/** 480000 -> "₹4.8L", 12500000 -> "₹1.25Cr", 8500 -> "₹8,500" */
export function inrCompact(amount: number): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const trim = (n: number) => String(Number(n.toFixed(2)));
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`;
  return `${sign}${inr(abs)}`;
}

export const pad2 = (n: number) => String(n).padStart(2, '0');
export const isoOf = (y: number, m0: number, d: number) => `${y}-${pad2(m0 + 1)}-${pad2(d)}`;
export const localISODate = (d: Date) => isoOf(d.getFullYear(), d.getMonth(), d.getDate());
export const todayISO = () => localISODate(new Date());

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', opts);
}

export function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Several event dates are kept in one text value: "YYYY-MM-DD,YYYY-MM-DD". */
export function parseEventDates(value: string): string[] {
  return Array.from(new Set((value || '').split(',').map((d) => d.trim()).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))).sort();
}

export function formatEventDates(dates: string[]): string {
  if (!dates.length) return 'Not selected';
  if (dates.length === 1) return fmtDate(dates[0]);
  const groups = new Map<string, string[]>();
  dates.forEach((d) => groups.set(d.slice(0, 7), [...(groups.get(d.slice(0, 7)) ?? []), d]));
  return Array.from(groups.values())
    .map((g) => `${g.map((d) => d.slice(8)).join(', ')} ${fmtDate(g[0], { month: 'short', year: 'numeric' })}`)
    .join(' · ');
}

export const monthKey = (iso: string) => iso.slice(0, 7);
export const monthLabel = (key: string) => fmtDate(`${key}-01`, { month: 'long', year: 'numeric' });

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function below100(n: number) { return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`; }
function below1000(n: number) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? below100(r) : ''].filter(Boolean).join(' ');
}

/** 125000 -> "Rupees One Lakh Twenty Five Thousand Only" (Indian numbering) */
export function amountInWords(amount: number): string {
  let n = Math.round(Math.abs(Number.isFinite(amount) ? amount : 0));
  if (n === 0) return 'Rupees Zero Only';
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(`${below1000(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (n) parts.push(below1000(n));
  return `Rupees ${parts.join(' ')} Only`;
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');
export const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const makeId = (prefix: string, name: string) => `${prefix}-${slug(name) || 'item'}-${Math.random().toString(36).slice(2, 6)}`;
