import type { BusinessProfile, PaymentSettings } from './types';

export const DEFAULT_BUSINESS: BusinessProfile = {
  name: 'Eventora Venues', tagline: 'Weddings · Celebrations · Corporate Events',
  address: '', phone: '', email: '', website: '', gstNumber: '', defaultGstRate: 5, splitGst: true,
  terms: [
    '50% advance is required to confirm the booking; the balance is payable before the event date.',
    'The advance is non-refundable but may be adjusted against a rescheduled date, subject to availability.',
    'Quoted prices are valid for 15 days from the date of this document.',
    'Decoration, lighting and fireworks are subject to venue guidelines and local approvals.',
    'Any extra services or additional guests will be billed separately.',
  ].join('\n'),
  footerNote: 'This is a computer-generated document and does not require a signature.',
  signatory: 'Authorised Signatory',
};
export const DEFAULT_PAYMENT: PaymentSettings = { upiId: '', payeeName: '', bankName: '', accountHolder: '', accountNumber: '', ifsc: '', branch: '' };

const UPI = /^[a-zA-Z0-9._-]{2,}@[a-zA-Z][a-zA-Z0-9.-]{1,}$/;
const IFSC = /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/;
export const isValidUpiId = (v: string) => UPI.test(v.trim());
export const isValidIfsc = (v: string) => IFSC.test(v.trim());
export const isValidMobile = (v: string) => /^[6-9]\d{9}$/.test(v.replace(/\D/g, '').slice(-10));
export const isValidGstin = (v: string) => /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v.trim().toUpperCase());

export const cleanBusiness = (raw: Partial<BusinessProfile> | null | undefined): BusinessProfile => ({ ...DEFAULT_BUSINESS, ...(raw ?? {}) });
export function cleanPayment(raw: Partial<PaymentSettings> | null | undefined): PaymentSettings {
  const t = (v: unknown) => String(v ?? '').trim();
  return {
    upiId: t(raw?.upiId), payeeName: t(raw?.payeeName), bankName: t(raw?.bankName), accountHolder: t(raw?.accountHolder),
    accountNumber: t(raw?.accountNumber).replace(/\s+/g, ''), ifsc: t(raw?.ifsc).toUpperCase(), branch: t(raw?.branch),
  };
}
export function bankDetailsText(s: PaymentSettings): string {
  return [
    s.accountHolder && `Account name: ${s.accountHolder}`, s.accountNumber && `Account number: ${s.accountNumber}`,
    s.ifsc && `IFSC: ${s.ifsc}`, s.bankName && `Bank: ${s.bankName}${s.branch ? `, ${s.branch}` : ''}`,
  ].filter(Boolean).join('\n');
}
/** Standard UPI deep link: every UPI app can read it from a QR code. */
export function buildUpiUri(s: Pick<PaymentSettings, 'upiId' | 'payeeName'>, amount: number, note: string): string {
  return `upi://pay?pa=${s.upiId.trim()}&pn=${encodeURIComponent(s.payeeName.trim())}&am=${Math.max(0, amount).toFixed(2)}&cu=INR&tn=${encodeURIComponent(note.slice(0, 60))}`;
}
export function whatsappLink(mobile: string, text: string): string {
  const d = mobile.replace(/\D/g, '');
  return `https://wa.me/${/^[6-9]\d{9}$/.test(d.slice(-10)) ? `91${d.slice(-10)}` : ''}?text=${encodeURIComponent(text)}`;
}
export const newId = () => {
  try { if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID(); } catch { /* fall through */ }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};
