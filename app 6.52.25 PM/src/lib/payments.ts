// UPI payment helpers: payee settings, UPI link and WhatsApp request text.

export type PaymentSettings = {
  upiId: string;
  payeeName: string;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  ifsc: string;
  branch: string;
};
export type UpiSettings = Pick<PaymentSettings, 'upiId' | 'payeeName'>;

const STORAGE_KEY = 'swagattam-payment-settings';
const UPI_ID_PATTERN = /^[a-zA-Z0-9._-]{2,}@[a-zA-Z][a-zA-Z0-9.-]{1,}$/;
const IFSC_PATTERN = /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/;

// Optional defaults can be set once in the .env file (VITE_UPI_ID, VITE_UPI_NAME).
const ENV_UPI_ID = String(import.meta.env.VITE_UPI_ID ?? '').trim();
const ENV_PAYEE = String(import.meta.env.VITE_UPI_NAME ?? '').trim() || 'Swagattam Party Lawns';

export const EMPTY_PAYMENT_SETTINGS: PaymentSettings = { upiId: ENV_UPI_ID, payeeName: ENV_PAYEE, bankName: '', accountHolder: '', accountNumber: '', ifsc: '', branch: '' };

export function isValidUpiId(value: string): boolean {
  return UPI_ID_PATTERN.test(value.trim());
}

export function isValidIfsc(value: string): boolean {
  return IFSC_PATTERN.test(value.trim());
}

export function cleanPaymentSettings(raw: Partial<PaymentSettings> | null | undefined): PaymentSettings {
  const text = (value: unknown) => String(value ?? '').trim();
  return {
    upiId: text(raw?.upiId) || ENV_UPI_ID,
    payeeName: text(raw?.payeeName) || ENV_PAYEE,
    bankName: text(raw?.bankName),
    accountHolder: text(raw?.accountHolder),
    accountNumber: text(raw?.accountNumber).replace(/\s+/g, ''),
    ifsc: text(raw?.ifsc).toUpperCase(),
    branch: text(raw?.branch),
  };
}

// A copy kept on this device so the panel still works if the cloud copy cannot be reached.
export function loadPaymentSettings(): PaymentSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return cleanPaymentSettings(JSON.parse(raw) as Partial<PaymentSettings>);
  } catch {
    // Storage can be blocked; fall back to the defaults.
  }
  return cleanPaymentSettings(null);
}

export function savePaymentSettingsLocally(settings: PaymentSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore: the settings simply will not be remembered on this device.
  }
}

// Bank details as plain text (for copying or sending on WhatsApp). Empty when no bank details are filled in.
export function bankDetailsText(settings: PaymentSettings): string {
  const lines = [
    settings.accountHolder && `Account name: ${settings.accountHolder}`,
    settings.accountNumber && `Account number: ${settings.accountNumber}`,
    settings.ifsc && `IFSC: ${settings.ifsc}`,
    settings.bankName && `Bank: ${settings.bankName}${settings.branch ? `, ${settings.branch}` : ''}`,
  ].filter(Boolean);
  return lines.join('\n');
}

// Standard UPI deep link. Every UPI app (Google Pay, PhonePe, Paytm, BHIM...) can read it from a QR code.
export function buildUpiUri(settings: UpiSettings, amount: number, note: string): string {
  const params = [
    `pa=${settings.upiId.trim()}`,
    `pn=${encodeURIComponent(settings.payeeName.trim())}`,
    `am=${Math.max(0, amount).toFixed(2)}`,
    'cu=INR',
    `tn=${encodeURIComponent(note.slice(0, 60))}`,
  ];
  return `upi://pay?${params.join('&')}`;
}

export function whatsappLink(mobile: string, text: string): string {
  const digits = mobile.replace(/\D/g, '');
  const valid = /^[6-9]\d{9}$/.test(digits.slice(-10));
  return `https://wa.me/${valid ? `91${digits.slice(-10)}` : ''}?text=${encodeURIComponent(text)}`;
}

export function newPaymentId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    // fall through
  }
  return `pay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
