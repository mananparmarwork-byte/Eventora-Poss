import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, CircleAlert, Landmark, Smartphone } from 'lucide-react';
import { getGetPaymentSettingsQueryKey, useGetPaymentSettings, useSavePaymentSettings } from '@/lib/supabase-queries';
import {
  buildUpiUri,
  cleanPaymentSettings,
  isValidIfsc,
  isValidUpiId,
  loadPaymentSettings,
  savePaymentSettingsLocally,
  type PaymentSettings,
} from '@/lib/payments';
import { UpiQr } from '@/components/upi-qr';

// The payment account the admin saved: cloud copy first (same on every device), this device's copy as a fallback.
export function usePaymentSettings(): { settings: PaymentSettings; cloudSaved: boolean; cloudAvailable: boolean; isLoading: boolean } {
  const query = useGetPaymentSettings();
  const local = loadPaymentSettings(); // cheap read; re-read every render so a fresh save shows up straight away
  const cloud = query.data?.settings ?? null;
  return { settings: cloud ?? local, cloudSaved: Boolean(cloud), cloudAvailable: query.data?.available ?? false, isLoading: query.isLoading };
}

// The payment account editor lives in the admin Settings panel. Anything that needs it asks the panel to open.
export const OPEN_SETTINGS_EVENT = 'swagattam:open-settings';
export function openPaymentSettings() {
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { tab: 'payment' } }));
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-[#263b31]">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-[11px] text-[#a13d32]">{error}</span> : hint ? <span className="mt-1 block text-[11px] text-[#77736D]">{hint}</span> : null}
    </label>
  );
}

