import { formatEventDates, inr } from './format';
import { timeText } from './booking';
import { quoteDates, quotePaymentState } from './pricing';
import type { ActivityAction, ActivityChange, ActivityDraft, ActivityEntry, Quote, QuotePayment } from './types';

export const ACTION_META: Record<ActivityAction, { label: string; group: 'bills' | 'payments' | 'removed' | 'other'; tone: 'success' | 'gold' | 'error' | 'info' | 'warning' }> = {
  'bill.created': { label: 'Bill created', group: 'bills', tone: 'gold' },
  'bill.updated': { label: 'Bill edited', group: 'bills', tone: 'info' },
  'bill.deleted': { label: 'Bill deleted', group: 'removed', tone: 'error' },
  'bill.booked': { label: 'Marked booked', group: 'bills', tone: 'success' },
  'bill.released': { label: 'Booking released', group: 'removed', tone: 'warning' },
  'payment.received': { label: 'Payment received', group: 'payments', tone: 'success' },
  'payment.removed': { label: 'Payment cancelled', group: 'removed', tone: 'error' },
  'payment.request': { label: 'Payment request sent', group: 'payments', tone: 'info' },
  'settings.changed': { label: 'Settings changed', group: 'other', tone: 'warning' },
};

export type ActivityFilter = 'all' | 'bills' | 'payments' | 'removed';
export const ACTIVITY_FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'bills', label: 'Bills' }, { id: 'payments', label: 'Payments' }, { id: 'removed', label: 'Deleted & cancelled' },
];
export const matchesFilter = (a: ActivityEntry, f: ActivityFilter) => f === 'all' || ACTION_META[a.action].group === f;

const who = (q: Quote) => `${q.customer.name} · ${q.customer.eventType}`;
const snapshot = (q: Quote): ActivityDraft['data'] => ({
  customer: q.customer.name, mobile: q.customer.mobile, eventType: q.customer.eventType, dates: formatEventDates(quoteDates(q.customer)),
  guests: q.customer.guests, total: q.pricing.grandTotal, received: quotePaymentState(q.pricing).received, services: q.services.map((s) => s.name),
});

export function billDeleted(q: Quote): ActivityDraft {
  const received = quotePaymentState(q.pricing).received;
  return { action: 'bill.deleted', reference: q.reference, title: `Bill ${q.reference} deleted`, detail: `${who(q)} · total ${inr(q.pricing.grandTotal)}${received > 0 ? ` · ${inr(received)} had been received` : ''}`, data: snapshot(q) };
}

export function statusChanged(q: Quote, booked: boolean): ActivityDraft {
  return { action: booked ? 'bill.booked' : 'bill.released', reference: q.reference, title: booked ? `Bill ${q.reference} marked as booked` : `Booking released for ${q.reference}`, detail: `${who(q)} · ${formatEventDates(quoteDates(q.customer))}`, data: snapshot(q) };
}

export function paymentReceived(q: Quote, p: QuotePayment, balanceAfter: number): ActivityDraft {
  const ref = p.note ? ` · ref ${p.note}` : '';
  return { action: 'payment.received', reference: q.reference, title: `${inr(p.amount)} received by ${p.method.toUpperCase()}`, detail: `${q.customer.name} · bill ${q.reference} · ${p.kind === 'full' ? 'full payment' : 'advance'}${ref} · balance ${inr(balanceAfter)}`,
    data: { amount: p.amount, method: p.method, kind: p.kind, txn: p.note, paymentId: p.id, balance: balanceAfter, customer: q.customer.name, total: q.pricing.grandTotal } };
}

export function paymentRemoved(q: Quote, p: QuotePayment, balanceAfter: number): ActivityDraft {
  return { action: 'payment.removed', reference: q.reference, title: `${p.method.toUpperCase()} payment of ${inr(p.amount)} cancelled`, detail: `${q.customer.name} · bill ${q.reference} · was received ${new Date(p.paidAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}${p.by ? ` by ${p.by}` : ''} · balance now ${inr(balanceAfter)}`,
    data: { amount: p.amount, method: p.method, kind: p.kind, txn: p.note, paymentId: p.id, balance: balanceAfter, customer: q.customer.name, total: q.pricing.grandTotal } };
}

export function paymentRequest(q: Quote, amount: number): ActivityDraft {
  return { action: 'payment.request', reference: q.reference, title: `UPI payment request for ${inr(amount)} sent`, detail: `${q.customer.name} · bill ${q.reference} (WhatsApp, UPI QR)`, data: { amount, method: 'upi', customer: q.customer.name } };
}

const yn = (v: boolean | undefined) => (v ? 'Yes' : 'No');
const svcKey = (s: Quote['services'][number]) => s.id;

