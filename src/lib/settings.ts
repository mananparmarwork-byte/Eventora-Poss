import type { BusinessProfile, PaymentSettings } from './types';

export const DEFAULT_BUSINESS: BusinessProfile = {
  name: 'Eventora',
  tagline: 'Venue & Event Management',
  address: '',
  phone: '',
  email: '',
  gstin: '',
  website: '',
  terms: [
    'This quotation is valid for 15 days from the date of issue.',
    'The booking is confirmed only after the advance payment is received.',
    'Advance payments are non-refundable; date changes are subject to availability.',
    'Final guest count must be confirmed 7 days before the event; billing is on the confirmed or actual count, whichever is higher.',
    'Services not listed in this document are charged separately.',
  ].join('\n'),
  footerNote: 'This is a computer-generated document and does not require a signature or stamp.',
  signatory: 'Authorised Signatory',
  gstSplit: true,
};

export const DEFAULT_PAYMENT: PaymentSettings = { upiId: '', payeeName: 'Eventora', bankName: '', accountHolder: '', accountNumber: '', ifsc: '', branch: '' };

const text = (v: unknown) => String(v ?? '').trim();

export function cleanBusiness(raw: Partial<BusinessProfile> | null | undefined): BusinessProfile {
  const b = { ...DEFAULT_BUSINESS, ...(raw ?? {}) };
  return {
    name: text(b.name) || DEFAULT_BUSINESS.name,
    tagline: text(b.tagline),
    address: String(b.address ?? '').trim(),
    phone: text(b.phone),
    email: text(b.email),
    gstin: text(b.gstin).toUpperCase(),
    website: text(b.website),
    terms: String(b.terms ?? ''),
    footerNote: text(b.footerNote),
    signatory: text(b.signatory) || DEFAULT_BUSINESS.signatory,
    gstSplit: b.gstSplit !== false,
    logo: typeof b.logo === 'string' && b.logo.startsWith('data:image/') ? b.logo : undefined,
  };
}

export function cleanPayment(raw: Partial<PaymentSettings> | null | undefined): PaymentSettings {
  const p = { ...DEFAULT_PAYMENT, ...(raw ?? {}) };
  return {
    upiId: text(p.upiId),
    payeeName: text(p.payeeName) || DEFAULT_PAYMENT.payeeName,
    bankName: text(p.bankName),
    accountHolder: text(p.accountHolder),
    accountNumber: text(p.accountNumber).replace(/\s+/g, ''),
    ifsc: text(p.ifsc).toUpperCase(),
    branch: text(p.branch),
  };
}

export const isValidUpiId = (v: string) => /^[a-zA-Z0-9._-]{2,}@[a-zA-Z][a-zA-Z0-9.-]{1,}$/.test(v.trim());
export const isValidIfsc = (v: string) => /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(v.trim());
export const isValidGstin = (v: string) => /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(v.trim().toUpperCase());

export function buildUpiUri(s: Pick<PaymentSettings, 'upiId' | 'payeeName'>, amount: number, note: string) {
  return `upi://pay?pa=${s.upiId.trim()}&pn=${encodeURIComponent(s.payeeName.trim())}&am=${Math.max(0, amount).toFixed(2)}&cu=INR&tn=${encodeURIComponent(note.slice(0, 60))}`;
}

export function bankDetailsText(s: PaymentSettings) {
  return [
    s.accountHolder && `Account name: ${s.accountHolder}`,
    s.accountNumber && `Account number: ${s.accountNumber}`,
    s.ifsc && `IFSC: ${s.ifsc}`,
    s.bankName && `Bank: ${s.bankName}${s.branch ? `, ${s.branch}` : ''}`,
  ].filter(Boolean).join('\n');
}

export function whatsappLink(mobile: string, message: string) {
  const digits = mobile.replace(/\D/g, '').slice(-10);
  return `https://wa.me/${/^[6-9]\d{9}$/.test(digits) ? `91${digits}` : ''}?text=${encodeURIComponent(message)}`;
}

export const newId = () => {
  try { if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID(); } catch { /* fall through */ }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};
