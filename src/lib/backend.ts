import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cloneCatalog, DEFAULT_CATALOG } from './catalog';
import { normalizeEventSlots, occupancyEntries } from './booking';
import { computeTotals, lineTotal, quoteAdvance } from './pricing';
import { newId } from './settings';
import { localISODate } from './format';
import type { CatalogCategory, Quote, QuoteInput, QuotePricing, QuoteService, QuoteStatus, TimeRange } from './types';

/**
 * Every screen talks to the database ONLY through this interface.
 *  - makeSupabaseBackend: used for GitHub + Supabase.
 *  - makeHttpBackend: used for Hostinger (PHP + MySQL) when VITE_API_URL is set.
 * To move to a Hostinger database later, add a third implementation (e.g. a small REST API in front of MySQL)
 * and return it from getBackend(). No page has to change.
 */
export type Session = { email: string } | null;

export interface Backend {
  mode: 'supabase' | 'api';
  getCatalog(): Promise<CatalogCategory[]>;
  saveCatalog(catalog: CatalogCategory[]): Promise<void>;
  listQuotes(): Promise<Quote[]>;
  getQuote(reference: string): Promise<Quote | null>;
  createQuote(input: QuoteInput): Promise<Quote>;
  updateQuote(reference: string, input: QuoteInput): Promise<void>;
  updatePricing(reference: string, pricing: QuotePricing): Promise<void>;
  setStatus(reference: string, status: QuoteStatus): Promise<void>;
  deleteQuote(reference: string): Promise<void>;
  bookedTimes(): Promise<Record<string, TimeRange[]>>;
  getSettings(key: string): Promise<unknown | null>;
  saveSettings(key: string, data: unknown): Promise<void>;
  getSession(): Promise<Session>;
  signIn(email: string, password: string): Promise<Session>;
  signOut(): Promise<void>;
  onAuthChange(cb: () => void): () => void;
}

/* ------------------------------------------------------------------ Supabase */

type QuoteRow = {
  id: string; reference: string; customer_name: string; mobile: string; event_type: string; event_date: string;
  guests: number; customer_gst_number: string | null; hall: string; services: QuoteService[]; pricing: QuotePricing;
  status: QuoteStatus; created_at: string;
};

function fromRow(row: QuoteRow): Quote {
  const dates = Array.isArray(row.pricing?.eventDates) && row.pricing.eventDates.length ? row.pricing.eventDates : [row.event_date];
  return {
    id: row.id,
    reference: row.reference,
    customer: {
      name: row.customer_name, mobile: row.mobile, eventType: row.event_type, eventDate: row.event_date, eventDates: dates,
      eventSlots: normalizeEventSlots(row.pricing?.eventSlots), guests: row.guests, gstNumber: row.customer_gst_number ?? '', hall: row.hall,
    },
    services: Array.isArray(row.services) ? row.services : [],
    pricing: {
      ...row.pricing,
      gstNumber: typeof row.pricing?.gstNumber === 'string' ? row.pricing.gstNumber : '',
      gstNumberVisible: typeof row.pricing?.gstNumberVisible === 'boolean' ? row.pricing.gstNumberVisible : false,
    },
    status: row.status,
    createdAt: row.created_at,
  };
}

const toRow = (input: QuoteInput) => ({
  reference: input.reference,
  customer_name: input.customer.name,
  mobile: input.customer.mobile,
  event_type: input.customer.eventType,
  event_date: input.customer.eventDate,
  guests: input.customer.guests,
  customer_gst_number: input.customer.gstNumber ?? '',
  hall: input.customer.hall,
  services: input.services,
  pricing: { ...input.pricing, eventDates: input.customer.eventDates ?? [input.customer.eventDate], eventSlots: input.customer.eventSlots ?? {} },
});

const NOT_ALLOWED = 'The database did not allow this change. Make sure supabase/setup.sql has been run and you are signed in as an admin.';

