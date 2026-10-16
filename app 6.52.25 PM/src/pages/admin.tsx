import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetCatalogQueryKey,
  getGetQuoteQueryKey,
  getListQuotesQueryKey,
  useGetCatalog,
  useGetQuote,
  useDeleteQuote,
  useListQuotes,
  useAdminSession,
  useUpdateCatalog,
  signInAdmin,
  signOutAdmin,
  subscribeToAuthChanges,
  formatEventDates,
  quoteEventDates,
  useSetQuoteBooked,
  quoteAdvance,
  quotePaymentState,
} from '@/lib/supabase-queries';
import { findConflicts, hasAnySlots, scheduleLines, timeText } from '@/lib/booking';
import { PrintBill, type PrintBillData } from '@/components/print-bill';
import { OccupancyCalendar } from '@/components/occupancy-calendar';
import { PaymentBadge, PaymentPanel } from '@/components/payment-panel';
import { OPEN_SETTINGS_EVENT, PaymentSettingsSection } from '@/components/payment-settings';
import type { Quote } from '@/lib/supabase-queries';
import { isSupabaseConfigured } from '@/lib/supabase';
import { ArrowDown, ArrowLeft, ArrowUp, BadgeCheck, Banknote, Boxes, Check, ChevronDown, ChevronRight, CircleAlert, LayoutGrid, ListChecks, Landmark, Pencil, FileText, Plus, Printer, RotateCcw, Save, Settings, Sparkles, Trash2, X } from 'lucide-react';
import { Link } from 'wouter';
import { CATALOG_UPDATED_EVENT, ORIGINAL_CATALOG, cacheCatalog, cloneCatalog, loadCatalog, saveCatalog } from '@/lib/catalog';
import type { CatalogCategory, CatalogItem, CatalogSubcategory, PricingType } from '@/lib/catalog';

type SettingsTab = 'menu' | 'payment';

type ModalState =
  | { kind: 'category'; category?: CatalogCategory }
  | { kind: 'subcategory'; categoryId: string; subcategory?: CatalogSubcategory }
  | { kind: 'service'; categoryId: string; subcategoryId: string; service?: CatalogItem }
  | { kind: 'restore' }
  | null;

const makeId = (prefix: string, name: string) => `${prefix}-${name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'new'}-${Date.now().toString(36)}`;
const money = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
const BRAND_LOGO = `${import.meta.env.BASE_URL}swagattam-logo.webp`;

function isFoodService(category: string) {
  return category.toLowerCase().includes('food');
}

function serviceRateLabel(pricingType: Quote['services'][number]['pricingType']) {
  if (pricingType === 'perPerson') return '/ plate';
  if (pricingType === 'perUnit') return '/ unit';
  return 'one-time';
}

function SavedQuotePrintSheet({ quote }: { quote: Quote | null }) {
  if (!quote) return null;
  const advance = quoteAdvance(quote.pricing);
  const pr = quote.pricing;
  const totals: { name: string; total: number }[] = [];
  quote.services.forEach((service) => {
    const row = totals.find((item) => item.name === service.category);
    if (row) row.total += service.total; else totals.push({ name: service.category, total: service.total });
  });
  const discountParts = [(pr.discountPercent ?? 0) > 0 ? `${pr.discountPercent}%` : '', (pr.discountFlat ?? 0) > 0 ? money(pr.discountFlat ?? 0) : ''].filter(Boolean);
  const data: PrintBillData = {
    billNumber: quote.reference,
    customerName: quote.customer.name,
    mobile: quote.customer.mobile,
    eventType: quote.customer.eventType,
    dates: quoteEventDates(quote.customer),
    eventSlots: quote.customer.eventSlots,
    guests: quote.customer.guests,
    gstEnabled: pr.gstEnabled,
    gstRate: pr.gstRate,
    gstAmount: pr.gstAmount,
    hallGstNumber: pr.gstNumberVisible ? pr.gstNumber : '',
    customerGstNumber: quote.customer.gstNumber ?? '',
    lines: quote.services.map((service) => ({ id: service.id, isFood: isFoodService(service.category), category: service.category, subcategory: service.subcategory, name: service.name, description: service.description ?? '', pricingType: service.pricingType, quantity: service.quantity, price: service.unitPrice, total: service.total })),
    categoryTotals: totals,
    foodPerPlate: pr.foodPerPlate,
    subtotal: pr.subtotal,
    discountAmount: pr.discountEnabled ? pr.discountAmount ?? 0 : 0,
    discountLabel: discountParts.length ? `Discount (${discountParts.join(' + ')})` : 'Discount',
    grandTotal: pr.grandTotal,
    advanceAmount: advance.paid ? advance.amount : 0,
    balanceDue: advance.balance,
    costPerGuest: pr.costPerGuest,
    showCostPerGuest: pr.showCostPerGuest !== false,
  };
  return <PrintBill data={data} />;
}

// ---- Monthly grouping and the "Print all enquiries" report ----
const monthKeyOf = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const monthLabelOf = (key: string) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
type MonthGroup = { key: string; label: string; quotes: Quote[]; booked: number; budget: number };
function groupQuotesByMonth(quotes: Quote[]): MonthGroup[] {
  const map = new Map<string, Quote[]>();
  quotes.forEach((quote) => { const key = monthKeyOf(quote.createdAt); map.set(key, [...(map.get(key) ?? []), quote]); });
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, list]) => ({ key, label: monthLabelOf(key), quotes: list, booked: list.filter((quote) => quote.status === 'confirmed').length, budget: list.reduce((sum, quote) => sum + quote.pricing.grandTotal, 0) }));
}
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

