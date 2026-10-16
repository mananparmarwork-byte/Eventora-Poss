import { formatEventDates } from '@/lib/supabase-queries';
import { hasAnySlots, printableSubcategory, scheduleLines, type EventSlots } from '@/lib/booking';

/**
 * ONE print layout for every bill.
 * Used by the estimator (/111) and the admin panel (/999), so both always print identically.
 * To change how a bill looks, edit only this file (and the .print-* rules in index.css).
 */

export const BANQUET_NAME = 'Swagattam Party Lawns';
export const BRAND_LOGO = `${import.meta.env.BASE_URL}swagattam-logo.webp`;
export const BILL_NOTE = 'This is an auto-generated bill and does not require any signature or stamp. It is electronically generated and is valid without a physical signature or company stamp.';

const inr = (amount: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0);
const num = (amount: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0);
const preparedOn = () => new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export type PrintBillLine = {
  id: string;
  isFood: boolean;
  category: string;
  subcategory: string;
  name: string;
  description: string;
  pricingType: 'perPerson' | 'perUnit' | 'fixed' | string;
  quantity: number;
  price: number;
  total: number;
};

export type PrintBillData = {
  billNumber: string;
  customerName: string;
  mobile: string;
  eventType: string;
  dates: string[]; // ISO dates yyyy-mm-dd
  eventSlots?: EventSlots;
  guests: number;
  gstEnabled: boolean;
  gstRate: number;
  gstAmount: number;
  hallGstNumber?: string; // only pass when it should be visible on the bill
  customerGstNumber?: string; // only pass when it should be visible on the bill
  lines: PrintBillLine[];
  categoryTotals: { name: string; total: number }[];
  foodPerPlate: number;
  subtotal: number;
  discountAmount: number;
  discountLabel: string;
  grandTotal: number;
  advanceAmount: number;
  balanceDue: number;
  costPerGuest: number;
  showCostPerGuest: boolean;
};

const rateLabel = (type: string) => (type === 'perPerson' ? '/ plate' : type === 'perUnit' ? '/ unit' : 'one-time');

function ServiceTable({ title, lines, guests, eventType, showLineTotal = true, showDescription = true }: { title: string; lines: PrintBillLine[]; guests: number; eventType: string; showLineTotal?: boolean; showDescription?: boolean }) {
  return (
    <section className="print-service-section">
      <h2 className="mb-2 text-lg font-semibold text-[#263b31]">{title}</h2>
      <table className="print-table">
        <thead><tr><th>Category / subcategory</th><th>Item</th><th>Qty</th><th>Rate</th>{showLineTotal && <th>Total</th>}</tr></thead>
        <tbody>
          {lines.map((line) => {
            const sub = printableSubcategory(line.subcategory, eventType, line.category);
            return (
              <tr key={line.id}>
                <td>{line.category}{sub && <span className="print-subcategory">{sub}</span>}</td>
                <td>{line.name}{showDescription && line.description.trim() && <span className="print-item-description">{line.description}</span>}</td>
                <td>{line.pricingType === 'perPerson' ? `${num(guests)} guests` : line.quantity}</td>
                <td>{inr(line.price)} {rateLabel(line.pricingType)}</td>
                {showLineTotal && <td>{inr(line.total)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export function PrintBill({ data }: { data: PrintBillData }) {
  const { lines, dates, eventSlots, guests, eventType } = data;
  const foodLines = lines.filter((line) => line.isFood);
  const otherLines = lines.filter((line) => !line.isFood);
  const schedule = hasAnySlots(eventSlots) ? scheduleLines(dates, eventSlots) : [];
  return (
    <main className="print-sheet">
      <div className="print-header flex items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <img src={BRAND_LOGO} alt={`${BANQUET_NAME} logo`} className="print-logo" />
          <div>
            <h1 className="text-3xl font-semibold text-[#864936]">{BANQUET_NAME}</h1>
            <p className="mt-1 text-xs text-[#6e6a61]">Celebrations, held beautifully.</p>
          </div>
        </div>
        <div className="text-right">
          <p className="print-label">Prepared on</p><strong className="text-xs">{preparedOn()}</strong>
          <p className="mt-2 print-label">Bill No</p><strong className="text-xs">{data.billNumber || '—'}</strong>
        </div>
      </div>
      <section className="print-inquiry">
        <h2>Inquiry details</h2>
        <div className="print-inquiry-grid">
          <div><span>Customer</span><strong>{data.customerName || '—'}</strong></div>
          <div><span>Mobile</span><strong>{data.mobile || '—'}</strong></div>
          <div><span>Event</span><strong>{eventType || '—'}</strong></div>
          <div><span>{dates.length > 1 ? 'Dates' : 'Date'}</span><strong>{dates.length ? formatEventDates(dates) : 'Not selected'}</strong></div>
          <div><span>Guests</span><strong>{guests ? num(guests) : '—'}</strong></div>
          <div><span>GST</span><strong>{data.gstEnabled ? `${data.gstRate}%` : 'Not applied'}</strong></div>
          {data.hallGstNumber?.trim() && <div><span>Hall GST number</span><strong>{data.hallGstNumber}</strong></div>}
          {data.customerGstNumber?.trim() && <div><span>Customer GST number</span><strong>{data.customerGstNumber}</strong></div>}
        </div>
        {schedule.length > 0 && (
          <div className="print-schedule">
            <span>Date &amp; time</span>
            {schedule.map((line) => <p key={line.date}><strong>{formatEventDates([line.date])}</strong> — {line.text}</p>)}
          </div>
        )}
      </section>
      {foodLines.length > 0 && <ServiceTable title="Food & Catering" lines={foodLines} guests={guests} eventType={eventType} showLineTotal={false} showDescription={false} />}
      {otherLines.length > 0 && <ServiceTable title="Additional services" lines={otherLines} guests={guests} eventType={eventType} />}
      {!lines.length && <p className="mb-2 text-sm text-[#6e6a61]">No additional services selected.</p>}
      <div className="print-totals">
        {data.categoryTotals.filter((row) => row.total > 0).map((row) => <div className="print-total-row" key={row.name}><span>{row.name}</span><strong>{inr(row.total)}</strong></div>)}
        {data.foodPerPlate > 0 && <div className="print-total-row"><span>Food price / plate</span><strong>{inr(data.foodPerPlate)}</strong></div>}
        <div className="print-total-row"><span>Subtotal</span><strong>{inr(data.subtotal)}</strong></div>
        {data.discountAmount > 0 && <div className="print-total-row"><span>{data.discountLabel}</span><strong>− {inr(data.discountAmount)}</strong></div>}
        {data.gstEnabled && <div className="print-total-row"><span>GST ({data.gstRate}%)</span><strong>{inr(data.gstAmount)}</strong></div>}
        <div className="print-total-row print-grand"><span>Grand total</span><strong>{inr(data.grandTotal)}</strong></div>
        {data.advanceAmount > 0 && <div className="print-total-row"><span>Advance paid</span><strong>− {inr(data.advanceAmount)}</strong></div>}
        {data.advanceAmount > 0 && <div className="print-total-row print-balance"><span>{data.balanceDue <= 0 ? 'Fully paid' : 'Balance to pay'}</span><strong>{inr(data.balanceDue)}</strong></div>}
        {data.showCostPerGuest && <div className="print-total-row"><span>Cost per guest</span><strong>{inr(data.costPerGuest)}</strong></div>}
      </div>
      <div className="print-notes"><strong>Notes & terms</strong><br />{BILL_NOTE}</div>
    </main>
  );
}
