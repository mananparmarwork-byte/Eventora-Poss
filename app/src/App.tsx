import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetCatalogQueryKey,
  getListQuotesQueryKey,
  getGetQuoteQueryKey,
  useCreateQuote,
  useUpdateQuote,
  useGetQuote,
  quoteAdvance,
  useGetCatalog,
  useBookedSlots,
  parseEventDates,
  formatEventDates,
  quoteEventDates,
} from '@/lib/supabase-queries';
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  Clock3,
  IndianRupee,
  Minus,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Send,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/pages/not-found';
import type { EstimatePayload } from '@/lib/estimate-connection';
import type { Quote } from '@/lib/supabase-queries';
import { CATALOG_UPDATED_EVENT, cacheCatalog, loadCatalog } from '@/lib/catalog';
import type { CatalogCategory as Category, CatalogItem as Item, CatalogSubcategory as Subcategory } from '@/lib/catalog';
import AdminPage from '@/pages/admin';
import { ClockTimePicker } from '@/components/clock-time-picker';
import { PrintBill, type PrintBillData } from '@/components/print-bill';
import { durationText, formatTime, fromMinutes, hasAnySlots, isFullDayBooked, isRangeComplete, isRangeValid, normalizeEventSlots, normalizeRange, occupancyEntries, rangesOverlap, rangesText, scheduleLines, timeText, toMinutes, type EventSlots, type TimeRange } from '@/lib/booking';

const EVENT_TYPES = ['Wedding', 'Reception', 'Engagement', 'Birthday', 'Anniversary', 'Corporate', 'Other'];
const BANQUET_NAME = 'Swagattam Party Lawns';
const INITIAL_DETAILS = { name: '', mobile: '', eventType: '', otherEventType: '', eventDate: '', guests: '150', billNumber: '', customerGstNumber: '' };
const DRAFT_STORAGE_KEY = 'swagattam-banquet-estimate';
// Print only: show each item's description under its name. Set to true to also show it for Food & Catering items.
const BRAND_LOGO = `${import.meta.env.BASE_URL}swagattam-logo.webp`;