function EnquiryReportSheet({ report }: { report: { title: string; quotes: Quote[] } | null }) {
  if (!report) return null;
  const groups = groupQuotesByMonth(report.quotes);
  const totalBudget = report.quotes.reduce((sum, quote) => sum + quote.pricing.grandTotal, 0);
  const bookedCount = report.quotes.filter((quote) => quote.status === 'confirmed').length;
  return (
    <main className="print-sheet enquiry-report">
      <div className="print-header flex items-center justify-between gap-6">
        <div className="flex items-center gap-3"><img src={BRAND_LOGO} alt="Swagattam logo" className="print-logo" /><div><p className="print-label">Enquiry report</p><h1 className="mt-1 text-2xl font-semibold text-[#864936]">Swagattam Party Lawns</h1><p className="mt-1 text-xs text-[#6e6a61]">{report.title}</p></div></div>
        <div className="text-right"><p className="print-label">Prepared on</p><strong className="text-xs">{shortDate(new Date().toISOString())}</strong><p className="mt-2 print-label">Enquiries</p><strong className="text-xs">{report.quotes.length} · {bookedCount} booked</strong></div>
      </div>
      {groups.map((group) => (
        <section key={group.key} className="enquiry-month">
          <h2>{group.label} <span>{group.quotes.length} enquir{group.quotes.length === 1 ? 'y' : 'ies'} · {group.booked} booked · Total budget {money(group.budget)}</span></h2>
          <table className="print-table enquiry-table">
            <thead><tr><th>#</th><th>Enquiry date</th><th>Name</th><th>Mobile</th><th>Occasion</th><th>Event date(s)</th><th>Days</th><th>Guests</th><th>Price / plate</th><th>Total budget</th><th>Status</th></tr></thead>
            <tbody>
              {group.quotes.map((quote, index) => {
                const dates = quoteEventDates(quote.customer);
                return <tr key={quote.id}>
                  <td>{index + 1}</td>
                  <td>{shortDate(quote.createdAt)}</td>
                  <td><strong>{quote.customer.name}</strong></td>
                  <td>{quote.customer.mobile}</td>
                  <td>{quote.customer.eventType}</td>
                  <td>{formatEventDates(dates)}</td>
                  <td>{dates.length} {dates.length === 1 ? 'day' : 'days'}</td>
                  <td>{quote.customer.guests.toLocaleString('en-IN')}</td>
                  <td>{quote.pricing.foodPerPlate > 0 ? money(quote.pricing.foodPerPlate) : '—'}</td>
                  <td><strong>{money(quote.pricing.grandTotal)}</strong></td>
                  <td>{quote.status === 'confirmed' ? 'Booked' : 'Not booked'}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </section>
      ))}
      <div className="print-totals"><div className="print-total-row print-grand"><span>All enquiries · total budget</span><strong>{money(totalBudget)}</strong></div></div>
      <div className="print-notes">Total budget is the grand total of each saved estimate. Price / plate is the food price per guest.</div>
    </main>
  );
}

function Modal({ title, eyebrow, children, onClose, testId }: { title: string; eyebrow: string; children: ReactNode; onClose: () => void; testId: string }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#1d2e25]/45 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" data-testid={testId}>
      <div className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[#dfd2c1] bg-[#fffdf8] p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div><p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#9a5b47]">{eyebrow}</p><h2 className="mt-2 font-serif text-2xl font-semibold text-[#263b31]">{title}</h2></div>
          <button type="button" onClick={onClose} aria-label="Close dialog" data-testid="button-close-dialog" className="grid size-9 place-items-center rounded-full text-[#706e67] hover:bg-[#f2e8d3]"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, multiline = false, required = true, testId }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; required?: boolean; testId: string }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.09em] text-[#5f655e]">{label}{required && <span className="ml-1 text-[#9a5b47]">*</span>}</span>{multiline ? <textarea required={required} value={value} onChange={(event) => onChange(event.target.value)} className="field-control min-h-24 w-full resize-y rounded-xl px-3 py-2.5 text-sm" data-testid={testId} /> : <input required={required} value={value} onChange={(event) => onChange(event.target.value)} className="field-control h-11 w-full rounded-xl px-3 text-sm" data-testid={testId} />}</label>;
}

function CategoryModal({ state, onClose, onSave }: { state: Extract<ModalState, { kind: 'category' }>; onClose: () => void; onSave: (name: string, description: string) => void }) {
  const [name, setName] = useState(state.category?.name ?? '');
  const [description, setDescription] = useState(state.category?.description ?? '');
  const submit = (event: FormEvent) => { event.preventDefault(); if (name.trim()) onSave(name.trim(), description.trim()); };
  return <Modal title={state.category ? 'Edit category' : 'New category'} eyebrow="Catalog / category" onClose={onClose} testId="dialog-category">
    <form onSubmit={submit} className="mt-6 space-y-4"><TextField label="Category name" value={name} onChange={setName} testId="input-category-name" /><TextField label="Description" value={description} onChange={setDescription} multiline required={false} testId="input-category-description" /><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} className="admin-secondary" data-testid="button-cancel-category">Cancel</button><button type="submit" className="admin-primary" data-testid="button-save-category"><Save size={16} /> Save category</button></div></form>
  </Modal>;
}

function SubcategoryModal({ state, onClose, onSave }: { state: Extract<ModalState, { kind: 'subcategory' }>; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(state.subcategory?.name ?? '');
  const submit = (event: FormEvent) => { event.preventDefault(); if (name.trim()) onSave(name.trim()); };
  return <Modal title={state.subcategory ? 'Edit subcategory' : 'New subcategory'} eyebrow="Catalog / grouping" onClose={onClose} testId="dialog-subcategory">
    <form onSubmit={submit} className="mt-6 space-y-4"><TextField label="Subcategory name" value={name} onChange={setName} testId="input-subcategory-name" /><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} className="admin-secondary" data-testid="button-cancel-subcategory">Cancel</button><button type="submit" className="admin-primary" data-testid="button-save-subcategory"><Save size={16} /> Save subcategory</button></div></form>
  </Modal>;
}

function ServiceModal({ state, onClose, onSave }: { state: Extract<ModalState, { kind: 'service' }>; onClose: () => void; onSave: (service: CatalogItem) => void }) {
  const service = state.service;
  const [name, setName] = useState(service?.name ?? '');
  const [description, setDescription] = useState(service?.description ?? '');
  const [price, setPrice] = useState(String(service?.price ?? 0));
  const [pricingType, setPricingType] = useState<PricingType>(service?.pricingType ?? 'perPerson');
  const [minQuantity, setMinQuantity] = useState(String(service?.minQuantity ?? 1));
  const [maxQuantity, setMaxQuantity] = useState(String(service?.maxQuantity ?? 1));
  const [active, setActive] = useState(service?.active ?? true);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    const minimum = Math.max(1, Number(minQuantity) || 1);
    const maximum = Math.max(minimum, Number(maxQuantity) || minimum);
    onSave({ id: service?.id ?? makeId('service', name), name: name.trim(), description: description.trim(), categoryId: state.categoryId, subcategoryId: state.subcategoryId, price: Math.max(0, Number(price) || 0), pricingType, active, minQuantity: minimum, maxQuantity: maximum });
  };
  return <Modal title={service ? 'Edit service' : 'New service'} eyebrow="Catalog / service" onClose={onClose} testId="dialog-service">
    <form onSubmit={submit} className="mt-6 space-y-4">
      <TextField label="Service name" value={name} onChange={setName} testId="input-service-name" />
      <TextField label="Description" value={description} onChange={setDescription} multiline required={false} testId="input-service-description" />
      <div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.09em] text-[#5f655e]">Price</span><input type="number" min="0" step="1" value={price} onChange={(event) => setPrice(event.target.value)} className="field-control h-11 w-full rounded-xl px-3 text-sm" data-testid="input-service-price" /></label><label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.09em] text-[#5f655e]">Pricing type</span><select value={pricingType} onChange={(event) => setPricingType(event.target.value as PricingType)} className="field-control h-11 w-full rounded-xl px-3 text-sm" data-testid="select-service-pricing-type"><option value="perPerson">Per person</option><option value="perUnit">Per unit</option><option value="fixed">Fixed price</option></select></label></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.09em] text-[#5f655e]">Minimum quantity</span><input type="number" min="1" step="1" value={minQuantity} onChange={(event) => setMinQuantity(event.target.value)} className="field-control h-11 w-full rounded-xl px-3 text-sm" data-testid="input-service-min-quantity" /></label><label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.09em] text-[#5f655e]">Maximum quantity</span><input type="number" min="1" step="1" value={maxQuantity} onChange={(event) => setMaxQuantity(event.target.value)} className="field-control h-11 w-full rounded-xl px-3 text-sm" data-testid="input-service-max-quantity" /></label></div>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#e3d8c9] bg-[#fbf7ef] px-3 py-3 text-sm font-semibold text-[#34483c]"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="size-4 accent-[#864936]" data-testid="input-service-active" /> Available to customers</label>
      <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} className="admin-secondary" data-testid="button-cancel-service">Cancel</button><button type="submit" className="admin-primary" data-testid="button-save-service"><Save size={16} /> Save service</button></div>
    </form>
  </Modal>;
}

