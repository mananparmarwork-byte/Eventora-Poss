import { useEffect, useState } from 'react';
import { Banknote, Copy, Landmark, Loader2, MessageCircle, QrCode, Smartphone, Trash2 } from 'lucide-react';
import { Link } from 'wouter';
import { Badge, Button, Card, CardHeader, Field, Input, useUi } from './ui';
import { PaymentBadge } from './PaymentBadge';
import { usePayment, useUpdatePricing } from '@/lib/api';
import { fmtDateTime, inr } from '@/lib/format';
import { quotePaymentState } from '@/lib/pricing';
import { bankDetailsText, buildUpiUri, isValidUpiId, newId, whatsappLink } from '@/lib/settings';
import { qrCardBlob, qrDataUrl } from '@/lib/qr';
import type { PaymentKind, PaymentMethod, Quote, QuotePayment } from '@/lib/types';

const ADVANCE_PERCENT = 25;
const METHODS: { id: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { id: 'upi', label: 'UPI', icon: <Smartphone size={14} /> },
  { id: 'cash', label: 'Cash', icon: <Banknote size={14} /> },
  { id: 'bank', label: 'Bank', icon: <Landmark size={14} /> },
];

function requestText(i: { name: string; type: string; amount: string; upi: string; payee: string; after: string; full: boolean }) {
  return [
    `Hello ${i.name},`,
    `Thank you for choosing ${i.payee}${i.type ? ` for your ${i.type.toLowerCase()}` : ''}.`,
    `To confirm your booking, please complete the ${i.full ? '' : 'advance '}payment:`,
    '',
    `• Amount payable: ${i.amount}`,
    `• UPI ID: ${i.upi}`,
    `• Payee: ${i.payee}`,
    `• Balance after this payment: ${i.after}`,
    '',
    'Scan the attached QR code with any UPI app (Google Pay, PhonePe, Paytm, BHIM) and share the payment screenshot with us.',
    '',
    `Team ${i.payee}`,
  ].join('\n');
}

