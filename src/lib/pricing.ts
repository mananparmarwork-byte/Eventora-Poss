import type { PricingType, Quote, QuotePricing } from './types';

export type PricedLine = { categoryId: string; pricingType: PricingType; price: number; total: number };

export const lineTotal = (type: PricingType, price: number, guests: number, quantity: number) =>
  type === 'perPerson' ? price * guests : price * quantity;

export type TotalsInput = {
  lines: PricedLine[];
  gstEnabled: boolean;
  gstRate: number;
  discountEnabled: boolean;
  discountPercent: number;
  discountFlat: number;
  guests: number;
  advancePaid: boolean;
  advanceAmount: number;
};

/** The one pricing engine. Discount comes off the subtotal first, then GST is charged on what is left. */
export function computeTotals(input: TotalsInput) {
  const categoryTotals: Record<string, number> = {};
  input.lines.forEach((l) => { categoryTotals[l.categoryId] = (categoryTotals[l.categoryId] || 0) + l.total; });
  const subtotal = Object.values(categoryTotals).reduce((a, b) => a + b, 0);
  const foodPerPlate = input.lines.filter((l) => l.categoryId === 'food' && l.pricingType === 'perPerson').reduce((a, l) => a + l.price, 0);
  const pct = input.discountEnabled ? Math.min(100, Math.max(0, input.discountPercent || 0)) : 0;
  const flat = input.discountEnabled ? Math.max(0, input.discountFlat || 0) : 0;
  const discountAmount = Math.min(subtotal, Math.round(subtotal * (pct / 100)) + flat);
  const taxable = subtotal - discountAmount;
  const gstAmount = input.gstEnabled ? taxable * (input.gstRate / 100) : 0;
  const grandTotal = taxable + gstAmount;
  const costPerGuest = input.guests > 0 ? grandTotal / input.guests : 0;
  const advance = quoteAdvance({ grandTotal, advancePaid: input.advancePaid, advanceAmount: input.advanceAmount });
  return { categoryTotals, subtotal, foodPerPlate, discountPercent: pct, discountFlat: flat, discountAmount, taxable, gstAmount, grandTotal, costPerGuest, advance };
}

export function quoteAdvance(p: Pick<QuotePricing, 'grandTotal' | 'advancePaid' | 'advanceAmount'>) {
  const amount = p.advancePaid ? Math.min(p.grandTotal, Math.max(0, Number(p.advanceAmount) || 0)) : 0;
  return { paid: amount > 0, amount, balance: p.grandTotal - amount };
}

export type PaymentState = 'unpaid' | 'partial' | 'paid';
export function quotePaymentState(p: Pick<QuotePricing, 'grandTotal' | 'advancePaid' | 'advanceAmount'>) {
  const a = quoteAdvance(p);
  if (!a.paid) return { state: 'unpaid' as PaymentState, received: 0, balance: p.grandTotal };
  return { state: (a.balance <= 0 ? 'paid' : 'partial') as PaymentState, received: a.amount, balance: a.balance };
}

export const quoteDates = (c: { eventDate: string; eventDates?: string[] }) =>
  c.eventDates && c.eventDates.length ? c.eventDates : c.eventDate ? [c.eventDate] : [];

export const discountLabel = (percent: number, flat: number) => {
  const parts = [percent > 0 ? `${percent}%` : '', flat > 0 ? `₹${flat.toLocaleString('en-IN')}` : ''].filter(Boolean);
  return parts.length ? `Discount (${parts.join(' + ')})` : 'Discount';
};

export const isBooked = (q: Quote) => q.status === 'confirmed';