function AdminWorkspace({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const [catalog, setCatalog] = useState<CatalogCategory[]>(() => loadCatalog());
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [modal, setModal] = useState<ModalState>(null);
  const [savedAt, setSavedAt] = useState(() => new Date());
  const [selectedQuoteReference, setSelectedQuoteReference] = useState<string | null>(null);
  const [quoteToPrint, setQuoteToPrint] = useState<Quote | null>(null);
  const [reportToPrint, setReportToPrint] = useState<{ title: string; quotes: Quote[] } | null>(null);
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('menu');
  const queryClient = useQueryClient();
  const catalogQuery = useGetCatalog();
  const quotesQuery = useListQuotes({ limit: 1000 });
  const deleteQuoteMutation = useDeleteQuote();
  const setBookedMutation = useSetQuoteBooked();
  const [bookingFilter, setBookingFilter] = useState<'all' | 'booked' | 'open' | 'paid' | 'due'>('all');
  const updateCatalogMutation = useUpdateCatalog();
  const selectedQuoteQuery = useGetQuote(selectedQuoteReference ?? '', {
    query: {
      enabled: Boolean(selectedQuoteReference),
      queryKey: getGetQuoteQueryKey(selectedQuoteReference ?? ''),
    },
  });
  const allQuotes = quotesQuery.data ?? [];
  const bookedCount = allQuotes.filter((quote) => quote.status === 'confirmed').length;
  const paidCount = allQuotes.filter((quote) => quotePaymentState(quote.pricing).state === 'paid').length;
  const filteredQuotes = allQuotes.filter((quote) => {
    if (bookingFilter === 'all') return true;
    if (bookingFilter === 'booked') return quote.status === 'confirmed';
    if (bookingFilter === 'open') return quote.status !== 'confirmed';
    const paymentState = quotePaymentState(quote.pricing).state;
    return bookingFilter === 'paid' ? paymentState === 'paid' : paymentState !== 'paid';
  });
  const paymentTotals = useMemo(() => allQuotes.reduce((totals, quote) => {
    const payment = quotePaymentState(quote.pricing);
    totals.collected += payment.received;
    if (quote.status === 'confirmed') totals.pending += payment.balance;
    return totals;
  }, { collected: 0, pending: 0 }), [allQuotes]);
  const monthGroups = useMemo(() => groupQuotesByMonth(filteredQuotes), [filteredQuotes]);
  const currentMonthKey = monthKeyOf(new Date().toISOString());
  const stats = useMemo(() => {
    const subcategories = catalog.reduce((sum, category) => sum + category.subcategories.length, 0);
    const services = catalog.reduce((sum, category) => sum + category.subcategories.reduce((inner, subcategory) => inner + subcategory.items.length, 0), 0);
    const active = catalog.reduce((sum, category) => sum + category.subcategories.reduce((inner, subcategory) => inner + subcategory.items.filter((item) => item.active).length, 0), 0);
    return { categories: catalog.length, subcategories, services, active };
  }, [catalog]);

  // Anything in the app can ask for the Settings panel (for example "Change payment account" on a bill).
  useEffect(() => {
    const open = (event: Event) => {
      const tab = (event as CustomEvent<{ tab?: SettingsTab }>).detail?.tab;
      setSettingsTab(tab === 'payment' ? 'payment' : 'menu');
      setSettingsOpen(true);
    };
    window.addEventListener(OPEN_SETTINGS_EVENT, open);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, open);
  }, []);

  useEffect(() => {
    if (!settingsOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !modal) setSettingsOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKey); };
  }, [settingsOpen, modal]);

  useEffect(() => {
    const refresh = () => setCatalog(loadCatalog());
    window.addEventListener(CATALOG_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(CATALOG_UPDATED_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (!catalogQuery.data || !Array.isArray(catalogQuery.data) || catalogQuery.data.length === 0) return;
    // The cloud (Supabase) copy is the source of truth, so every device shows the same menu.
    // Skip while a save is in flight or has failed, so unsaved local edits are not overwritten.
    if (updateCatalogMutation.isPending || updateCatalogMutation.isError) return;
    setCatalog(catalogQuery.data);
    cacheCatalog(catalogQuery.data);
  }, [catalogQuery.data]);

  const commit = (next: CatalogCategory[]) => {
    setCatalog(next);
    saveCatalog(next);
    setSavedAt(new Date());
    updateCatalogMutation.mutate({ data: next }, {
      onSuccess: (saved) => {
        queryClient.setQueryData(getGetCatalogQueryKey(), saved);
      },
    });
  };
  const updateCategory = (categoryId: string, updater: (category: CatalogCategory) => CatalogCategory) => commit(catalog.map((category) => category.id === categoryId ? updater(category) : category));
  // Moves a category up (-1) or down (+1). The new order is saved to Supabase together with the catalog,
  // so it is the same every time the admin panel or the customer estimator is opened.
  const moveCategory = (categoryId: string, direction: -1 | 1) => {
    const index = catalog.findIndex((category) => category.id === categoryId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= catalog.length) return;
    const next = [...catalog];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };
  const deleteCategory = (category: CatalogCategory) => { if (window.confirm(`Delete ${category.name} and all of its services?`)) commit(catalog.filter((entry) => entry.id !== category.id)); };
  const deleteSubcategory = (categoryId: string, subcategory: CatalogSubcategory) => { if (window.confirm(`Delete ${subcategory.name} and its services?`)) updateCategory(categoryId, (category) => ({ ...category, subcategories: category.subcategories.filter((entry) => entry.id !== subcategory.id) })); };
  const deleteService = (categoryId: string, subcategoryId: string, service: CatalogItem) => { if (window.confirm(`Delete ${service.name}?`)) updateCategory(categoryId, (category) => ({ ...category, subcategories: category.subcategories.map((subcategory) => subcategory.id === subcategoryId ? { ...subcategory, items: subcategory.items.filter((item) => item.id !== service.id) } : subcategory) })); };
  const deleteQuote = (quote: Quote) => {
    if (!window.confirm(`Delete saved bill ${quote.reference}? This cannot be undone.`)) return;
    deleteQuoteMutation.mutate({ reference: quote.reference }, {
      onSuccess: () => {
        if (selectedQuoteReference === quote.reference) setSelectedQuoteReference(null);
        void queryClient.invalidateQueries({ queryKey: getGetQuoteQueryKey(quote.reference) });
        void queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });
      },
    });
  };
  const openQuote = (reference: string) => {
    setSelectedQuoteReference(reference);
    window.setTimeout(() => document.querySelector('[data-testid="panel-quote-detail"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  };
  const toggleBooked = async (quote: Quote, booked: boolean) => {
    if (booked) {
      const alreadyBooked = (quotesQuery.data ?? [])
        .filter((other) => other.status === 'confirmed')
        .map((other) => ({ reference: other.reference, name: other.customer.name, dates: quoteEventDates(other.customer), slots: other.customer.eventSlots }));
      const conflicts = findConflicts({ reference: quote.reference, dates: quoteEventDates(quote.customer), slots: quote.customer.eventSlots }, alreadyBooked);
      if (conflicts.length) {
        window.alert(`Cannot mark this bill as booked. The hall is already booked:\n\n${conflicts.map((item) => `• ${formatEventDates([item.date])}: ${timeText(item.range)} (${item.name}, Bill ${item.reference})`).join('\n')}`);
        return;
      }
    }
    try {
      await setBookedMutation.mutateAsync({ reference: quote.reference, booked });
      await queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetQuoteQueryKey(quote.reference) });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not update the booking.');
    }
  };
  const printReport = (title: string, quotes: Quote[]) => {
    if (!quotes.length) { window.alert('There are no enquiries to print.'); return; }
    setQuoteToPrint(null);
    setReportToPrint({ title, quotes });
    window.setTimeout(() => window.print(), 100);
  };
  const printQuote = (quote: Quote) => {
    setReportToPrint(null);
    setQuoteToPrint(quote);
    window.setTimeout(() => window.print(), 0);
  };

  const handleCategorySave = (name: string, description: string) => {
    if (!modal || modal.kind !== 'category') return;
    if (modal.category) commit(catalog.map((category) => category.id === modal.category?.id ? { ...category, name, description } : category));
    else commit([...catalog, { id: makeId('category', name), name, description, subcategories: [] }]);
    setModal(null);
  };
  const handleSubcategorySave = (name: string) => {
    if (!modal || modal.kind !== 'subcategory') return;
    updateCategory(modal.categoryId, (category) => ({ ...category, subcategories: modal.subcategory ? category.subcategories.map((entry) => entry.id === modal.subcategory?.id ? { ...entry, name } : entry) : [...category.subcategories, { id: makeId('group', name), name, items: [] }] }));
    setModal(null);
  };
  const handleServiceSave = (service: CatalogItem) => {
    if (!modal || modal.kind !== 'service') return;
    updateCategory(modal.categoryId, (category) => ({ ...category, subcategories: category.subcategories.map((subcategory) => subcategory.id === modal.subcategoryId ? { ...subcategory, items: modal.service ? subcategory.items.map((item) => item.id === service.id ? service : item) : [...subcategory.items, service] } : subcategory) }));
    setModal(null);
  };
  const restore = () => { commit(cloneCatalog(ORIGINAL_CATALOG)); setModal(null); };

  const renderQuoteRow = (quote: Quote) => <div key={quote.id} className="flex w-full flex-col items-start gap-3 py-4 text-left transition hover:bg-[#fcf8f0] sm:flex-row sm:items-center sm:justify-between sm:px-2" data-testid={`row-saved-quote-${quote.reference}`}>
                <button type="button" onClick={() => setSelectedQuoteReference(quote.reference)} className="min-w-0 text-left" data-testid={`button-open-quote-${quote.reference}`}><span className="flex flex-wrap items-center gap-2"><strong className="text-sm text-[#2e4437]">{quote.customer.name}</strong><span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] ${quote.status === 'confirmed' ? 'bg-[#864936] text-white' : 'bg-[#eee6d9] text-[#7a776e]'}`} data-testid={`badge-booking-${quote.reference}`}>{quote.status === 'confirmed' ? 'Booked' : 'Not booked'}</span></span><span className="mt-1 block text-xs text-[#858178]">{quote.customer.eventType} · {quote.customer.guests.toLocaleString('en-IN')} guests · {quote.reference}</span><span className="mt-1 block text-xs font-semibold text-[#5f655e]" data-testid={`text-schedule-${quote.reference}`}>{hasAnySlots(quote.customer.eventSlots) ? scheduleLines(quoteEventDates(quote.customer), quote.customer.eventSlots).map((line) => `${formatEventDates([line.date])}: ${(timeText(quote.customer.eventSlots?.[line.date]) || 'Time not selected')}`).join(' · ') : `${formatEventDates(quoteEventDates(quote.customer))} · time not set`}</span></button>
                <span className="flex w-full shrink-0 items-center justify-between gap-3 sm:w-auto sm:justify-end"><span className="text-left sm:text-right"><strong className="block font-mono text-sm text-[#864936]">{money(quote.pricing.grandTotal)}</strong><span className="mt-1 flex sm:justify-end"><PaymentBadge state={quotePaymentState(quote.pricing).state} balance={quotePaymentState(quote.pricing).balance} testId={`badge-payment-${quote.reference}`} /></span><span className="mt-1 block text-[10px] uppercase tracking-[0.08em] text-[#938b7f]">{new Date(quote.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span></span><span className="flex items-center gap-2"><label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#e0d3c1] bg-white px-2.5 py-1.5 text-xs font-bold text-[#5f655e]"><input type="checkbox" checked={quote.status === 'confirmed'} disabled={setBookedMutation.isPending} onChange={(e) => void toggleBooked(quote, e.target.checked)} className="size-4 accent-[#864936]" data-testid={`input-booked-${quote.reference}`} />Booked</label><button type="button" onClick={() => printQuote(quote)} className="icon-button" aria-label={`Print bill ${quote.reference}`} data-testid={`button-print-quote-${quote.reference}`}><Printer size={16} /></button><button type="button" onClick={() => deleteQuote(quote)} className="icon-button danger-hover" aria-label={`Delete bill ${quote.reference}`} data-testid={`button-delete-quote-${quote.reference}`} disabled={deleteQuoteMutation.isPending}><Trash2 size={16} /></button></span></span>
              </div>;

  return <>
   <main className="admin-shell min-h-[100dvh]">
     <header className="admin-brand-header">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
          <Link href="/111" className="brand-header__link flex min-w-0 items-center gap-3" data-testid="link-back-estimator">
           <span className="brand-logo-frame">
             <img src={BRAND_LOGO} alt="Swagattam Party Lawns logo" className="brand-logo brand-logo--interactive" />
           </span>
           <span className="min-w-0">
             <span className="brand-header__title block font-serif text-base font-semibold leading-tight sm:text-lg">Swagattam Party Lawns</span>
             <span className="brand-header__subtitle mt-1 block font-mono text-[9px] font-bold uppercase tracking-[0.18em]">Operations desk</span>
           </span>
         </Link>
         <div className="flex items-center gap-3">
            <span className="brand-header__badge hidden sm:inline-flex"><Sparkles size={12} /> Private workspace</span>
            <button type="button" onClick={() => { setSettingsTab('menu'); setSettingsOpen(true); }} className="admin-secondary flex items-center gap-2" data-testid="button-open-settings"><Settings size={15} /> Settings</button>
            <button type="button" onClick={() => void onSignOut()} className="admin-secondary hidden items-center gap-2 sm:flex" data-testid="button-admin-sign-out">Sign out</button>
          <Link href="/111" className="admin-secondary hidden items-center gap-2 sm:flex" data-testid="link-view-estimator"><ArrowLeft size={15} /> Customer estimator</Link>
         </div>
      </div>
    </header>
    <div className="mx-auto max-w-[1440px] px-4 py-7 sm:px-8 sm:py-10 lg:px-12">
        <div className="admin-intro flex flex-col justify-between gap-6 lg:flex-row lg:items-end"><div><p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-[#9a5b47]">Operations desk</p><div className="admin-hero-badge"><Sparkles size={12} /> Curated venue operations</div><h1 className="mt-3 max-w-2xl font-serif text-4xl font-semibold leading-tight tracking-[-0.025em] text-[#263b31] sm:text-5xl">Bookings &amp; saved estimates.</h1><p className="mt-4 max-w-xl text-sm leading-7 text-[#737269]">See which dates are booked and follow up on every saved estimate. The menu, categories and payment account are managed under Settings.</p></div></div>
        <OccupancyCalendar quotes={allQuotes} onOpenQuote={openQuote} />
        <section className="admin-panel mt-8 rounded-2xl border border-[#e3d8c9] bg-[#fffdf8] p-4 shadow-[0_14px_40px_rgba(98,67,36,.035)] sm:p-5" data-testid="section-recent-estimates">
         <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#eee6d9] pb-4">
             <div><p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#9a5b47]">Customer pipeline</p><h2 className="mt-2 font-serif text-2xl font-semibold text-[#263b31]">Saved estimates</h2><p className="mt-1 text-sm text-[#7a776e]">Saved bills remain here until you manually delete them.</p></div>
           {quotesQuery.isFetching && <span className="text-xs text-[#8b887f]" role="status" data-testid="status-quotes-loading">Refreshing estimates…</span>}
         </div>
         {allQuotes.length > 0 && (
           <div className="grid gap-3 pt-4 sm:grid-cols-3" data-testid="summary-payments">
             <div className="rounded-xl border border-[#cfe6d6] bg-[#f1f8f3] px-4 py-3"><span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#3c7a52]"><BadgeCheck size={13} /> Collected</span><strong className="mt-1 block font-mono text-lg text-[#2f6b44]" data-testid="text-total-collected">{money(paymentTotals.collected)}</strong></div>
             <div className="rounded-xl border border-[#f0d9c9] bg-[#fdf3ec] px-4 py-3"><span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#864936]"><Banknote size={13} /> Balance pending (booked)</span><strong className="mt-1 block font-mono text-lg text-[#864936]" data-testid="text-total-pending">{money(paymentTotals.pending)}</strong></div>
             <div className="rounded-xl border border-[#e7e0d5] bg-white px-4 py-3"><span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#77736D]"><Check size={13} /> Fully paid bills</span><strong className="mt-1 block font-mono text-lg text-[#242424]" data-testid="text-paid-count">{paidCount} of {allQuotes.length}</strong></div>
           </div>
         )}
         {allQuotes.length > 0 && (
           <div className="flex flex-wrap items-center gap-2 pt-4" role="tablist" data-testid="tabs-booking-filter">
             {([['all', 'All', allQuotes.length], ['booked', 'Booked', bookedCount], ['open', 'Not booked', allQuotes.length - bookedCount], ['paid', 'Paid', paidCount], ['due', 'Payment due', allQuotes.length - paidCount]] as const).map(([key, label, count]) => (
               <button key={key} type="button" role="tab" aria-selected={bookingFilter === key} onClick={() => setBookingFilter(key)} className={`rounded-full border px-4 py-1.5 text-xs font-bold transition ${bookingFilter === key ? 'border-[#864936] bg-[#864936] text-white' : 'border-[#e0d3c1] bg-white text-[#5f655e] hover:border-[#864936]'}`} data-testid={`tab-filter-${key}`}>{label} · {count}</button>
             ))}
             <button type="button" onClick={() => printReport('All enquiries', allQuotes)} className="admin-primary ml-auto" data-testid="button-print-all-enquiries"><FileText size={15} /> Print all enquiries</button>
           </div>
         )}
         {quotesQuery.isLoading ? (
           <div className="grid gap-2 pt-4 sm:grid-cols-3" role="status" data-testid="status-quotes-skeleton">{[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-[#f2e8d3]" />)}</div>
         ) : quotesQuery.isError ? (
           <div className="flex flex-col items-start gap-3 rounded-xl border border-[#e8cfc5] bg-[#fff7f3] p-4 text-sm text-[#73483b]" role="alert" data-testid="status-quotes-error"><div className="flex items-center gap-2 font-semibold"><CircleAlert size={17} /> Saved estimates could not be loaded.</div><p className="text-xs leading-5 text-[#8a655a]">The catalog remains available locally while the operations feed reconnects.</p><button type="button" onClick={() => void quotesQuery.refetch()} className="admin-secondary" data-testid="button-retry-quotes"><RotateCcw size={14} /> Try again</button></div>
         ) : (quotesQuery.data ?? []).length === 0 ? (
           <div className="empty-panel mt-4 py-10" data-testid="empty-quotes"><CircleAlert size={22} /><h2>No saved estimates yet</h2><p>When a visitor saves a brief, it will appear here for follow-up.</p></div>
         ) : (
           <div className="mt-4 space-y-3" data-testid="list-recent-quotes">
              {filteredQuotes.length === 0 && <p className="py-6 text-center text-sm text-[#7a776e]" data-testid="empty-filtered-quotes">No bills in this view.</p>}
              {monthGroups.map((group) => {
                const open = openMonths[group.key] ?? group.key === currentMonthKey;
                return <div key={group.key} data-testid={`month-group-${group.key}`}>
                  <div className="flex flex-wrap items-center gap-3 bg-[#f6efe2] px-3 py-2.5 sm:px-4">
                    <button type="button" onClick={() => setOpenMonths((current) => ({ ...current, [group.key]: !(current[group.key] ?? group.key === currentMonthKey) }))} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={open} data-testid={`button-toggle-month-${group.key}`}>
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-[#864936] shadow-sm">{open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</span>
                      <span className="min-w-0">
                        <strong className="block font-serif text-lg font-semibold text-[#263b31]">{group.label}</strong>
                        <span className="block text-xs text-[#7a776e]">{group.quotes.length} enquir{group.quotes.length === 1 ? 'y' : 'ies'} · {group.booked} booked · Total budget {money(group.budget)}</span>
                      </span>
                    </button>
                    <button type="button" onClick={() => printReport(`Enquiries for ${group.label}`, group.quotes)} className="admin-secondary" data-testid={`button-print-month-${group.key}`}><FileText size={14} /> Print month</button>
                  </div>
                  {open && <div className="divide-y divide-[#eee6d9]">{group.quotes.map((quote) => renderQuoteRow(quote))}</div>}
                </div>;
              })}
           </div>
         )}
       </section>
        {selectedQuoteReference && <section className="mt-4 rounded-2xl border border-[#d8cbb9] bg-[#f8f2e7] p-4 sm:p-5" data-testid="panel-quote-detail">
           <div className="flex items-start justify-between gap-4"><div><p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#9a5b47]">Bill detail</p><h2 className="mt-2 font-serif text-2xl font-semibold text-[#263b31]">{selectedQuoteQuery.data?.customer.name ?? 'Loading saved bill'}</h2></div><div className="flex items-center gap-1">{selectedQuoteQuery.data && <><a href={`${import.meta.env.BASE_URL}111/?edit=${encodeURIComponent(selectedQuoteQuery.data.reference)}`} className="admin-secondary" data-testid="button-edit-selected-quote"><Pencil size={15} /> Edit</a><button type="button" onClick={() => printQuote(selectedQuoteQuery.data)} className="admin-secondary" data-testid="button-print-selected-quote"><Printer size={15} /> Print bill</button><button type="button" onClick={() => deleteQuote(selectedQuoteQuery.data)} className="icon-button danger-hover" aria-label="Delete saved bill" data-testid="button-delete-selected-quote" disabled={deleteQuoteMutation.isPending}><Trash2 size={17} /></button></>}<button type="button" onClick={() => setSelectedQuoteReference(null)} className="icon-button" aria-label="Close bill detail" data-testid="button-close-quote-detail"><X size={17} /></button></div></div>
          {selectedQuoteQuery.isLoading && <p className="mt-4 text-sm text-[#7a776e]" role="status" data-testid="status-quote-detail-loading">Loading the saved brief…</p>}
          {selectedQuoteQuery.isError && <p className="mt-4 rounded-xl border border-[#e8cfc5] bg-[#fff7f3] p-3 text-sm text-[#73483b]" role="alert" data-testid="status-quote-detail-error">This estimate could not be opened. It may have been removed or is temporarily unavailable.</p>}
          {selectedQuoteQuery.data && <div className="mt-4 space-y-5 text-sm" data-testid="saved-quote-full-details">
            <div className="grid gap-4 rounded-xl border border-[#e3d8c9] bg-[#fffdf8] p-3 sm:grid-cols-3 sm:p-4">
              <div><span className="block text-[10px] uppercase tracking-[0.1em] text-[#8a867c]">Bill No</span><strong className="mt-1 block font-mono text-xs text-[#34483c]">{selectedQuoteQuery.data.reference}</strong></div>
              <div><span className="block text-[10px] uppercase tracking-[0.1em] text-[#8a867c]">Saved on</span><strong className="mt-1 block text-[#34483c]">{new Date(selectedQuoteQuery.data.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong></div>
              <div><span className="block text-[10px] uppercase tracking-[0.1em] text-[#8a867c]">Status</span><label className="mt-1 flex cursor-pointer items-center gap-2 font-bold text-[#34483c]"><input type="checkbox" checked={selectedQuoteQuery.data.status === 'confirmed'} disabled={setBookedMutation.isPending} onChange={(e) => selectedQuoteQuery.data && void toggleBooked(selectedQuoteQuery.data, e.target.checked)} className="size-4 accent-[#864936]" data-testid="input-booked-detail" />{selectedQuoteQuery.data.status === 'confirmed' ? 'Booked' : 'Not booked'}</label></div>
              <div><span className="block text-[10px] uppercase tracking-[0.1em] text-[#8a867c]">Mobile</span><strong className="mt-1 block text-[#34483c]">{selectedQuoteQuery.data.customer.mobile}</strong></div>
              <div><span className="block text-[10px] uppercase tracking-[0.1em] text-[#8a867c]">Event</span><strong className="mt-1 block text-[#34483c]">{selectedQuoteQuery.data.customer.eventType}</strong></div>
              <div><span className="block text-[10px] uppercase tracking-[0.1em] text-[#8a867c]">Venue / hall</span><strong className="mt-1 block text-[#34483c]">{selectedQuoteQuery.data.customer.hall}</strong></div>
              <div><span className="block text-[10px] uppercase tracking-[0.1em] text-[#8a867c]">Event date &amp; time</span>{hasAnySlots(selectedQuoteQuery.data.customer.eventSlots) ? <ul className="mt-1 space-y-1 text-[#34483c]">{scheduleLines(quoteEventDates(selectedQuoteQuery.data.customer), selectedQuoteQuery.data.customer.eventSlots).map((line) => <li key={line.date}><strong>{formatEventDates([line.date])}</strong><span className="block text-xs">{line.text}</span></li>)}</ul> : <strong className="mt-1 block text-[#34483c]">{formatEventDates(quoteEventDates(selectedQuoteQuery.data.customer))} · time not set</strong>}</div>
              <div><span className="block text-[10px] uppercase tracking-[0.1em] text-[#8a867c]">Guests</span><strong className="mt-1 block text-[#34483c]">{selectedQuoteQuery.data.customer.guests.toLocaleString('en-IN')}</strong></div>
              <div><span className="block text-[10px] uppercase tracking-[0.1em] text-[#8a867c]">Customer GST</span><strong className="mt-1 block text-[#34483c]">{selectedQuoteQuery.data.customer.gstNumber || 'Not provided'}</strong></div>
              <div><span className="block text-[10px] uppercase tracking-[0.1em] text-[#8a867c]">Hall GST</span><strong className="mt-1 block text-[#34483c]">{selectedQuoteQuery.data.pricing.gstNumber || 'Not provided'}</strong></div>
            </div>
            <div className="rounded-xl border border-[#e3d8c9] bg-[#fffdf8] p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3 border-b border-[#eee6d9] pb-3"><h3 className="font-serif text-lg font-semibold text-[#263b31]">Selected services</h3><span className="font-mono text-xs text-[#864936]">{selectedQuoteQuery.data.services.length} {selectedQuoteQuery.data.services.length === 1 ? 'item' : 'items'}</span></div>
              {selectedQuoteQuery.data.services.length ? <div className="divide-y divide-[#f0e8dc]">{selectedQuoteQuery.data.services.map((service) => <div key={service.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><strong className="text-[#34483c]">{service.name}</strong><p className="mt-1 text-xs text-[#858178]">{service.category} / {service.subcategory}</p></div><div className="flex items-center justify-between gap-5 sm:justify-end"><span className="text-xs text-[#6e6a61]">{service.pricingType === 'perPerson' ? `${selectedQuoteQuery.data.customer.guests.toLocaleString('en-IN')} guests` : `Qty ${service.quantity}`} · {money(service.unitPrice)} {serviceRateLabel(service.pricingType)}</span><strong className="font-mono text-[#864936]">{money(service.total)}</strong></div></div>)}</div> : <p className="py-4 text-xs text-[#858178]">No additional services selected.</p>}
            </div>
            <div className="ml-auto max-w-sm space-y-1 border-t border-[#d8cbb9] pt-3">
              <div className="flex justify-between gap-4 text-[#5f655e]"><span>Food price per plate</span><strong className="font-mono">{money(selectedQuoteQuery.data.pricing.foodPerPlate)}</strong></div>
              <div className="flex justify-between gap-4 text-[#5f655e]"><span>Subtotal</span><strong className="font-mono">{money(selectedQuoteQuery.data.pricing.subtotal)}</strong></div>
              {selectedQuoteQuery.data.pricing.discountEnabled && (selectedQuoteQuery.data.pricing.discountAmount ?? 0) > 0 && <div className="flex justify-between gap-4 text-[#5f655e]"><span>Discount</span><strong className="font-mono">− {money(selectedQuoteQuery.data.pricing.discountAmount ?? 0)}</strong></div>}
              {selectedQuoteQuery.data.pricing.gstEnabled && <div className="flex justify-between gap-4 text-[#5f655e]"><span>GST ({selectedQuoteQuery.data.pricing.gstRate}%)</span><strong className="font-mono">{money(selectedQuoteQuery.data.pricing.gstAmount)}</strong></div>}
              <div className="flex justify-between gap-4 pt-1 text-base font-semibold text-[#864936]"><span>Grand total</span><strong className="font-mono">{money(selectedQuoteQuery.data.pricing.grandTotal)}</strong></div>
              {quoteAdvance(selectedQuoteQuery.data.pricing).paid && <div className="flex justify-between gap-4 text-[#3c7a52]"><span>Advance paid</span><strong className="font-mono">− {money(quoteAdvance(selectedQuoteQuery.data.pricing).amount)}</strong></div>}
              {quoteAdvance(selectedQuoteQuery.data.pricing).paid && <div className="flex justify-between gap-4 text-base font-semibold text-[#864936]"><span>Balance to pay</span><strong className="font-mono">{money(quoteAdvance(selectedQuoteQuery.data.pricing).balance)}</strong></div>}
              {selectedQuoteQuery.data.pricing.showCostPerGuest !== false && <div className="flex justify-between gap-4 text-xs text-[#7a776e]"><span>Cost per guest</span><strong className="font-mono">{money(selectedQuoteQuery.data.pricing.costPerGuest)}</strong></div>}
            </div>
            <PaymentPanel key={selectedQuoteQuery.data.reference} quote={selectedQuoteQuery.data} />
          </div>}
        </section>}
    </div>
    {settingsOpen && <div className="fixed inset-0 z-40 flex justify-end bg-[#1d2e25]/45 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }} data-testid="overlay-settings">
      <aside className="flex h-full w-full max-w-4xl flex-col bg-[#fffdf8] shadow-2xl" role="dialog" aria-modal="true" aria-label="Settings" data-testid="panel-settings">
        <div className="flex items-start justify-between gap-4 border-b border-[#eee6d9] px-4 py-4 sm:px-8 sm:py-5">
          <div><p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#9a5b47]">Operations desk</p><h2 className="mt-1.5 font-serif text-2xl font-semibold text-[#263b31]">Settings</h2></div>
          <div className="flex items-center gap-2"><button type="button" onClick={() => void onSignOut()} className="admin-secondary sm:hidden" data-testid="button-settings-sign-out">Sign out</button><button type="button" onClick={() => setSettingsOpen(false)} aria-label="Close settings" data-testid="button-close-settings" className="grid size-9 place-items-center rounded-full text-[#706e67] hover:bg-[#f2e8d3]"><X size={18} /></button></div>
        </div>
        <div className="flex gap-2 overflow-x-auto border-b border-[#eee6d9] px-4 py-3 sm:px-8" role="tablist" data-testid="tabs-settings">
          {([['menu', 'Menu & catalog', LayoutGrid], ['payment', 'Payment account', Landmark]] as const).map(([key, label, Icon]) => (
            <button key={key} type="button" role="tab" aria-selected={settingsTab === key} onClick={() => setSettingsTab(key)} className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition ${settingsTab === key ? 'border-[#864936] bg-[#864936] text-white' : 'border-[#e0d3c1] bg-white text-[#5f655e] hover:border-[#864936]'}`} data-testid={`tab-settings-${key}`}><Icon size={14} /> {label}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-7">
          {settingsTab === 'payment' ? (
            <PaymentSettingsSection />
          ) : (
            <div data-testid="settings-menu-editor">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
                <div><p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#9a5b47]">Menu editor</p><h3 className="mt-2 font-serif text-2xl font-semibold text-[#263b31]">Menu &amp; catalog</h3><p className="mt-1 max-w-xl text-sm leading-6 text-[#7a776e]">Add categories, groups and services, set prices and choose what customers can see. Changes sync to Supabase and appear in the estimator for future visitors.</p></div>
                <div className="flex flex-wrap items-center gap-2"><span className="saved-pill" data-testid="status-catalog-saved"><Check size={14} /> {updateCatalogMutation.isPending ? 'Saving…' : updateCatalogMutation.isSuccess ? 'Saved to cloud' : 'Saved locally'} · {savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>{updateCatalogMutation.isError && <span className="rounded-lg border border-[#e8cfc5] bg-[#fff7f3] px-3 py-2 text-xs text-[#73483b]" role="alert">Cloud save failed, so other devices will not see this change. Please sign out, sign in again and retry.</span>}<button type="button" onClick={() => setModal({ kind: 'restore' })} className="admin-secondary" data-testid="button-open-restore"><RotateCcw size={15} /> Restore original</button><button type="button" onClick={() => setModal({ kind: 'category' })} className="admin-primary" data-testid="button-add-category"><Plus size={16} /> Add category</button></div>
              </div>
              <div className="mt-8 grid gap-3 sm:grid-cols-4"><div className="stat-card"><LayoutGrid size={18} /><span>Categories</span><strong data-testid="text-category-count">{stats.categories}</strong></div><div className="stat-card"><Boxes size={18} /><span>Subcategories</span><strong data-testid="text-subcategory-count">{stats.subcategories}</strong></div><div className="stat-card"><ListChecks size={18} /><span>Services</span><strong data-testid="text-service-count">{stats.services}</strong></div><div className="stat-card"><Check size={18} /><span>Customer-ready</span><strong data-testid="text-active-service-count">{stats.active}</strong></div></div>
              <div className="mt-8 space-y-4">{catalog.length === 0 ? <div className="empty-panel" data-testid="empty-catalog"><CircleAlert size={24} /><h2>Nothing in the catalog yet</h2><p>Start with a category to give customers something to choose from.</p><button type="button" onClick={() => setModal({ kind: 'category' })} className="admin-primary" data-testid="button-add-first-category"><Plus size={16} /> Add first category</button></div> : catalog.map((category, categoryIndex) => <CategoryRow key={category.id} category={category} canMoveUp={categoryIndex > 0} canMoveDown={categoryIndex < catalog.length - 1} onMoveUp={() => moveCategory(category.id, -1)} onMoveDown={() => moveCategory(category.id, 1)} open={expanded[category.id] ?? true} onToggle={() => setExpanded((current) => ({ ...current, [category.id]: !(current[category.id] ?? true) }))} onEdit={() => setModal({ kind: 'category', category })} onDelete={() => deleteCategory(category)} onAddSubcategory={() => setModal({ kind: 'subcategory', categoryId: category.id })} onEditSubcategory={(subcategory) => setModal({ kind: 'subcategory', categoryId: category.id, subcategory })} onDeleteSubcategory={(subcategory) => deleteSubcategory(category.id, subcategory)} onAddService={(subcategory) => setModal({ kind: 'service', categoryId: category.id, subcategoryId: subcategory.id })} onEditService={(subcategory, service) => setModal({ kind: 'service', categoryId: category.id, subcategoryId: subcategory.id, service })} onToggleService={(subcategory, service) => updateCategory(category.id, (entry) => ({ ...entry, subcategories: entry.subcategories.map((group) => group.id === subcategory.id ? { ...group, items: group.items.map((item) => item.id === service.id ? { ...item, active: !item.active } : item) } : group) }))} onDeleteService={deleteService} />)}</div>
            </div>
          )}
        </div>
      </aside>
    </div>}
    {modal?.kind === 'category' && <CategoryModal state={modal} onClose={() => setModal(null)} onSave={handleCategorySave} />}
    {modal?.kind === 'subcategory' && <SubcategoryModal state={modal} onClose={() => setModal(null)} onSave={handleSubcategorySave} />}
    {modal?.kind === 'service' && <ServiceModal state={modal} onClose={() => setModal(null)} onSave={handleServiceSave} />}
    {modal?.kind === 'restore' && <Modal title="Restore original catalog?" eyebrow="Catalog / reset" onClose={() => setModal(null)} testId="dialog-restore"><div className="mt-5 rounded-xl border border-[#e8cfc5] bg-[#fff7f3] p-4 text-sm leading-6 text-[#73483b]"><CircleAlert size={18} className="mb-2" /><p>This will remove your local edits and bring back the original {ORIGINAL_CATALOG.length} categories and current services. This cannot be undone.</p></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setModal(null)} className="admin-secondary" data-testid="button-cancel-restore">Keep my edits</button><button type="button" onClick={restore} className="admin-danger" data-testid="button-confirm-restore"><RotateCcw size={16} /> Restore catalog</button></div></Modal>}
   </main>
   <SavedQuotePrintSheet quote={quoteToPrint} />
   <EnquiryReportSheet report={reportToPrint} />
   </>;
}

