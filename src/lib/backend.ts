import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cloneCatalog, DEFAULT_CATALOG } from './catalog';
import { normalizeEventSlots, occupancyEntries } from './booking';
import { computeTotals, lineTotal, quoteAdvance } from './pricing';
import { newId } from './settings';
import { localISODate } from './format';
import { type ActivityDraft, type ActivityEntry, type CatalogCategory, type Quote, type QuoteInput, type QuotePricing, type QuoteService, type QuoteStatus, type Role, type Session, type StaffMember, type TimeRange } from './types';

/**
 * Every screen talks to the database ONLY through this interface.
 *  - makeSupabaseBackend: used for GitHub + Supabase.
 *  - makeHttpBackend: used for Hostinger (PHP + MySQL) when VITE_API_URL is set.
 * To move to a Hostinger database later, add a third implementation (e.g. a small REST API in front of MySQL)
 * and return it from getBackend(). No page has to change.
 */
export type { Session };

export interface Backend {
  mode: 'supabase' | 'api';
  getCatalog(): Promise<CatalogCategory[]>;
  saveCatalog(catalog: CatalogCategory[]): Promise<void>;
  listQuotes(): Promise<Quote[]>;
  getQuote(reference: string): Promise<Quote | null>;
  /** The server gives the bill its number (EV-DDMMYY-1001...). `overrideRef` is honoured for the owner only. */
  createQuote(input: QuoteInput, overrideRef?: string): Promise<Quote>;
  /** The number the next bill will get today (nothing is used up). Null when the caller may not ask. */
  peekBillNumber(): Promise<string | null>;
  /** Owner only: set the running number for the next bill today. */
  setNextBillNumber(n: number): Promise<void>;
  logActivity(draft: ActivityDraft): Promise<void>;
  listActivity(limit?: number): Promise<ActivityEntry[]>;
  purgeActivity(beforeISO: string): Promise<number>;
  canCreateStaff: boolean;
  listStaff(): Promise<StaffMember[]>;
  setStaffActive(id: string, active: boolean): Promise<void>;
  createStaff(email: string, password: string): Promise<void>;
  updateQuote(reference: string, input: QuoteInput): Promise<void>;
  updatePricing(reference: string, pricing: QuotePricing): Promise<void>;
  setStatus(reference: string, status: QuoteStatus): Promise<void>;
  deleteQuote(reference: string): Promise<void>;
  bookedTimes(): Promise<Record<string, TimeRange[]>>;
  getSettings(key: string): Promise<unknown | null>;
  saveSettings(key: string, data: unknown): Promise<void>;
  getSession(): Promise<Session>;
  signIn(email: string, password: string): Promise<NonNullable<Session>>;
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

type ActivityRow = { id: string; at: string; actor_email: string | null; actor_role: string | null; action: ActivityEntry['action']; reference: string | null; title: string; detail: string | null; data: ActivityEntry['data'] | null };
const fromActivityRow = (r: ActivityRow): ActivityEntry => ({
  id: r.id, at: r.at, actorEmail: r.actor_email ?? '', actorRole: (r.actor_role as ActivityEntry['actorRole']) ?? 'system', action: r.action,
  reference: r.reference ?? '', title: r.title, detail: r.detail ?? '', data: r.data ?? {},
});

const NOT_ALLOWED = 'The database did not allow this change. Make sure supabase/setup.sql has been run and you are signed in as an admin.';

/** Asks the database who is signed in. Falls back to the admin_users table if my_role() cannot be called, and says what went wrong. */
async function lookupRole(client: SupabaseClient): Promise<{ role: Role | 'none'; problem: string }> {
  const { data, error } = await client.rpc('my_role');
  if (!error && (data === 'admin' || data === 'staff' || data === 'none')) return { role: data, problem: '' };
  const { data: u } = await client.auth.getUser();
  const id = u.user?.id;
  if (id) {
    const a = await client.from('admin_users').select('user_id').eq('user_id', id).maybeSingle();
    if (a.data) return { role: 'admin', problem: '' };
    const t = await client.from('staff_users').select('user_id,active').eq('user_id', id).maybeSingle();
    if (t.data) return { role: t.data.active ? 'staff' : 'none', problem: '' };
  }
  return { role: 'none', problem: error ? error.message : '' };
}

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
    async createQuote(input, overrideRef) {
      // Bills are created by a database function so the number is handed out safely (see supabase/setup.sql).
      const { reference: _r, ...row } = toRow(input);
      void _r;
      const { data, error } = await client.rpc('create_quote', { p: row, p_reference: overrideRef?.trim() || null });
      if (error) throw new Error(error.code === '23505' ? 'This bill number already exists. Use a different bill number.' : error.message);
      return { ...input, reference: String(data), id: newId(), createdAt: new Date().toISOString(), status: 'new' };
    },
    async peekBillNumber() {
      const { data, error } = await client.rpc('peek_bill_number');
      return error || !data ? null : String(data);
    },
    async setNextBillNumber(n) {
      const { error } = await client.rpc('set_next_bill_number', { n });
      if (error) throw new Error(error.message);
    },
    async logActivity(d) {
      const { error } = await client.from('activity_log').insert({ action: d.action, reference: d.reference, title: d.title, detail: d.detail, data: d.data });
      if (error) throw new Error(error.message);
    },
    async listActivity(limit = 3000) {
      const { data, error } = await client.from('activity_log').select('*').order('at', { ascending: false }).limit(limit);
      if (error) throw error;
      return (data as ActivityRow[]).map(fromActivityRow);
    },
    async purgeActivity(beforeISO) {
      const { count, error } = await client.from('activity_log').delete({ count: 'exact' }).lt('at', beforeISO);
      if (error) throw error;
      return count ?? 0;
    },
    canCreateStaff: false,
    async listStaff() {
      const { data, error } = await client.from('staff_users').select('user_id,email,active').order('email');
      if (error) throw error;
      return (data as { user_id: string; email: string; active: boolean }[]).map((r) => ({ id: r.user_id, email: r.email, active: r.active }));
    },
    async setStaffActive(id, active) {
      const { error } = await client.from('staff_users').update({ active }).eq('user_id', id);
      if (error) throw error;
    },
    async createStaff() { throw new Error('With Supabase, create the employee login in the Supabase dashboard (see Settings → Team).'); },
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
      const email = data.session?.user?.email;
      if (!email) return null;
      const { role } = await lookupRole(client);
      return role === 'admin' || role === 'staff' ? { email, role } : null;
    },
    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const { role, problem } = await lookupRole(client);
      if (role !== 'admin' && role !== 'staff') {
        await client.auth.signOut();
        throw new Error(problem ? `Signed in, but the database could not confirm your role: ${problem}. Run the latest supabase/setup.sql.` : 'This account has no access yet, or it was switched off. Please ask the owner.');
      }
      return { email: data.user?.email ?? email, role };
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
    async createQuote(input, overrideRef) { return normalizeQuote(await call<Quote>('quotes.create', { ...input, overrideRef: overrideRef ?? '' })); },
    async peekBillNumber() { try { return (await call<{ reference: string }>('bill.peek')).reference; } catch { return null; } },
    async setNextBillNumber(n) { await call('bill.setNext', { n }); },
    async logActivity(d) { await call('activity.log', d); },
    async listActivity(limit = 3000) { return call<ActivityEntry[]>('activity.list', { limit }); },
    async purgeActivity(beforeISO) { return (await call<{ deleted: number }>('activity.purge', { before: beforeISO })).deleted; },
    canCreateStaff: true,
    async listStaff() { return call<StaffMember[]>('staff.list'); },
    async setStaffActive(id, active) { await call('staff.setActive', { id, active }); },
    async createStaff(email, password) { await call('staff.create', { email, password }); },
    async updateQuote(reference, input) { await call('quotes.update', { reference, input }); },
    async updatePricing(reference, pricing) { await call('quotes.pricing', { reference, pricing }); },
    async setStatus(reference, status) { await call('quotes.status', { reference, status }); },
    async deleteQuote(reference) { await call('quotes.delete', { reference }); },
    async bookedTimes() { return call<Record<string, TimeRange[]>>('booked'); },
    async getSettings(key) { try { return (await call<{ data: unknown }>('settings.get', { key })).data ?? null; } catch { return null; } },
    async saveSettings(key, data) { await call('settings.save', { key, data }); },
    async getSession() {
      if (!readToken()) return null;
      try { const r = await call<{ email: string | null; role?: Role }>('auth.me'); return r.email ? { email: r.email, role: r.role ?? 'admin' } : null; } catch { return null; }
    },
    async signIn(email, password) {
      const r = await call<{ token: string; email: string; role?: Role }>('auth.login', { email, password });
      writeToken(r.token); notify();
      return { email: r.email, role: r.role ?? 'admin' };
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
