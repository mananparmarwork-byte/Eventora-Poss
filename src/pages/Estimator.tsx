import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowLeft, Check, ChevronRight, Copy, Download, Loader2, LogIn, MessageCircle, Minus, Plus, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import { Brand } from '@/components/Logo';
import { Button, Card, Field, Input, Select, Spinner, Switch, useUi } from '@/components/ui';
import { DatePicker } from '@/components/DatePicker';
import { useBookedTimes, useBusiness, useCatalog, useCreateQuote, useNextBillNumber, usePayment, usePermissions, useQuote, useSession, useUpdateQuote } from '@/lib/api';
import { hasAnySlots, isRangeComplete, isRangeValid, normalizeEventSlots, normalizeRange, occupancyEntries, rangesOverlap, rangesText, scheduleLines } from '@/lib/booking';
import { cn, formatEventDates, inr, localISODate, num, parseEventDates } from '@/lib/format';
import { computeTotals, discountLabel, lineTotal, quoteAdvance, quoteDates } from '@/lib/pricing';
import { whatsappLink } from '@/lib/settings';
import type { CatalogCategory, CatalogItem, EventSlots, Quote, QuoteInput, TimeRange } from '@/lib/types';
import { billFileName, buildBillBlob, saveBlob } from '@/pdf/generate';

const EVENT_TYPES = ['Wedding', 'Reception', 'Engagement', 'Birthday', 'Anniversary', 'Corporate', 'Other'];
const DRAFT_KEY = 'eventora-estimate-draft-v1';

type Details = { name: string; mobile: string; eventType: string; otherEventType: string; eventDate: string; guests: string; billNumber: string; customerGstNumber: string };
const INITIAL: Details = { name: '', mobile: '', eventType: '', otherEventType: '', eventDate: '', guests: '150', billNumber: '', customerGstNumber: '' };
type Errors = Partial<Record<keyof Details, string>>;

type Draft = {
  details: Details; selections: Record<string, number>; gstEnabled: boolean; gstRate: number; gstVisible: boolean; custGstVisible: boolean;
  slots: EventSlots; showCostPerGuest: boolean; discountEnabled: boolean; discountPercent: string; discountFlat: string; advancePaid: boolean; advanceAmount: string;
};

const eventTypeLabel = (d: Details) => (d.eventType === 'Other' ? d.otherEventType.trim() || 'Other' : d.eventType);

