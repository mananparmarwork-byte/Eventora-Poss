import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { fmtDate, formatEventDates, monthKey, monthLabel } from '@/lib/format';
import { quotePaymentState, quoteDates } from '@/lib/pricing';
import type { BusinessProfile, Quote } from '@/lib/types';

const C = { navy: '#0B1733', gold: '#B8861B', goldBright: '#E6B84A', ivory: '#F7F5EF', ink: '#1B2437', muted: '#667085', line: '#E4E1D6', white: '#FFFFFF', green: '#2F7D55', red: '#B4474D' };
const s = StyleSheet.create({
  page: { padding: 32, paddingBottom: 46, fontFamily: 'Helvetica', fontSize: 8.5, color: C.ink },
  head: { backgroundColor: C.navy, borderRadius: 8, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  title: { fontFamily: 'Times-Bold', fontSize: 18, color: C.white },
  sub: { fontSize: 8.5, color: C.goldBright, marginTop: 3, letterSpacing: 1, textTransform: 'uppercase' },
  stats: { flexDirection: 'row', marginTop: 12 },
  stat: { flex: 1, backgroundColor: C.ivory, borderWidth: 1, borderColor: C.line, borderRadius: 6, padding: 9, marginRight: 8 },
  statLabel: { fontSize: 7.5, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  statValue: { fontFamily: 'Helvetica-Bold', fontSize: 12.5, marginTop: 3 },
  month: { flexDirection: 'row', justifyContent: 'space-between', borderLeftWidth: 3, borderLeftColor: C.goldBright, backgroundColor: C.ivory, paddingVertical: 5, paddingHorizontal: 8, marginTop: 14 },
  monthName: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: C.navy },
  thead: { flexDirection: 'row', backgroundColor: C.navy, paddingVertical: 5, paddingHorizontal: 6, marginTop: 4 },
  th: { color: C.white, fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.6 },
  row: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 0.6, borderBottomColor: C.line },
  footer: { position: 'absolute', left: 32, right: 32, bottom: 18, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.6, borderTopColor: C.line, paddingTop: 5 },
  footText: { fontSize: 7.5, color: C.muted },
});
const col = { ref: 1.1, name: 2.6, event: 1.5, date: 2.3, guests: 0.8, status: 1.1, total: 1.5, recv: 1.5, bal: 1.5 };
const plain = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0);

export function ReportDocument({ title, quotes, business }: { title: string; quotes: Quote[]; business: BusinessProfile }) {
  const sorted = [...quotes].sort((a, b) => (quoteDates(a.customer)[0] ?? '').localeCompare(quoteDates(b.customer)[0] ?? ''));
  const groups = new Map<string, Quote[]>();
  sorted.forEach((q) => { const k = monthKey(quoteDates(q.customer)[0] ?? q.createdAt.slice(0, 10)); groups.set(k, [...(groups.get(k) ?? []), q]); });
  const sum = (list: Quote[]) => list.reduce((a, q) => { const p = quotePaymentState(q.pricing); return { total: a.total + q.pricing.grandTotal, recv: a.recv + p.received, bal: a.bal + p.balance, booked: a.booked + (q.status === 'confirmed' ? 1 : 0) }; }, { total: 0, recv: 0, bal: 0, booked: 0 });
  const all = sum(quotes);
  return (
    <Document title={title} author={business.name} creator="Eventora OS">
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.head}>
          <View><Text style={s.title}>{title}</Text><Text style={s.sub}>{business.name} · Generated {fmtDate(new Date().toISOString())}</Text></View>
        </View>
        <View style={s.stats}>
          {[['Enquiries', String(quotes.length)], ['Booked', String(all.booked)], ['Total value', `INR ${plain(all.total)}`], ['Collected', `INR ${plain(all.recv)}`], ['Outstanding', `INR ${plain(all.bal)}`]].map(([l, v], i, a) => (
            <View key={l} style={[s.stat, i === a.length - 1 ? { marginRight: 0 } : {}]}><Text style={s.statLabel}>{l}</Text><Text style={s.statValue}>{v}</Text></View>
          ))}
        </View>
        {Array.from(groups.entries()).map(([key, list]) => {
          const t = sum(list);
          return (
            <View key={key}>
              <View style={s.month} wrap={false}>
                <Text style={s.monthName}>{monthLabel(key)}</Text>
                <Text style={{ fontSize: 8.5 }}>{list.length} enquir{list.length === 1 ? 'y' : 'ies'} · {t.booked} booked · INR {plain(t.total)}</Text>
              </View>
              <View style={s.thead} wrap={false}>
                <Text style={[s.th, { flex: col.ref }]}>Bill no.</Text><Text style={[s.th, { flex: col.name }]}>Customer</Text><Text style={[s.th, { flex: col.event }]}>Event</Text>
                <Text style={[s.th, { flex: col.date }]}>Date</Text><Text style={[s.th, { flex: col.guests, textAlign: 'right' }]}>Guests</Text><Text style={[s.th, { flex: col.status, textAlign: 'center' }]}>Status</Text>
                <Text style={[s.th, { flex: col.total, textAlign: 'right' }]}>Total</Text><Text style={[s.th, { flex: col.recv, textAlign: 'right' }]}>Received</Text><Text style={[s.th, { flex: col.bal, textAlign: 'right' }]}>Balance</Text>
              </View>
              {list.map((q) => {
                const p = quotePaymentState(q.pricing);
                return (
                  <View key={q.id} style={s.row} wrap={false}>
                    <Text style={{ flex: col.ref, fontFamily: 'Helvetica-Bold' }}>{q.reference}</Text>
                    <View style={{ flex: col.name }}><Text style={{ fontFamily: 'Helvetica-Bold' }}>{q.customer.name}</Text><Text style={{ color: C.muted, fontSize: 7.5 }}>{q.customer.mobile}</Text></View>
                    <Text style={{ flex: col.event }}>{q.customer.eventType}</Text>
                    <Text style={{ flex: col.date }}>{formatEventDates(quoteDates(q.customer))}</Text>
                    <Text style={{ flex: col.guests, textAlign: 'right' }}>{plain(q.customer.guests)}</Text>
                    <Text style={{ flex: col.status, textAlign: 'center', color: q.status === 'confirmed' ? C.green : C.muted }}>{q.status === 'confirmed' ? 'Booked' : 'Enquiry'}</Text>
                    <Text style={{ flex: col.total, textAlign: 'right', fontFamily: 'Helvetica-Bold' }}>{plain(q.pricing.grandTotal)}</Text>
                    <Text style={{ flex: col.recv, textAlign: 'right', color: C.green }}>{plain(p.received)}</Text>
                    <Text style={{ flex: col.bal, textAlign: 'right', color: p.balance > 0 ? C.red : C.green }}>{plain(p.balance)}</Text>
                  </View>
                );
              })}
            </View>
          );
        })}
        <View style={s.footer} fixed>
          <Text style={s.footText}>{business.name} · Eventora OS</Text>
          <Text style={s.footText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
