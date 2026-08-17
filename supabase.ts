import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Hardcoded Supabase credentials for direct cloud connection
export const HARDCODED_SUPABASE_URL = 'https://argjmnsffrznpwswinka.supabase.co';
export const HARDCODED_SUPABASE_ANON_KEY = 'sb_publishable_Hl-mMWVY7ONNsVdwS_nfTw_gCnLEtzq';

export const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || HARDCODED_SUPABASE_URL;
export const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || HARDCODED_SUPABASE_ANON_KEY;

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

// Global singleton client cache to avoid "Multiple GoTrueClient instances detected" warning
const clientMap = new Map<string, SupabaseClient>();

export function getActiveSupabaseClient(): { client: SupabaseClient; isConfigured: boolean } {
  const { url, anonKey } = getSupabaseCredentials();
  const activeUrl = url || SUPABASE_URL;
  const activeKey = anonKey || SUPABASE_ANON_KEY;
  const cacheKey = `${activeUrl}__${activeKey}`;

  if (!clientMap.has(cacheKey)) {
    clientMap.set(
      cacheKey,
      createClient(activeUrl, activeKey, {
        auth: {
          persistSession: false,
        },
      })
    );
  }

  return {
    client: clientMap.get(cacheKey)!,
    isConfigured: true,
  };
}

export const isSupabaseConfigured = true;
export const supabase: SupabaseClient = getActiveSupabaseClient().client;