function CategoryRow({ category, canMoveUp, canMoveDown, onMoveUp, onMoveDown, open, onToggle, onEdit, onDelete, onAddSubcategory, onEditSubcategory, onDeleteSubcategory, onAddService, onEditService, onToggleService, onDeleteService }: { category: CatalogCategory; canMoveUp: boolean; canMoveDown: boolean; onMoveUp: () => void; onMoveDown: () => void; open: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void; onAddSubcategory: () => void; onEditSubcategory: (subcategory: CatalogSubcategory) => void; onDeleteSubcategory: (subcategory: CatalogSubcategory) => void; onAddService: (subcategory: CatalogSubcategory) => void; onEditService: (subcategory: CatalogSubcategory, service: CatalogItem) => void; onToggleService: (subcategory: CatalogSubcategory, service: CatalogItem) => void; onDeleteService: (categoryId: string, subcategoryId: string, service: CatalogItem) => void }) {
  const services = category.subcategories.reduce((sum, subcategory) => sum + subcategory.items.length, 0);
  return <section className="overflow-hidden rounded-2xl border border-[#e3d8c9] bg-[#fffdf8] shadow-[0_14px_40px_rgba(98,67,36,.045)]" data-testid={`card-category-${category.id}`}>
    <div className="flex items-start gap-3 p-4 sm:items-center sm:p-5"><button type="button" onClick={onToggle} className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f2e8d3] text-[#864936]" aria-expanded={open} data-testid={`button-toggle-category-${category.id}`}>{open ? <ChevronDown size={19} /> : <ChevronRight size={19} />}</button><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-serif text-xl font-semibold text-[#263b31]" data-testid={`text-category-name-${category.id}`}>{category.name}</h2><span className="count-pill" data-testid={`text-category-service-count-${category.id}`}>{services} services</span></div><p className="mt-1 text-sm text-[#7a776e]" data-testid={`text-category-description-${category.id}`}>{category.description || 'No category description yet.'}</p></div><div className="flex shrink-0 gap-1"><button type="button" onClick={onMoveUp} disabled={!canMoveUp} className="icon-button disabled:opacity-30" aria-label={`Move ${category.name} up`} title="Move up" data-testid={`button-move-up-${category.id}`}><ArrowUp size={16} /></button><button type="button" onClick={onMoveDown} disabled={!canMoveDown} className="icon-button disabled:opacity-30" aria-label={`Move ${category.name} down`} title="Move down" data-testid={`button-move-down-${category.id}`}><ArrowDown size={16} /></button><button type="button" onClick={onEdit} className="icon-button" aria-label={`Edit ${category.name}`} data-testid={`button-edit-category-${category.id}`}><Pencil size={16} /></button><button type="button" onClick={onDelete} className="icon-button danger-hover" aria-label={`Delete ${category.name}`} data-testid={`button-delete-category-${category.id}`}><Trash2 size={16} /></button></div></div>
    {open && <div className="border-t border-[#eee6d9] bg-[#fcf8f0] px-3 pb-3 sm:px-5 sm:pb-5"><div className="flex items-center justify-between gap-3 py-4"><span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#9a5b47]">Service groups</span><button type="button" onClick={onAddSubcategory} className="admin-link" data-testid={`button-add-subcategory-${category.id}`}><Plus size={15} /> Add group</button></div>{category.subcategories.length === 0 ? <div className="rounded-xl border border-dashed border-[#d9cbb9] bg-[#fffdf8] px-4 py-7 text-center" data-testid={`empty-subcategories-${category.id}`}><p className="text-sm font-semibold text-[#47564c]">No service groups in this category</p><p className="mt-1 text-xs text-[#88847b]">Add a group before adding services.</p></div> : <div className="space-y-3">{category.subcategories.map((subcategory) => <SubcategoryRow key={subcategory.id} categoryId={category.id} subcategory={subcategory} onEdit={() => onEditSubcategory(subcategory)} onDelete={() => onDeleteSubcategory(subcategory)} onAddService={() => onAddService(subcategory)} onEditService={(service) => onEditService(subcategory, service)} onToggleService={(service) => onToggleService(subcategory, service)} onDeleteService={(service) => onDeleteService(category.id, subcategory.id, service)} />)}</div>}</div>}
  </section>;
}

function SubcategoryRow({ categoryId, subcategory, onEdit, onDelete, onAddService, onEditService, onToggleService, onDeleteService }: { categoryId: string; subcategory: CatalogSubcategory; onEdit: () => void; onDelete: () => void; onAddService: () => void; onEditService: (service: CatalogItem) => void; onToggleService: (service: CatalogItem) => void; onDeleteService: (service: CatalogItem) => void }) {
  return <div className="rounded-xl border border-[#e6dccd] bg-[#fffdf8]" data-testid={`card-subcategory-${subcategory.id}`}><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eee6d9] px-3 py-3 sm:px-4"><div className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-[#d6ae60]" /><h3 className="text-sm font-bold uppercase tracking-[0.1em] text-[#4c5b50]" data-testid={`text-subcategory-name-${subcategory.id}`}>{subcategory.name}</h3><span className="text-xs text-[#908b81]" data-testid={`text-subcategory-service-count-${subcategory.id}`}>{subcategory.items.length}</span></div><div className="flex items-center gap-1"><button type="button" onClick={onAddService} className="admin-link" data-testid={`button-add-service-${subcategory.id}`}><Plus size={14} /> Add service</button><button type="button" onClick={onEdit} className="icon-button" aria-label={`Edit ${subcategory.name}`} data-testid={`button-edit-subcategory-${subcategory.id}`}><Pencil size={14} /></button><button type="button" onClick={onDelete} className="icon-button danger-hover" aria-label={`Delete ${subcategory.name}`} data-testid={`button-delete-subcategory-${subcategory.id}`}><Trash2 size={14} /></button></div></div>{subcategory.items.length === 0 ? <div className="px-4 py-6 text-center text-xs text-[#8b887f]" data-testid={`empty-services-${subcategory.id}`}>No services here yet. Add the first offering.</div> : <div className="divide-y divide-[#f0e8dc]">{subcategory.items.map((service) => <ServiceRow key={service.id} categoryId={categoryId} service={service} onEdit={() => onEditService(service)} onToggle={() => onToggleService(service)} onDelete={() => onDeleteService(service)} />)}</div>}</div>;
}

