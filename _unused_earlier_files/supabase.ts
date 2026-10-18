import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const key = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
export const isSupabaseConfigured = Boolean(url && key);
export const supabase: SupabaseClient | null = isSupabaseConfigured ? createClient(url, key) : null;
export const requireSupabase = (): SupabaseClient => {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
};
