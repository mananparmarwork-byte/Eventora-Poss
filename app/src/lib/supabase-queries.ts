import { normalizeEventSlots, type EventSlots, type TimeRange } from '@/lib/booking';
import {
  useMutation,
  useQuery,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type { CatalogCategory } from '@/lib/catalog';
import { cleanPaymentSettings, type PaymentSettings } from '@/lib/payments';
import { cloneCatalog, ORIGINAL_CATALOG } from '@/lib/catalog';
import { isSupabaseConfigured, requireSupabase, supabase } from '@/lib/supabase';

export type QuoteService = {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  pricingType: 'perPerson' | 'fixed' | 'perUnit';
  quantity: number;
  unitPrice: number;
  total: number;
  description?: string;
};

export type QuoteCustomer = {
  name: string;
  mobile: string;
  eventType: string;
  eventDate: string;
  eventDates?: string[];
  eventSlots?: EventSlots;
  guests: number;
  gstNumber?: string;
  hall: string;
};

export type PaymentMethod = 'upi' | 'cash';
export type PaymentKind = 'advance' | 'full';
export type QuotePayment = {
  id: string;
  amount: number;
  method: PaymentMethod;
  kind: PaymentKind;
  paidAt: string;
  note?: string;
};

export type QuotePricing = {
  foodPerPlate: number;
  subtotal: number;
  gstEnabled: boolean;
  gstRate: number;
  gstAmount: number;
  gstNumber: string;
  gstNumberVisible: boolean;
  showCostPerGuest?: boolean;
  eventDates?: string[];
  eventSlots?: EventSlots;
  discountEnabled?: boolean;
  discountPercent?: number;
  discountFlat?: number;
  discountAmount?: number;
  grandTotal: number;
  costPerGuest: number;
  // Advance payment: when advancePaid is true, advanceAmount is taken off the grand total and balanceDue is what is left to pay.
  advancePaid?: boolean;
  advanceAmount?: number;
  balanceDue?: number;
  // Log of payments collected from the admin panel (UPI / cash). advanceAmount is the running total received.
  payments?: QuotePayment[];
};

export type QuoteInput = {
  reference: string;
  customer: QuoteCustomer;
  services: QuoteService[];
  pricing: QuotePricing;
};

export type Quote = QuoteInput & {
  id: string;
  createdAt: string;
  status: 'new' | 'contacted' | 'confirmed' | 'archived';
};

type QuoteRow = {
  id: string;
  reference: string;
  customer_name: string;
  mobile: string;
  event_type: string;
  event_date: string;
  guests: number;
  customer_gst_number: string | null;
  hall: string;
  services: QuoteService[];
  pricing: QuotePricing;
  status: Quote['status'];
  created_at: string;
};

// Several event dates are kept in one text value as 'YYYY-MM-DD,YYYY-MM-DD'.
export function parseEventDates(value: string): string[] {
  return Array.from(new Set((value || '').split(',').map((date) => date.trim()).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))).sort();
}

export function formatEventDates(dates: string[]): string {
  if (!dates.length) return 'Not selected';
  const fmt = (date: string, options: Intl.DateTimeFormatOptions) => new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', options);
  if (dates.length === 1) return fmt(dates[0], { day: '2-digit', month: 'short', year: 'numeric' });
  const groups = new Map<string, string[]>();
  dates.forEach((date) => groups.set(date.slice(0, 7), [...(groups.get(date.slice(0, 7)) ?? []), date]));
  return Array.from(groups.values()).map((group) => `${group.map((date) => date.slice(8)).join(', ')} ${fmt(group[0], { month: 'short', year: 'numeric' })}`).join(' · ');
}

export function quoteEventDates(customer: { eventDate: string; eventDates?: string[] }): string[] {
  return customer.eventDates && customer.eventDates.length ? customer.eventDates : parseEventDates(customer.eventDate);
}

// Advance actually counted on a bill (never more than the grand total) and the balance still to be paid.
export function quoteAdvance(pricing: Pick<QuotePricing, 'grandTotal' | 'advancePaid' | 'advanceAmount'>): { paid: boolean; amount: number; balance: number } {
  const amount = pricing.advancePaid ? Math.min(pricing.grandTotal, Math.max(0, Number(pricing.advanceAmount) || 0)) : 0;
  return { paid: amount > 0, amount, balance: pricing.grandTotal - amount };
}

// unpaid = nothing received, partial = advance received, paid = nothing left to pay.
export type PaymentState = 'unpaid' | 'partial' | 'paid';
export function quotePaymentState(pricing: Pick<QuotePricing, 'grandTotal' | 'advancePaid' | 'advanceAmount'>): { state: PaymentState; received: number; balance: number } {
  const advance = quoteAdvance(pricing);
  if (!advance.paid) return { state: 'unpaid', received: 0, balance: pricing.grandTotal };
  return { state: advance.balance <= 0 ? 'paid' : 'partial', received: advance.amount, balance: advance.balance };
}

