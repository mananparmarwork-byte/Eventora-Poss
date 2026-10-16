import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Banknote, CircleAlert, Copy, Landmark, MessageCircle, QrCode, Settings2, Smartphone, Trash2 } from 'lucide-react';
import {
  getGetQuoteQueryKey,
  getListQuotesQueryKey,
  quotePaymentState,
  useUpdateQuotePricing,
  type PaymentKind,
  type PaymentMethod,
  type PaymentState,
  type Quote,
  type QuotePayment,
} from '@/lib/supabase-queries';
import { bankDetailsText, buildUpiUri, isValidUpiId, newPaymentId, whatsappLink } from '@/lib/payments';
import { qrPngBlob } from '@/lib/qr-image';
import { UpiQr } from '@/components/upi-qr';
import { openPaymentSettings, usePaymentSettings } from '@/components/payment-settings';

const ADVANCE_PERCENT = 25;
const money = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
const dateTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const EVENT_EMOJI: Record<string, string> = { wedding: '💒', reception: '🥂', engagement: '💍', birthday: '🎂', anniversary: '💞', corporate: '🏢' };

// The WhatsApp message sent with the payment QR code.
function paymentRequestText(info: { customerName: string; eventType?: string; amount: string; upiId: string; payeeName: string; balanceAfter: string; full: boolean }) {
  const type = (info.eventType ?? '').trim();
  const plain = ['', 'other', 'corporate'].includes(type.toLowerCase());
  const occasion = !type ? 'event' : plain ? `${type.toLowerCase() === 'other' ? '' : `${type} `}event`.trim() : `${type} celebration`;
  const emoji = EVENT_EMOJI[type.toLowerCase()] ?? '✨';
  return [
    `Hello ${info.customerName}! 👋`,
    `Thank you for choosing ${info.payeeName} for your ${occasion}! ${emoji}`,
    `To confirm your booking, please complete the ${info.full ? '' : 'advance '}payment using the details below:`,
    '💳 Payment Details',
    '',
    `• Amount Payable: ${info.amount}`,
    `• UPI ID: ${info.upiId}`,
    `• Payee Name: ${info.payeeName}`,
    `• Balance After Payment: ${info.balanceAfter}`,
    '',
    '📲 How to Pay',
    '',
    '1. Scan the QR code attached to this message.',
    '2. Pay using Google Pay, PhonePe, Paytm, or any UPI app.',
    '3. Once the payment is successful, please share the payment screenshot with us.',
    '',
    `Thank you for choosing ${info.payeeName}! We look forward to making your special occasion memorable. ✨`,
    `Team ${info.payeeName}`,
  ].join('\n');
}

