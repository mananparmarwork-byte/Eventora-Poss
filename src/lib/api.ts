import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getBackend } from './backend';
import { cleanBusiness, cleanPayment } from './settings';
import { cloneCatalog } from './catalog';
import type { BusinessProfile, CatalogCategory, PaymentSettings, Quote, QuoteInput, QuotePricing, QuoteStatus } from './types';

const BUSINESS_FALLBACK = cleanBusiness(null);
const PAYMENT_FALLBACK = cleanPayment(null);

export const keys = {
  catalog: ['catalog'] as const,
  quotes: ['quotes'] as const,
  quote: (ref: string) => ['quote', ref] as const,
  booked: ['booked'] as const,
  settings: (k: string) => ['settings', k] as const,
  session: ['session'] as const,
};

const be = () => getBackend();

export function useCatalog() {
  return useQuery<CatalogCategory[]>({ queryKey: keys.catalog, queryFn: () => be().getCatalog(), staleTime: 30_000 });
}
export function useSaveCatalog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (c: CatalogCategory[]) => be().saveCatalog(c),
    onSuccess: (_d, c) => qc.setQueryData(keys.catalog, c),
  });
}
export const defaultCatalog = () => cloneCatalog();

export function useQuotes() {
  return useQuery<Quote[]>({ queryKey: keys.quotes, queryFn: () => be().listQuotes(), refetchOnWindowFocus: true });
}
export function useQuote(reference: string, enabled = true) {
  return useQuery<Quote | null>({ queryKey: keys.quote(reference), queryFn: () => be().getQuote(reference), enabled: enabled && Boolean(reference) });
}

function useInvalidateQuotes() {
  const qc = useQueryClient();
  return (reference?: string) => {
    void qc.invalidateQueries({ queryKey: keys.quotes });
    void qc.invalidateQueries({ queryKey: keys.booked });
    if (reference) void qc.invalidateQueries({ queryKey: keys.quote(reference) });
  };
}

export function useCreateQuote() {
  const done = useInvalidateQuotes();
  return useMutation({ mutationFn: (input: QuoteInput) => be().createQuote(input), onSuccess: (q) => done(q.reference) });
}
export function useUpdateQuote() {
  const done = useInvalidateQuotes();
  return useMutation({ mutationFn: (v: { reference: string; input: QuoteInput }) => be().updateQuote(v.reference, v.input), onSuccess: (_d, v) => done(v.reference) });
}
export function useUpdatePricing() {
  const done = useInvalidateQuotes();
  return useMutation({ mutationFn: (v: { reference: string; pricing: QuotePricing }) => be().updatePricing(v.reference, v.pricing), onSuccess: (_d, v) => done(v.reference) });
}
export function useSetStatus() {
  const done = useInvalidateQuotes();
  return useMutation({ mutationFn: (v: { reference: string; status: QuoteStatus }) => be().setStatus(v.reference, v.status), onSuccess: (_d, v) => done(v.reference) });
}
export function useDeleteQuote() {
  const done = useInvalidateQuotes();
  return useMutation({ mutationFn: (reference: string) => be().deleteQuote(reference), onSuccess: (_d, ref) => done(ref) });
}
export function useBookedTimes() {
  return useQuery({ queryKey: keys.booked, queryFn: () => be().bookedTimes(), staleTime: 20_000, refetchOnWindowFocus: true, retry: false });
}

export function useBusiness() {
  const q = useQuery<BusinessProfile>({ queryKey: keys.settings('business'), queryFn: async () => cleanBusiness((await be().getSettings('business')) as Partial<BusinessProfile> | null), staleTime: 60_000 });
  return { ...q, business: q.data ?? BUSINESS_FALLBACK };
}
export function usePayment() {
  const q = useQuery<PaymentSettings>({ queryKey: keys.settings('payment'), queryFn: async () => cleanPayment((await be().getSettings('payment')) as Partial<PaymentSettings> | null), staleTime: 60_000 });
  return { ...q, payment: q.data ?? PAYMENT_FALLBACK };
}
export function useSaveSettings(key: 'business' | 'payment') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BusinessProfile | PaymentSettings) => be().saveSettings(key, data),
    onSuccess: (_d, data) => qc.setQueryData(keys.settings(key), data),
  });
}

export function useSession() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: keys.session, queryFn: () => be().getSession(), staleTime: Infinity });
  useEffect(() => be().onAuthChange(() => { void qc.invalidateQueries({ queryKey: keys.session }); }), [qc]);
  return { session: q.data ?? null, loading: q.isLoading };
}
export const signIn = (email: string, password: string) => be().signIn(email, password);
export const signOut = () => be().signOut();
export const backendMode = () => be().mode;