/** Field-by-field comparison of a bill before and after an edit. */
export function diffBills(a: Quote, b: Quote): ActivityChange[] {
  const out: ActivityChange[] = [];
  const same = (label: string, x: string | number, y: string | number, money = false) => {
    if (String(x) !== String(y)) out.push({ label, from: money ? inr(Number(x)) : String(x), to: money ? inr(Number(y)) : String(y) });
  };
  same('Customer name', a.customer.name, b.customer.name);
  same('Mobile', a.customer.mobile, b.customer.mobile);
  same('Event type', a.customer.eventType, b.customer.eventType);
  same('Guests', a.customer.guests, b.customer.guests);
  same('Customer GSTIN', a.customer.gstNumber ?? '', b.customer.gstNumber ?? '');
  const da = quoteDates(a.customer), db = quoteDates(b.customer);
  same('Event dates', formatEventDates(da), formatEventDates(db));
  [...new Set([...da, ...db])].sort().forEach((d) => {
    const ta = timeText(a.customer.eventSlots?.[d]), tb = timeText(b.customer.eventSlots?.[d]);
    if (da.includes(d) && db.includes(d)) same(`Time on ${formatEventDates([d])}`, ta || 'not set', tb || 'not set');
  });
  const ma = new Map(a.services.map((s) => [svcKey(s), s])), mb = new Map(b.services.map((s) => [svcKey(s), s]));
  mb.forEach((s, k) => { if (!ma.has(k)) out.push({ label: 'Service added', to: `${s.name} (${inr(s.total)})` }); });
  ma.forEach((s, k) => {
    const n = mb.get(k);
    if (!n) { out.push({ label: 'Service removed', from: `${s.name} (${inr(s.total)})` }); return; }
    if (s.quantity !== n.quantity) out.push({ label: `${s.name} quantity`, from: String(s.quantity), to: String(n.quantity) });
    if (s.unitPrice !== n.unitPrice) out.push({ label: `${s.name} price`, from: inr(s.unitPrice), to: inr(n.unitPrice) });
  });
  same('Subtotal', a.pricing.subtotal, b.pricing.subtotal, true);
  same('Discount', a.pricing.discountAmount ?? 0, b.pricing.discountAmount ?? 0, true);
  if (a.pricing.gstEnabled !== b.pricing.gstEnabled) out.push({ label: 'GST charged', from: yn(a.pricing.gstEnabled), to: yn(b.pricing.gstEnabled) });
  else if (b.pricing.gstEnabled) same('GST rate', `${a.pricing.gstRate}%`, `${b.pricing.gstRate}%`);
  same('Grand total', a.pricing.grandTotal, b.pricing.grandTotal, true);
  return out;
}

export function billUpdated(before: Quote, after: Quote): ActivityDraft | null {
  const changes = diffBills(before, after);
  if (!changes.length) return null;
  const total = changes.find((c) => c.label === 'Grand total');
  return { action: 'bill.updated', reference: after.reference, title: `Bill ${after.reference} edited`, detail: `${who(after)} · ${changes.length} change${changes.length === 1 ? '' : 's'}${total ? ` · total ${total.from} → ${total.to}` : ''}`, data: { changes, customer: after.customer.name, total: after.pricing.grandTotal } };
}

/**
 * The log table only exists from this version on. Older bills and payments are shown too, rebuilt from the bills themselves,
 * so nothing disappears from "Recent activity" after the upgrade. Anything the log already knows about is not repeated.
 */
export function mergeActivity(logged: ActivityEntry[], quotes: Quote[]): ActivityEntry[] {
  const createdLogged = new Set(logged.filter((a) => a.action === 'bill.created').map((a) => a.reference));
  const paymentLogged = new Set(logged.filter((a) => a.action === 'payment.received').map((a) => a.data.paymentId).filter(Boolean));
  const legacy: ActivityEntry[] = [];
  quotes.forEach((q) => {
    if (!createdLogged.has(q.reference)) legacy.push({ id: `legacy-c-${q.id}`, at: q.createdAt, actorEmail: '', actorRole: 'system', action: 'bill.created', reference: q.reference, title: 'New quotation created', detail: who(q), data: snapshot(q), legacy: true });
    (q.pricing.payments ?? []).forEach((p) => {
      if (!paymentLogged.has(p.id)) legacy.push({ id: `legacy-p-${p.id}`, at: p.paidAt, actorEmail: p.by ?? '', actorRole: 'system', action: 'payment.received', reference: q.reference, title: `${inr(p.amount)} received by ${p.method.toUpperCase()}`, detail: `${q.customer.name} · bill ${q.reference}`, data: { amount: p.amount, method: p.method, kind: p.kind, txn: p.note, paymentId: p.id, customer: q.customer.name }, legacy: true });
    });
  });
  return [...logged, ...legacy].sort((x, y) => y.at.localeCompare(x.at));
}

export const actorLabel = (a: ActivityEntry) => (a.actorRole === 'public' ? 'Customer (public estimator)' : a.actorEmail ? a.actorEmail : a.legacy ? 'Before activity log' : 'System');
