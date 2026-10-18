import { createElement } from 'react';
import { qrDataUrl } from '@/lib/qr';
import { buildUpiUri, isValidUpiId } from '@/lib/settings';
import { quoteAdvance } from '@/lib/pricing';
import type { BusinessProfile, PaymentSettings, Quote } from '@/lib/types';
import type { BillKind } from './BillDocument';

// The PDF engine is large, so it is only downloaded the first time someone actually creates a PDF.
async function render(element: React.ReactElement): Promise<Blob> {
  const { pdf } = await import('@react-pdf/renderer');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return pdf(element as any).toBlob();
}

export async function buildBillBlob(quote: Quote, business: BusinessProfile, payment: PaymentSettings, kind: BillKind): Promise<Blob> {
  const { BillDocument } = await import('./BillDocument');
  const balance = quoteAdvance(quote.pricing).balance;
  let qr: string | undefined;
  if (isValidUpiId(payment.upiId) && balance > 0) {
    try { qr = await qrDataUrl(buildUpiUri(payment, balance, `Bill ${quote.reference}`), 300); } catch { qr = undefined; }
  }
  return render(createElement(BillDocument, { quote, business, payment, kind, qr }));
}

export async function buildReportBlob(title: string, quotes: Quote[], business: BusinessProfile): Promise<Blob> {
  const { ReportDocument } = await import('./ReportDocument');
  return render(createElement(ReportDocument, { title, quotes, business }));
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function openBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) saveBlob(blob, 'document.pdf');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const billFileName = (quote: Quote, kind: BillKind) =>
  `${kind === 'invoice' ? 'Invoice' : 'Quotation'}-${quote.reference}-${quote.customer.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}.pdf`;