export const getGetCatalogQueryKey = () => ['supabase', 'catalog'] as const;
export const getListQuotesQueryKey = () => ['supabase', 'quotes'] as const;
export const getGetQuoteQueryKey = (reference: string) => ['supabase', 'quote', reference] as const;

function fromQuoteRow(row: QuoteRow): Quote {
  return {
    id: row.id,
    reference: row.reference,
    customer: {
      name: row.customer_name,
      mobile: row.mobile,
      eventType: row.event_type,
      eventDate: row.event_date,
      eventDates: Array.isArray(row.pricing?.eventDates) && row.pricing.eventDates.length ? row.pricing.eventDates : [row.event_date],
      eventSlots: normalizeEventSlots(row.pricing?.eventSlots),
      guests: row.guests,
      gstNumber: row.customer_gst_number ?? '',
      hall: row.hall,
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

export function useGetCatalog() {
  return useQuery<CatalogCategory[]>({
    queryKey: getGetCatalogQueryKey(),
    queryFn: async () => {
      if (!isSupabaseConfigured) return cloneCatalog(ORIGINAL_CATALOG);
      const { data, error } = await requireSupabase().from('catalog').select('categories').eq('id', 'default').maybeSingle();
      if (error) throw error;
      return Array.isArray(data?.categories) ? (data.categories as CatalogCategory[]) : cloneCatalog(ORIGINAL_CATALOG);
    },
    staleTime: 30_000,
  });
}

export function useUpdateCatalog() {
  return useMutation({
    mutationFn: async ({ data }: { data: CatalogCategory[] }) => {
      const client = requireSupabase();
      const { data: saved, error } = await client
        .from('catalog')
        .upsert({ id: 'default', categories: data }, { onConflict: 'id' })
        .select('categories')
        .single();
      if (error) throw error;
      return saved.categories as CatalogCategory[];
    },
  });
}

export function useCreateQuote() {
  return useMutation<Quote, Error, { data: QuoteInput }>({
    mutationFn: async ({ data: input }) => {
      const client = requireSupabase();
      const { data, error } = await client
        .from('quotes')
        .insert({
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
          status: 'new',
        })
        .select('*')
        .single();
      if (error) throw error;
      return fromQuoteRow(data as QuoteRow);
    },
  });
}

const EDIT_PERMISSION_MESSAGE = 'Supabase did not allow this change. Run the file supabase/04-edit-quotes.sql once in the Supabase SQL Editor, then try again.';

// Saves changes to an already saved bill (the bill number and the Booked status are not changed). Needs supabase/04-edit-quotes.sql.
export function useUpdateQuote() {
  return useMutation<void, Error, { reference: string; data: QuoteInput }>({
    mutationFn: async ({ reference, data: input }) => {
      const { data, error } = await requireSupabase()
        .from('quotes')
        .update({
          customer_name: input.customer.name,
          mobile: input.customer.mobile,
          event_type: input.customer.eventType,
          event_date: input.customer.eventDate,
          guests: input.customer.guests,
          customer_gst_number: input.customer.gstNumber ?? '',
          hall: input.customer.hall,
          services: input.services,
          pricing: { ...input.pricing, eventDates: input.customer.eventDates ?? [input.customer.eventDate], eventSlots: input.customer.eventSlots ?? {} },
        })
        .eq('reference', reference)
        .select('reference');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error(EDIT_PERMISSION_MESSAGE);
    },
  });
}

// Adds / changes / removes the advance payment on a saved bill without touching anything else. Needs supabase/04-edit-quotes.sql.
export function useSetQuoteAdvance() {
  return useMutation<void, Error, { reference: string; pricing: QuotePricing; advancePaid: boolean; advanceAmount: number }>({
    mutationFn: async ({ reference, pricing, advancePaid, advanceAmount }) => {
      const advance = quoteAdvance({ grandTotal: pricing.grandTotal, advancePaid, advanceAmount });
      const { data, error } = await requireSupabase()
        .from('quotes')
        .update({ pricing: { ...pricing, advancePaid: advance.amount > 0, advanceAmount: advance.amount, balanceDue: advance.balance } })
        .eq('reference', reference)
        .select('reference');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error(EDIT_PERMISSION_MESSAGE);
    },
  });
}

// Saves a new pricing block on a saved bill (used when a payment is recorded or removed). Needs supabase/04-edit-quotes.sql.
export function useUpdateQuotePricing() {
  return useMutation<void, Error, { reference: string; pricing: QuotePricing }>({
    mutationFn: async ({ reference, pricing }) => {
      const { data, error } = await requireSupabase()
        .from('quotes')
        .update({ pricing })
        .eq('reference', reference)
        .select('reference');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error(EDIT_PERMISSION_MESSAGE);
    },
  });
}

export const getGetPaymentSettingsQueryKey = () => ['supabase', 'payment-settings'] as const;

// Reads the payment account details saved by the admin (UPI ID, bank details). Needs supabase/05-payment-settings.sql.
// `available` is false when the table has not been created yet; the panel then falls back to this device's copy.
export function useGetPaymentSettings() {
  return useQuery<{ settings: PaymentSettings | null; available: boolean }>({
    queryKey: getGetPaymentSettingsQueryKey(),
    queryFn: async () => {
      if (!isSupabaseConfigured) return { settings: null, available: false };
      const { data, error } = await requireSupabase().from('payment_settings').select('*').eq('id', 'default').maybeSingle();
      if (error) return { settings: null, available: false };
      if (!data) return { settings: null, available: true };
      return {
        available: true,
        settings: cleanPaymentSettings({
          upiId: data.upi_id,
          payeeName: data.payee_name,
          bankName: data.bank_name,
          accountHolder: data.account_holder,
          accountNumber: data.account_number,
          ifsc: data.ifsc,
          branch: data.branch,
        }),
      };
    },
    staleTime: 60_000,
  });
}

export function useSavePaymentSettings() {
  return useMutation<void, Error, PaymentSettings>({
    mutationFn: async (settings) => {
      const { error } = await requireSupabase()
        .from('payment_settings')
        .upsert({
          id: 'default',
          upi_id: settings.upiId,
          payee_name: settings.payeeName,
          bank_name: settings.bankName,
          account_holder: settings.accountHolder,
          account_number: settings.accountNumber,
          ifsc: settings.ifsc,
          branch: settings.branch,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
      if (error) throw error;
    },
  });
}

export function useListQuotes(params?: { limit?: number }) {
  return useQuery<Quote[]>({
    queryKey: [...getListQuotesQueryKey(), params?.limit ?? 100],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('quotes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(params?.limit ?? 100);
      if (error) throw error;
      return (data as QuoteRow[]).map(fromQuoteRow);
    },
    enabled: isSupabaseConfigured,
  });
}

export function useGetQuote(
  reference: string,
  options?: { query?: Pick<UseQueryOptions<Quote>, 'enabled' | 'queryKey'> },
) {
  return useQuery<Quote>({
    queryKey: options?.query?.queryKey ?? getGetQuoteQueryKey(reference),
    queryFn: async () => {
      const { data, error } = await requireSupabase().from('quotes').select('*').eq('reference', reference).single();
      if (error) throw error;
      return fromQuoteRow(data as QuoteRow);
    },
    enabled: isSupabaseConfigured && Boolean(reference) && (options?.query?.enabled ?? true),
  });
}

export function useDeleteQuote() {
  return useMutation<void, Error, { reference: string }>({
    mutationFn: async ({ reference }) => {
      const { error } = await requireSupabase().from('quotes').delete().eq('reference', reference);
      if (error) throw error;
    },
  });
}

// Dates and times already booked (bills ticked "Booked"), without any customer details. Needs supabase/06-booking-times.sql.
export function useBookedSlots() {
  return useQuery<Record<string, TimeRange[]>>({
    queryKey: ['supabase', 'booked-slots'],
    queryFn: async () => {
      const { data, error } = await requireSupabase().rpc('booked_times');
      if (error) throw error;
      const map: Record<string, TimeRange[]> = {};
      ((data ?? []) as { booked_date: string; start_time: string; end_time: string }[]).forEach((row) => {
        map[row.booked_date] = [...(map[row.booked_date] ?? []), { start: row.start_time, end: row.end_time }];
      });
      return map;
    },
    enabled: isSupabaseConfigured,
    staleTime: 20_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

// Ticking "Booked" in the admin panel marks the bill as confirmed (status = 'confirmed'); unticking returns it to 'new'.
export function useSetQuoteBooked() {
  return useMutation<void, Error, { reference: string; booked: boolean }>({
    mutationFn: async ({ reference, booked }) => {
      const { data, error } = await requireSupabase()
        .from('quotes')
        .update({ status: booked ? 'confirmed' : 'new' })
        .eq('reference', reference)
        .select('reference');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Supabase did not allow this change. Run the file supabase/02-booking-update.sql once in the Supabase SQL Editor, then try again.');
      }
    },
  });
}

export function useAdminSession() {
  return useQuery({
    queryKey: ['supabase', 'admin-session'],
    queryFn: async () => {
      const { data, error } = await requireSupabase().auth.getSession();
      if (error) throw error;
      return data.session;
    },
    enabled: isSupabaseConfigured,
    staleTime: Infinity,
  });
}

export async function signInAdmin(email: string, password: string) {
  const { data, error } = await requireSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOutAdmin() {
  const { error } = await requireSupabase().auth.signOut();
  if (error) throw error;
}

export function subscribeToAuthChanges(onChange: () => void) {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange(onChange);
  return () => data.subscription.unsubscribe();
}