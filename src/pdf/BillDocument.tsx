/**
 * Eventora OS — printable quotation / invoice (real PDF, built with @react-pdf/renderer).
 *
 * THE WHOLE PDF LAYOUT LIVES IN THIS ONE FILE.
 * Want a different layout? Edit `styles` and the JSX below — nothing else in the app needs to change.
 * Uses the built-in PDF fonts (Helvetica / Times) so nothing has to be downloaded; money is written as "INR 1,25,000.00".
 */
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { amountInWords, fmtDate, formatEventDates } from '@/lib/format';
import { scheduleLines, timeText, durationText } from '@/lib/booking';
import { quoteAdvance, quoteDates, discountLabel } from '@/lib/pricing';
import { bankDetailsText } from '@/lib/settings';
import type { BusinessProfile, PaymentSettings, Quote, QuoteService } from '@/lib/types';

export type BillKind = 'quotation' | 'invoice';

const C = {
  navy: '#0B1733', navy2: '#18243A', gold: '#B8861B', goldBright: '#E6B84A', ivory: '#F7F5EF',
  ink: '#1B2437', muted: '#667085', line: '#E4E1D6', white: '#FFFFFF', green: '#2F7D55', red: '#B4474D',
};

const s = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 58, paddingHorizontal: 0, fontFamily: 'Helvetica', fontSize: 9, color: C.ink, backgroundColor: C.white },
  band: { backgroundColor: C.navy, paddingHorizontal: 36, paddingTop: 28, paddingBottom: 22, flexDirection: 'row', justifyContent: 'space-between' },
  goldLine: { height: 3, backgroundColor: C.goldBright },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  mark: { width: 34, height: 34, borderRadius: 9, backgroundColor: C.navy2, borderWidth: 1, borderColor: '#33415A', justifyContent: 'center', paddingLeft: 8, marginRight: 11 },
  bar: { height: 3.5, borderRadius: 2, backgroundColor: C.goldBright, marginVertical: 2.2 },
  bizName: { fontFamily: 'Times-Bold', fontSize: 19, color: C.white },
  bizTag: { fontSize: 8, color: C.goldBright, letterSpacing: 1.4, textTransform: 'uppercase', marginTop: 2 },
  bizMeta: { fontSize: 8, color: '#B8C2D4', marginTop: 7, lineHeight: 1.45, maxWidth: 250 },
  docType: { fontFamily: 'Times-Bold', fontSize: 23, color: C.goldBright, textAlign: 'right', letterSpacing: 1.5 },
  docMetaRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  docMetaLabel: { fontSize: 8, color: '#8D9AB0', marginRight: 6, width: 52, textAlign: 'right' },
  docMetaValue: { fontSize: 9, color: C.white, fontFamily: 'Helvetica-Bold', width: 92, textAlign: 'right' },
  body: { paddingHorizontal: 36, paddingTop: 20 },
  twoCol: { flexDirection: 'row' },
  box: { flex: 1, backgroundColor: C.ivory, borderRadius: 6, padding: 11, borderWidth: 1, borderColor: C.line },
  boxLabel: { fontSize: 7.5, color: C.gold, letterSpacing: 1.3, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold', marginBottom: 5 },
  boxName: { fontFamily: 'Helvetica-Bold', fontSize: 11, marginBottom: 3 },
  line: { fontSize: 9, color: C.ink, lineHeight: 1.5 },
  lineMuted: { fontSize: 9, color: C.muted, lineHeight: 1.5 },
  kv: { flexDirection: 'row', marginBottom: 2 },
  k: { width: 62, color: C.muted, fontSize: 9 },
  v: { flex: 1, fontSize: 9, fontFamily: 'Helvetica-Bold' },
  thead: { flexDirection: 'row', backgroundColor: C.navy, paddingVertical: 6, paddingHorizontal: 8, marginTop: 16 },
  th: { color: C.white, fontSize: 7.5, fontFamily: 'Helvetica-Bold', letterSpacing: 0.8, textTransform: 'uppercase' },
  catRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: C.ivory, paddingVertical: 5, paddingHorizontal: 8, borderLeftWidth: 3, borderLeftColor: C.goldBright, marginTop: 6 },
  catName: { fontFamily: 'Helvetica-Bold', fontSize: 9.5, color: C.navy },
  catTotal: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.navy },
  row: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 0.7, borderBottomColor: C.line },
  cName: { flex: 5.2, paddingRight: 8 },
  cRate: { flex: 2.2, textAlign: 'right' },
  cQty: { flex: 1.5, textAlign: 'right' },
  cAmt: { flex: 2.2, textAlign: 'right' },
  itemName: { fontFamily: 'Helvetica-Bold', fontSize: 9.2 },
  itemDesc: { fontSize: 7.8, color: C.muted, marginTop: 1.5, lineHeight: 1.35 },
  summaryWrap: { flexDirection: 'row', marginTop: 16 },
  summaryLeft: { flex: 1, paddingRight: 18 },
  summaryRight: { width: 218 },
  totRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3.5, paddingHorizontal: 4 },
  totLabel: { color: C.muted, fontSize: 9 },
  totValue: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  grand: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: C.navy, borderRadius: 6, paddingVertical: 9, paddingHorizontal: 10, marginTop: 5 },
  grandLabel: { color: C.goldBright, fontFamily: 'Helvetica-Bold', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' },
  grandValue: { color: C.white, fontFamily: 'Helvetica-Bold', fontSize: 12 },
  balance: { flexDirection: 'row', justifyContent: 'space-between', borderWidth: 1, borderColor: C.goldBright, borderRadius: 6, paddingVertical: 7, paddingHorizontal: 10, marginTop: 5, backgroundColor: '#FFF9E8' },
  words: { backgroundColor: C.ivory, borderRadius: 6, borderWidth: 1, borderColor: C.line, padding: 10 },
  wordsLabel: { fontSize: 7.5, color: C.gold, letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  wordsText: { fontFamily: 'Times-Italic', fontSize: 10, lineHeight: 1.4 },
  heading: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: C.navy, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 },
  payBox: { flexDirection: 'row', borderWidth: 1, borderColor: C.line, borderRadius: 6, padding: 10, marginTop: 16, alignItems: 'center' },
  qr: { width: 74, height: 74, marginRight: 14 },
  terms: { marginTop: 16 },
  termRow: { flexDirection: 'row', marginBottom: 2.5 },
  termNo: { width: 14, color: C.gold, fontFamily: 'Helvetica-Bold', fontSize: 8 },
  termText: { flex: 1, fontSize: 8, color: C.muted, lineHeight: 1.45 },
  sign: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 26 },
  signBox: { width: 160, alignItems: 'center' },
  signLine: { borderTopWidth: 1, borderTopColor: C.ink, width: '100%', paddingTop: 4, textAlign: 'center', fontSize: 8.5 },
  footer: { position: 'absolute', left: 36, right: 36, bottom: 22, borderTopWidth: 0.7, borderTopColor: C.line, paddingTop: 7, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7.5, color: C.muted },
});