export function PaymentPanel({ quote }: { quote: Quote }) {
  const { toast, confirm } = useUi();
  const mutation = useUpdatePricing();
  const { payment: settings } = usePayment();
  const { pricing } = quote;
  const { state, received, balance } = quotePaymentState(pricing);
  const log = pricing.payments ?? [];
  const logged = log.reduce((a, p) => a + p.amount, 0);
  const earlier = Math.max(0, received - logged);

  const [kind, setKind] = useState<PaymentKind>(balance > 0 && received === 0 ? 'advance' : 'full');
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const suggested = kind === 'full' ? balance : Math.min(balance, Math.max(1, Math.round((pricing.grandTotal * ADVANCE_PERCENT) / 100)));
  const [amount, setAmount] = useState(String(suggested));
  const [qr, setQr] = useState('');
  const [qrBlob, setQrBlob] = useState<Blob | null>(null);

  useEffect(() => { setAmount(String(suggested)); }, [suggested]);

  const applied = Math.min(Math.round(Math.max(0, Number(amount) || 0) * 100) / 100, balance);
  const upiReady = isValidUpiId(settings.upiId);
  const uri = upiReady && applied > 0 ? buildUpiUri(settings, applied, quote.customer.eventType || 'Booking') : '';
  const progress = pricing.grandTotal > 0 ? Math.min(100, Math.round((received / pricing.grandTotal) * 100)) : 0;
  const bank = bankDetailsText(settings);

  useEffect(() => {
    let cancelled = false;
    setQr(''); setQrBlob(null);
    if (!uri) return undefined;
    qrDataUrl(uri, 360).then((u) => { if (!cancelled) setQr(u); }).catch(() => undefined);
    qrCardBlob(uri, { title: settings.payeeName, amount: inr(applied) }).then((b) => { if (!cancelled) setQrBlob(b); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [uri, settings.payeeName, applied]);

  const record = () => {
    if (applied <= 0) { toast('Enter an amount greater than zero.', 'error'); return; }
    const entry: QuotePayment = { id: newId(), amount: applied, method, kind: applied >= balance ? 'full' : kind, paidAt: new Date().toISOString() };
    const next = Math.min(pricing.grandTotal, received + applied);
    mutation.mutate({ reference: quote.reference, pricing: { ...pricing, payments: [...log, entry], advancePaid: true, advanceAmount: next, balanceDue: pricing.grandTotal - next } }, {
      onSuccess: () => toast(next >= pricing.grandTotal ? `${inr(applied)} received. Bill is fully paid.` : `${inr(applied)} received. Balance ${inr(pricing.grandTotal - next)}.`),
      onError: (e) => toast(e.message, 'error'),
    });
  };

  const remove = async (p: QuotePayment) => {
    if (!(await confirm({ title: 'Remove this payment?', text: `${inr(p.amount)} (${p.method.toUpperCase()}) will be taken off this bill.`, confirmLabel: 'Remove', danger: true }))) return;
    const next = Math.max(0, received - p.amount);
    mutation.mutate({ reference: quote.reference, pricing: { ...pricing, payments: log.filter((x) => x.id !== p.id), advancePaid: next > 0, advanceAmount: next, balanceDue: pricing.grandTotal - next } }, {
      onSuccess: () => toast('Payment removed.', 'info'), onError: (e) => toast(e.message, 'error'),
    });
  };

  const text = requestText({ name: quote.customer.name, type: quote.customer.eventType, amount: inr(applied), upi: settings.upiId, payee: settings.payeeName, after: inr(Math.max(0, balance - applied)), full: kind === 'full' || applied >= balance });

  const sendWhatsApp = async () => {
    const file = qrBlob ? new File([qrBlob], 'payment-qr.png', { type: 'image/png' }) : null;
    const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    if (file && touch && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text }); return; } catch (e) { if (e instanceof DOMException && e.name === 'AbortError') return; }
    }
    const w = window.open(whatsappLink(quote.customer.mobile, text), '_blank');
    if (qrBlob) {
      try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': qrBlob })]); toast('QR copied. In the WhatsApp chat press Ctrl+V (Cmd+V on Mac) to send it.', 'info'); }
      catch { toast('Message ready. Attach the QR from the payment panel if needed.', 'info'); }
    }
    if (!w) toast('Your browser blocked the WhatsApp window. Allow pop-ups and try again.', 'error');
  };

  const copy = async (label: string, value: string) => { try { await navigator.clipboard.writeText(value); toast(`${label} copied.`); } catch { toast('Copy is blocked in this browser.', 'error'); } };

  return (
    <Card>
      <CardHeader title="Payments" subtitle="Collect and track money for this bill" action={<PaymentBadge state={state} />} />
      <div className="space-y-5 p-5">
        <div>
          <div className="flex items-end justify-between text-sm"><span className="text-text-secondary">Received</span><span className="font-semibold text-text tabular">{inr(received)} <span className="font-normal text-text-disabled">of {inr(pricing.grandTotal)}</span></span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-input"><div className="h-full rounded-full bg-gradient-to-r from-gold to-success transition-all" style={{ width: `${progress}%` }} /></div>
          <p className="mt-2 text-xs text-text-secondary">{balance > 0 ? <>Balance due <strong className="text-text">{inr(balance)}</strong></> : 'Paid in full — nothing left to collect.'}</p>
        </div>

        {balance > 0 && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {([['advance', `Advance (${ADVANCE_PERCENT}%)`], ['full', 'Full balance']] as [PaymentKind, string][]).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setKind(id)} className={`rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition-colors ${kind === id ? 'border-gold bg-gold/10 text-gold' : 'border-border text-text-secondary hover:border-steel-blue'}`}>{label}</button>
              ))}
            </div>
            <Field label="Amount (₹)" hint={`Max ${inr(balance)}`}><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <div>
              <p className="mb-1.5 text-xs font-medium text-text-secondary">Received by</p>
              <div className="grid grid-cols-3 gap-2">
                {METHODS.map((m) => <button key={m.id} type="button" onClick={() => setMethod(m.id)} className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold transition-colors ${method === m.id ? 'border-gold bg-gold/10 text-gold' : 'border-border text-text-secondary hover:border-steel-blue'}`}>{m.icon}{m.label}</button>)}
              </div>
            </div>
            <Button variant="gold" className="w-full" onClick={record} disabled={mutation.isPending}>{mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : null} Record {inr(applied)} received</Button>

            <div className="rounded-xl border border-border bg-input/50 p-4">
              <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary"><QrCode size={14} className="text-gold" /> Collect via UPI</p>
              {!upiReady ? (
                <p className="text-sm text-text-secondary">Add your UPI ID to show a payment QR here. <Link href="/admin/settings" className="text-gold hover:underline">Open Settings</Link></p>
              ) : (
                <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                  <div className="grid size-40 shrink-0 place-items-center rounded-xl bg-white p-2">{qr ? <img src={qr} alt={`UPI QR for ${inr(applied)}`} className="size-full" /> : <Loader2 className="animate-spin text-brand" />}</div>
                  <div className="min-w-0 flex-1 space-y-2 text-sm">
                    <p className="text-text">{settings.payeeName}</p>
                    <p className="flex items-center gap-2 text-xs text-text-secondary"><span className="truncate">{settings.upiId}</span><button type="button" className="text-gold" onClick={() => copy('UPI ID', settings.upiId)} aria-label="Copy UPI ID"><Copy size={13} /></button></p>
                    <Button variant="outline" size="sm" onClick={sendWhatsApp} disabled={applied <= 0}><MessageCircle size={14} /> Send request on WhatsApp</Button>
                  </div>
                </div>
              )}
              {bank && <div className="mt-3 border-t border-border/70 pt-3"><pre className="whitespace-pre-wrap font-sans text-xs text-text-secondary">{bank}</pre><button type="button" className="mt-1 text-xs text-gold hover:underline" onClick={() => copy('Bank details', bank)}>Copy bank details</button></div>}
            </div>
          </>
        )}

        {(log.length > 0 || earlier > 0) && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">Payment history</p>
            <ul className="divide-y divide-border/60 rounded-xl border border-border">
              {earlier > 0 && <li className="flex items-center justify-between px-3.5 py-2.5 text-sm"><span className="text-text-secondary">Advance noted on the bill</span><span className="font-medium tabular text-text">{inr(earlier)}</span></li>}
              {log.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                  <span className="min-w-0"><span className="block font-medium text-text tabular">{inr(p.amount)}</span><span className="block text-[11px] text-text-disabled">{fmtDateTime(p.paidAt)}</span></span>
                  <span className="flex items-center gap-2"><Badge tone={p.kind === 'full' ? 'success' : 'warning'}>{p.method.toUpperCase()} · {p.kind}</Badge><button type="button" onClick={() => remove(p)} aria-label="Remove payment" className="grid size-7 place-items-center rounded-lg text-text-disabled hover:bg-error-bg hover:text-error"><Trash2 size={14} /></button></span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
