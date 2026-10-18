import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Loader2, Printer } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, Select, Spinner, useUi } from '@/components/ui';
import { StatusBadge } from '@/components/PaymentBadge';
import { useBusiness, useQuotes } from '@/lib/api';
import { formatEventDates, inr, inrCompact, monthKey, monthLabel } from '@/lib/format';
import { quoteDates, quotePaymentState } from '@/lib/pricing';
import { buildReportBlob, saveBlob } from '@/pdf/generate';

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

export function Reports() {
  const { data: quotes = [], isLoading } = useQuotes();
  const { business } = useBusiness();
  const { toast } = useUi();
  const [month, setMonth] = useState('all');
  const [busy, setBusy] = useState(false);

  const months = useMemo(() => Array.from(new Set(quotes.map((q) => monthKey(quoteDates(q.customer)[0] ?? q.createdAt)))).sort().reverse(), [quotes]);
  const rows = useMemo(() => quotes.filter((q) => month === 'all' || monthKey(quoteDates(q.customer)[0] ?? q.createdAt) === month), [quotes, month]);
  if (isLoading) return <Spinner label="Loading reports" />;

  const sum = rows.reduce((a, q) => { const p = quotePaymentState(q.pricing); return { total: a.total + q.pricing.grandTotal, recv: a.recv + p.received, bal: a.bal + p.balance, booked: a.booked + (q.status === 'confirmed' ? 1 : 0) }; }, { total: 0, recv: 0, bal: 0, booked: 0 });
  const title = month === 'all' ? 'Enquiry & booking report' : `Report — ${monthLabel(month)}`;

  const pdf = async () => {
    setBusy(true);
    try { saveBlob(await buildReportBlob(title, rows, business), `eventora-report-${month}.pdf`); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not create the PDF.', 'error'); }
    finally { setBusy(false); }
  };

  const csv = () => {
    const head = ['Bill no', 'Customer', 'Mobile', 'Event', 'Dates', 'Guests', 'Status', 'Total', 'Received', 'Balance'];
    const body = rows.map((q) => { const p = quotePaymentState(q.pricing); return [q.reference, q.customer.name, q.customer.mobile, q.customer.eventType, formatEventDates(quoteDates(q.customer)), q.customer.guests, q.status === 'confirmed' ? 'Booked' : 'Enquiry', Math.round(q.pricing.grandTotal), Math.round(p.received), Math.round(p.balance)]; });
    saveBlob(new Blob([[head, ...body].map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }), `eventora-report-${month}.csv`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><h2 className="font-display text-2xl font-semibold text-text">Reports</h2><p className="mt-1 text-sm text-text-secondary">Filter by event month, then download a PDF or spreadsheet.</p></div>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-52" aria-label="Month"><option value="all">All months</option>{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</Select>
          <Button variant="gold" onClick={pdf} disabled={busy || rows.length === 0}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} PDF report</Button>
          <Button variant="outline" onClick={csv} disabled={rows.length === 0}><FileSpreadsheet size={15} /> CSV</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[['Quotations', String(rows.length)], ['Booked', String(sum.booked)], ['Total value', inrCompact(sum.total)], ['Collected', inrCompact(sum.recv)], ['Outstanding', inrCompact(sum.bal)]].map(([l, v]) => (
          <Card key={l} className="p-5"><p className="text-xs text-text-secondary">{l}</p><p className="mt-1 text-2xl font-semibold text-text tabular">{v}</p></Card>
        ))}
      </div>

      <Card>
        <CardHeader title={title} subtitle={`${rows.length} record${rows.length === 1 ? '' : 's'}`} action={<Button variant="ghost" size="sm" onClick={() => window.print()}><Printer size={14} /> Print</Button>} />
        {rows.length === 0 ? <EmptyState icon={<FileSpreadsheet />} title="No records" text="Nothing matches this month." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead><tr className="border-b border-border/70 text-[11px] uppercase tracking-wide text-text-disabled"><th className="px-5 py-3">Bill</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Total</th><th className="px-5 py-3 text-right">Received</th><th className="px-5 py-3 text-right">Balance</th></tr></thead>
              <tbody>
                {rows.map((q) => { const p = quotePaymentState(q.pricing); return (
                  <tr key={q.id} className="border-b border-border/50 last:border-0">
                    <td className="px-5 py-3 font-mono text-xs font-semibold text-gold">{q.reference}</td>
                    <td className="px-5 py-3"><p className="font-medium text-text">{q.customer.name}</p><p className="text-xs text-text-secondary">{q.customer.eventType}</p></td>
                    <td className="px-5 py-3 text-text-secondary">{formatEventDates(quoteDates(q.customer))}</td>
                    <td className="px-5 py-3"><StatusBadge status={q.status} /></td>
                    <td className="px-5 py-3 text-right font-semibold tabular text-text">{inr(q.pricing.grandTotal)}</td>
                    <td className="px-5 py-3 text-right tabular text-success">{inr(p.received)}</td>
                    <td className="px-5 py-3 text-right tabular text-warning">{inr(p.balance)}</td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