const money = (n: number) => `INR ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0)}`;
const plain = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0);

function rateText(service: QuoteService) {
  if (service.pricingType === 'perPerson') return `${plain(service.unitPrice)} / plate`;
  if (service.pricingType === 'perUnit') return `${plain(service.unitPrice)} / unit`;
  return `${plain(service.unitPrice)}`;
}
function qtyText(service: QuoteService, guests: number) {
  if (service.pricingType === 'perPerson') return `${plain(guests)}`;
  if (service.pricingType === 'perUnit') return `${service.quantity}`;
  return '1';
}

function groupServices(services: QuoteService[]) {
  const groups: { name: string; items: QuoteService[] }[] = [];
  services.forEach((svc) => {
    const g = groups.find((x) => x.name === svc.category);
    if (g) g.items.push(svc); else groups.push({ name: svc.category || 'Services', items: [svc] });
  });
  return groups;
}

export type BillProps = { quote: Quote; business: BusinessProfile; payment: PaymentSettings; kind: BillKind; qr?: string };

export function BillDocument({ quote, business, payment, kind, qr }: BillProps) {
  const { customer, pricing } = quote;
  const dates = quoteDates(customer);
  const advance = quoteAdvance(pricing);
  const taxable = pricing.subtotal - (pricing.discountEnabled ? pricing.discountAmount ?? 0 : 0);
  const showGst = pricing.gstEnabled && pricing.gstAmount > 0;
  const half = pricing.gstRate / 2;
  const groups = groupServices(quote.services);
  const schedule = scheduleLines(dates, customer.eventSlots);
  const termLines = business.terms.split('\n').map((t) => t.trim()).filter(Boolean);
  const bank = bankDetailsText(payment);
  const showPayBlock = advance.balance > 0 && (payment.upiId || bank);
  const docTitle = kind === 'invoice' ? 'TAX INVOICE' : 'QUOTATION';
  const addressLines = business.address.split('\n').map((l) => l.trim()).filter(Boolean);
  const contact = [business.phone && `Tel: ${business.phone}`, business.email, business.website].filter(Boolean).join('  |  ');

  return (
    <Document title={`${docTitle} ${quote.reference}`} author={business.name} subject={`${docTitle} for ${customer.name}`} creator="Eventora OS">
      <Page size="A4" style={s.page}>
        {/* ---- header ---- */}
        <View style={s.band}>
          <View>
            <View style={s.brandRow}>
              {business.logo ? (
                <Image src={business.logo} style={{ width: 40, height: 40, objectFit: 'contain', marginRight: 11 }} />
              ) : (
                <View style={s.mark}>
                  <View style={[s.bar, { width: 18 }]} /><View style={[s.bar, { width: 12 }]} /><View style={[s.bar, { width: 18 }]} />
                </View>
              )}
              <View>
                <Text style={s.bizName}>{business.name}</Text>
                {business.tagline ? <Text style={s.bizTag}>{business.tagline}</Text> : null}
              </View>
            </View>
            <Text style={s.bizMeta}>
              {[...addressLines, contact, (pricing.gstNumber || business.gstin) && pricing.gstNumberVisible !== false ? `GSTIN: ${pricing.gstNumber || business.gstin}` : ''].filter(Boolean).join('\n')}
            </Text>
          </View>
          <View>
            <Text style={s.docType}>{docTitle}</Text>
            <View style={[s.docMetaRow, { marginTop: 10 }]}><Text style={s.docMetaLabel}>No.</Text><Text style={s.docMetaValue}>{quote.reference}</Text></View>
            <View style={s.docMetaRow}><Text style={s.docMetaLabel}>Date</Text><Text style={s.docMetaValue}>{fmtDate(quote.createdAt)}</Text></View>
            <View style={s.docMetaRow}><Text style={s.docMetaLabel}>Status</Text><Text style={s.docMetaValue}>{quote.status === 'confirmed' ? 'Booked' : kind === 'invoice' ? 'Issued' : 'Estimate'}</Text></View>
          </View>
        </View>
        <View style={s.goldLine} />

        <View style={s.body}>
          {/* ---- parties ---- */}
          <View style={s.twoCol}>
            <View style={[s.box, { marginRight: 10 }]}>
              <Text style={s.boxLabel}>Billed to</Text>
              <Text style={s.boxName}>{customer.name}</Text>
              <Text style={s.lineMuted}>Mobile: {customer.mobile}</Text>
              {customer.gstNumber && pricing.customerGstNumberVisible !== false ? <Text style={s.lineMuted}>GSTIN: {customer.gstNumber}</Text> : null}
            </View>
            <View style={s.box}>
              <Text style={s.boxLabel}>Event details</Text>
              <View style={s.kv}><Text style={s.k}>Occasion</Text><Text style={s.v}>{customer.eventType}</Text></View>
              <View style={s.kv}><Text style={s.k}>{dates.length > 1 ? 'Dates' : 'Date'}</Text><Text style={s.v}>{formatEventDates(dates)}</Text></View>
              {schedule.map((l) => (
                <View key={l.date} style={s.kv}>
                  <Text style={s.k}>{dates.length > 1 ? fmtDate(l.date, { day: '2-digit', month: 'short' }) : 'Time'}</Text>
                  <Text style={s.v}>{l.text}{durationText(customer.eventSlots?.[l.date]) && timeText(customer.eventSlots?.[l.date]) ? `  (${durationText(customer.eventSlots?.[l.date])})` : ''}</Text>
                </View>
              ))}
              <View style={s.kv}><Text style={s.k}>Guests</Text><Text style={s.v}>{plain(customer.guests)}</Text></View>
            </View>
          </View>

          {/* ---- items ---- */}
          <View style={s.thead}>
            <Text style={[s.th, s.cName]}>Description</Text>
            <Text style={[s.th, s.cRate]}>Rate (INR)</Text>
            <Text style={[s.th, s.cQty]}>Qty</Text>
            <Text style={[s.th, s.cAmt]}>Amount (INR)</Text>
          </View>
          {groups.map((g) => (
            <View key={g.name}>
              <View style={s.catRow} wrap={false}>
                <Text style={s.catName}>{g.name}</Text>
                <Text style={s.catTotal}>{plain(g.items.reduce((a, i) => a + i.total, 0))}</Text>
              </View>
              {g.items.map((item) => (
                <View key={item.id} style={s.row} wrap={false}>
                  <View style={s.cName}>
                    <Text style={s.itemName}>{item.name}</Text>
                    {item.description ? <Text style={s.itemDesc}>{item.description}</Text> : null}
                  </View>
                  <Text style={s.cRate}>{rateText(item)}</Text>
                  <Text style={s.cQty}>{qtyText(item, customer.guests)}</Text>
                  <Text style={[s.cAmt, { fontFamily: 'Helvetica-Bold' }]}>{plain(item.total)}</Text>
                </View>
              ))}
            </View>
          ))}

          {/* ---- totals ---- */}
          <View style={s.summaryWrap} wrap={false}>
            <View style={s.summaryLeft}>
              <View style={s.words}>
                <Text style={s.wordsLabel}>Amount in words</Text>
                <Text style={s.wordsText}>{amountInWords(pricing.grandTotal)}</Text>
              </View>
              {pricing.showCostPerGuest !== false && customer.guests > 0 ? (
                <Text style={[s.lineMuted, { marginTop: 8 }]}>Effective cost per guest: {money(pricing.costPerGuest)}</Text>
              ) : null}
            </View>
            <View style={s.summaryRight}>
              <View style={s.totRow}><Text style={s.totLabel}>Subtotal</Text><Text style={s.totValue}>{money(pricing.subtotal)}</Text></View>
              {pricing.discountEnabled && (pricing.discountAmount ?? 0) > 0 ? (
                <View style={s.totRow}><Text style={s.totLabel}>{discountLabel(pricing.discountPercent ?? 0, pricing.discountFlat ?? 0)}</Text><Text style={[s.totValue, { color: C.green }]}>- {money(pricing.discountAmount ?? 0)}</Text></View>
              ) : null}
              {showGst ? (
                <>
                  <View style={s.totRow}><Text style={s.totLabel}>Taxable amount</Text><Text style={s.totValue}>{money(taxable)}</Text></View>
                  {business.gstSplit ? (
                    <>
                      <View style={s.totRow}><Text style={s.totLabel}>CGST @ {half}%</Text><Text style={s.totValue}>{money(pricing.gstAmount / 2)}</Text></View>
                      <View style={s.totRow}><Text style={s.totLabel}>SGST @ {half}%</Text><Text style={s.totValue}>{money(pricing.gstAmount / 2)}</Text></View>
                    </>
                  ) : (
                    <View style={s.totRow}><Text style={s.totLabel}>GST @ {pricing.gstRate}%</Text><Text style={s.totValue}>{money(pricing.gstAmount)}</Text></View>
                  )}
                </>
              ) : null}
              <View style={s.grand}><Text style={s.grandLabel}>Grand total</Text><Text style={s.grandValue}>{money(pricing.grandTotal)}</Text></View>
              {advance.paid ? (
                <>
                  <View style={[s.totRow, { marginTop: 4 }]}><Text style={s.totLabel}>Received</Text><Text style={[s.totValue, { color: C.green }]}>- {money(advance.amount)}</Text></View>
                  <View style={s.balance}>
                    <Text style={[s.totLabel, { color: C.ink, fontFamily: 'Helvetica-Bold' }]}>{advance.balance > 0 ? 'Balance due' : 'Paid in full'}</Text>
                    <Text style={[s.totValue, { fontSize: 11, color: advance.balance > 0 ? C.red : C.green }]}>{money(advance.balance)}</Text>
                  </View>
                </>
              ) : null}
            </View>
          </View>

          {/* ---- payment details ---- */}
          {showPayBlock ? (
            <View style={s.payBox} wrap={false}>
              {qr && payment.upiId ? <Image src={qr} style={s.qr} /> : null}
              <View style={{ flex: 1 }}>
                <Text style={s.heading}>How to pay</Text>
                {payment.upiId ? <Text style={s.line}>UPI: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{payment.upiId}</Text>{payment.payeeName ? `  (${payment.payeeName})` : ''}</Text> : null}
                {qr && payment.upiId ? <Text style={s.lineMuted}>Scan the QR with any UPI app to pay {money(advance.balance)}.</Text> : null}
                {bank ? <Text style={[s.lineMuted, { marginTop: 4 }]}>{bank}</Text> : null}
              </View>
            </View>
          ) : null}

          {/* ---- terms + signature ---- */}
          {termLines.length ? (
            <View style={s.terms} wrap={false}>
              <Text style={s.heading}>Terms & conditions</Text>
              {termLines.map((t, i) => (
                <View key={i} style={s.termRow}><Text style={s.termNo}>{i + 1}.</Text><Text style={s.termText}>{t}</Text></View>
              ))}
            </View>
          ) : null}
          <View style={s.sign} wrap={false}>
            <View style={s.signBox}><Text style={[s.signLine, { color: C.muted }]}>Customer acceptance</Text></View>
            <View style={s.signBox}>
              <Text style={{ fontFamily: 'Times-Bold', fontSize: 9, marginBottom: 20 }}>For {business.name}</Text>
              <Text style={s.signLine}>{business.signatory}</Text>
            </View>
          </View>
        </View>

        {/* ---- footer on every page ---- */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>{business.footerNote}</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `${quote.reference}  ·  Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