function makeSupabaseBackend(client: SupabaseClient): Backend {
  return {
    mode: 'supabase',
    async getCatalog() {
      const { data, error } = await client.from('catalog').select('categories').eq('id', 'default').maybeSingle();
      if (error) throw error;
      return Array.isArray(data?.categories) && data.categories.length ? (data.categories as CatalogCategory[]) : cloneCatalog();
    },
    async saveCatalog(catalog) {
      const { error } = await client.from('catalog').upsert({ id: 'default', categories: catalog }, { onConflict: 'id' });
      if (error) throw error;
    },
    async listQuotes() {
      const { data, error } = await client.from('quotes').select('*').order('created_at', { ascending: false }).limit(2000);
      if (error) throw error;
      return (data as QuoteRow[]).map(fromRow);
    },
    async getQuote(reference) {
      const { data, error } = await client.from('quotes').select('*').eq('reference', reference).maybeSingle();
      if (error) throw error;
      return data ? fromRow(data as QuoteRow) : null;
    },
    async createQuote(input) {
      // No .select(): the public estimator may insert but is not allowed to read quotes back.
      const { error } = await client.from('quotes').insert({ ...toRow(input), status: 'new' });
      if (error) throw new Error(error.code === '23505' ? 'This bill number already exists. Use a different bill number.' : error.message);
      return { ...input, id: newId(), createdAt: new Date().toISOString(), status: 'new' };
    },
    async updateQuote(reference, input) {
      const { reference: _ref, ...fields } = toRow(input);
      void _ref;
      const { data, error } = await client.from('quotes').update(fields).eq('reference', reference).select('reference');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error(NOT_ALLOWED);
    },
    async updatePricing(reference, pricing) {
      const { data, error } = await client.from('quotes').update({ pricing }).eq('reference', reference).select('reference');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error(NOT_ALLOWED);
    },
    async setStatus(reference, status) {
      const { data, error } = await client.from('quotes').update({ status }).eq('reference', reference).select('reference');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error(NOT_ALLOWED);
    },
    async deleteQuote(reference) {
      const { error } = await client.from('quotes').delete().eq('reference', reference);
      if (error) throw error;
    },
    async bookedTimes() {
      const { data, error } = await client.rpc('booked_times');
      if (error) throw error;
      const map: Record<string, TimeRange[]> = {};
      ((data ?? []) as { booked_date: string; start_time: string; end_time: string }[]).forEach((r) => {
        map[r.booked_date] = [...(map[r.booked_date] ?? []), { start: r.start_time, end: r.end_time }];
      });
      return map;
    },
    async getSettings(key) {
      const { data, error } = await client.from('app_settings').select('data').eq('id', key).maybeSingle();
      if (error) return null;
      return data?.data ?? null;
    },
    async saveSettings(key, data) {
      const { error } = await client.from('app_settings').upsert({ id: key, data, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      if (error) throw error;
    },
    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session?.user?.email ? { email: data.session.user.email } : null;
    },
    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { email: data.user?.email ?? email };
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },
    onAuthChange(cb) {
      const { data } = client.auth.onAuthStateChange(() => cb());
      return () => data.subscription.unsubscribe();
    },
  };
}

/* ------------------------------------------------------- Sample for previews --- */

function seedQuote(db: CatalogCategory[], o: { ref: string; name: string; mobile: string; type: string; dayOffset: number; guests: number; items: string[]; status: QuoteStatus; advancePct: number; start: string; end: string; createdDaysAgo: number }): Quote {
  const all = db.flatMap((c) => c.subcategories.flatMap((s) => s.items));
  const when = new Date(); when.setDate(when.getDate() + o.dayOffset);
  const date = localISODate(when);
  const lines = o.items.map((id) => all.find((i) => i.id === id)).filter((i): i is NonNullable<typeof i> => Boolean(i));
  const services: QuoteService[] = lines.map((i) => ({
    id: i.id, name: i.name, category: db.find((c) => c.id === i.categoryId)?.name ?? '', subcategory: db.find((c) => c.id === i.categoryId)?.subcategories.find((s) => s.id === i.subcategoryId)?.name ?? '',
    pricingType: i.pricingType, quantity: 1, unitPrice: i.price, total: lineTotal(i.pricingType, i.price, o.guests, 1), description: i.description,
  }));
  const base = computeTotals({
    lines: services.map((s) => ({ categoryId: all.find((i) => i.id === s.id)?.categoryId ?? '', pricingType: s.pricingType, price: s.unitPrice, total: s.total })),
    gstEnabled: true, gstRate: 5, discountEnabled: false, discountPercent: 0, discountFlat: 0, guests: o.guests, advancePaid: false, advanceAmount: 0,
  });
  const paid = Math.round((base.grandTotal * o.advancePct) / 100);
  const adv = quoteAdvance({ grandTotal: base.grandTotal, advancePaid: paid > 0, advanceAmount: paid });
  const created = new Date(); created.setDate(created.getDate() - o.createdDaysAgo);
  return {
    id: newId(), reference: o.ref, status: o.status, createdAt: created.toISOString(),
    customer: { name: o.name, mobile: o.mobile, eventType: o.type, eventDate: date, eventDates: [date], eventSlots: { [date]: { start: o.start, end: o.end } }, guests: o.guests, gstNumber: '', hall: 'Eventora' },
    services,
    pricing: {
      foodPerPlate: base.foodPerPlate, subtotal: base.subtotal, gstEnabled: true, gstRate: 5, gstAmount: base.gstAmount, gstNumber: '', gstNumberVisible: true, customerGstNumberVisible: true,
      showCostPerGuest: true, eventDates: [date], eventSlots: { [date]: { start: o.start, end: o.end } }, discountEnabled: false, discountAmount: 0,
      grandTotal: base.grandTotal, costPerGuest: base.costPerGuest, advancePaid: adv.paid, advanceAmount: adv.amount, balanceDue: adv.balance,
      payments: paid > 0 ? [{ id: newId(), amount: paid, method: 'upi', kind: o.advancePct >= 100 ? 'full' : 'advance', paidAt: created.toISOString() }] : [],
    },
  };
}