function ServiceRow({ categoryId, service, onEdit, onToggle, onDelete }: { categoryId: string; service: CatalogItem; onEdit: () => void; onToggle: () => void; onDelete: () => void }) {
  const rate = service.pricingType === 'perPerson' ? categoryId === 'food' ? '/ plate' : '/ guest' : service.pricingType === 'perUnit' ? '/ unit' : 'one-time';
  return <div className={`flex flex-col gap-3 px-3 py-3.5 sm:flex-row sm:items-center sm:px-4 ${!service.active ? 'opacity-60' : ''}`} data-testid={`row-service-${service.id}`}><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-[#2e4437]" data-testid={`text-service-name-${service.id}`}>{service.name}</span><span className={`status-pill ${service.active ? 'status-active' : 'status-inactive'}`} data-testid={`status-service-${service.id}`}>{service.active ? 'Live' : 'Hidden'}</span></div><p className="mt-1 truncate text-xs text-[#858178]" data-testid={`text-service-description-${service.id}`}>{service.description || 'No description yet.'}</p></div><div className="flex items-center justify-between gap-4 sm:justify-end"><div className="text-right"><p className="font-mono text-sm font-bold text-[#864936]" data-testid={`text-service-price-${service.id}`}>{money(service.price)}</p><p className="text-[10px] uppercase tracking-[0.08em] text-[#938b7f]">{rate} · {service.minQuantity}–{service.maxQuantity} qty</p></div><div className="flex gap-1"><button type="button" onClick={onToggle} className="icon-button" aria-label={`${service.active ? 'Disable' : 'Enable'} ${service.name}`} data-testid={`button-toggle-service-${service.id}`}><Check size={15} /></button><button type="button" onClick={onEdit} className="icon-button" aria-label={`Edit ${service.name}`} data-testid={`button-edit-service-${service.id}`}><Pencil size={15} /></button><button type="button" onClick={onDelete} className="icon-button danger-hover" aria-label={`Delete ${service.name}`} data-testid={`button-delete-service-${service.id}`}><Trash2 size={15} /></button></div></div></div>;
}

function AdminLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await signInAdmin(email, password);
      onSignedIn();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Sign-in failed.');
    } finally {
      setPending(false);
    }
  };
  return <main className="admin-shell grid min-h-[100dvh] place-items-center px-4 py-10">
    <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-[#e3d8c9] bg-[#fffdf8] p-6 shadow-[0_14px_40px_rgba(98,67,36,.08)] sm:p-8">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#9a5b47]">Private workspace</p>
      <h1 className="mt-3 font-serif text-3xl font-semibold text-[#263b31]">Sign in to operations</h1>
      <p className="mt-2 text-sm leading-6 text-[#737269]">Use the Supabase Auth account added to the admin allowlist.</p>
      <div className="mt-6 space-y-4">
        <TextField label="Email" value={email} onChange={setEmail} testId="input-admin-email" />
        <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.09em] text-[#5f655e]">Password</span><input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="field-control h-11 w-full rounded-xl px-3 text-sm" data-testid="input-admin-password" /></label>
      </div>
      {error && <p className="mt-4 rounded-xl border border-[#e8cfc5] bg-[#fff7f3] p-3 text-sm text-[#73483b]" role="alert">{error}</p>}
      <button type="submit" disabled={pending} className="admin-primary mt-6 w-full justify-center disabled:opacity-60" data-testid="button-admin-sign-in">{pending ? 'Signing in…' : 'Sign in'}</button>
    </form>
  </main>;
}

function AdminPage() {
  const sessionQuery = useAdminSession();
  const [, setAuthVersion] = useState(0);
  useEffect(() => subscribeToAuthChanges(() => setAuthVersion((value) => value + 1)), []);

  if (!isSupabaseConfigured) {
    return <main className="admin-shell grid min-h-[100dvh] place-items-center px-4 py-10"><div className="max-w-lg rounded-2xl border border-[#e8cfc5] bg-[#fff7f3] p-6 text-sm leading-6 text-[#73483b]"><h1 className="font-serif text-2xl font-semibold">Supabase setup required</h1><p className="mt-3">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the GitHub Actions environment before opening the private admin workspace.</p></div></main>;
  }
  if (sessionQuery.isLoading) return <main className="admin-shell grid min-h-[100dvh] place-items-center text-sm text-[#737269]">Checking admin session…</main>;
  if (!sessionQuery.data) return <AdminLogin onSignedIn={() => void sessionQuery.refetch()} />;
  return <AdminWorkspace onSignOut={async () => { await signOutAdmin(); await sessionQuery.refetch(); }} />;
}

export default AdminPage;