// Small coloured status pill used in the bill list and the bill detail.
export function PaymentBadge({ state, balance, testId }: { state: PaymentState; balance?: number; testId?: string }) {
  if (state === 'paid') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-[#3c7a52] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-white" data-testid={testId}><BadgeCheck size={12} /> Paid</span>;
  }
  if (state === 'partial') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-[#f6e7bf] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[#7a5a14]" data-testid={testId}><Banknote size={12} /> Advance paid{balance !== undefined ? ` · ${money(balance)} due` : ''}</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full bg-[#eee6d9] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[#7a776e]" data-testid={testId}><CircleAlert size={12} /> Unpaid</span>;
}

function Segmented<T extends string>({ value, options, onChange, name }: { value: T; options: { id: T; label: string; note?: string; icon?: ReactNode }[]; onChange: (id: T) => void; name: string }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={name}>
      {options.map((option) => (
        <label key={option.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${value === option.id ? 'border-[#c9a227] bg-[#fff8e6] shadow-sm' : 'border-[#e3d8c9] bg-white hover:border-[#c9a227]'}`}>
          <input type="radio" name={name} checked={value === option.id} onChange={() => onChange(option.id)} className="size-4 accent-[#c86b45]" data-testid={`radio-${name}-${option.id}`} />
          <span className="min-w-0"><strong className="flex items-center gap-1.5 text-xs text-[#263b31]">{option.icon}{option.label}</strong>{option.note && <span className="block text-[11px] text-[#74736c]">{option.note}</span>}</span>
        </label>
      ))}
    </div>
  );
}

export function PaymentPanel({ quote }: { quote: Quote }) {
  const queryClient = useQueryClient();
  const mutation = useUpdateQuotePricing();
  const pricing = quote.pricing;
  const { state, received, balance } = quotePaymentState(pricing);
  const payments = pricing.payments ?? [];
  const loggedTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const earlierAdvance = Math.max(0, received - loggedTotal); // advance typed on the bill itself (not collected here)

  const [kind, setKind] = useState<PaymentKind>(balance > 0 && received === 0 ? 'advance' : 'full');
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const suggested = kind === 'full' ? balance : Math.min(balance, Math.max(1, Math.round((pricing.grandTotal * ADVANCE_PERCENT) / 100)));
  const [amount, setAmount] = useState(String(suggested));
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const { settings } = usePaymentSettings();
  const [copied, setCopied] = useState('');
  const [qrBlob, setQrBlob] = useState<Blob | null>(null);
  const [shareNote, setShareNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // Amount is filled in automatically from the bill: full payment = whatever balance is left.
  useEffect(() => { setAmount(String(suggested)); }, [suggested]);

  const typed = Math.round(Math.max(0, Number(amount) || 0) * 100) / 100;
  const applied = Math.min(typed, balance);
  const upiReady = isValidUpiId(settings.upiId);
  const upiUri = upiReady && applied > 0 ? buildUpiUri(settings, applied, quote.customer.eventType?.trim() || 'Booking') : '';
  const progress = pricing.grandTotal > 0 ? Math.min(100, Math.round((received / pricing.grandTotal) * 100)) : 0;
  const bankText = bankDetailsText(settings);

  const finish = (text: string) => {
    setMessage({ kind: 'ok', text });
    void queryClient.invalidateQueries({ queryKey: getGetQuoteQueryKey(quote.reference) });
    void queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });
  };
  const fail = (error: Error) => setMessage({ kind: 'error', text: error.message });

  const record = (via: PaymentMethod) => {
    if (applied <= 0) { setMessage({ kind: 'error', text: 'Enter an amount greater than zero.' }); return; }
    setMessage(null);
    const entry: QuotePayment = { id: newPaymentId(), amount: applied, method: via, kind: applied >= balance ? 'full' : kind, paidAt: new Date().toISOString() };
    const nextReceived = Math.min(pricing.grandTotal, received + applied);
    mutation.mutate({
      reference: quote.reference,
      pricing: { ...pricing, payments: [...payments, entry], advancePaid: true, advanceAmount: nextReceived, balanceDue: pricing.grandTotal - nextReceived },
    }, {
      onSuccess: () => finish(nextReceived >= pricing.grandTotal ? `${money(applied)} received by ${via === 'upi' ? 'UPI' : 'cash'}. Bill is fully paid.` : `${money(applied)} received by ${via === 'upi' ? 'UPI' : 'cash'}. Balance ${money(pricing.grandTotal - nextReceived)}.`),
      onError: fail,
    });
  };

  const remove = (payment: QuotePayment) => {
    if (!window.confirm(`Remove the ${money(payment.amount)} ${payment.method === 'upi' ? 'UPI' : 'cash'} payment from this bill?`)) return;
    setMessage(null);
    const nextReceived = Math.max(0, received - payment.amount);
    mutation.mutate({
      reference: quote.reference,
      pricing: { ...pricing, payments: payments.filter((item) => item.id !== payment.id), advancePaid: nextReceived > 0, advanceAmount: nextReceived, balanceDue: pricing.grandTotal - nextReceived },
    }, { onSuccess: () => finish('Payment removed.'), onError: fail });
  };

  const copy = async (label: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(label); window.setTimeout(() => setCopied(''), 1800); } catch { setCopied(''); }
  };

  const eventName = quote.customer.eventType?.trim();
  // WhatsApp payment request. The auto-generated QR code (amount already filled in) is sent together with this message.
  const requestText = paymentRequestText({
    customerName: quote.customer.name,
    eventType: eventName,
    amount: money(applied),
    upiId: settings.upiId,
    payeeName: settings.payeeName,
    balanceAfter: money(Math.max(0, balance - applied)),
    full: kind === 'full' || applied >= balance,
  });

  // Prepare the QR picture ahead of time so the WhatsApp button can use it instantly.
  useEffect(() => {
    let cancelled = false;
    setQrBlob(null);
    if (!upiUri) return undefined;
    qrPngBlob(upiUri, { title: settings.payeeName, amount: money(applied) }).then((blob) => { if (!cancelled) setQrBlob(blob); }).catch(() => { if (!cancelled) setQrBlob(null); });
    return () => { cancelled = true; };
  }, [upiUri, settings.payeeName, applied]);

  const downloadQr = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payment-qr-${quote.customer.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'customer'}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  // Send on WhatsApp: the message goes as text and the QR code goes as a photo.
  //  - Phone: the share sheet sends the QR picture with the message as its caption.
  //  - Computer: the QR picture is copied, WhatsApp opens on the customer's chat with the message ready, and
  //    pressing Ctrl+V (Cmd+V on Mac) in that chat sends the QR as a photo. If copying is blocked, the picture is downloaded.
  const sendOnWhatsApp = async () => {
    setShareNote(null);
    const file = qrBlob ? new File([qrBlob], 'payment-qr.png', { type: 'image/png' }) : null;
    const isTouchDevice = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    if (file && isTouchDevice && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: requestText });
        setShareNote({ kind: 'ok', text: 'Choose WhatsApp and the customer. The QR photo is sent with the message.' });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        // Any other failure falls through to the normal WhatsApp link below.
      }
    }
    const popup = window.open(whatsappLink(quote.customer.mobile, requestText), '_blank');
    if (!qrBlob) { setShareNote({ kind: 'error', text: 'The message is ready, but the QR picture could not be prepared. Take a screenshot of the QR code to send it.' }); return; }
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': qrBlob })]);
      setShareNote({ kind: 'ok', text: 'QR photo copied. In the WhatsApp chat that just opened, press Ctrl+V (Cmd+V on Mac) and send it.' });
    } catch {
      downloadQr(qrBlob);
      setShareNote({ kind: 'ok', text: 'QR photo downloaded. Attach it in the WhatsApp chat using the + (attach) button.' });
    }
    if (!popup) setShareNote({ kind: 'error', text: 'Your browser blocked the WhatsApp window. Allow pop-ups for this site and try again.' });
  };

  return (
    <div className="rounded-xl border border-[#e3d8c9] bg-[#fffdf8] p-3 sm:p-4" data-testid="box-payment-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-serif text-lg font-semibold text-[#263b31]">Payment</h3>
        <PaymentBadge state={state} balance={balance} testId="badge-payment-state" />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-[#f6efe2] px-2 py-2"><span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-[#77736D]">Bill total</span><strong className="font-mono text-sm text-[#242424]">{money(pricing.grandTotal)}</strong></div>
        <div className="rounded-lg bg-[#e8f3ea] px-2 py-2"><span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-[#3c7a52]">Received</span><strong className="font-mono text-sm text-[#2f6b44]" data-testid="text-payment-received">{money(received)}</strong></div>
        <div className="rounded-lg bg-[#fbeee6] px-2 py-2"><span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-[#864936]">Balance</span><strong className="font-mono text-sm text-[#864936]" data-testid="text-payment-balance">{money(balance)}</strong></div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#eee6d9]" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Payment received">
        <div className="h-full rounded-full bg-gradient-to-r from-[#3c7a52] to-[#5fa57a] transition-all duration-700" style={{ width: `${progress}%` }} />
      </div>

      {(payments.length > 0 || earlierAdvance > 0) && (
        <ul className="mt-3 divide-y divide-[#eee6d9] rounded-lg border border-[#eee6d9] bg-white text-xs" data-testid="list-payments">
          {earlierAdvance > 0 && (
            <li className="flex items-center justify-between gap-3 px-3 py-2"><span className="flex items-center gap-2 text-[#5f655e]"><Banknote size={14} className="text-[#9a5b47]" /> Advance noted on the bill</span><strong className="font-mono text-[#2f6b44]">{money(earlierAdvance)}</strong></li>
          )}
          {payments.map((payment) => (
            <li key={payment.id} className="flex items-center justify-between gap-3 px-3 py-2" data-testid={`payment-${payment.id}`}>
              <span className="flex min-w-0 items-center gap-2 text-[#5f655e]">
                {payment.method === 'upi' ? <Smartphone size={14} className="shrink-0 text-[#9a5b47]" /> : <Banknote size={14} className="shrink-0 text-[#9a5b47]" />}
                <span className="min-w-0"><strong className="block text-[#263b31]">{payment.kind === 'full' ? 'Full payment' : 'Advance'} · {payment.method === 'upi' ? 'UPI' : 'Cash'}</strong><span className="block text-[11px] text-[#77736D]">{dateTime(payment.paidAt)}</span></span>
              </span>
              <span className="flex items-center gap-1"><strong className="font-mono text-[#2f6b44]">{money(payment.amount)}</strong><button type="button" onClick={() => remove(payment)} disabled={mutation.isPending} className="icon-button danger-hover" aria-label="Remove this payment" data-testid={`button-remove-payment-${payment.id}`}><Trash2 size={14} /></button></span>
            </li>
          ))}
        </ul>
      )}

      {balance <= 0 && pricing.grandTotal > 0 ? (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-[#e8f3ea] px-3 py-2.5 text-sm font-semibold text-[#2f6b44]" role="status" data-testid="text-fully-paid"><BadgeCheck size={17} /> This bill is fully paid. Nothing left to collect.</p>
      ) : (
        <div className="mt-4 space-y-3 border-t border-[#eee6d9] pt-4" data-testid="form-collect-payment">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#9a5b47]">Collect payment</p>
          <Segmented name="payment-kind" value={kind} onChange={setKind} options={[
            { id: 'advance', label: 'Advance', note: `Suggested ${ADVANCE_PERCENT}% of the bill` },
            { id: 'full', label: 'Full payment', note: 'Whole remaining balance' },
          ]} />
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-[#263b31]">Amount to collect {kind === 'full' ? '(filled from the balance)' : '(you can change it)'}</span>
            <div className="relative max-w-xs">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm font-bold text-[#9a5b47]">₹</span>
              <input type="number" min="1" max={balance} step="1" value={amount} readOnly={kind === 'full'} onChange={(e) => setAmount(e.target.value)} className="field-control h-11 w-full rounded-xl pl-7 pr-3 text-sm font-semibold read-only:bg-[#f6efe2]" aria-label="Amount to collect in rupees" data-testid="input-collect-amount" />
            </div>
                      </label>
          <Segmented name="payment-method" value={method} onChange={setMethod} options={[
            { id: 'upi', label: 'UPI / QR', note: 'Google Pay, PhonePe, Paytm…', icon: <QrCode size={13} /> },
            { id: 'cash', label: 'Cash', note: 'Received in hand', icon: <Banknote size={13} /> },
          ]} />

          {method === 'upi' ? (
            <div className="rounded-xl border border-[#eee6d9] bg-white p-3" data-testid="box-upi">
              {!upiReady ? (
                <p className="text-xs text-[#a13d32]">Add your UPI ID in <button type="button" onClick={openPaymentSettings} className="font-bold underline" data-testid="link-go-payment-account">Settings → Payment account</button> to create the QR code.</p>
              ) : applied <= 0 ? (
                <p className="text-xs text-[#a13d32]">Enter an amount to create the QR code.</p>
              ) : (
                <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                  <UpiQr value={upiUri} />
                  <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
                    <p className="text-xs text-[#5f655e]">Ask the customer to scan this with any UPI app. The amount <strong className="font-mono text-[#864936]">{money(applied)}</strong> is already filled in.</p>
                    <p className="break-all font-mono text-[11px] text-[#77736D]">{settings.upiId} · {settings.payeeName}</p>
                    <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                      <button type="button" onClick={() => void copy('link', upiUri)} className="admin-secondary" data-testid="button-copy-upi-link"><Copy size={14} /> {copied === 'link' ? 'Copied' : 'Copy link'}</button>
                      {bankText && <button type="button" onClick={() => void copy('bank', bankText)} className="admin-secondary" data-testid="button-copy-bank"><Landmark size={14} /> {copied === 'bank' ? 'Copied' : 'Copy bank details'}</button>}
                      <button type="button" onClick={() => void sendOnWhatsApp()} className="admin-secondary" data-testid="button-whatsapp-payment"><MessageCircle size={14} /> Send on WhatsApp</button>
                    </div>
                    {shareNote && <p className={`rounded-lg px-3 py-2 text-left text-[11px] ${shareNote.kind === 'ok' ? 'bg-[#e8f3ea] text-[#2f6b44]' : 'bg-[#fff7f3] text-[#73483b]'}`} role={shareNote.kind === 'ok' ? 'status' : 'alert'} data-testid="status-whatsapp-share">{shareNote.text}</p>}
                  </div>
                </div>
              )}
              <button type="button" onClick={() => record('upi')} disabled={mutation.isPending || applied <= 0} className="admin-primary mt-3 w-full" data-testid="button-mark-upi-paid"><BadgeCheck size={15} /> {mutation.isPending ? 'Saving…' : `Mark ${money(applied)} UPI payment received`}</button>
              <p className="mt-2 text-[11px] text-[#77736D]">Tap this only after you see the money in your bank or UPI app. The app cannot check it for you.</p>
            </div>
          ) : (
            <button type="button" onClick={() => record('cash')} disabled={mutation.isPending || applied <= 0} className="admin-primary w-full" data-testid="button-mark-cash-paid"><BadgeCheck size={15} /> {mutation.isPending ? 'Saving…' : `Mark ${money(applied)} cash received`}</button>
          )}
        </div>
      )}

      {message && <p className={`mt-3 rounded-lg px-3 py-2 text-xs ${message.kind === 'ok' ? 'bg-[#e8f3ea] text-[#2f6b44]' : 'bg-[#fff7f3] text-[#73483b]'}`} role={message.kind === 'ok' ? 'status' : 'alert'} data-testid="status-payment-message">{message.text}</p>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#eee6d9] pt-3 text-[11px] text-[#77736D]">
        <span className="flex min-w-0 items-center gap-1.5"><Landmark size={13} className="shrink-0 text-[#9a5b47]" /> <span className="truncate">Money goes to: {upiReady ? `${settings.upiId} (${settings.payeeName})` : 'UPI ID not set'}</span></span>
        <button type="button" onClick={openPaymentSettings} className="admin-link" data-testid="button-open-payment-account"><Settings2 size={13} /> Change payment account</button>
      </div>
    </div>
  );
}
