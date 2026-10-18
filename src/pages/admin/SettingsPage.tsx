import { useEffect, useState } from 'react';
import { Building2, Database, FileText, Loader2, Save, Wallet } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Field, Input, Switch, Textarea, useUi } from '@/components/ui';
import { backendMode, useBusiness, usePayment, useSaveSettings } from '@/lib/api';
import { sampleQuote } from '@/lib/backend';
import { isValidGstin, isValidIfsc, isValidUpiId } from '@/lib/settings';
import type { BusinessProfile, PaymentSettings } from '@/lib/types';
import { buildBillBlob, openBlob } from '@/pdf/generate';
import { cn } from '@/lib/format';

type Tab = 'business' | 'payment' | 'system';
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'business', label: 'Business & bills', icon: <Building2 size={16} /> },
  { id: 'payment', label: 'Payments', icon: <Wallet size={16} /> },
  { id: 'system', label: 'System', icon: <Database size={16} /> },
];

export function SettingsPage() {
  const { toast, confirm } = useUi();
  const { business, isLoading: bl } = useBusiness();
  const { payment, isLoading: pl } = usePayment();
  const saveBusiness = useSaveSettings('business');
  const savePayment = useSaveSettings('payment');
  const [tab, setTab] = useState<Tab>('business');
  const [b, setB] = useState<BusinessProfile>(business);
  const [p, setP] = useState<PaymentSettings>(payment);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => { if (!bl) setB(business); }, [bl, business]);
  useEffect(() => { if (!pl) setP(payment); }, [pl, payment]);

  const bs = <K extends keyof BusinessProfile>(k: K, v: BusinessProfile[K]) => setB((x) => ({ ...x, [k]: v }));
  const ps = <K extends keyof PaymentSettings>(k: K, v: PaymentSettings[K]) => setP((x) => ({ ...x, [k]: v }));

  // Shrinks the picture to at most 300px so it stays small in the database and in the PDF.
  const pickLogo = async (file: File) => {
    try {
      const url = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that image.')); i.src = url; });
      const scale = Math.min(1, 300 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      bs('logo', c.toDataURL('image/png'));
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not use that image.', 'error'); }
  };

  const submitBusiness = () => {
    if (b.gstin && !isValidGstin(b.gstin)) { toast('That GSTIN does not look valid (15 characters, e.g. 22AAAAA0000A1Z5).', 'error'); return; }
    saveBusiness.mutate(b, { onSuccess: () => toast('Business profile saved.'), onError: (e) => toast(e.message, 'error') });
  };
  const submitPayment = () => {
    if (p.upiId && !isValidUpiId(p.upiId)) { toast('Enter a valid UPI ID, e.g. name@bank.', 'error'); return; }
    if (p.ifsc && !isValidIfsc(p.ifsc)) { toast('IFSC should look like HDFC0001234.', 'error'); return; }
    savePayment.mutate(p, { onSuccess: () => toast('Payment details saved.'), onError: (e) => toast(e.message, 'error') });
  };
  const preview = async () => {
    setPreviewing(true);
    try { openBlob(await buildBillBlob({ ...sampleQuote(), customer: { ...sampleQuote().customer, hall: b.name } }, b, p, 'quotation')); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not create the preview.', 'error'); }
    finally { setPreviewing(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => <button key={t.id} type="button" onClick={() => setTab(t.id)} className={cn('flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors', tab === t.id ? 'bg-gold text-text-on-gold' : 'bg-surface text-text-secondary hover:text-text')}>{t.icon}{t.label}</button>)}
      </div>

      {tab === 'business' && (
        <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
          <Card>
            <CardHeader title="Business profile" subtitle="Printed in the header of every quotation and invoice" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="sm:col-span-2 flex items-center gap-4 rounded-xl border border-border bg-input/50 p-4">
                <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-brand">{b.logo ? <img src={b.logo} alt="Logo" className="size-full object-contain" /> : <span className="text-xs text-text-disabled">No logo</span>}</span>
                <div className="min-w-0 flex-1"><p className="text-sm font-medium text-text">Business logo</p><p className="text-xs text-text-secondary">PNG or JPG, printed in the bill header. Resized automatically.</p></div>
                <label className="cursor-pointer rounded-xl border border-border px-3.5 py-2 text-sm font-medium text-text hover:bg-surface-hover">Upload<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickLogo(f); e.target.value = ''; }} /></label>
                {b.logo && <Button variant="ghost" size="sm" onClick={() => bs('logo', undefined)}>Remove</Button>}
              </div>
              <Field label="Business name" required><Input value={b.name} onChange={(e) => bs('name', e.target.value)} /></Field>
              <Field label="Tagline"><Input value={b.tagline} onChange={(e) => bs('tagline', e.target.value)} placeholder="Venue & Event Management" /></Field>
              <Field label="Address" className="sm:col-span-2"><Textarea value={b.address} onChange={(e) => bs('address', e.target.value)} className="min-h-20" placeholder={'Street, area\nCity, State – PIN'} /></Field>
              <Field label="Phone"><Input value={b.phone} onChange={(e) => bs('phone', e.target.value)} inputMode="tel" /></Field>
              <Field label="Email"><Input type="email" value={b.email} onChange={(e) => bs('email', e.target.value)} /></Field>
              <Field label="Website"><Input value={b.website} onChange={(e) => bs('website', e.target.value)} /></Field>
              <Field label="GSTIN" hint="15 characters"><Input value={b.gstin} onChange={(e) => bs('gstin', e.target.value.toUpperCase().slice(0, 15))} placeholder="22AAAAA0000A1Z5" /></Field>
              <Field label="Signatory title"><Input value={b.signatory} onChange={(e) => bs('signatory', e.target.value)} /></Field>
              <Field label="Footer note"><Input value={b.footerNote} onChange={(e) => bs('footerNote', e.target.value)} /></Field>
              <div className="sm:col-span-2"><Switch checked={b.gstSplit} onChange={(v) => bs('gstSplit', v)} label="Show GST as CGST + SGST" description="Turn off to print a single GST line (use for inter-state billing)" /></div>
              <Field label="Terms & conditions" hint="One per line" className="sm:col-span-2"><Textarea value={b.terms} onChange={(e) => bs('terms', e.target.value)} className="min-h-36" /></Field>
            </div>
            <div className="flex justify-end gap-3 border-t border-border/70 px-5 py-4"><Button variant="gold" onClick={submitBusiness} disabled={saveBusiness.isPending}>{saveBusiness.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save profile</Button></div>
          </Card>
          <Card className="h-fit">
            <CardHeader title="Preview" subtitle="See how your bill looks" />
            <div className="space-y-3 p-5 text-sm text-text-secondary">
              <p>Opens a sample quotation using the details on the left (even before you save).</p>
              <Button variant="outline" className="w-full" onClick={preview} disabled={previewing}>{previewing ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} Preview sample PDF</Button>
            </div>
          </Card>
        </div>
      )}

      {tab === 'payment' && (
        <Card className="max-w-3xl">
          <CardHeader title="Payment account" subtitle="Used for the UPI QR and printed on bills with a balance due. Only admins can see this." />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="UPI ID" hint="e.g. venue@okhdfcbank"><Input value={p.upiId} onChange={(e) => ps('upiId', e.target.value.trim())} /></Field>
            <Field label="Payee name"><Input value={p.payeeName} onChange={(e) => ps('payeeName', e.target.value)} /></Field>
            <div className="gold-rule sm:col-span-2" />
            <Field label="Account holder"><Input value={p.accountHolder} onChange={(e) => ps('accountHolder', e.target.value)} /></Field>
            <Field label="Bank name"><Input value={p.bankName} onChange={(e) => ps('bankName', e.target.value)} /></Field>
            <Field label="Account number"><Input value={p.accountNumber} onChange={(e) => ps('accountNumber', e.target.value)} inputMode="numeric" /></Field>
            <Field label="IFSC"><Input value={p.ifsc} onChange={(e) => ps('ifsc', e.target.value.toUpperCase())} /></Field>
            <Field label="Branch" className="sm:col-span-2"><Input value={p.branch} onChange={(e) => ps('branch', e.target.value)} /></Field>
          </div>
          <div className="flex justify-end border-t border-border/70 px-5 py-4"><Button variant="gold" onClick={submitPayment} disabled={savePayment.isPending}>{savePayment.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save payment details</Button></div>
        </Card>
      )}

      {tab === 'system' && (
        <Card className="max-w-3xl">
          <CardHeader title="System" subtitle="Where your data lives" />
          <div className="space-y-5 p-5 text-sm">
            <div className="flex items-center justify-between gap-4"><div><p className="font-medium text-text">Data store</p><p className="text-xs text-text-secondary">{backendMode() === 'supabase' ? 'Connected to Supabase.' : 'Connected to the Hostinger API.'}</p></div><Badge tone="success">{backendMode() === 'api' ? 'Hostinger' : 'Supabase'}</Badge></div>
          </div>
        </Card>
      )}
    </div>
  );
}