/** A made-up bill used ONLY for "Preview sample PDF" in Settings. It is never saved anywhere. */
export const sampleQuote = (): Quote =>
  seedQuote(cloneCatalog(DEFAULT_CATALOG), { ref: 'EV-1001', name: 'Aarav & Meera Shah', mobile: '9876501234', type: 'Wedding', dayOffset: 30, guests: 300, items: ['welcome-signature', 'starters-veg', 'main-global', 'dessert-live', 'stage-floral', 'lighting-fairy', 'music-dj'], status: 'confirmed', advancePct: 40, start: '18:00', end: '23:30', createdDaysAgo: 0 });

/* ------------------------------------------------- Hostinger (PHP + MySQL) --- */

const TOKEN_KEY = 'eventora-api-token';
const readToken = () => { try { return window.localStorage.getItem(TOKEN_KEY) ?? ''; } catch { return ''; } };
const writeToken = (t: string) => { try { if (t) window.localStorage.setItem(TOKEN_KEY, t); else window.localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };

/** Talks to hostinger-api/index.php. Same interface as the Supabase backend, so no screen changes. */
function makeHttpBackend(apiUrl: string): Backend {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  async function call<T>(action: string, body: unknown = {}): Promise<T> {
    const token = readToken();
    let res: Response;
    try {
      res = await fetch(`${apiUrl}?action=${encodeURIComponent(action)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
    } catch { throw new Error('Could not reach the server. Check your internet connection.'); }
    let json: unknown = null;
    try { json = await res.json(); } catch { /* not JSON */ }
    if (!res.ok) {
      if (res.status === 401 && action !== 'auth.login') { writeToken(''); notify(); }
      throw new Error((json as { error?: string } | null)?.error ?? `Server error (${res.status}).`);
    }
    return json as T;
  }

  return {
    mode: 'api',
    async getCatalog() { const r = await call<{ categories: CatalogCategory[] | null }>('catalog.get'); return r.categories && r.categories.length ? r.categories : cloneCatalog(); },
    async saveCatalog(catalog) { await call('catalog.save', { categories: catalog }); },
    async listQuotes() { return (await call<Quote[]>('quotes.list')).map(normalizeQuote); },
    async getQuote(reference) { const q = await call<Quote | null>('quotes.get', { reference }); return q ? normalizeQuote(q) : null; },
    async createQuote(input) { return normalizeQuote(await call<Quote>('quotes.create', input)); },
    async updateQuote(reference, input) { await call('quotes.update', { reference, input }); },
    async updatePricing(reference, pricing) { await call('quotes.pricing', { reference, pricing }); },
    async setStatus(reference, status) { await call('quotes.status', { reference, status }); },
    async deleteQuote(reference) { await call('quotes.delete', { reference }); },
    async bookedTimes() { return call<Record<string, TimeRange[]>>('booked'); },
    async getSettings(key) { try { return (await call<{ data: unknown }>('settings.get', { key })).data ?? null; } catch { return null; } },
    async saveSettings(key, data) { await call('settings.save', { key, data }); },
    async getSession() {
      if (!readToken()) return null;
      try { const r = await call<{ email: string | null }>('auth.me'); return r.email ? { email: r.email } : null; } catch { return null; }
    },
    async signIn(email, password) {
      const r = await call<{ token: string; email: string }>('auth.login', { email, password });
      writeToken(r.token); notify();
      return { email: r.email };
    },
    async signOut() { try { await call('auth.logout'); } catch { /* token may already be invalid */ } writeToken(''); notify(); },
    onAuthChange(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },
  };
}

function normalizeQuote(q: Quote): Quote {
  const dates = q.customer.eventDates && q.customer.eventDates.length ? q.customer.eventDates : [q.customer.eventDate];
  return { ...q, customer: { ...q.customer, eventDates: dates, eventSlots: normalizeEventSlots(q.customer.eventSlots) } };
}

/* ------------------------------------------------------------------- Chooser */

const url = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const key = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
export const isSupabaseConfigured = Boolean(url && key);
const apiUrl = String(import.meta.env.VITE_API_URL ?? '').trim();

/** True when either Supabase keys or the Hostinger API address are set. */
export const isBackendConfigured = Boolean(apiUrl || isSupabaseConfigured);

let instance: Backend | null = null;
export function getBackend(): Backend {
  // Priority: Hostinger API (VITE_API_URL) → Supabase. The app shows a setup screen if neither is set.
  if (!instance) {
    if (apiUrl) instance = makeHttpBackend(apiUrl);
    else if (isSupabaseConfigured) instance = makeSupabaseBackend(createClient(url, key));
    else throw new Error('No database is connected. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  return instance;
}