type Details = typeof INITIAL_DETAILS;
type ValidationErrors = Partial<Record<keyof Details, string>>;
type Line = Item & { categoryName: string; subcategoryName: string; quantity: number; total: number };
type PrintableLine = Pick<Line, 'id' | 'name' | 'description' | 'categoryId' | 'categoryName' | 'subcategoryName' | 'pricingType' | 'quantity' | 'price' | 'total'>;
type PrintData = {
  details: Details;
  lines: PrintableLine[];
  categoryTotals: Record<string, number>;
  foodPerPlate: number;
  subtotal: number;
  gstEnabled: boolean;
  gstRate: number;
  gstAmount: number;
  gstNumber: string;
  gstNumberVisible: boolean;
  customerGstNumberVisible: boolean;
  discountAmount: number;
  discountLabel: string;
  grandTotal: number;
  costPerGuest: number;
  showCostPerGuest: boolean;
  eventSlots: EventSlots;
  billNumber: string;
  advanceAmount: number;
  balanceDue: number;
};
type CopyStatus = 'idle' | 'copied' | 'error';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const currency = (amount: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0);
const numberFormat = (amount: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(amount);
const localISODate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const displayEventDates = (value: string) => formatEventDates(parseEventDates(value));
const displayDate = (date: string) => (date ? new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not selected');
const displayEventType = (details: Details) => details.eventType === 'Other' ? details.otherEventType.trim() || 'Other' : details.eventType;

function advanceMessage(pricing: { grandTotal: number; advancePaid?: boolean; advanceAmount?: number }) {
  const advance = quoteAdvance(pricing);
  return advance.paid ? `\nAdvance paid: -${currency(advance.amount)}\nBalance to pay: ${currency(advance.balance)}` : '';
}

function discountLabelText(percent: number, flat: number) {
  const parts: string[] = [];
  if (percent > 0) parts.push(`${percent}%`);
  if (flat > 0) parts.push(currency(flat));
  return parts.length ? `Discount (${parts.join(' + ')})` : 'Discount';
}

function isFoodCategory(category: string) {
  return category.toLowerCase().includes('food');
}

function serviceRateLabel(pricingType: EstimatePayload['services'][number]['pricingType']) {
  if (pricingType === 'perPerson') return '/ plate';
  if (pricingType === 'perUnit') return '/ unit';
  return 'one-time';
}

function serviceDisplayAmount(service: EstimatePayload['services'][number], showFoodRate = false) {
  return showFoodRate && isFoodCategory(service.category)
    ? `${currency(service.unitPrice)} ${serviceRateLabel(service.pricingType)}`
    : currency(service.total);
}

function categoryIcon(categoryId: string, size = 20) {
  const props = { size, strokeWidth: 1.7 };
  // Keep the category treatment consistent, including for categories added later.
  void categoryId;
  return <Sparkles {...props} />;
}

function pricingLabel(item: Item, categoryId?: string) {
  if (item.pricingType === 'perPerson') return `${currency(item.price)} ${categoryId === 'food' ? '/ plate' : '/ guest'}`;
  if (item.pricingType === 'perUnit') return `${currency(item.price)} / unit`;
  return 'One-time service';
}

function CategoryCard({
  category,
  selections,
  onToggle,
  onQuantityChange,
}: {
  category: Category;
  selections: Record<string, number>;
  onToggle: (item: Item, checked: boolean) => void;
  onQuantityChange: (item: Item, quantity: number) => void;
}) {
  const [open, setOpen] = useState(category.id === 'food');
  const itemCount = category.subcategories.reduce((total, subcategory) => total + subcategory.items.length, 0);
  const selectedCount = category.subcategories.reduce((total, subcategory) => total + subcategory.items.filter((item) => (selections[item.id] ?? 0) > 0).length, 0);
  return (
    <section className="overflow-hidden rounded-2xl border border-[#e5dccd] bg-[#fffdf8]">
      <button
        type="button"
        data-testid={`button-toggle-category-${category.id}`}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-[76px] w-full items-center gap-4 px-4 py-4 text-left sm:px-5"
        aria-expanded={open}
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f2e8d3] text-[#864936]">{categoryIcon(category.id)}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-serif text-[1.12rem] font-semibold text-[#243b31]">{category.name}</span>
           <span className="mt-0.5 block text-xs text-[#76746c]">{category.description}</span>
           <span className="mt-2 block font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#9a5b47]">
             {itemCount} {itemCount === 1 ? 'service' : 'services'}{selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
           </span>
        </span>
        {open ? <ChevronDown size={19} className="text-[#864936]" /> : <ChevronRight size={19} className="text-[#864936]" />}
      </button>
      {open && (
        <div className="border-t border-[#eee6d9] px-3 pb-3 sm:px-4 sm:pb-4">
          {category.subcategories.map((subcategory) => (
            <SubcategoryGroup
              key={subcategory.id}
              categoryId={category.id}
              subcategory={subcategory}
              selections={selections}
              onToggle={onToggle}
              onQuantityChange={onQuantityChange}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SubcategoryGroup({
  categoryId,
  subcategory,
  selections,
  onToggle,
  onQuantityChange,
}: {
  categoryId: string;
  subcategory: Subcategory;
  selections: Record<string, number>;
  onToggle: (item: Item, checked: boolean) => void;
  onQuantityChange: (item: Item, quantity: number) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-[#eee6d9] last:border-b-0">
      <button
        type="button"
        data-testid={`button-toggle-subcategory-${subcategory.id}`}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-[50px] w-full items-center gap-2 text-left"
        aria-expanded={open}
      >
        {open ? <ChevronDown size={16} className="text-[#9a5b47]" /> : <ChevronRight size={16} className="text-[#9a5b47]" />}
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#6c6a63]">{subcategory.name}</span>
      </button>
      {open && (
        <div className="space-y-2 pb-3">
          {subcategory.items.map((item) => {
            const quantity = selections[item.id] ?? 0;
            const selected = quantity > 0;
            return (
              <div key={item.id} className={`item-row flex items-center gap-3 rounded-xl border px-3 py-3 ${selected ? 'is-selected' : 'border-[#eee6d9]'}`}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(event) => onToggle(item, event.target.checked)}
                  className="service-check cursor-pointer"
                  aria-label={`Select ${item.name}`}
                  data-testid={`input-select-item-${item.id}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="text-sm font-semibold text-[#263b31]">{item.name}</span>
                    <span className="font-mono text-xs font-bold text-[#864936]">{pricingLabel(item, categoryId)}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[#77756e]">{item.description}</p>
                </div>
                {selected && item.pricingType === 'perUnit' && (
                  <div className="flex shrink-0 items-center rounded-lg border border-[#dccfbd] bg-[#fffdf8]" aria-label={`Quantity for ${item.name}`}>
                    <button type="button" className="quantity-button rounded-l-lg border-0" onClick={() => onQuantityChange(item, quantity - 1)} aria-label={`Decrease ${item.name}`} data-testid={`button-decrease-${item.id}`}>
                      <Minus size={15} />
                    </button>
                    <span className="min-w-[30px] text-center font-mono text-sm font-bold text-[#263b31]" data-testid={`text-quantity-${item.id}`}>{quantity}</span>
                    <button type="button" className="quantity-button rounded-r-lg border-0" onClick={() => onQuantityChange(item, quantity + 1)} aria-label={`Increase ${item.name}`} data-testid={`button-increase-${item.id}`}>
                      <Plus size={15} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EventDetails({
  details,
  errors,
  hallGstNumber,
  customerGstNumber,
  gstNumberVisible,
  customerGstNumberVisible,
  eventSlots,
  bookedSlots,
  onEventSlotsChange,
  onChange,
  onHallGstNumberChange,
  onCustomerGstNumberChange,
  onGstNumberVisibilityChange,
  onCustomerGstNumberVisibilityChange,
  billNumberLocked = false,
}: {
  billNumberLocked?: boolean;
  details: Details;
  errors: ValidationErrors;
  hallGstNumber: string;
  customerGstNumber: string;
  gstNumberVisible: boolean;
  customerGstNumberVisible: boolean;
  eventSlots: EventSlots;
  bookedSlots: Record<string, TimeRange[]>;
  onEventSlotsChange: (slots: EventSlots) => void;
  onChange: (field: keyof Details, value: string) => void;
  onHallGstNumberChange: (value: string) => void;
  onCustomerGstNumberChange: (value: string) => void;
  onGstNumberVisibilityChange: (visible: boolean) => void;
  onCustomerGstNumberVisibilityChange: (visible: boolean) => void;
}) {
  return (
    <section className="selection-card page-enter rounded-2xl border border-[#e4dacc] p-4 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#9a5b47]">01 / Start with the occasion</p>
          <h2 className="mt-2 font-serif text-2xl font-semibold text-[#263b31]">Event details</h2>
          <p className="mt-1 text-sm text-[#74736c]">A few details help us shape a useful first estimate.</p>
        </div>
        <CalendarDays size={22} className="mt-1 shrink-0 text-[#9a5b47]" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer name" required error={errors.name}>
          <input value={details.name} onChange={(e) => onChange('name', e.target.value)} placeholder="e.g. Kavya Mehta" className="field-control h-12 w-full rounded-xl px-3 text-sm" data-testid="input-customer-name" />
        </Field>
        <Field label="Mobile number" required error={errors.mobile} hint="10 digit mobile number">
          <input value={details.mobile} onChange={(e) => onChange('mobile', e.target.value.replace(/[^\d+ ]/g, '').slice(0, 14))} inputMode="tel" placeholder="e.g. 98765 43210" className="field-control h-12 w-full rounded-xl px-3 text-sm" data-testid="input-mobile-number" />
        </Field>
        <Field label="Event type" required error={errors.eventType}>
          <select value={details.eventType} onChange={(e) => onChange('eventType', e.target.value)} className="field-control h-12 w-full rounded-xl px-3 text-sm" data-testid="select-event-type">
            <option value="">Choose event type</option>
            {EVENT_TYPES.map((eventType) => <option key={eventType} value={eventType}>{eventType}</option>)}
          </select>
        </Field>
        {details.eventType === 'Other' && (
          <Field label="What occasion are you planning?" required error={errors.otherEventType} hint="Please describe the occasion">
            <input
              value={details.otherEventType}
              onChange={(e) => onChange('otherEventType', e.target.value.slice(0, 80))}
              placeholder="e.g. Naming ceremony"
              maxLength={80}
              className="field-control h-12 w-full rounded-xl px-3 text-sm"
              data-testid="input-other-event-type"
              aria-label="Other occasion"
            />
          </Field>
        )}
        <MultiDatePicker value={details.eventDate} error={errors.eventDate} slots={eventSlots} booked={bookedSlots} onChange={(value) => onChange('eventDate', value)} onSlotsChange={onEventSlotsChange} />
        <Field label="Number of guests" required error={errors.guests} hint="Food items are priced per guest">
          <div className="relative">
            <UsersRound size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9a5b47]" />
            <input type="number" min="1" step="1" value={details.guests} onChange={(e) => onChange('guests', e.target.value.replace(/[^\d]/g, '').slice(0, 5))} className="field-control h-12 w-full rounded-xl pl-10 pr-3 text-sm" data-testid="input-guest-count" />
          </div>
        </Field>
         <Field label="Bill No" required error={errors.billNumber} hint="Enter manually">
           <input
             value={details.billNumber}
             onChange={(e) => onChange('billNumber', e.target.value.replace(/\D/g, '').slice(0, 12))}
             disabled={billNumberLocked}
             inputMode="numeric"
             placeholder="e.g. 1001"
             className="field-control h-12 w-full rounded-xl px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
             data-testid="input-bill-number"
             aria-label="Bill number"
           />
         </Field>
         <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
         <Field label="Hall GST number" hint="Optional · shown on the bill">
           <div className="space-y-2">
             <input
               value={hallGstNumber}
               onChange={(e) => onHallGstNumberChange(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15))}
               placeholder="e.g. 22AAAAA0000A1Z5"
               maxLength={15}
               className="field-control h-12 w-full rounded-xl px-3 text-sm uppercase"
               data-testid="input-hall-gst-number"
               aria-label="Hall GST number"
             />
             <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#5f655e]">
               <input
                 type="checkbox"
                 checked={gstNumberVisible}
                 onChange={(e) => onGstNumberVisibilityChange(e.target.checked)}
                 className="size-4 accent-[#864936]"
                 data-testid="input-gst-number-visible"
               />
               Show on bill
             </label>
           </div>
         </Field>
        <Field label="Customer GST number" hint="Optional · shown on the bill">
           <div className="space-y-2">
             <input
               value={customerGstNumber}
               onChange={(e) => onCustomerGstNumberChange(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15))}
               placeholder="e.g. 22AAAAA0000A1Z5"
               maxLength={15}
               className="field-control h-12 w-full rounded-xl px-3 text-sm uppercase"
               data-testid="input-customer-gst-number"
               aria-label="Customer GST number"
             />
             <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#5f655e]">
               <input
                 type="checkbox"
                 checked={customerGstNumberVisible}
                 onChange={(e) => onCustomerGstNumberVisibilityChange(e.target.checked)}
                 className="size-4 accent-[#864936]"
                 data-testid="input-customer-gst-number-visible"
               />
               Show on bill
             </label>
           </div>
        </Field>
         </div>
      </div>
    </section>
  );
}

function DiscountBlock({
  enabled,
  percent,
  flat,
  discountAmount,
  onEnabledChange,
  onPercentChange,
  onFlatChange,
}: {
  enabled: boolean;
  percent: string;
  flat: string;
  discountAmount: number;
  onEnabledChange: (enabled: boolean) => void;
  onPercentChange: (value: string) => void;
  onFlatChange: (value: string) => void;
}) {
  return (
    <section className="selection-card page-enter rounded-2xl border border-[#e4dacc] p-4 sm:p-6" data-testid="block-discount">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#9a5b47]">Reference discount</p>
          <h2 className="mt-2 font-serif text-2xl font-semibold text-[#263b31]">Discount</h2>
          <p className="mt-1 text-sm text-[#74736c]">Tick to apply. It is deducted from the subtotal and shown on the bill. Untick to remove it completely.</p>
        </div>
        <label className="mt-1 flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold text-[#5f655e]">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
            className="size-5 accent-[#864936]"
            data-testid="input-discount-enabled"
            aria-label="Apply discount and show on bill"
          />
          Show on bill
        </label>
      </div>
      <div className={`mt-5 grid gap-4 sm:grid-cols-2 ${enabled ? '' : 'opacity-50'}`}>
        <Field label="Discount in percentage" hint="e.g. 10 for 10%">
          <div className="relative">
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={percent}
              disabled={!enabled}
              onChange={(e) => onPercentChange(e.target.value)}
              placeholder="0"
              className="field-control h-12 w-full rounded-xl pl-3 pr-10 text-sm disabled:cursor-not-allowed"
              data-testid="input-discount-percent"
              aria-label="Discount percentage"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-sm font-bold text-[#9a5b47]">%</span>
          </div>
        </Field>
        <Field label="Discount in amount" hint="Flat amount in rupees">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm font-bold text-[#9a5b47]">₹</span>
            <input
              type="number"
              min="0"
              step="1"
              value={flat}
              disabled={!enabled}
              onChange={(e) => onFlatChange(e.target.value)}
              placeholder="0"
              className="field-control h-12 w-full rounded-xl pl-8 pr-3 text-sm disabled:cursor-not-allowed"
              data-testid="input-discount-amount"
              aria-label="Discount amount in rupees"
            />
          </div>
        </Field>
      </div>
      {enabled && (
        <p className="mt-4 text-xs font-semibold text-[#5f655e]" data-testid="text-discount-preview">
          Total discount: <span className="font-mono text-[#864936]">− {currency(discountAmount)}</span>
        </p>
      )}
    </section>
  );
}

function MultiDatePicker({ value, error, slots, booked, onChange, onSlotsChange }: { value: string; error?: string; slots: EventSlots; booked: Record<string, TimeRange[]>; onChange: (value: string) => void; onSlotsChange: (slots: EventSlots) => void }) {
  const dates = parseEventDates(value);
  const todayISO = localISODate(new Date());
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const base = dates[0] ? new Date(`${dates[0]}T00:00:00`) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => localISODate(new Date(year, month, index + 1))),
  ];
  const updateDates = (next: string[]) => {
    onChange([...next].sort().join(','));
    const kept: EventSlots = {};
    next.forEach((date) => { if (slots[date]) kept[date] = slots[date]; });
    onSlotsChange(kept);
  };
  const toggleDate = (iso: string) => updateDates(dates.includes(iso) ? dates.filter((date) => date !== iso) : [...dates, iso]);
  const setTime = (date: string, part: 'start' | 'end', time: string) => {
    onSlotsChange({ ...slots, [date]: { ...normalizeRange(slots[date]), [part]: time } });
  };
  const copyFirstToAll = () => {
    const first = normalizeRange(slots[dates[0]]);
    const next: EventSlots = {};
    dates.forEach((date) => { next[date] = { ...first }; });
    onSlotsChange(next);
  };
  return (
    <div data-testid="date-picker">
      <span className="mb-1.5 flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[#5f655e]">
        <span>Event date &amp; time<span className="ml-1 text-[#9a5b47]">*</span></span>
        {!error && <span className="normal-case font-normal tracking-normal text-[#8b887f]">Select days, then the time</span>}
      </span>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="field-control flex h-12 w-full items-center justify-between rounded-xl px-3 text-left text-sm"
        data-testid="input-event-date"
      >
        <span className={dates.length ? 'text-[#263b31]' : 'text-[#9b988f]'}>{dates.length ? `${dates.length} date${dates.length > 1 ? 's' : ''} selected` : 'Select one or more dates'}</span>
        <CalendarDays size={17} className="text-[#9a5b47]" />
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-[#e0d3c1] bg-white p-3 shadow-sm" data-testid="calendar-panel">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => setViewMonth(new Date(year, month - 1, 1))} aria-label="Previous month" className="grid size-8 place-items-center rounded-lg text-[#864936] hover:bg-[#f6efe4]" data-testid="button-prev-month">‹</button>
            <strong className="text-sm text-[#263b31]">{viewMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</strong>
            <button type="button" onClick={() => setViewMonth(new Date(year, month + 1, 1))} aria-label="Next month" className="grid size-8 place-items-center rounded-lg text-[#864936] hover:bg-[#f6efe4]" data-testid="button-next-month">›</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-[#8b887f]">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span key={index} className="py-1">{day}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((iso, index) => {
              if (!iso) return <span key={`blank-${index}`} />;
              const selected = dates.includes(iso);
              const past = iso < todayISO;
              const takenSlots = booked[iso] ?? [];
              const full = isFullDayBooked(takenSlots);
              const partial = takenSlots.length > 0 && !full;
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={past || (full && !selected)}
                  title={full ? 'Fully booked' : partial ? `Already booked: ${rangesText(takenSlots)}` : undefined}
                  onClick={() => toggleDate(iso)}
                  aria-pressed={selected}
                  className={`relative h-9 rounded-lg text-sm font-semibold transition ${selected ? 'bg-[#864936] text-white' : past ? 'cursor-not-allowed text-[#c9c5bb]' : full ? 'cursor-not-allowed bg-[#f6dcd6] text-[#b0675a] line-through' : 'text-[#263b31] hover:bg-[#f6efe4]'} ${iso === todayISO && !selected ? 'ring-1 ring-[#b89555]' : ''}`}
                  data-testid={`button-date-${iso}`}
                >
                  {Number(iso.slice(8))}
                  {partial && <span className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-[#b9822a]" />}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-[#8b887f]" data-testid="text-availability-legend">Red = fully booked · dot = part of the day already booked</p>
          <div className="mt-3 flex items-center justify-between text-xs font-semibold">
            <button type="button" onClick={() => updateDates([])} className="text-[#864936] hover:underline" data-testid="button-clear-dates">Clear all</button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-[#864936] px-4 py-1.5 text-white" data-testid="button-done-dates">Done</button>
          </div>
        </div>
      )}
      {dates.length > 0 && (
        <div className="mt-3 space-y-3" data-testid="selected-dates">
          {dates.map((date) => {
            const chosen = normalizeRange(slots[date]);
            const taken = booked[date] ?? [];
            const complete = isRangeComplete(chosen);
            const valid = isRangeValid(chosen);
            const clash = valid ? taken.filter((range) => rangesOverlap(chosen, range)) : [];
            return (
              <div key={date} className="rounded-xl border border-[#e0d3c1] bg-[#fbf7ef] p-3" data-testid={`date-card-${date}`}>
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-sm text-[#263b31]">{displayDate(date)}</strong>
                  <button type="button" onClick={() => toggleDate(date)} aria-label={`Remove ${displayDate(date)}`} className="grid size-6 place-items-center rounded-full bg-[#864936] text-sm font-bold leading-none text-white" data-testid={`button-remove-date-${date}`}>×</button>
                </div>
                <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#8b887f]">Party plot booking time</p>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <div className="block">
                    <span className="mb-1 block text-[11px] font-bold text-[#5f655e]">From</span>
                    <ClockTimePicker value={chosen.start} onChange={(time) => setTime(date, 'start', time)} invalid={clash.length > 0} title={`Start time · ${displayDate(date)}`} defaultValue="18:00" ariaLabel={`Booking start time on ${displayDate(date)}`} testId={`input-time-start-${date}`} />
                  </div>
                  <div className="block">
                    <span className="mb-1 block text-[11px] font-bold text-[#5f655e]">Till</span>
                    <ClockTimePicker value={chosen.end} onChange={(time) => setTime(date, 'end', time)} invalid={clash.length > 0} endOfDay title={`End time · ${displayDate(date)}`} defaultValue={fromMinutes(Math.min(23 * 60 + 59, (toMinutes(chosen.start) ?? 17 * 60) + 60))} ariaLabel={`Booking end time on ${displayDate(date)}`} testId={`input-time-end-${date}`} />
                  </div>
                </div>
                <p className="mt-2 text-xs font-semibold text-[#5f655e]" data-testid={`text-slot-summary-${date}`}>
                  {valid ? `${timeText(chosen)} · ${durationText(chosen)}` : complete ? 'The end time must be after the start time.' : 'Tap the clock and choose when the booking starts and when it ends.'}
                </p>
                {taken.length > 0 && <p className="mt-1 text-xs font-semibold text-[#b0675a]" data-testid={`text-occupied-${date}`}>Already booked on this date: {rangesText(taken)}</p>}
                {clash.length > 0 && <p className="mt-1 text-xs font-bold text-[#a13d32]" data-testid={`text-clash-${date}`}>This time overlaps an existing booking ({rangesText(clash)}). Please change the time.</p>}
              </div>
            );
          })}
          {dates.length > 1 && isRangeComplete(slots[dates[0]]) && (
            <button type="button" onClick={copyFirstToAll} className="text-xs font-bold text-[#864936] hover:underline" data-testid="button-copy-slots-all">Use the first date's time for all dates</button>
          )}
        </div>
      )}
      {error && <span className="mt-1.5 block text-xs font-medium text-[#a13d32]" data-testid="error-event-date">{error}</span>}
    </div>
  );
}

function Field({ label, required, error, hint, children }: { label: string; required?: boolean; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[#5f655e]">
        <span>{label}{required && <span className="ml-1 text-[#9a5b47]">*</span>}</span>
        {hint && !error && <span className="normal-case font-normal tracking-normal text-[#8b887f]">{hint}</span>}
      </span>
      {children}
      {error && <span className="mt-1.5 block text-xs font-medium text-[#a13d32]" data-testid={`error-${label.toLowerCase().replaceAll(' ', '-')}`}>{error}</span>}
    </label>
  );
}

function SummaryPanel({
  catalog,
  details,
  eventSlots,
  lines,
  categoryTotals,
  foodPerPlate,
  subtotal,
  gstEnabled,
  gstRate,
  gstAmount,
  discountAmount,
  discountLabel,
  grandTotal,
  advanceAmount,
  balanceDue,
  editing,
  costPerGuest,
  showCostPerGuest,
  onShowCostPerGuestChange,
  onGstChange,
  onGstRateChange,
  onPrint,
  onPrintSaved,
  onCopy,
  copyStatus,
  onWhatsApp,
  onReset,
  onSaveEstimate,
  saveStatus,
  saveErrorMessage,
  savedEstimate,
}: {
  catalog: Category[];
  details: Details;
  eventSlots: EventSlots;
  lines: Line[];
  categoryTotals: Record<string, number>;
  foodPerPlate: number;
  subtotal: number;
  gstEnabled: boolean;
  gstRate: number;
  gstAmount: number;
  discountAmount: number;
  discountLabel: string;
  grandTotal: number;
  advanceAmount: number;
  balanceDue: number;
  editing: boolean;
  costPerGuest: number;
  showCostPerGuest: boolean;
  onShowCostPerGuestChange: (show: boolean) => void;
  onGstChange: (enabled: boolean) => void;
  onGstRateChange: (rate: number) => void;
  onPrint: () => void;
  onPrintSaved: () => void;
  onCopy: () => void;
  copyStatus: CopyStatus;
  onWhatsApp: () => void;
  onReset: () => void;
  onSaveEstimate: () => void;
  saveStatus: SaveStatus;
  saveErrorMessage: string;
  savedEstimate: EstimatePayload | null;
}) {
  return (
    <aside id="estimate-summary" className="summary-panel relative overflow-hidden rounded-2xl p-5 sm:p-6 lg:sticky lg:top-5" data-testid="panel-estimate-summary">
      <div className="relative">
        <div className="flex items-start justify-between gap-4 border-b border-white/15 pb-5">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#e2bf72]">Live estimate</p>
            <h2 className="mt-2 font-serif text-2xl font-semibold">Your celebration</h2>
            <p className="mt-1 text-xs text-[#c5c9bf]">Updates as you make each choice.</p>
          </div>
          <span className="grid size-10 place-items-center rounded-full border border-[#b89555]/50 text-[#e2bf72]"><IndianRupee size={17} /></span>
        </div>

        <div className="grid grid-cols-2 gap-x-5 gap-y-4 border-b border-white/15 py-5 text-sm">
          <SummaryDetail label="Customer" value={details.name || 'Awaiting name'} />
          <SummaryDetail label="Occasion" value={displayEventType(details) || 'Awaiting event'} />
          <SummaryDetail label={parseEventDates(details.eventDate).length > 1 ? 'Dates' : 'Date'} value={displayEventDates(details.eventDate)} />
          <SummaryDetail label="Guests" value={details.guests ? `${numberFormat(Number(details.guests))} guests` : 'Not selected'} />
          {hasAnySlots(eventSlots) && (
            <div className="col-span-2" data-testid="summary-schedule">
              <span className="block text-[10px] uppercase tracking-[0.12em] text-[#9fa99e]">Event time</span>
              <ul className="mt-1 space-y-1 text-sm font-medium text-[#f7f0e2]">
                {scheduleLines(parseEventDates(details.eventDate), eventSlots).map((line) => <li key={line.date}><span className="text-[#d6ae60]">{formatEventDates([line.date])}</span> · {timeText(eventSlots[line.date])}</li>)}
              </ul>
            </div>
          )}
          <div className="col-span-2"><SummaryDetail label="Mobile number" value={details.mobile || 'Awaiting mobile number'} /></div>
        </div>

        <div className="border-b border-white/15 py-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#c5c9bf]">Selected services</span>
            <span className="font-mono text-[11px] text-[#e2bf72]" data-testid="text-selected-count">{lines.length} {lines.length === 1 ? 'item' : 'items'}</span>
          </div>
          {lines.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/20 px-3 py-4 text-center text-xs leading-relaxed text-[#aeb7ac]">
              Your estimate will appear here as you select services.
            </div>
          ) : (
            <div className="max-h-[300px] space-y-3 overflow-y-auto pr-1">
              {lines.map((line) => (
                <div key={line.id} className="flex items-start justify-between gap-3 text-sm" data-testid={`summary-line-${line.id}`}>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[#f7f0e2]">{line.name}</p>
                    <p className="mt-0.5 text-[10px] text-[#9fa99e]">{line.categoryName} / {line.subcategoryName} · {line.pricingType === 'perPerson' ? `${numberFormat(Number(details.guests) || 0)} guests` : `Qty ${line.quantity}`}</p>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-[#f1d58e]">{line.categoryId === 'food' ? `${currency(line.price)} ${serviceRateLabel(line.pricingType)}` : currency(line.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-b border-white/15 py-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#c5c9bf]">Category totals</span>
            <span className="font-mono text-[11px] text-[#9fa99e]">{currency(subtotal)}</span>
          </div>
          <div className="space-y-2">
            {catalog.filter((category) => categoryTotals[category.id] > 0).map((category) => (
              <div key={category.id} className="flex items-center justify-between text-sm">
                <span className="text-[#d2d7cd]">{category.name}</span>
                <span className="font-mono text-xs text-[#f1d58e]" data-testid={`text-category-total-${category.id}`}>{currency(categoryTotals[category.id])}</span>
              </div>
            ))}
            {subtotal === 0 && <p className="text-xs text-[#9fa99e]">No services selected yet.</p>}
          </div>
          {foodPerPlate > 0 && (
            <div className="mt-4 rounded-xl bg-white/8 px-3 py-3">
              <div className="flex items-center justify-between text-xs text-[#c5c9bf]"><span>Food price per plate</span><span className="font-mono font-bold text-[#f1d58e]" data-testid="text-food-price-per-plate">{currency(foodPerPlate)}</span></div>
            </div>
          )}
        </div>

        <div className="space-y-3 py-5">
          <div className="flex items-center justify-between text-sm text-[#d2d7cd]"><span>Subtotal</span><span className="font-mono text-xs">{currency(subtotal)}</span></div>
          {discountAmount > 0 && <div className="flex items-center justify-between text-sm text-[#9fe0b0]" data-testid="summary-discount-row"><span>{discountLabel}</span><span className="font-mono text-xs" data-testid="text-discount-amount">− {currency(discountAmount)}</span></div>}
          <div className="flex items-center justify-between gap-3 text-sm">
            <label className="flex cursor-pointer items-center gap-2 text-[#d2d7cd]">
              <input type="checkbox" checked={gstEnabled} onChange={(e) => onGstChange(e.target.checked)} className="size-4 accent-[#d6ae60]" data-testid="input-gst-enabled" />
              GST
            </label>
            <div className="flex items-center gap-2">
              <input type="number" min="0" max="28" step="0.5" value={gstRate} disabled={!gstEnabled} onChange={(e) => onGstRateChange(Math.min(28, Math.max(0, Number(e.target.value))))} className="h-8 w-16 rounded-md border border-white/20 bg-white/10 px-2 text-right font-mono text-xs text-white disabled:opacity-40" aria-label="GST percentage" data-testid="input-gst-rate" />
              <span className="font-mono text-xs text-[#9fa99e]">= {currency(gstAmount)}</span>
            </div>
          </div>
          <div className="border-t border-[#c19a56]/40 pt-4">
            <div className="flex items-end justify-between gap-3">
              <div><p className="text-xs uppercase tracking-[0.13em] text-[#c5c9bf]">Grand total</p><p className="mt-1 text-xs text-[#9fa99e]">Estimated for your event</p></div>
              <span className="font-mono text-2xl font-bold tracking-tight text-[#f1d58e]" data-testid="text-grand-total">{currency(grandTotal)}</span>
            </div>
            {advanceAmount > 0 && (
              <div className="mt-3 space-y-2 rounded-lg border border-[#c19a56]/40 px-3 py-3 text-sm" data-testid="summary-advance">
                <div className="flex items-center justify-between text-[#9fe0b0]"><span>Advance paid</span><span className="font-mono text-xs" data-testid="text-advance-amount">− {currency(advanceAmount)}</span></div>
                <div className="flex items-end justify-between"><span className="text-xs uppercase tracking-[0.13em] text-[#c5c9bf]">Balance to pay</span><span className="font-mono text-xl font-bold text-[#f1d58e]" data-testid="text-balance-due">{currency(balanceDue)}</span></div>
              </div>
            )}
            <div className="mt-3 flex items-center justify-between rounded-lg bg-white/8 px-3 py-2 text-xs"><label className="flex cursor-pointer items-center gap-2 text-[#b7c0b4]"><input type="checkbox" checked={showCostPerGuest} onChange={(e) => onShowCostPerGuestChange(e.target.checked)} className="size-4 accent-[#d6ae60]" data-testid="input-show-cost-per-guest" />Cost per guest</label><span className="font-mono font-bold text-[#f7f0e2]" data-testid="text-cost-per-guest">{showCostPerGuest ? currency(costPerGuest) : 'Hidden'}</span></div>
          </div>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
           <button type="button" onClick={onPrint} className="estimate-action-button estimate-action-button--primary" data-testid="button-print-estimate"><Printer size={16} /> Print estimate</button>
          <button type="button" onClick={onCopy} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/20 px-3 text-sm font-semibold text-[#f7f0e2] transition hover:bg-white/10" data-testid="button-copy-estimate"><Copy size={16} /> {copyStatus === 'copied' ? 'Copied' : copyStatus === 'error' ? 'Copy failed' : 'Copy summary'}</button>
           <button type="button" onClick={onWhatsApp} className="estimate-action-button estimate-action-button--whatsapp" data-testid="button-send-whatsapp"><Send size={16} /> Send on WhatsApp</button>
           <button type="button" onClick={onSaveEstimate} disabled={saveStatus === 'saving' || (saveStatus === 'saved' && !editing)} className="estimate-action-button estimate-action-button--primary disabled:cursor-not-allowed disabled:opacity-55" data-testid="button-save-estimate"><Check size={16} /> {saveStatus === 'saving' ? (editing ? 'Saving changes' : 'Saving estimate') : saveStatus === 'saved' ? (editing ? 'Changes saved' : 'Estimate saved') : (editing ? 'Save changes' : 'Save estimate')}</button>
        </div>
         {saveStatus === 'saved' && <p className="save-status save-status--success mt-3 rounded-lg px-3 py-2 text-center text-xs" role="status" data-testid="status-estimate-saved">{editing ? 'Changes saved to this bill. You can go back to the admin panel.' : 'Your estimate has been saved. Our team will follow up with you shortly.'}</p>}
         {saveStatus === 'error' && <p className="save-status save-status--error mt-3 rounded-lg px-3 py-2 text-center text-xs" role="alert" data-testid="status-estimate-save-error">{saveErrorMessage || 'We could not save this estimate right now. You can still print, copy, or send it on WhatsApp.'}</p>}
         {savedEstimate && <SavedEstimateCard estimate={savedEstimate} onPrint={onPrintSaved} />}
        {editing && <Link href="/999" className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 py-2.5 text-xs font-semibold text-[#f7f0e2] transition hover:bg-white/10" data-testid="link-back-admin">Back to admin panel</Link>}
        {!editing && <button type="button" onClick={onReset} className="mt-3 flex w-full items-center justify-center gap-2 py-2 text-xs text-[#aeb7ac] transition hover:text-[#f7f0e2]" data-testid="button-reset-estimate"><RotateCcw size={13} /> Reset estimate</button>}
      </div>
    </aside>
  );
}

function SavedEstimateCard({ estimate, onPrint }: { estimate: EstimatePayload; onPrint: () => void }) {
  const foodServices = estimate.services.filter((service) => service.category.toLowerCase().includes('food'));
  const otherServices = estimate.services.filter((service) => !service.category.toLowerCase().includes('food'));
  return (
    <section className="saved-estimate-card mt-4 rounded-xl p-3.5 text-xs" data-testid="panel-saved-estimate-details">
       <div className="saved-estimate-card__header flex items-start justify-between gap-3 pb-3">
        <div>
           <p className="saved-estimate-card__title font-bold uppercase tracking-[0.12em]">Saved quotation</p>
           <p className="saved-estimate-card__reference mt-1 text-[11px]">Bill No {estimate.reference}</p>
        </div>
         <Check size={16} className="saved-estimate-card__check shrink-0" />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 py-3">
        <SavedDetail label="Customer" value={estimate.customer.name} />
        <SavedDetail label="Mobile" value={estimate.customer.mobile} />
        <SavedDetail label="Event" value={estimate.customer.eventType} />
        <SavedDetail label={quoteEventDates(estimate.customer).length > 1 ? 'Dates' : 'Date'} value={formatEventDates(quoteEventDates(estimate.customer))} />
        {hasAnySlots(estimate.customer.eventSlots) && <SavedDetail label="Event time" value={scheduleLines(quoteEventDates(estimate.customer), estimate.customer.eventSlots).map((line) => `${formatEventDates([line.date])}: ${timeText(estimate.customer.eventSlots?.[line.date])}`).join(' · ')} />}
        <SavedDetail label="Guests" value={numberFormat(estimate.customer.guests)} />
        {estimate.customer.gstNumber && <SavedDetail label="Customer GST" value={estimate.customer.gstNumber} />}
      </div>
       <div className="saved-estimate-card__section border-t pt-3">
         <p className="saved-estimate-card__section-title mb-3 font-bold uppercase tracking-[0.12em]">Itemized bill</p>
        {foodServices.length > 0 && <SavedServiceGroup title="Food & Catering" services={foodServices} guests={estimate.customer.guests} />}
        {otherServices.length > 0 && <SavedServiceGroup title="Additional services" services={otherServices} guests={estimate.customer.guests} />}
        {!estimate.services.length && <p className="text-[#aeb7ac]">No additional services selected.</p>}
      </div>
       <div className="saved-estimate-card__totals mt-3 space-y-1 border-t pt-3">
        <SavedTotal label="Subtotal" value={currency(estimate.pricing.subtotal)} />
        {estimate.pricing.discountEnabled && (estimate.pricing.discountAmount ?? 0) > 0 && <SavedTotal label={discountLabelText(estimate.pricing.discountPercent ?? 0, estimate.pricing.discountFlat ?? 0)} value={`− ${currency(estimate.pricing.discountAmount ?? 0)}`} />}
        {estimate.pricing.gstEnabled && <SavedTotal label={`GST (${estimate.pricing.gstRate}%)`} value={currency(estimate.pricing.gstAmount)} />}
        <SavedTotal label="Grand total" value={currency(estimate.pricing.grandTotal)} strong />
        {quoteAdvance(estimate.pricing).paid && <SavedTotal label="Advance paid" value={`− ${currency(quoteAdvance(estimate.pricing).amount)}`} />}
        {quoteAdvance(estimate.pricing).paid && <SavedTotal label="Balance to pay" value={currency(quoteAdvance(estimate.pricing).balance)} strong />}
        {estimate.pricing.showCostPerGuest !== false && <SavedTotal label="Cost per guest" value={currency(estimate.pricing.costPerGuest)} />}
      </div>
       <button type="button" onClick={onPrint} className="saved-print-button mt-4 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg px-3 font-semibold transition" data-testid="button-print-saved-estimate"><Printer size={15} /> Print bill</button>
    </section>
  );
}

function SavedServiceGroup({ title, services, guests }: { title: string; services: EstimatePayload['services']; guests: number }) {
  return (
    <div className="mb-3 last:mb-0">
       <p className="saved-estimate-card__group-title mb-2 text-[10px] font-bold uppercase tracking-[0.1em]">{title}</p>
      <div className="space-y-2">
        {services.map((service) => (
          <div key={service.id} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
               <p className="saved-estimate-card__service-name truncate">{service.name}</p>
               <p className="saved-estimate-card__service-meta mt-0.5 text-[10px]">{service.subcategory} · {service.pricingType === 'perPerson' ? `${numberFormat(guests)} guests` : `Qty ${service.quantity}`}</p>
            </div>
             <span className="saved-estimate-card__service-total shrink-0 font-mono">{serviceDisplayAmount(service, true)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SavedDetail({ label, value }: { label: string; value: string }) {
  return <div><span className="saved-estimate-card__detail-label block text-[9px] uppercase tracking-[0.1em]">{label}</span><span className="saved-estimate-card__detail-value mt-0.5 block truncate">{value || '—'}</span></div>;
}

function SavedTotal({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`saved-estimate-card__total-row flex items-center justify-between gap-3 ${strong ? 'saved-estimate-card__total-row--grand pt-1 font-semibold' : ''}`}><span>{label}</span><span className="font-mono">{value}</span></div>;
}

function SummaryDetail({ label, value }: { label: string; value: string }) {
  return <div data-testid={`summary-detail-${label.toLowerCase()}`}><span className="block text-[10px] uppercase tracking-[0.12em] text-[#9fa99e]">{label}</span><span className="mt-1 block truncate font-medium text-[#f7f0e2]">{value}</span></div>;
}

function PrintSheet({ catalog, printData }: { catalog: Category[]; printData: PrintData | null }) {
  if (!printData) return null;
  const d = printData;
  const data: PrintBillData = {
    billNumber: d.billNumber,
    customerName: d.details.name,
    mobile: d.details.mobile,
    eventType: displayEventType(d.details),
    dates: parseEventDates(d.details.eventDate),
    eventSlots: d.eventSlots,
    guests: Number(d.details.guests) || 0,
    gstEnabled: d.gstEnabled,
    gstRate: d.gstRate,
    gstAmount: d.gstAmount,
    hallGstNumber: d.gstNumberVisible ? d.gstNumber : '',
    customerGstNumber: d.customerGstNumberVisible ? d.details.customerGstNumber : '',
    lines: d.lines.map((line) => ({ id: line.id, isFood: line.categoryId === 'food', category: line.categoryName, subcategory: line.subcategoryName, name: line.name, description: line.description, pricingType: line.pricingType, quantity: line.quantity, price: line.price, total: line.total })),
    categoryTotals: catalog.filter((category) => (d.categoryTotals[category.id] ?? 0) > 0).map((category) => ({ name: category.name, total: d.categoryTotals[category.id] })),
    foodPerPlate: d.foodPerPlate,
    subtotal: d.subtotal,
    discountAmount: d.discountAmount,
    discountLabel: d.discountLabel,
    grandTotal: d.grandTotal,
    advanceAmount: d.advanceAmount,
    balanceDue: d.balanceDue,
    costPerGuest: d.costPerGuest,
    showCostPerGuest: d.showCostPerGuest,
  };
  return <PrintBill data={data} />;
}

function EstimatorPage() {
  const [catalog, setCatalog] = useState<Category[]>(() => loadCatalog());
  const [details, setDetails] = useState<Details>(INITIAL_DETAILS);
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [gstEnabled, setGstEnabled] = useState(true);
  const [gstRate, setGstRate] = useState(5);
  const [hallGstNumber, setHallGstNumber] = useState('');
  const [gstNumberVisible, setGstNumberVisible] = useState(true);
  const [customerGstNumberVisible, setCustomerGstNumberVisible] = useState(true);
  const [eventSlots, setEventSlots] = useState<EventSlots>({});
  const bookedSlotsQuery = useBookedSlots();
  const [showCostPerGuest, setShowCostPerGuest] = useState(true);
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountPercent, setDiscountPercent] = useState('');
  const [discountFlat, setDiscountFlat] = useState('');
  const [advancePaid, setAdvancePaid] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('');
  // Editing a saved bill: /111/?edit=<bill no> (opened with the Edit button in the admin panel).
  const editReference = useMemo(() => (typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('edit') ?? ''), []);
  const isEditing = Boolean(editReference);
  const [editQuote, setEditQuote] = useState<Quote | null>(null);
  const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({});
  const [saveError, setSaveError] = useState('');
  const editQuery = useGetQuote(editReference, { query: { enabled: isEditing, queryKey: getGetQuoteQueryKey(editReference) } });
  const updateQuoteMutation = useUpdateQuote();
  // While editing a booked bill, its own slots must not count as "already booked" against itself.
  const bookedSlots = useMemo(() => {
    const raw = bookedSlotsQuery.data ?? {};
    if (!editQuote || editQuote.status !== 'confirmed') return raw;
    const next: Record<string, TimeRange[]> = { ...raw };
    occupancyEntries(quoteEventDates(editQuote.customer), editQuote.customer.eventSlots).forEach(({ date, range }) => {
      const list = [...(next[date] ?? [])];
      const index = list.findIndex((item) => item.start === range.start && item.end === range.end);
      if (index >= 0) list.splice(index, 1);
      next[date] = list;
    });
    return next;
  }, [bookedSlotsQuery.data, editQuote]);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [savedEstimate, setSavedEstimate] = useState<EstimatePayload | null>(null);
  const [printData, setPrintData] = useState<PrintData | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const queryClient = useQueryClient();
  const catalogQuery = useGetCatalog();
  const createQuoteMutation = useCreateQuote();

  useEffect(() => {
    if (!catalogQuery.data || !Array.isArray(catalogQuery.data) || catalogQuery.data.length === 0) return;
    // Cloud copy is the source of truth; local storage is only an offline fallback.
    setCatalog(catalogQuery.data);
    cacheCatalog(catalogQuery.data);
  }, [catalogQuery.data]);

  useEffect(() => {
    const refreshCatalog = () => setCatalog(loadCatalog());
    window.addEventListener('storage', refreshCatalog);
    window.addEventListener(CATALOG_UPDATED_EVENT, refreshCatalog);
    return () => {
      window.removeEventListener('storage', refreshCatalog);
      window.removeEventListener(CATALOG_UPDATED_EVENT, refreshCatalog);
    };
  }, []);

  useEffect(() => {
    try {
      const saved = isEditing ? null : window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) {
        const draft = JSON.parse(saved) as {
          details?: Partial<Details>;
          selections?: Record<string, number>;
          gstEnabled?: boolean;
          gstRate?: number;
          hallGstNumber?: string;
          gstNumberVisible?: boolean;
           customerGstNumberVisible?: boolean;
          eventSlots?: EventSlots;
          showCostPerGuest?: boolean;
          discountEnabled?: boolean;
          discountPercent?: string;
          discountFlat?: string;
          advancePaid?: boolean;
          advanceAmount?: string;
        };
        if (draft.details) setDetails((current) => ({ ...current, ...draft.details }));
        if (draft.selections && typeof draft.selections === 'object') setSelections(draft.selections);
        if (typeof draft.gstEnabled === 'boolean') setGstEnabled(draft.gstEnabled);
        if (typeof draft.gstRate === 'number' && Number.isFinite(draft.gstRate)) setGstRate(Math.min(28, Math.max(0, draft.gstRate)));
        if (typeof draft.hallGstNumber === 'string') setHallGstNumber(draft.hallGstNumber.slice(0, 15));
        if (typeof draft.gstNumberVisible === 'boolean') setGstNumberVisible(draft.gstNumberVisible);
         if (typeof draft.customerGstNumberVisible === 'boolean') setCustomerGstNumberVisible(draft.customerGstNumberVisible);
        if (draft.eventSlots && typeof draft.eventSlots === 'object') setEventSlots(normalizeEventSlots(draft.eventSlots));
        if (typeof draft.showCostPerGuest === 'boolean') setShowCostPerGuest(draft.showCostPerGuest);
        if (typeof draft.discountEnabled === 'boolean') setDiscountEnabled(draft.discountEnabled);
        if (typeof draft.discountPercent === 'string') setDiscountPercent(draft.discountPercent);
        if (typeof draft.discountFlat === 'string') setDiscountFlat(draft.discountFlat);
        if (typeof draft.advancePaid === 'boolean') setAdvancePaid(draft.advancePaid);
        if (typeof draft.advanceAmount === 'string') setAdvanceAmount(draft.advanceAmount);
      }
    } catch {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    // A saved bill that is being edited must never overwrite the normal draft kept on this device.
    if (!isHydrated || isEditing) return;
    try {
       window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ details, selections, gstEnabled, gstRate, hallGstNumber, gstNumberVisible, customerGstNumberVisible, eventSlots, showCostPerGuest, discountEnabled, discountPercent, discountFlat, advancePaid, advanceAmount }));
    } catch {
      // The estimator remains usable when browser storage is unavailable.
    }
  }, [details, selections, gstEnabled, gstRate, hallGstNumber, gstNumberVisible, customerGstNumberVisible, eventSlots, showCostPerGuest, discountEnabled, discountPercent, discountFlat, advancePaid, advanceAmount, isEditing, isHydrated]);

  const guestCount = Number(details.guests) || 0;
  useEffect(() => {
    const quote = editQuery.data;
    if (!quote || editQuote) return;
    setEditQuote(quote);
    const savedType = quote.customer.eventType;
    const knownType = EVENT_TYPES.includes(savedType) && savedType !== 'Other';
    setDetails({ name: quote.customer.name, mobile: quote.customer.mobile, eventType: knownType ? savedType : 'Other', otherEventType: knownType || savedType === 'Other' ? '' : savedType, eventDate: quoteEventDates(quote.customer).join(','), guests: String(quote.customer.guests), billNumber: quote.reference, customerGstNumber: quote.customer.gstNumber ?? '' });
    setSelections(Object.fromEntries(quote.services.map((service) => [service.id, service.pricingType === 'perUnit' ? service.quantity : 1])));
    setPriceOverrides(Object.fromEntries(quote.services.map((service) => [service.id, service.unitPrice])));
    setGstEnabled(quote.pricing.gstEnabled);
    setGstRate(Math.min(28, Math.max(0, Number(quote.pricing.gstRate) || 0)));
    setHallGstNumber((quote.pricing.gstNumber ?? '').slice(0, 15));
    setGstNumberVisible(quote.pricing.gstNumberVisible);
    setShowCostPerGuest(quote.pricing.showCostPerGuest !== false);
    setEventSlots(normalizeEventSlots(quote.customer.eventSlots));
    const hadDiscount = Boolean(quote.pricing.discountEnabled) && (quote.pricing.discountAmount ?? 0) > 0;
    setDiscountEnabled(hadDiscount);
    setDiscountPercent(hadDiscount && quote.pricing.discountPercent ? String(quote.pricing.discountPercent) : '');
    setDiscountFlat(hadDiscount && quote.pricing.discountFlat ? String(quote.pricing.discountFlat) : '');
    const savedAdvance = quoteAdvance(quote.pricing);
    setAdvancePaid(savedAdvance.paid);
    setAdvanceAmount(savedAdvance.paid ? String(savedAdvance.amount) : '');
  }, [editQuery.data, editQuote]);

  const lines = useMemo<Line[]>(() => catalog.flatMap((category) => category.subcategories.flatMap((subcategory) => subcategory.items.filter((item) => item.active))).flatMap((item) => {
    const rawQuantity = selections[item.id] ?? 0;
    const quantity = rawQuantity && item.pricingType === 'perUnit'
      ? Math.min(item.maxQuantity, Math.max(item.minQuantity, rawQuantity))
      : rawQuantity;
    if (!quantity) return [];
    const category = catalog.find((entry) => entry.id === item.categoryId);
    const subcategory = category?.subcategories.find((entry) => entry.id === item.subcategoryId);
    // Services already on a bill being edited keep the price saved on that bill.
    const price = priceOverrides[item.id] ?? item.price;
    const total = item.pricingType === 'perPerson' ? price * guestCount : price * quantity;
    return [{ ...item, price, categoryName: category?.name ?? '', subcategoryName: subcategory?.name ?? '', quantity, total }];
  }), [catalog, guestCount, selections, priceOverrides]);

  const missingServices = useMemo(() => (editQuote ? editQuote.services.filter((service) => !lines.some((line) => line.id === service.id)) : []), [editQuote, lines]);

  const categoryTotals = useMemo(() => lines.reduce<Record<string, number>>((totals, line) => {
    totals[line.categoryId] = (totals[line.categoryId] || 0) + line.total;
    return totals;
  }, {}), [lines]);
  const foodPerPlate = useMemo(() => lines.filter((line) => line.categoryId === 'food' && line.pricingType === 'perPerson').reduce((sum, line) => sum + line.price, 0), [lines]);
  const subtotal = Object.values(categoryTotals).reduce((sum, total) => sum + total, 0);
  // Discount only counts while its tick box is on. It is taken off the subtotal first, then GST is charged on what is left.
  const discountPercentValue = discountEnabled ? Math.min(100, Math.max(0, Number(discountPercent) || 0)) : 0;
  const discountFlatValue = discountEnabled ? Math.max(0, Number(discountFlat) || 0) : 0;
  const discountAmount = Math.min(subtotal, Math.round(subtotal * (discountPercentValue / 100)) + discountFlatValue);
  const discountLabel = discountLabelText(discountPercentValue, discountFlatValue);
  const eventSlotsForDates: EventSlots = Object.fromEntries(parseEventDates(details.eventDate).map((date) => [date, normalizeRange(eventSlots[date])]));
  const taxableAmount = subtotal - discountAmount;
  const gstAmount = gstEnabled ? taxableAmount * (gstRate / 100) : 0;
  const grandTotal = taxableAmount + gstAmount;
  const costPerGuest = guestCount > 0 ? grandTotal / guestCount : 0;
  const { amount: advanceValue, balance: balanceDue } = quoteAdvance({ grandTotal, advancePaid, advanceAmount: Math.max(0, Number(advanceAmount) || 0) });

  const onChange = (field: keyof Details, value: string) => {
    setDetails((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const onToggle = (item: Item, checked: boolean) => {
    setSelections((current) => {
      const next = { ...current };
      if (checked) next[item.id] = item.pricingType === 'perUnit' ? item.minQuantity : 1;
      else delete next[item.id];
      return next;
    });
  };

  const onQuantityChange = (item: Item, nextQuantity: number) => {
    const quantity = Math.min(item.maxQuantity, Math.max(item.minQuantity, nextQuantity));
    setSelections((current) => ({ ...current, [item.id]: quantity }));
  };

  const validate = () => {
    const nextErrors: ValidationErrors = {};
    if (!details.name.trim()) nextErrors.name = 'Please enter the customer name.';
    const mobileDigits = details.mobile.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(mobileDigits.slice(-10))) nextErrors.mobile = 'Enter a valid 10 digit mobile number.';
    if (!details.eventType) nextErrors.eventType = 'Choose an event type.';
    if (details.eventType === 'Other' && !details.otherEventType.trim()) nextErrors.otherEventType = 'Describe the occasion you are planning.';
    const chosenDates = parseEventDates(details.eventDate);
    if (!chosenDates.length) nextErrors.eventDate = 'Choose at least one event date.';
    else if (chosenDates.some((date) => date < localISODate(new Date()) && !(editQuote ? quoteEventDates(editQuote.customer) : []).includes(date))) nextErrors.eventDate = 'Choose future dates only.';
    else {
      const missingTime = chosenDates.find((date) => !isRangeComplete(eventSlotsForDates[date]));
      const badTime = chosenDates.find((date) => isRangeComplete(eventSlotsForDates[date]) && !isRangeValid(eventSlotsForDates[date]));
      if (missingTime) nextErrors.eventDate = `Enter the start time and end time for ${formatEventDates([missingTime])}.`;
      else if (badTime) nextErrors.eventDate = `The end time must be after the start time on ${formatEventDates([badTime])}.`;
      else {
        const clashDate = chosenDates.find((date) => (bookedSlots[date] ?? []).some((taken) => rangesOverlap(eventSlotsForDates[date] as TimeRange, taken)));
        if (clashDate) nextErrors.eventDate = `${formatEventDates([clashDate])} is already booked for ${rangesText((bookedSlots[clashDate] ?? []).filter((taken) => rangesOverlap(eventSlotsForDates[clashDate] as TimeRange, taken)))}. Please choose another time.`;
      }
    }
    if (!Number.isInteger(guestCount) || guestCount <= 0) nextErrors.guests = 'Guests must be more than zero.';
    if (!details.billNumber.trim()) nextErrors.billNumber = 'Enter a bill number.';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const buildEstimatePayload = (): EstimatePayload => ({
    reference: details.billNumber.trim(),
    customer: {
      name: details.name,
      mobile: details.mobile,
      eventType: displayEventType(details),
      eventDate: parseEventDates(details.eventDate)[0] ?? '',
      eventDates: parseEventDates(details.eventDate),
      eventSlots: eventSlotsForDates,
      guests: guestCount,
      gstNumber: details.customerGstNumber,
      // The API keeps this legacy field for compatibility; the customer no longer
      // has to provide a venue in the inquiry form.
      hall: BANQUET_NAME,
    },
    services: lines.map((line) => ({
      id: line.id,
      name: line.name,
      category: line.categoryName,
      subcategory: line.subcategoryName,
      pricingType: line.pricingType,
      quantity: line.quantity,
      unitPrice: line.price,
      total: line.total,
      description: line.description,
    })),
    pricing: { foodPerPlate, subtotal, gstEnabled, gstRate, gstAmount, gstNumber: hallGstNumber, gstNumberVisible, showCostPerGuest, discountEnabled: discountAmount > 0, discountPercent: discountPercentValue, discountFlat: discountFlatValue, discountAmount, grandTotal, costPerGuest, advancePaid: advanceValue > 0, advanceAmount: advanceValue, balanceDue, ...(editQuote?.pricing.payments ? { payments: editQuote.pricing.payments } : {}) },
  });

  const estimateMessage = () => {
    const payload = buildEstimatePayload();
    const serviceText = payload.services.length ? payload.services.map((service) => `• ${service.name} (${service.pricingType === 'perPerson' ? `${payload.customer.guests} guests` : `qty ${service.quantity}`}): ${isFoodCategory(service.category) ? `${currency(service.unitPrice)} ${serviceRateLabel(service.pricingType)}` : currency(service.total)}`).join('\n') : 'No additional services selected';
     return `Hello ${BANQUET_NAME}, I would like to discuss this quotation.\n\nBill No: ${payload.reference || 'Not assigned'}\nCustomer: ${payload.customer.name || 'Not provided'}\nMobile: ${payload.customer.mobile || 'Not provided'}\nEvent: ${payload.customer.eventType || 'Not provided'}\n${hasAnySlots(payload.customer.eventSlots) ? `Date & time:\n${scheduleLines(quoteEventDates(payload.customer), payload.customer.eventSlots).map((line) => `• ${formatEventDates([line.date])}: ${line.text}`).join('\n')}` : `Date: ${formatEventDates(quoteEventDates(payload.customer))}`}\nGuests: ${payload.customer.guests || 'Not provided'}\n${payload.customer.gstNumber ? `Customer GST number: ${payload.customer.gstNumber}\n` : ''}${payload.pricing.gstNumberVisible && payload.pricing.gstNumber ? `Hall GST number: ${payload.pricing.gstNumber}\n` : ''}\nSelected services:\n${serviceText}\n\nFood price per plate: ${currency(payload.pricing.foodPerPlate)}\nSubtotal: ${currency(payload.pricing.subtotal)}\n${payload.pricing.discountEnabled && (payload.pricing.discountAmount ?? 0) > 0 ? `${discountLabelText(payload.pricing.discountPercent ?? 0, payload.pricing.discountFlat ?? 0)}: -${currency(payload.pricing.discountAmount ?? 0)}\n` : ''}${payload.pricing.gstEnabled ? `GST (${payload.pricing.gstRate}%): ${currency(payload.pricing.gstAmount)}\n` : ''}Grand total: ${currency(payload.pricing.grandTotal)}${advanceMessage(payload.pricing)}${payload.pricing.showCostPerGuest !== false ? `\nCost per guest: ${currency(payload.pricing.costPerGuest)}` : ''}`;
  };

  const buildPrintData = (payload?: EstimatePayload): PrintData => {
    if (!payload) {
       return { details, lines, categoryTotals, foodPerPlate, subtotal, gstEnabled, gstRate, gstAmount, gstNumber: hallGstNumber, gstNumberVisible, customerGstNumberVisible, discountAmount, discountLabel, grandTotal, costPerGuest, showCostPerGuest, eventSlots: eventSlotsForDates, billNumber: details.billNumber, advanceAmount: advanceValue, balanceDue };
    }

    const savedLines: PrintableLine[] = payload.services.map((service) => {
      const matchingCategory = catalog.find((category) => category.name.toLowerCase() === service.category.toLowerCase());
      return {
        id: service.id,
        name: service.name,
        description: service.description ?? catalog.flatMap((category) => category.subcategories.flatMap((subcategory) => subcategory.items)).find((item) => item.id === service.id)?.description ?? '',
        categoryId: matchingCategory?.id ?? service.category,
        categoryName: service.category,
        subcategoryName: service.subcategory,
        pricingType: service.pricingType,
        quantity: service.quantity,
        price: service.unitPrice,
        total: service.total,
      };
    });
    const savedCategoryTotals = savedLines.reduce<Record<string, number>>((totals, line) => {
      totals[line.categoryId] = (totals[line.categoryId] || 0) + line.total;
      return totals;
    }, {});
    return {
       details: { name: payload.customer.name, mobile: payload.customer.mobile, eventType: payload.customer.eventType, otherEventType: '', eventDate: quoteEventDates(payload.customer).join(','), guests: String(payload.customer.guests), billNumber: payload.reference, customerGstNumber: payload.customer.gstNumber ?? '' },
      lines: savedLines,
      categoryTotals: savedCategoryTotals,
      foodPerPlate: payload.pricing.foodPerPlate,
      subtotal: payload.pricing.subtotal,
      gstEnabled: payload.pricing.gstEnabled,
      gstRate: payload.pricing.gstRate,
      gstAmount: payload.pricing.gstAmount,
      gstNumber: payload.pricing.gstNumber ?? '',
      gstNumberVisible: payload.pricing.gstNumberVisible ?? false,
       customerGstNumberVisible,
      discountAmount: payload.pricing.discountEnabled ? payload.pricing.discountAmount ?? 0 : 0,
      discountLabel: discountLabelText(payload.pricing.discountPercent ?? 0, payload.pricing.discountFlat ?? 0),
      grandTotal: payload.pricing.grandTotal,
      costPerGuest: payload.pricing.costPerGuest,
      showCostPerGuest: payload.pricing.showCostPerGuest !== false,
      eventSlots: payload.customer.eventSlots ?? {},
       billNumber: payload.reference,
      advanceAmount: quoteAdvance(payload.pricing).amount,
      balanceDue: quoteAdvance(payload.pricing).balance,
    };
  };
  const openPrintDialog = (payload?: EstimatePayload) => {
    setPrintData(buildPrintData(payload));
    window.setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    }, 0);
  };
  const printEstimate = () => openPrintDialog();
  const printSavedEstimate = () => { if (savedEstimate) openPrintDialog(savedEstimate); };
  const copyTextToClipboard = async (text: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    const copied = document.execCommand('copy');
    textArea.remove();
    if (!copied) throw new Error('Clipboard access is unavailable.');
  };
  const copyEstimate = async () => {
    try {
      await copyTextToClipboard(estimateMessage());
      setCopyStatus('copied');
      window.setTimeout(() => setCopyStatus('idle'), 2200);
    } catch {
      setCopyStatus('error');
      window.setTimeout(() => setCopyStatus('idle'), 2200);
    }
  };
  const sendWhatsApp = () => {
    const digits = details.mobile.replace(/\D/g, '');
    const validMobile = /^[6-9]\d{9}$/.test(digits.slice(-10));
    const target = validMobile ? `91${digits.slice(-10)}` : '';
    const whatsappUrl = target
      ? `https://wa.me/${target}?text=${encodeURIComponent(estimateMessage())}`
      : `https://wa.me/?text=${encodeURIComponent(estimateMessage())}`;
    const popup = window.open(whatsappUrl, '_blank');
    if (!popup) window.location.assign(whatsappUrl);
  };
  const saveEstimate = () => {
    if (isEditing && !editQuote) return;
    if (!validate()) return;
    const payload = buildEstimatePayload();
    setSaveStatus('saving');
    setSaveError('');
    const handlers = {
      onSuccess: () => {
        setSaveStatus('saved');
        setSavedEstimate(payload);
        void queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetCatalogQueryKey() });
        void queryClient.invalidateQueries({ queryKey: ['supabase', 'booked-slots'] });
        if (isEditing) void queryClient.invalidateQueries({ queryKey: getGetQuoteQueryKey(editReference) });
      },
      onError: (error: Error) => {
        setSaveStatus('error');
        if (isEditing) setSaveError(error.message);
      },
    };
    if (isEditing) updateQuoteMutation.mutate({ reference: editReference, data: payload }, handlers);
    else createQuoteMutation.mutate({ data: payload }, handlers);
  };
  const resetEstimate = () => {
    if (window.confirm('Reset this estimate? All event details and selections will be cleared.')) {
      setDetails(INITIAL_DETAILS);
      setSelections({});
      setGstEnabled(true);
      setGstRate(5);
      setHallGstNumber('');
      setGstNumberVisible(true);
       setCustomerGstNumberVisible(true);
      setEventSlots({});
      setShowCostPerGuest(true);
      setDiscountEnabled(false);
      setDiscountPercent('');
      setDiscountFlat('');
      setAdvancePaid(false);
      setAdvanceAmount('');
      setErrors({});
      setCopyStatus('idle');
      setSaveStatus('idle');
      setSavedEstimate(null);
    }
  };

  return (
    <>
      <div className="estimator-app estimator-shell min-h-[100dvh]">
        <header className="brand-header">
          <div className="mx-auto flex max-w-[1380px] items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-12">
            <div className="flex min-w-0 items-center gap-3">
              <span className="brand-logo-frame">
                <img src={BRAND_LOGO} alt={`${BANQUET_NAME} logo`} className="brand-logo brand-logo--interactive" />
              </span>
              <div className="min-w-0">
                <p className="brand-header__title font-serif text-base font-semibold leading-tight sm:text-lg">{BANQUET_NAME}</p>
                <p className="brand-header__subtitle mt-1 font-mono text-[8px] uppercase tracking-[0.16em] sm:text-[9px]">Event estimate studio</p>
              </div>
            </div>
            <div className="brand-header__meta hidden items-center gap-4 text-xs font-medium sm:flex">
              <span className="brand-header__badge"><Sparkles size={12} /> Signature planning</span>
              <span className="flex items-center gap-2"><Clock3 size={14} className="brand-header__accent" /> Takes about 2 minutes</span>
              {isHydrated && !isEditing && <span className="brand-header__muted">Draft saved on this device</span>}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1380px] px-5 pb-28 sm:px-8 lg:px-12 lg:pb-12">
          <section className="premium-hero page-enter relative overflow-hidden rounded-[1.5rem] bg-[#263b31] px-5 py-9 text-[#f9f3e7] shadow-[0_20px_60px_rgba(38,59,49,0.16)] sm:px-10 sm:py-12 lg:px-14 lg:py-14">
            <div className="absolute -right-16 -top-24 size-72 rounded-full border border-[#d6ae60]/25" /><div className="absolute -right-2 -top-10 size-52 rounded-full border border-[#d6ae60]/20" />
            <div className="relative max-w-3xl">
              <div className="hero-kicker"><Sparkles size={13} /> Signature celebrations, thoughtfully curated</div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-[#e2bf72]">Your day, thoughtfully priced</p>
              <h1 className="mt-4 max-w-2xl font-serif text-4xl font-semibold leading-[1.08] tracking-[-0.02em] sm:text-5xl lg:text-6xl">Plan the celebration.<br /><span className="text-[#e2bf72]">See it come together.</span></h1>
              <p className="mt-5 max-w-xl text-sm leading-7 text-[#cbd1c7] sm:text-base">Choose your menu, styling and finishing touches. Your estimate updates instantly, so every decision feels clear before the first guest arrives.</p>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-[#b7c0b4]"><span className="flex items-center gap-2"><Check size={15} className="text-[#e2bf72]" /> No commitment</span><span className="flex items-center gap-2"><Check size={15} className="text-[#e2bf72]" /> Transparent pricing</span><span className="flex items-center gap-2"><Check size={15} className="text-[#e2bf72]" /> Made for your guest count</span></div>
            </div>
          </section>

          <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_390px] xl:gap-10">
            <div className="space-y-6">
              {isEditing && (
                <div className="rounded-2xl border border-[#d6ae60] bg-[#fff8e6] p-4 text-sm text-[#5d4a1f]" role="status" data-testid="banner-edit-mode">
                  <p className="flex items-center gap-2 font-bold"><Pencil size={15} /> Editing saved bill {editReference}{editQuote ? ` — ${editQuote.customer.name}` : ''}</p>
                  {editQuery.isLoading && <p className="mt-1 text-xs">Loading the saved bill…</p>}
                  {editQuery.isError && <p className="mt-1 text-xs text-[#8a3d32]">This bill could not be opened. Please sign in on the <Link href="/999" className="font-bold underline">admin page</Link> first, then press Edit again.</p>}
                  {editQuote && <p className="mt-1 text-xs">Change anything below and press <strong>Save changes</strong>. The bill number and the Booked status stay the same. Services already on this bill keep their saved prices.</p>}
                  {editQuote && !catalogQuery.isLoading && missingServices.length > 0 && <p className="mt-2 rounded-lg bg-[#fbe4dc] px-3 py-2 text-xs text-[#8a3d32]">These saved services are no longer in the catalog and will be removed if you save: {missingServices.map((service) => service.name).join(', ')}.</p>}
                </div>
              )}
              <EventDetails billNumberLocked={isEditing} eventSlots={eventSlots} bookedSlots={bookedSlots} onEventSlotsChange={setEventSlots} details={details} errors={errors} hallGstNumber={hallGstNumber} customerGstNumber={details.customerGstNumber} gstNumberVisible={gstNumberVisible} customerGstNumberVisible={customerGstNumberVisible} onChange={onChange} onHallGstNumberChange={setHallGstNumber} onCustomerGstNumberChange={(value) => setDetails((current) => ({ ...current, customerGstNumber: value }))} onGstNumberVisibilityChange={setGstNumberVisible} onCustomerGstNumberVisibilityChange={setCustomerGstNumberVisible} />
              <DiscountBlock enabled={discountEnabled} percent={discountPercent} flat={discountFlat} discountAmount={discountAmount} onEnabledChange={setDiscountEnabled} onPercentChange={setDiscountPercent} onFlatChange={setDiscountFlat} />
               <section className="page-enter stagger-1">
                <div className="mb-5 flex items-end justify-between gap-4 px-1">
                  <div><p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#9a5b47]">02 / Make it yours</p><h2 className="mt-2 font-serif text-2xl font-semibold text-[#263b31]">Choose your services</h2><p className="mt-1 text-sm text-[#74736c]">Select what you need. We will handle the arithmetic.</p></div>
                  <CircleHelp size={20} className="mb-1 shrink-0 text-[#9a5b47]" />
                </div>
                 {catalogQuery.isLoading && <div className="mb-3 rounded-xl border border-[#e3d8c9] bg-[#fffdf8] px-4 py-3 text-xs text-[#7b776e]" role="status" data-testid="status-catalog-loading">Refreshing the service catalog…</div>}
                 {catalogQuery.isError && <div className="mb-3 rounded-xl border border-[#e8cfc5] bg-[#fff7f3] px-4 py-3 text-xs text-[#8a5144]" role="alert" data-testid="status-catalog-fallback">The live catalog is temporarily unavailable. Showing the latest catalog saved on this device.</div>}
                 {catalog.length === 0 ? <div className="rounded-2xl border border-dashed border-[#d8cbbb] bg-[#fffdf8] p-8 text-center text-sm text-[#77756e]">Services are being refreshed. Please check back shortly.</div> : <div className="space-y-3">{catalog.map((category) => <CategoryCard key={category.id} category={category} selections={selections} onToggle={onToggle} onQuantityChange={onQuantityChange} />)}</div>}
              </section>
            </div>
             <SummaryPanel catalog={catalog} details={details} eventSlots={eventSlotsForDates} lines={lines} categoryTotals={categoryTotals} foodPerPlate={foodPerPlate} subtotal={subtotal} gstEnabled={gstEnabled} gstRate={gstRate} gstAmount={gstAmount} discountAmount={discountAmount} discountLabel={discountLabel} grandTotal={grandTotal} advanceAmount={advanceValue} balanceDue={balanceDue} editing={isEditing} saveErrorMessage={saveError} costPerGuest={costPerGuest} showCostPerGuest={showCostPerGuest} onShowCostPerGuestChange={setShowCostPerGuest} onGstChange={setGstEnabled} onGstRateChange={setGstRate} onPrint={printEstimate} onPrintSaved={printSavedEstimate} onCopy={copyEstimate} copyStatus={copyStatus} onWhatsApp={sendWhatsApp} onSaveEstimate={saveEstimate} saveStatus={saveStatus} savedEstimate={savedEstimate} onReset={resetEstimate} />
          </div>
        </main>
        <div className="mobile-dock fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-4 border-t border-[#ded1bf] bg-[#fffdf8]/90 px-5 py-3 lg:hidden">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#77756e]">Grand total</p><p className="font-mono text-lg font-bold text-[#864936]" data-testid="text-mobile-grand-total">{currency(grandTotal)}</p></div>
          <button type="button" onClick={() => document.getElementById('estimate-summary')?.scrollIntoView({ behavior: 'smooth' })} className="flex min-h-11 items-center gap-2 rounded-xl bg-[#864936] px-4 text-sm font-bold text-[#fff6e8]" data-testid="button-view-summary">View summary <ArrowRight size={16} /></button>
        </div>
      </div>
       <PrintSheet catalog={catalog} printData={printData} />
    </>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/111" component={EstimatorPage} />
        <Route path="/999" component={AdminPage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function App() {
  return <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter>;
}

export default App;