import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowLeft, CalendarCheck, Download, FileText, Loader2, MessageCircle, Pencil, Plus, Search, Trash2, Undo2 } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, Input, Spinner, useUi } from '@/components/ui';
import { PaymentBadge, StatusBadge } from '@/components/PaymentBadge';
import { PaymentPanel } from '@/components/PaymentPanel';
import { useBusiness, useDeleteQuote, usePayment, usePermissions, useQuote, useQuotes, useSession, useSetStatus } from '@/lib/api';
import { fmtDate, formatEventDates, inr, num, cn } from '@/lib/format';
import { durationText, findConflicts, scheduleLines, timeText } from '@/lib/booking';
import { discountLabel, quoteAdvance, quoteDates, quotePaymentState } from '@/lib/pricing';
import { whatsappLink } from '@/lib/settings';
import type { Quote } from '@/lib/types';
import { billFileName, buildBillBlob, saveBlob } from '@/pdf/generate';
import type { BillKind } from '@/pdf/BillDocument';

type Filter = 'all' | 'open' | 'booked' | 'due' | 'paid';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'open', label: 'Enquiries' }, { id: 'booked', label: 'Booked' }, { id: 'due', label: 'Payment due' }, { id: 'paid', label: 'Paid' },
];

function QuoteList() {
  const { data: quotes = [], isLoading, error } = useQuotes();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [, navigate] = useLocation();

  const rows = useMemo(() => quotes.filter((q) => {
    const pay = quotePaymentState(q.pricing).state;
    if (filter === 'open' && q.status === 'confirmed') return false;
    if (filter === 'booked' && q.status !== 'confirmed') return false;
    if (filter === 'due' && (pay === 'paid' || q.status !== 'confirmed')) return false;
    if (filter === 'paid' && pay !== 'paid') return false;
    const s = search.trim().toLowerCase();
    return !s || [q.reference, q.customer.name, q.customer.mobile, q.customer.eventType].some((v) => v.toLowerCase().includes(s));
  }), [quotes, filter, search]);

  if (isLoading) return <Spinner label="Loading quotations" />;
  if (error) return <Card className="p-8 text-center text-sm text-error">Could not load quotations: {(error as Error).message}</Card>;

  const count = (f: Filter) => quotes.filter((q) => {
    const pay = quotePaymentState(q.pricing).state;
    return f === 'all' || (f === 'open' && q.status !== 'confirmed') || (f === 'booked' && q.status === 'confirmed') || (f === 'due' && pay !== 'paid' && q.status === 'confirmed') || (f === 'paid' && pay === 'paid');
  }).length;

  return (
    <Card>
      <div className="flex flex-col gap-4 border-b border-border/70 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" onClick={() => setFilter(f.id)} className={cn('flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors', filter === f.id ? 'bg-gold text-text-on-gold' : 'bg-input text-text-secondary hover:text-text')}>
              {f.label}<span className={cn('text-xs', filter === f.id ? 'text-text-on-gold/70' : 'text-text-disabled')}>{count(f.id)}</span>
            </button>
          ))}
        </div>
        <div className="relative w-full lg:w-72"><Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-disabled" /><Input className="pl-10" placeholder="Search name, bill no., mobile" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search quotations" /></div>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<FileText />} title={quotes.length ? 'No matching quotations' : 'No quotations yet'} text={quotes.length ? 'Try a different filter or search.' : 'Create your first quotation to see it here.'} action={<Link href="/admin/new"><Button variant="gold"><Plus size={16} /> New quotation</Button></Link>} />
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead><tr className="border-b border-border/70 text-[11px] uppercase tracking-wide text-text-disabled">
                {['Bill', 'Customer', 'Event date', 'Total', 'Balance', 'Payment', 'Status'].map((h, i) => <th key={h} className={cn('px-5 py-3 font-semibold', i === 3 || i === 4 ? 'text-right' : '')}>{h}</th>)}
              </tr></thead>
              <tbody>
                {rows.map((q) => {
                  const p = quotePaymentState(q.pricing);
                  return (
                    <tr key={q.id} onClick={() => navigate(`/admin/quotes/${encodeURIComponent(q.reference)}`)} className="cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-surface-hover">
                      <td className="px-5 py-3.5 font-mono text-xs font-semibold text-gold">{q.reference}</td>
                      <td className="px-5 py-3.5"><p className="font-medium text-text">{q.customer.name}</p><p className="text-xs text-text-secondary">{q.customer.eventType} · {q.customer.guests} guests</p></td>
                      <td className="px-5 py-3.5 text-text-secondary">{formatEventDates(quoteDates(q.customer))}</td>
                      <td className="px-5 py-3.5 text-right font-semibold text-text tabular">{inr(q.pricing.grandTotal)}</td>
                      <td className={cn('px-5 py-3.5 text-right tabular', p.balance > 0 ? 'text-warning' : 'text-success')}>{inr(p.balance)}</td>
                      <td className="px-5 py-3.5"><PaymentBadge state={p.state} /></td>
                      <td className="px-5 py-3.5"><StatusBadge status={q.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-border/60 md:hidden">
            {rows.map((q) => {
              const p = quotePaymentState(q.pricing);
              return (
                <li key={q.id}><Link href={`/admin/quotes/${encodeURIComponent(q.reference)}`} className="block space-y-2 px-5 py-4 hover:bg-surface-hover">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-medium text-text">{q.customer.name}</p><p className="text-xs text-text-secondary">{q.reference} · {q.customer.eventType}</p></div><StatusBadge status={q.status} /></div>
                  <div className="flex items-center justify-between text-xs text-text-secondary"><span>{formatEventDates(quoteDates(q.customer))}</span><span className="font-semibold text-text tabular">{inr(q.pricing.grandTotal)}</span></div>
                  <PaymentBadge state={p.state} />
                </Link></li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}

function Detail({ reference }: { reference: string }) {
  const { toast, confirm } = useUi();
  const [, navigate] = useLocation();
  const { data: quote, isLoading } = useQuote(reference);
  const { data: all = [] } = useQuotes();
  const { business } = useBusiness();
  const { payment } = usePayment();
  const setStatus = useSetStatus();
  const del = useDeleteQuote();
  const { isAdmin } = useSession();
  const { permissions } = usePermissions();
  const canEdit = isAdmin || permissions.editBills;
  const canDelete = isAdmin; // employees can never delete bills
  const canBook = isAdmin || permissions.markBooked;
  const [busy, setBusy] = useState<BillKind | null>(null);

  if (isLoading) return <Spinner label="Loading bill" />;
  if (!quote) return <Card className="p-10 text-center"><p className="text-text">That bill could not be found.</p><Link href="/admin/quotes" className="mt-3 inline-block text-sm text-gold hover:underline">Back to quotations</Link></Card>;

  const { customer, pricing } = quote;
  const dates = quoteDates(customer);
  const adv = quoteAdvance(pricing);
  const pay = quotePaymentState(pricing);
  const booked = quote.status === 'confirmed';
  const groups = quote.services.reduce<Record<string, Quote['services']>>((m, s) => { (m[s.category] ??= []).push(s); return m; }, {});

  const toggleBooked = async () => {
    if (!booked) {
      const others = all.filter((o) => o.status === 'confirmed').map((o) => ({ reference: o.reference, name: o.customer.name, dates: quoteDates(o.customer), slots: o.customer.eventSlots }));
      const conflicts = findConflicts({ reference: quote.reference, dates, slots: customer.eventSlots }, others);
      if (conflicts.length) { toast(`Cannot book: ${formatEventDates([conflicts[0].date])} ${timeText(conflicts[0].range)} is already taken by ${conflicts[0].name} (${conflicts[0].reference}).`, 'error'); return; }
    }
    setStatus.mutate({ quote, status: booked ? 'new' : 'confirmed' }, { onSuccess: () => toast(booked ? 'Booking released.' : 'Marked as booked. The dates are now blocked.'), onError: (e) => toast(e.message, 'error') });
  };

  const pdf = async (kind: BillKind) => {
    setBusy(kind);
    try { saveBlob(await buildBillBlob(quote, business, payment, kind), billFileName(quote, kind)); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not create the PDF.', 'error'); }
    finally { setBusy(null); }
  };

  const remove = async () => {
    if (!(await confirm({ title: `Delete bill ${quote.reference}?`, text: isAdmin ? 'This permanently removes the quotation and its payment history. The deletion is recorded in Activity.' : 'This removes the quotation and its payment history. The owner will see this in the activity log, and the bill number will not be used again.', confirmLabel: 'Delete bill', danger: true }))) return;
    del.mutate(quote, { onSuccess: () => { toast('Bill deleted.', 'info'); navigate('/admin/quotes'); }, onError: (e) => toast(e.message, 'error') });
  };

  const wa = () => window.open(whatsappLink(customer.mobile, `Hello ${customer.name}, this is ${business.name} regarding your ${customer.eventType.toLowerCase()} (Bill ${quote.reference}). Grand total ${inr(pricing.grandTotal)}${pay.balance > 0 ? `, balance due ${inr(pay.balance)}` : ', paid in full'}.`), '_blank');

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <Link href="/admin/quotes" className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-gold"><ArrowLeft size={13} /> All quotations</Link>
          <div className="mt-2 flex flex-wrap items-center gap-3"><h2 className="font-display text-3xl font-semibold text-text">{customer.name}</h2><StatusBadge status={quote.status} /><PaymentBadge state={pay.state} /></div>
          <p className="mt-1 text-sm text-text-secondary"><span className="font-mono text-gold">{quote.reference}</span> · {customer.eventType} · created {fmtDate(quote.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {canBook && <Button variant={booked ? 'soft' : 'gold'} onClick={toggleBooked} disabled={setStatus.isPending}>{booked ? <><Undo2 size={15} /> Release booking</> : <><CalendarCheck size={15} /> Mark as booked</>}</Button>}
          {canEdit && <Link href={`/admin/edit/${encodeURIComponent(quote.reference)}`}><Button variant="outline"><Pencil size={15} /> Edit</Button></Link>}
          <Button variant="outline" onClick={() => pdf('quotation')} disabled={busy !== null}>{busy === 'quotation' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Quotation PDF</Button>
          <Button variant="outline" onClick={() => pdf('invoice')} disabled={busy !== null}>{busy === 'invoice' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Invoice PDF</Button>
          <Button variant="ghost" onClick={wa}><MessageCircle size={15} /></Button>
          {canDelete && <Button variant="danger" onClick={remove} aria-label="Delete bill"><Trash2 size={15} /></Button>}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Event" />
            <dl className="grid gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {[['Mobile', customer.mobile], ['Guests', num(customer.guests)], [dates.length > 1 ? 'Dates' : 'Date', formatEventDates(dates)], ...(customer.gstNumber ? [['Customer GSTIN', customer.gstNumber]] : [])].map(([k, v]) => (
                <div key={k}><dt className="text-[11px] uppercase tracking-wide text-text-disabled">{k}</dt><dd className="mt-0.5 font-medium text-text">{v}</dd></div>
              ))}
              {scheduleLines(dates, customer.eventSlots).map((l) => <div key={l.date} className="sm:col-span-2 lg:col-span-3"><dt className="text-[11px] uppercase tracking-wide text-text-disabled">{dates.length > 1 ? fmtDate(l.date) : 'Time'}</dt><dd className="mt-0.5 font-medium text-text">{l.text} {durationText(customer.eventSlots?.[l.date]) && <Badge className="ml-2">{durationText(customer.eventSlots?.[l.date])}</Badge>}</dd></div>)}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Itemised bill" />
            <div className="space-y-5 p-5">
              {Object.entries(groups).map(([cat, items]) => (
                <section key={cat}>
                  <div className="mb-2 flex items-center justify-between border-l-[3px] border-gold bg-input/60 px-3 py-1.5"><h3 className="text-sm font-semibold text-text">{cat}</h3><span className="text-sm font-semibold text-text tabular">{inr(items.reduce((a, i) => a + i.total, 0))}</span></div>
                  <ul className="divide-y divide-border/50">
                    {items.map((s) => (
                      <li key={s.id} className="flex items-start justify-between gap-4 px-3 py-2.5 text-sm">
                        <span className="min-w-0"><span className="block font-medium text-text">{s.name}</span><span className="block text-xs text-text-secondary">{s.pricingType === 'perPerson' ? `${inr(s.unitPrice)} × ${num(customer.guests)} guests` : s.pricingType === 'perUnit' ? `${inr(s.unitPrice)} × ${s.quantity}` : s.description}</span></span>
                        <span className="shrink-0 font-medium text-text tabular">{inr(s.total)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              <div className="ml-auto max-w-sm space-y-2 rounded-xl bg-input p-4 text-sm">
                <div className="flex justify-between text-text-secondary"><span>Subtotal</span><span className="tabular">{inr(pricing.subtotal)}</span></div>
                {pricing.discountEnabled && (pricing.discountAmount ?? 0) > 0 && <div className="flex justify-between text-success"><span>{discountLabel(pricing.discountPercent ?? 0, pricing.discountFlat ?? 0)}</span><span className="tabular">− {inr(pricing.discountAmount ?? 0)}</span></div>}
                {pricing.gstEnabled && <div className="flex justify-between text-text-secondary"><span>GST ({pricing.gstRate}%)</span><span className="tabular">{inr(pricing.gstAmount)}</span></div>}
                <div className="flex items-end justify-between border-t border-border pt-3"><span className="text-xs uppercase tracking-wide text-text-secondary">Grand total</span><span className="text-2xl font-semibold text-gold tabular">{inr(pricing.grandTotal)}</span></div>
                {adv.paid && <><div className="flex justify-between text-success"><span>Received</span><span className="tabular">− {inr(adv.amount)}</span></div><div className="flex justify-between font-semibold text-text"><span>Balance</span><span className="tabular">{inr(adv.balance)}</span></div></>}
              </div>
            </div>
          </Card>
        </div>
        <PaymentPanel quote={quote} />
      </div>
    </div>
  );
}

export function Quotes({ selected }: { selected?: string }) {
  return selected ? <Detail reference={selected} /> : <QuoteList />;
}