export function Estimator({ embedded = false, editRef = '' }: { embedded?: boolean; editRef?: string }) {
  const { toast, confirm } = useUi();
  const [, navigate] = useLocation();
  const { session, isAdmin } = useSession();
  const { permissions } = usePermissions();
  const { business } = useBusiness();
  const { payment } = usePayment();
  const catalogQuery = useCatalog();
  const bookedQuery = useBookedTimes();
  const nextBill = useNextBillNumber(Boolean(session) && !editRef);
  const createQuote = useCreateQuote();
  const updateQuote = useUpdateQuote();
  const editing = Boolean(editRef);
  const editQuery = useQuote(editRef, editing);

  const [details, setDetails] = useState<Details>(INITIAL);
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({});
  const [gstEnabled, setGstEnabled] = useState(true);
  const [gstRate, setGstRate] = useState(5);
  const [gstVisible, setGstVisible] = useState(true);
  const [custGstVisible, setCustGstVisible] = useState(true);
  const [slots, setSlots] = useState<EventSlots>({});
  const [showCostPerGuest, setShowCostPerGuest] = useState(true);
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountPercent, setDiscountPercent] = useState('');
  const [discountFlat, setDiscountFlat] = useState('');
  const [advancePaid, setAdvancePaid] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [activeCat, setActiveCat] = useState('');
  const [saved, setSaved] = useState<Quote | null>(null);
  const [editQuote, setEditQuote] = useState<Quote | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  /* ---- draft handling: a new quote is remembered on this device; an edit never touches it ---- */
  useEffect(() => {
    try {
      const raw = editing ? null : window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Partial<Draft>;
        if (d.details) setDetails((cur) => ({ ...cur, ...d.details, billNumber: '' }));
        if (d.selections) setSelections(d.selections);
        if (typeof d.gstEnabled === 'boolean') setGstEnabled(d.gstEnabled);
        if (typeof d.gstRate === 'number') setGstRate(Math.min(28, Math.max(0, d.gstRate)));
        if (typeof d.gstVisible === 'boolean') setGstVisible(d.gstVisible);
        if (typeof d.custGstVisible === 'boolean') setCustGstVisible(d.custGstVisible);
        if (d.slots) setSlots(normalizeEventSlots(d.slots));
        if (typeof d.showCostPerGuest === 'boolean') setShowCostPerGuest(d.showCostPerGuest);
        if (typeof d.discountEnabled === 'boolean') setDiscountEnabled(d.discountEnabled);
        if (typeof d.discountPercent === 'string') setDiscountPercent(d.discountPercent);
        if (typeof d.discountFlat === 'string') setDiscountFlat(d.discountFlat);
        if (typeof d.advancePaid === 'boolean') setAdvancePaid(d.advancePaid);
        if (typeof d.advanceAmount === 'string') setAdvanceAmount(d.advanceAmount);
      }
    } catch { try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } }
    setHydrated(true);
  }, [editing]);

  useEffect(() => {
    if (!hydrated || editing || saved) return;
    try {
      const draft: Draft = { details, selections, gstEnabled, gstRate, gstVisible, custGstVisible, slots, showCostPerGuest, discountEnabled, discountPercent, discountFlat, advancePaid, advanceAmount };
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch { /* storage blocked: the form still works */ }
  }, [details, selections, gstEnabled, gstRate, gstVisible, custGstVisible, slots, showCostPerGuest, discountEnabled, discountPercent, discountFlat, advancePaid, advanceAmount, hydrated, editing, saved]);

  /* ---- bill number: filled in automatically (read-only for employees). The owner may type their own. ---- */
  const autoNumber = nextBill.data ?? '';
  const shownNumber = editing ? details.billNumber : details.billNumber || autoNumber;
  const ownerOverride = isAdmin && !editing && details.billNumber.trim() !== '' && details.billNumber.trim() !== autoNumber ? details.billNumber.trim() : '';

  /* ---- load a saved bill for editing ---- */
  useEffect(() => {
    const q = editQuery.data;
    if (!q || editQuote) return;
    setEditQuote(q);
    const known = EVENT_TYPES.includes(q.customer.eventType) && q.customer.eventType !== 'Other';
    setDetails({ name: q.customer.name, mobile: q.customer.mobile, eventType: known ? q.customer.eventType : 'Other', otherEventType: known || q.customer.eventType === 'Other' ? '' : q.customer.eventType, eventDate: quoteDates(q.customer).join(','), guests: String(q.customer.guests), billNumber: q.reference, customerGstNumber: q.customer.gstNumber ?? '' });
    setSelections(Object.fromEntries(q.services.map((s) => [s.id, s.pricingType === 'perUnit' ? s.quantity : 1])));
    setPriceOverrides(Object.fromEntries(q.services.map((s) => [s.id, s.unitPrice])));
    setGstEnabled(q.pricing.gstEnabled);
    setGstRate(Math.min(28, Math.max(0, Number(q.pricing.gstRate) || 0)));
    setGstVisible(q.pricing.gstNumberVisible);
    setCustGstVisible(q.pricing.customerGstNumberVisible !== false);
    setShowCostPerGuest(q.pricing.showCostPerGuest !== false);
    setSlots(normalizeEventSlots(q.customer.eventSlots));
    const hadDiscount = Boolean(q.pricing.discountEnabled) && (q.pricing.discountAmount ?? 0) > 0;
    setDiscountEnabled(hadDiscount);
    setDiscountPercent(hadDiscount && q.pricing.discountPercent ? String(q.pricing.discountPercent) : '');
    setDiscountFlat(hadDiscount && q.pricing.discountFlat ? String(q.pricing.discountFlat) : '');
    const adv = quoteAdvance(q.pricing);
    setAdvancePaid(adv.paid);
    setAdvanceAmount(adv.paid ? String(adv.amount) : '');
  }, [editQuery.data, editQuote]);

  /* ---- catalog (+ services saved on an old bill that are no longer in the catalog) ---- */
  const catalog = useMemo<CatalogCategory[]>(() => {
    const base = catalogQuery.data ?? [];
    if (!editQuote) return base;
    const known = new Set(base.flatMap((c) => c.subcategories.flatMap((s) => s.items.map((i) => i.id))));
    const missing = editQuote.services.filter((s) => !known.has(s.id));
    if (!missing.length) return base;
    const items: CatalogItem[] = missing.map((s) => ({ id: s.id, name: s.name, description: s.description ?? '', categoryId: base.find((c) => c.name === s.category)?.id ?? 'on-this-bill', subcategoryId: 'on-this-bill', price: s.unitPrice, pricingType: s.pricingType, active: true, minQuantity: 1, maxQuantity: 999 }));
    return [...base, { id: 'on-this-bill', name: 'On this bill', description: 'Saved on this bill but no longer in the catalog.', subcategories: [{ id: 'on-this-bill', name: 'Saved services', items }] }];
  }, [catalogQuery.data, editQuote]);

  useEffect(() => { if (!activeCat && catalog.length) setActiveCat(catalog[0].id); }, [catalog, activeCat]);

  const guests = Number(details.guests) || 0;
  const dates = parseEventDates(details.eventDate);
  const slotsForDates: EventSlots = Object.fromEntries(dates.map((d) => [d, normalizeRange(slots[d])]));

  const lines = useMemo(() => catalog.flatMap((cat) => cat.subcategories.flatMap((sub) => sub.items.filter((i) => i.active).map((i) => ({ i, cat, sub })))).flatMap(({ i, cat, sub }) => {
    const raw = selections[i.id] ?? 0;
    if (!raw) return [];
    const quantity = i.pricingType === 'perUnit' ? Math.min(i.maxQuantity, Math.max(i.minQuantity, raw)) : 1;
    const price = priceOverrides[i.id] ?? i.price;
    return [{ ...i, price, quantity, categoryName: cat.name, subcategoryName: sub.name, total: lineTotal(i.pricingType, price, guests, quantity) }];
  }), [catalog, selections, priceOverrides, guests]);

  const totals = computeTotals({
    lines: lines.map((l) => ({ categoryId: l.categoryId, pricingType: l.pricingType, price: l.price, total: l.total })),
    gstEnabled, gstRate, discountEnabled, discountPercent: Number(discountPercent) || 0, discountFlat: Number(discountFlat) || 0, guests,
    advancePaid, advanceAmount: Number(advanceAmount) || 0,
  });

  /* ---- booked times (a bill being edited must not clash with itself) ---- */
  const booked = useMemo(() => {
    const raw: Record<string, TimeRange[]> = JSON.parse(JSON.stringify(bookedQuery.data ?? {}));
    if (editQuote?.status === 'confirmed') {
      occupancyEntries(quoteDates(editQuote.customer), editQuote.customer.eventSlots).forEach(({ date, range }) => {
        const list = raw[date] ?? [];
        const idx = list.findIndex((r) => r.start === range.start && r.end === range.end);
        if (idx >= 0) list.splice(idx, 1);
        raw[date] = list;
      });
    }
    return raw;
  }, [bookedQuery.data, editQuote]);

  const set = (field: keyof Details, value: string) => {
    setDetails((d) => ({ ...d, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const validate = () => {
    const e: Errors = {};
    if (!details.name.trim()) e.name = 'Please enter the customer name.';
    if (!/^[6-9]\d{9}$/.test(details.mobile.replace(/\D/g, '').slice(-10))) e.mobile = 'Enter a valid 10-digit mobile number.';
    if (!details.eventType) e.eventType = 'Choose an event type.';
    if (details.eventType === 'Other' && !details.otherEventType.trim()) e.otherEventType = 'Describe the occasion.';
    const oldDates = editQuote ? quoteDates(editQuote.customer) : [];
    if (!dates.length) e.eventDate = 'Choose at least one event date.';
    else if (dates.some((d) => d < localISODate(new Date()) && !oldDates.includes(d))) e.eventDate = 'Choose future dates only.';
    else {
      const missing = dates.find((d) => !isRangeComplete(slotsForDates[d]));
      const bad = dates.find((d) => isRangeComplete(slotsForDates[d]) && !isRangeValid(slotsForDates[d]));
      if (missing) e.eventDate = `Enter the start and end time for ${formatEventDates([missing])}.`;
      else if (bad) e.eventDate = `End time must be after the start time on ${formatEventDates([bad])}.`;
      else {
        const clash = dates.find((d) => (booked[d] ?? []).some((t) => rangesOverlap(slotsForDates[d] as TimeRange, t)));
        if (clash) e.eventDate = `${formatEventDates([clash])} is already booked for ${rangesText((booked[clash] ?? []).filter((t) => rangesOverlap(slotsForDates[clash] as TimeRange, t)))}. Please change the time.`;
      }
    }
    if (!Number.isInteger(guests) || guests <= 0) e.guests = 'Guests must be more than zero.';
    if (editing && !details.billNumber.trim()) e.billNumber = 'Enter a bill number.';
    setErrors(e);
    if (Object.keys(e).length) toast('Please fix the highlighted fields.', 'error');
    return Object.keys(e).length === 0;
  };

  const buildInput = (): QuoteInput => ({
    reference: ownerOverride || shownNumber.trim() || 'Assigned on save',
    customer: { name: details.name.trim(), mobile: details.mobile.trim(), eventType: eventTypeLabel(details), eventDate: dates[0] ?? '', eventDates: dates, eventSlots: slotsForDates, guests, gstNumber: details.customerGstNumber.trim(), hall: business.name },
    services: lines.map((l) => ({ id: l.id, name: l.name, category: l.categoryName, subcategory: l.subcategoryName, pricingType: l.pricingType, quantity: l.quantity, unitPrice: l.price, total: l.total, description: l.description })),
    pricing: {
      foodPerPlate: totals.foodPerPlate, subtotal: totals.subtotal, gstEnabled, gstRate, gstAmount: totals.gstAmount, gstNumber: business.gstin, gstNumberVisible: gstVisible, customerGstNumberVisible: custGstVisible,
      showCostPerGuest, discountEnabled: totals.discountAmount > 0, discountPercent: totals.discountPercent, discountFlat: totals.discountFlat, discountAmount: totals.discountAmount,
      grandTotal: totals.grandTotal, costPerGuest: totals.costPerGuest, advancePaid: totals.advance.paid, advanceAmount: totals.advance.amount, balanceDue: totals.advance.balance,
      payments: editQuote?.pricing.payments ?? [],
    },
  });

  const draftQuote = (): Quote => {
    const input = buildInput();
    const base = saved ?? editQuote;
    return base ? { ...base, ...input, pricing: { ...input.pricing, eventDates: dates, eventSlots: slotsForDates } } : { ...input, id: 'draft', createdAt: new Date().toISOString(), status: 'new' };
  };

  const save = () => {
    if (editing && !editQuote) return;
    if (!validate()) return;
    const input = buildInput();
    const done = (q: Quote) => {
      setSaved(q);
      try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      toast(editing ? 'Changes saved.' : `Bill ${q.reference} saved.`);
    };
    if (editing) updateQuote.mutate({ reference: editRef, input, before: editQuote as Quote }, { onSuccess: () => done({ ...(editQuote as Quote), ...input }), onError: (err) => toast(err.message, 'error') });
    else createQuote.mutate({ input, overrideRef: ownerOverride || undefined }, { onSuccess: (q) => done(q), onError: (err) => toast(err.message, 'error') });
  };

  const downloadPdf = async () => {
    if (!dates.length || !details.name.trim()) { toast('Add the customer name and event date first.', 'error'); return; }
    setPdfBusy(true);
    try {
      const q = draftQuote();
      saveBlob(await buildBillBlob(q, business, payment, 'quotation'), billFileName(q, 'quotation'));
    } catch (err) { toast(err instanceof Error ? err.message : 'Could not create the PDF.', 'error'); }
    finally { setPdfBusy(false); }
  };

  const message = () => {
    const sched = scheduleLines(dates, slotsForDates).map((l) => `${formatEventDates([l.date])}: ${l.text}`).join('\n');
    const svc = lines.map((l) => `• ${l.name}${l.pricingType === 'perPerson' ? ` (${guests} guests)` : l.pricingType === 'perUnit' ? ` (qty ${l.quantity})` : ''}: ${inr(l.total)}`).join('\n');
    return [
      `Hello ${business.name}, I would like to discuss this quotation.`, '',
      `Bill No: ${shownNumber || '—'}`, `Customer: ${details.name || '—'}`, `Mobile: ${details.mobile || '—'}`, `Event: ${eventTypeLabel(details) || '—'}`, sched, `Guests: ${guests}`, '',
      svc || 'No services selected', '',
      `Subtotal: ${inr(totals.subtotal)}`, totals.discountAmount > 0 ? `${discountLabel(totals.discountPercent, totals.discountFlat)}: -${inr(totals.discountAmount)}` : '', gstEnabled ? `GST (${gstRate}%): ${inr(totals.gstAmount)}` : '',
      `Grand total: ${inr(totals.grandTotal)}`, totals.advance.paid ? `Advance paid: ${inr(totals.advance.amount)}\nBalance: ${inr(totals.advance.balance)}` : '',
    ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  };

  const sendWhatsApp = () => { const w = window.open(whatsappLink(details.mobile, message()), '_blank'); if (!w) window.location.assign(whatsappLink(details.mobile, message())); };
  const copy = async () => { try { await navigator.clipboard.writeText(message()); toast('Quotation text copied.'); } catch { toast('Copy is blocked in this browser.', 'error'); } };
  const reset = async () => { if (!(await confirm({ title: 'Reset this quotation?', text: 'All details and selections will be cleared.', confirmLabel: 'Reset', danger: true }))) return; setDetails(INITIAL); setSelections({}); setSlots({}); setDiscountEnabled(false); setDiscountPercent(''); setDiscountFlat(''); setAdvancePaid(false); setAdvanceAmount(''); setErrors({}); setSaved(null); };

  const toggleItem = (item: CatalogItem, on: boolean) => setSelections((s) => { const n = { ...s }; if (on) n[item.id] = item.pricingType === 'perUnit' ? item.minQuantity : 1; else delete n[item.id]; return n; });
  const setQty = (item: CatalogItem, q: number) => setSelections((s) => ({ ...s, [item.id]: Math.min(item.maxQuantity, Math.max(item.minQuantity, q)) }));

  if (editing && editQuery.isLoading) return <Spinner label="Loading the saved bill" />;
  if (editing && !editQuery.isLoading && !editQuery.data) return <Card className="p-10 text-center"><p className="text-text">That bill could not be found.</p><Link href="/admin/quotes" className="mt-3 inline-block text-sm text-gold hover:underline">Back to quotations</Link></Card>;

  const saving = createQuote.isPending || updateQuote.isPending;
  const cat = catalog.find((c) => c.id === activeCat) ?? catalog[0];
  const countIn = (c: CatalogCategory) => c.subcategories.reduce((a, s) => a + s.items.filter((i) => selections[i.id]).length, 0);
  const unit = (t: string) => (t === 'perPerson' ? '/ plate' : t === 'perUnit' ? '/ unit' : 'fixed');

  const body = (
    <div className={cn('grid gap-6 xl:grid-cols-[1fr_400px]', !embedded && 'mx-auto max-w-[1280px] px-4 py-8 sm:px-8')}>
      <div className="min-w-0 space-y-6">
        {!embedded && (
          <div className="fade-up">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Event estimator</p>
            <h1 className="mt-2 font-display text-3xl font-semibold leading-tight text-text sm:text-4xl">Plan the celebration, see the price instantly.</h1>
            <p className="mt-2 max-w-xl text-sm text-text-secondary">Choose your services, set the guest count and dates, and download a professional quotation.</p>
          </div>
        )}
        {editing && editQuote && <div className="flex items-center gap-2 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold"><ShieldCheck size={16} /> Editing bill <strong>{editQuote.reference}</strong>. The bill number and booking status stay the same.</div>}

        {/* 1 — event details */}
        <Card>
          <div className="border-b border-border/70 px-5 py-4"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">Step 1</p><h2 className="text-base font-semibold text-text">Event details</h2></div>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Customer name" required error={errors.name}><Input value={details.name} onChange={(e) => set('name', e.target.value)} placeholder="Full name" autoComplete="name" /></Field>
            <Field label="Mobile number" required error={errors.mobile} hint="10 digits"><Input value={details.mobile} onChange={(e) => set('mobile', e.target.value)} inputMode="tel" placeholder="98765 43210" autoComplete="tel" /></Field>
            <Field label="Event type" required error={errors.eventType}>
              <Select value={details.eventType} onChange={(e) => set('eventType', e.target.value)}><option value="">Choose event type</option>{EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}</Select>
            </Field>
            {details.eventType === 'Other' ? <Field label="Occasion" required error={errors.otherEventType}><Input value={details.otherEventType} onChange={(e) => set('otherEventType', e.target.value)} placeholder="e.g. Baby shower" /></Field> : <div className="hidden sm:block" />}
            <Field label="Number of guests" required error={errors.guests} hint="Food is priced per guest"><Input type="number" min={1} value={details.guests} onChange={(e) => set('guests', e.target.value)} inputMode="numeric" /></Field>
            <Field label="Bill number" error={errors.billNumber} hint={editing ? 'Locked' : isAdmin ? 'Automatic · you can change it' : session ? 'Automatic' : 'Given when saved'}>
              <Input value={shownNumber} onChange={(e) => set('billNumber', e.target.value)} readOnly={!isAdmin || editing} disabled={editing || !session} placeholder={session ? 'Loading…' : 'Assigned when saved'} className={cn('font-mono', (!isAdmin || editing) && 'cursor-not-allowed text-gold')} aria-readonly={!isAdmin || editing} />
            </Field>
            <Field as="div" label="Event date & time" required className="sm:col-span-2"><DatePicker value={details.eventDate} slots={slots} booked={booked} error={errors.eventDate} allowPast={editQuote ? quoteDates(editQuote.customer) : []} onChange={(v) => { set('eventDate', v); }} onSlotsChange={setSlots} /></Field>
            <Field label="Customer GST number" hint="Optional · shown on the bill"><Input value={details.customerGstNumber} onChange={(e) => set('customerGstNumber', e.target.value.toUpperCase().slice(0, 15))} placeholder="22AAAAA0000A1Z5" /></Field>
          </div>
        </Card>

        {/* 2 — services */}
        <Card>
          <div className="border-b border-border/70 px-5 py-4"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">Step 2</p><h2 className="text-base font-semibold text-text">Choose services</h2></div>
          {catalogQuery.isLoading ? <Spinner label="Loading catalog" /> : (
            <>
              <div className="flex gap-2 overflow-x-auto border-b border-border/70 px-4 py-3" role="tablist">
                {catalog.map((c) => {
                  const n = countIn(c);
                  return (
                    <button key={c.id} role="tab" aria-selected={c.id === cat?.id} type="button" onClick={() => setActiveCat(c.id)}
                      className={cn('flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors', c.id === cat?.id ? 'bg-gold text-text-on-gold' : 'bg-input text-text-secondary hover:text-text')}>
                      {c.name}{n > 0 && <span className={cn('grid min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold', c.id === cat?.id ? 'bg-obsidian/15' : 'bg-gold/20 text-gold')}>{n}</span>}
                    </button>
                  );
                })}
              </div>
              {cat && (
                <div className="space-y-6 p-5">
                  <p className="text-sm text-text-secondary">{cat.description}</p>
                  {cat.subcategories.map((sub) => (
                    <section key={sub.id}>
                      <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">{sub.name}</h3>
                      <div className="space-y-2.5">
                        {sub.items.filter((i) => i.active).map((item) => {
                          const on = Boolean(selections[item.id]);
                          const price = priceOverrides[item.id] ?? item.price;
                          return (
                            <div key={item.id} className={cn('flex flex-col gap-3 rounded-xl border p-4 transition-colors sm:flex-row sm:items-center', on ? 'border-gold/60 bg-gold/[0.06]' : 'border-border bg-input/40 hover:border-steel-blue/60')}>
                              <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                                <input type="checkbox" checked={on} onChange={(e) => toggleItem(item, e.target.checked)} className="mt-1 size-4 accent-[#E6B84A]" aria-label={`Select ${item.name}`} />
                                <span className="min-w-0"><span className="block text-sm font-semibold text-text">{item.name}</span><span className="mt-0.5 block text-xs text-text-secondary">{item.description}</span></span>
                              </label>
                              <div className="flex items-center justify-between gap-4 sm:justify-end">
                                {on && item.pricingType === 'perUnit' && (
                                  <div className="flex items-center rounded-lg border border-border bg-input">
                                    <button type="button" aria-label="Decrease" onClick={() => setQty(item, (selections[item.id] ?? 1) - 1)} className="grid size-8 place-items-center text-text-secondary hover:text-text"><Minus size={14} /></button>
                                    <span className="w-8 text-center text-sm font-semibold tabular">{selections[item.id]}</span>
                                    <button type="button" aria-label="Increase" onClick={() => setQty(item, (selections[item.id] ?? 1) + 1)} className="grid size-8 place-items-center text-text-secondary hover:text-text"><Plus size={14} /></button>
                                  </div>
                                )}
                                <span className="text-right"><span className="block text-sm font-semibold text-text tabular">{inr(price)}</span><span className="block text-[11px] text-text-disabled">{unit(item.pricingType)}</span></span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </>
          )}
        </Card>

        {/* 3 — pricing options */}
        <Card>
          <div className="border-b border-border/70 px-5 py-4"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">Step 3</p><h2 className="text-base font-semibold text-text">Pricing options</h2></div>
          <div className="grid gap-6 p-5 lg:grid-cols-2">
            <div className="space-y-4">
              <Switch checked={discountEnabled} onChange={setDiscountEnabled} disabled={!isAdmin && !permissions.discounts} label="Apply a discount" description={!isAdmin && !permissions.discounts ? 'Only the owner can give discounts' : 'Taken off the subtotal before GST'} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Percentage" hint="e.g. 10"><Input type="number" min={0} max={100} value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} disabled={!discountEnabled} /></Field>
                <Field label="Flat amount (₹)"><Input type="number" min={0} value={discountFlat} onChange={(e) => setDiscountFlat(e.target.value)} disabled={!discountEnabled} /></Field>
              </div>
            </div>
            <div className="space-y-4">
              <Switch checked={gstEnabled} onChange={setGstEnabled} label="Charge GST" description={business.gstin ? `Your GSTIN: ${business.gstin}` : 'Add your GSTIN in Settings to print it on bills'} />
              <Field label="GST rate (%)"><Input type="number" min={0} max={28} step={0.5} value={gstRate} onChange={(e) => setGstRate(Math.min(28, Math.max(0, Number(e.target.value) || 0)))} disabled={!gstEnabled} /></Field>
              <Switch checked={gstVisible} onChange={setGstVisible} label="Show my GSTIN on the bill" />
              <Switch checked={custGstVisible} onChange={setCustGstVisible} label="Show customer GSTIN on the bill" />
              <Switch checked={showCostPerGuest} onChange={setShowCostPerGuest} label="Show cost per guest" />
            </div>
            <div className="space-y-4 lg:col-span-2">
              <div className="gold-rule" />
              <Switch checked={advancePaid} onChange={setAdvancePaid} label="Advance payment received" description="Shown as received, with the balance due" />
              <Field label="Advance amount (₹)" className="max-w-xs"><Input type="number" min={0} value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} disabled={!advancePaid} /></Field>
            </div>
          </div>
        </Card>
      </div>

      {/* summary */}
      <aside ref={summaryRef} id="summary" className="min-w-0 xl:sticky xl:top-24 xl:self-start">
        <Card className="overflow-hidden border-gold/25">
          <div className="border-b border-border/70 bg-brand px-5 py-4"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">Live estimate</p><h2 className="font-display text-xl font-semibold text-text">Your celebration</h2></div>
          <div className="space-y-5 p-5">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {[['Customer', details.name || '—'], ['Occasion', eventTypeLabel(details) || '—'], [dates.length > 1 ? 'Dates' : 'Date', dates.length ? formatEventDates(dates) : '—'], ['Guests', guests ? `${num(guests)} guests` : '—']].map(([k, v]) => (
                <div key={k}><dt className="text-[11px] uppercase tracking-wide text-text-disabled">{k}</dt><dd className="mt-0.5 truncate font-medium text-text">{v}</dd></div>
              ))}
              {hasAnySlots(slotsForDates) && <div className="col-span-2"><dt className="text-[11px] uppercase tracking-wide text-text-disabled">Event time</dt>{scheduleLines(dates, slotsForDates).map((l) => <dd key={l.date} className="mt-0.5 text-xs text-text">{dates.length > 1 && `${formatEventDates([l.date])}: `}{l.text}</dd>)}</div>}
            </dl>
            <div className="gold-rule" />
            {lines.length === 0 ? <p className="py-3 text-center text-sm text-text-secondary">Select services to build your estimate.</p> : (
              <ul className="space-y-2.5">
                {lines.map((l) => (
                  <li key={l.id} className="flex items-start justify-between gap-3 text-sm">
                    <span className="min-w-0"><span className="block truncate text-text">{l.name}</span><span className="block text-[11px] text-text-disabled">{l.pricingType === 'perPerson' ? `${inr(l.price)} × ${num(guests)} guests` : l.pricingType === 'perUnit' ? `${inr(l.price)} × ${l.quantity}` : l.categoryName}</span></span>
                    <span className="shrink-0 font-medium tabular text-text">{inr(l.total)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="space-y-2 rounded-xl bg-input p-4 text-sm">
              <div className="flex justify-between text-text-secondary"><span>Subtotal</span><span className="tabular">{inr(totals.subtotal)}</span></div>
              {totals.discountAmount > 0 && <div className="flex justify-between text-success"><span>{discountLabel(totals.discountPercent, totals.discountFlat)}</span><span className="tabular">− {inr(totals.discountAmount)}</span></div>}
              {gstEnabled && <div className="flex justify-between text-text-secondary"><span>GST ({gstRate}%)</span><span className="tabular">{inr(totals.gstAmount)}</span></div>}
              <div className="flex items-end justify-between border-t border-border pt-3"><span className="text-xs uppercase tracking-wide text-text-secondary">Grand total</span><span className="text-2xl font-semibold text-gold tabular">{inr(totals.grandTotal)}</span></div>
              {totals.advance.paid && <><div className="flex justify-between text-success"><span>Advance paid</span><span className="tabular">− {inr(totals.advance.amount)}</span></div><div className="flex justify-between font-semibold text-text"><span>Balance to pay</span><span className="tabular">{inr(totals.advance.balance)}</span></div></>}
              {showCostPerGuest && guests > 0 && <p className="pt-1 text-right text-[11px] text-text-disabled">≈ {inr(totals.costPerGuest)} per guest</p>}
            </div>

            {saved ? (
              <div className="rounded-xl border border-success/30 bg-success-bg p-4 text-sm text-success"><p className="flex items-center gap-2 font-semibold"><Check size={16} /> Saved as {saved.reference}</p></div>
            ) : (
              <Button variant="gold" size="lg" className="w-full" onClick={save} disabled={saving}>{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {editing ? 'Save changes' : 'Save quotation'}</Button>
            )}
            <div className="grid grid-cols-2 gap-2.5">
              <Button variant="outline" onClick={downloadPdf} disabled={pdfBusy}>{pdfBusy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} PDF</Button>
              <Button variant="outline" onClick={sendWhatsApp}><MessageCircle size={15} /> WhatsApp</Button>
              <Button variant="ghost" onClick={copy}><Copy size={15} /> Copy text</Button>
              {saved || editing ? <Button variant="ghost" onClick={() => navigate(embedded ? `/admin/quotes/${encodeURIComponent((saved ?? editQuote)?.reference ?? '')}` : '/')}><ChevronRight size={15} /> Open bill</Button> : <Button variant="ghost" onClick={reset}><RotateCcw size={15} /> Reset</Button>}
            </div>
            {saved && !editing && <Button variant="soft" className="w-full" onClick={() => { setSaved(null); setDetails(INITIAL); setSelections({}); setSlots({}); setAdvancePaid(false); setAdvanceAmount(''); setDiscountEnabled(false); setDiscountPercent(''); setDiscountFlat(''); }}><Plus size={15} /> Start another</Button>}
          </div>
        </Card>
      </aside>

      {/* mobile total bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-border bg-sidebar/95 px-4 py-3 backdrop-blur xl:hidden">
        <div><p className="text-[10px] uppercase tracking-wide text-text-secondary">Grand total</p><p className="text-lg font-semibold text-gold tabular">{inr(totals.grandTotal)}</p></div>
        <Button variant="gold" onClick={() => summaryRef.current?.scrollIntoView({ behavior: 'smooth' })}>Review & save</Button>
      </div>
    </div>
  );

  if (embedded) return <div className="pb-20 xl:pb-0">{body}</div>;
  return (
    <div className="min-h-dvh bg-page pb-20 xl:pb-0">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-page/85 backdrop-blur-md">
        <div className="mx-auto flex h-[72px] max-w-[1280px] items-center justify-between px-4 sm:px-8">
          <Brand subtitle="Event estimator" />
          <div className="flex items-center gap-3">
            {session ? <Link href="/admin"><Button variant="outline" size="sm"><ArrowLeft size={14} /> Dashboard</Button></Link> : <Link href="/login"><Button variant="ghost" size="sm"><LogIn size={14} /> Admin</Button></Link>}
          </div>
        </div>
      </header>
      {body}
    </div>
  );
}
