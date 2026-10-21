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

export function cleanSupabaseUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  let url = rawUrl.trim();
  url = url.replace(/^['"]|['"]$/g, '');
  url = url.replace(/\/+$/, '');
  if (url.endsWith('/rest/v1')) {
    url = url.substring(0, url.length - '/rest/v1'.length);
  }
  return url.replace(/\/+$/, '');
}

export function getSupabaseCredentials(): SupabaseConfigState {
  const localUrl = localStorage.getItem('thekho_supabase_url');
  const localKey = localStorage.getItem('thekho_supabase_anon_key');
  const rawUrl = localUrl || SUPABASE_URL;
  const rawKey = localKey || SUPABASE_ANON_KEY;
  return {
    url: cleanSupabaseUrl(rawUrl),
    anonKey: rawKey.trim(),
  };
}

export function saveSupabaseCredentials(url: string, anonKey: string): void {
  const cleanedUrl = cleanSupabaseUrl(url);
  const cleanedKey = anonKey.trim();
  localStorage.setItem('thekho_supabase_url', cleanedUrl);
  localStorage.setItem('thekho_supabase_anon_key', cleanedKey);
}

// Global singleton client cache to avoid "Multiple GoTrueClient instances detected" warning
const clientMap = new Map<string, SupabaseClient>();

export function getActiveSupabaseClient(): { client: SupabaseClient | null; isConfigured: boolean } {
  const { url, anonKey } = getSupabaseCredentials();
  const activeUrl = cleanSupabaseUrl(url || SUPABASE_URL);
  const activeKey = (anonKey || SUPABASE_ANON_KEY).trim();
  const cacheKey = `${activeUrl}__${activeKey}`;

  const isValidUrl = Boolean(activeUrl && (activeUrl.startsWith('http://') || activeUrl.startsWith('https://')));
  const isConfigured = Boolean(isValidUrl && activeKey);

  if (isConfigured && !clientMap.has(cacheKey)) {
    try {
      clientMap.set(
        cacheKey,
        createClient(activeUrl, activeKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
          global: {
            headers: {
              'x-client-info': 'thekho-warehouse/1.0',
            },
          },
        })
      );
    } catch {
      // Suppressed client init warning
    }
  }

  const client = clientMap.get(cacheKey) || null;

  return {
    client,
    isConfigured: Boolean(client && isConfigured),
  };
}

export const isSupabaseConfigured = true;

// Chainable safe fallback builder when Supabase client is temporarily uninitialized
function createSafeDummyChain(): any {
  const dummyFn: any = (..._args: any[]) => createSafeDummyChain();
  return new Proxy(dummyFn, {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: any) => resolve({ data: null, error: null, count: 0 });
      }
      if (prop === 'catch') {
        return (_reject: any) => Promise.resolve({ data: null, error: null, count: 0 });
      }
      return createSafeDummyChain();
    },
    apply() {
      return createSafeDummyChain();
    },
  });
}

// Dynamic Proxy for supabase to prevent null client reference errors at app bootstrap
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const { client } = getActiveSupabaseClient();
    if (client) {
      const val = (client as any)[prop];
      return typeof val === 'function' ? val.bind(client) : val;
    }
    return createSafeDummyChain();
  },
  apply(_target, _thisArg, args) {
    const { client } = getActiveSupabaseClient();
    if (client && typeof (client as any) === 'function') {
      return (client as any)(...args);
    }
    return createSafeDummyChain();
  },
}) as SupabaseClient;


