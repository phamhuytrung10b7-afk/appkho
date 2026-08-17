import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Read Supabase credentials from environment variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Initialize Supabase client
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_URL.startsWith('http'));

// Fallback placeholder client if URL is not configured yet
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL || 'https://placeholder-project.supabase.co',
  SUPABASE_ANON_KEY || 'placeholder-anon-key'
);

export interface SupabaseConfigState {
  url: string;
  anonKey: string;
}

export function getSupabaseCredentials(): SupabaseConfigState {
  const localUrl = localStorage.getItem('thekho_supabase_url');
  const localKey = localStorage.getItem('thekho_supabase_anon_key');
  return {
    url: localUrl || SUPABASE_URL,
    anonKey: localKey || SUPABASE_ANON_KEY,
  };
}

export function saveSupabaseCredentials(url: string, anonKey: string): void {
  localStorage.setItem('thekho_supabase_url', url.trim());
  localStorage.setItem('thekho_supabase_anon_key', anonKey.trim());
}

export function getActiveSupabaseClient(): { client: SupabaseClient; isConfigured: boolean } {
  const { url, anonKey } = getSupabaseCredentials();
  if (url && anonKey && url.startsWith('http')) {
    return {
      client: createClient(url, anonKey),
      isConfigured: true,
    };
  }
  return {
    client: supabase,
    isConfigured: false,
  };
}
