import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { backend, type Session } from './backend';
import { cleanBusiness, cleanPayment } from './payments';
import type { BusinessProfile, CatalogCategory, PaymentSettings, QuoteInput, QuotePricing, QuoteStatus } from './types';

export const keys = {
  catalog: ['catalog'] as const, quotes: ['quotes'] as const, quote: (r: string) => ['quote', r] as const,
  booked: ['booked'] as const, business: ['setting', 'business'] as const, payment: ['setting', 'payment'] as const,
};

export const useCatalog = () => useQuery({ queryKey: keys.catalog, queryFn: () => backend.getCatalog(), staleTime: 30_000 });
export const useQuotes = (enabled = true) => useQuery({ queryKey: keys.quotes, queryFn: () => backend.listQuotes(), enabled });
export const useQuote = (reference: string) => useQuery({ queryKey: keys.quote(reference), queryFn: () => backend.getQuote(reference), enabled: Boolean(reference) });
export const useBookedTimes = () => useQuery({ queryKey: keys.booked, queryFn: () => backend.bookedTimes(), staleTime: 20_000, retry: false });
export const useBusiness = () =>
  useQuery<BusinessProfile>({ queryKey: keys.business, queryFn: async () => cleanBusiness(await backend.getSetting<Partial<BusinessProfile>>('business')), staleTime: 60_000 });
export const usePayment = () =>
  useQuery<PaymentSettings>({ queryKey: keys.payment, queryFn: async () => cleanPayment(await backend.getSetting<Partial<PaymentSettings>>('payment')), staleTime: 60_000, retry: false });

function useInvalidate() {
  const qc = useQueryClient();
  return (reference?: string) => {
    void qc.invalidateQueries({ queryKey: keys.quotes });
    void qc.invalidateQueries({ queryKey: keys.booked });
    if (reference) void qc.invalidateQueries({ queryKey: keys.quote(reference) });
  };
}
export function useCreateQuote() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (input: QuoteInput) => backend.createQuote(input), onSuccess: () => inv() });
}
export function useUpdateQuote() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (v: { reference: string; input: QuoteInput }) => backend.updateQuote(v.reference, v.input), onSuccess: (_d, v) => inv(v.reference) });
}
export function useUpdatePricing() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (v: { reference: string; pricing: QuotePricing }) => backend.updatePricing(v.reference, v.pricing), onSuccess: (_d, v) => inv(v.reference) });
}
export function useSetStatus() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (v: { reference: string; status: QuoteStatus }) => backend.setStatus(v.reference, v.status), onSuccess: (_d, v) => inv(v.reference) });
}
export function useDeleteQuote() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (reference: string) => backend.deleteQuote(reference), onSuccess: (_d, r) => inv(r) });
}
export function useSaveCatalog() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (c: CatalogCategory[]) => backend.saveCatalog(c), onSuccess: (_d, c) => qc.setQueryData(keys.catalog, c) });
}
export function useSaveSetting(key: 'business' | 'payment') {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: BusinessProfile | PaymentSettings) => backend.saveSetting(key, data), onSuccess: () => qc.invalidateQueries({ queryKey: ['setting', key] }) });
}

/* ---------- auth ---------- */
type AuthState = { session: Session | null; loading: boolean };
const AuthContext = createContext<AuthState>({ session: null, loading: true });
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true });
  useEffect(() => {
    let alive = true;
    const load = () => backend.getSession().then((s) => { if (alive) setState({ session: s, loading: false }); }).catch(() => { if (alive) setState({ session: null, loading: false }); });
    void load();
    const off = backend.onAuthChange(() => void load());
    return () => { alive = false; off(); };
  }, []);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