export function PaymentSettingsSection() {
  const queryClient = useQueryClient();
  const { settings, cloudSaved, cloudAvailable, isLoading } = usePaymentSettings();
  const mutation = useSavePaymentSettings();
  const [draft, setDraft] = useState<PaymentSettings | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const form = draft ?? settings;
  const set = (key: keyof PaymentSettings, value: string) => setDraft({ ...form, [key]: value });

  const upiOk = isValidUpiId(form.upiId);
  const ifscOk = !form.ifsc.trim() || isValidIfsc(form.ifsc);
  const accountOk = !form.accountNumber.trim() || /^\d{6,20}$/.test(form.accountNumber.replace(/\s+/g, ''));
  const canSave = upiOk && ifscOk && accountOk && !mutation.isPending;
  const sampleUri = upiOk ? buildUpiUri(form, 1, 'Test payment') : '';

  const save = () => {
    if (!canSave) return;
    setMessage(null);
    const clean = cleanPaymentSettings(form);
    savePaymentSettingsLocally(clean);
    mutation.mutate(clean, {
      onSuccess: () => {
        setDraft(null);
        setMessage({ kind: 'ok', text: 'Saved. These details are now used on every payment QR code, on every device.' });
        void queryClient.invalidateQueries({ queryKey: getGetPaymentSettingsQueryKey() });
      },
      onError: () => {
        setDraft(null);
        setMessage({ kind: 'warn', text: 'Saved on this device only. To keep them for every device, run the file supabase/05-payment-settings.sql once in the Supabase SQL Editor, then press Save again.' });
        void queryClient.invalidateQueries({ queryKey: getGetPaymentSettingsQueryKey() });
      },
    });
  };

  const input = 'field-control h-11 w-full rounded-xl px-3 text-sm';
  return (
    <section id="payment-account" className="admin-panel rounded-2xl border border-[#e3d8c9] bg-[#fffdf8] p-4 sm:p-5" data-testid="section-payment-account">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#eee6d9] pb-4">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#9a5b47]">Receiving money</p>
          <h2 className="mt-2 font-serif text-2xl font-semibold text-[#263b31]">Payment account</h2>
          <p className="mt-1 max-w-2xl text-sm text-[#7a776e]">Your UPI ID is where customers' money goes. When a customer scans the QR code and pays, the money arrives directly in the bank account linked to this UPI ID. Nothing passes through this website.</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold ${upiOk && settings.upiId && (cloudSaved || !cloudAvailable) && settings.upiId.trim() ? 'bg-[#e8f3ea] text-[#2f6b44]' : 'bg-[#fbeee6] text-[#864936]'}`} data-testid="badge-payment-account-status">
          {isLoading ? 'Checking…' : isValidUpiId(settings.upiId) ? <><BadgeCheck size={13} /> {cloudSaved ? 'Saved for all devices' : 'Saved on this device'}</> : <><CircleAlert size={13} /> UPI ID not set</>}
        </span>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_auto]">
        <div className="space-y-5">
          <div>
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#263b31]"><Smartphone size={16} className="text-[#c86b45]" /> UPI (used for the QR code)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Your UPI ID" hint="Example: 9876543210@ybl or name@oksbi. You can see it inside Google Pay / PhonePe." error={form.upiId && !upiOk ? 'This does not look like a UPI ID. It should look like name@bank.' : undefined}>
                <input value={form.upiId} onChange={(e) => set('upiId', e.target.value)} placeholder="name@bank" autoCapitalize="none" autoCorrect="off" className={input} data-testid="input-upi-id" />
              </Field>
              <Field label="Name shown to the customer" hint="Shown on the customer's payment screen.">
                <input value={form.payeeName} onChange={(e) => set('payeeName', e.target.value)} placeholder="Swagattam Party Lawns" className={input} data-testid="input-upi-name" />
              </Field>
            </div>
          </div>

          <div>
            <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-[#263b31]"><Landmark size={16} className="text-[#c86b45]" /> Bank account (optional)</p>
            <p className="mb-3 text-xs text-[#77736D]">Only for customers who prefer a bank transfer (NEFT / IMPS). Use the "Copy bank details" button on a bill to share them.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Account holder name"><input value={form.accountHolder} onChange={(e) => set('accountHolder', e.target.value)} className={input} data-testid="input-bank-holder" /></Field>
              <Field label="Bank name"><input value={form.bankName} onChange={(e) => set('bankName', e.target.value)} className={input} data-testid="input-bank-name" /></Field>
              <Field label="Account number" error={!accountOk ? 'Use digits only (6 to 20 digits).' : undefined}><input value={form.accountNumber} onChange={(e) => set('accountNumber', e.target.value)} inputMode="numeric" className={input} data-testid="input-bank-account" /></Field>
              <Field label="IFSC code" error={!ifscOk ? 'IFSC has 11 characters, like SBIN0001234.' : undefined}><input value={form.ifsc} onChange={(e) => set('ifsc', e.target.value.toUpperCase())} maxLength={11} autoCapitalize="characters" className={input} data-testid="input-bank-ifsc" /></Field>
              <Field label="Branch (optional)"><input value={form.branch} onChange={(e) => set('branch', e.target.value)} className={input} data-testid="input-bank-branch" /></Field>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={save} disabled={!canSave} className="admin-primary" data-testid="button-save-payment-account">{mutation.isPending ? 'Saving…' : 'Save payment account'}</button>
            {draft && <button type="button" onClick={() => { setDraft(null); setMessage(null); }} className="admin-secondary" data-testid="button-reset-payment-account">Undo changes</button>}
          </div>
          {message && <p className={`rounded-lg px-3 py-2 text-xs ${message.kind === 'ok' ? 'bg-[#e8f3ea] text-[#2f6b44]' : message.kind === 'warn' ? 'bg-[#fff6dd] text-[#7a5a14]' : 'bg-[#fff7f3] text-[#73483b]'}`} role={message.kind === 'error' ? 'alert' : 'status'} data-testid="status-payment-account-message">{message.text}</p>}
        </div>

        <div className="rounded-xl border border-[#eee6d9] bg-white p-4 text-center lg:w-64" data-testid="box-test-qr">
          <p className="text-xs font-bold text-[#263b31]">Test your QR code</p>
          {sampleUri ? (
            <>
              <div className="mt-3 flex justify-center"><UpiQr value={sampleUri} className="h-40 w-40" /></div>
              <p className="mt-2 text-[11px] text-[#77736D]">Scan it with your own phone. Your UPI app should open with <strong>{form.payeeName || 'your name'}</strong> and ₹1. Pay ₹1 once to be sure the money reaches your account.</p>
            </>
          ) : <p className="mt-3 text-xs text-[#77736D]">Enter a valid UPI ID to see a test QR code here.</p>}
        </div>
      </div>
    </section>
  );
}
