import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseConfig } from './config';

export { isSupabaseConfigured } from './config';

let client: SupabaseClient | null = null;

/**
 * Browser Supabase client, or null when NEXT_PUBLIC_SUPABASE_URL / key are missing (local demo) or on the server.
 * Used only for session storage and refresh; every data call goes through our own API.
 */
export function getSupabase(): SupabaseClient | null {
  if (typeof window === 'undefined') return null;
  if (client) return client;
  const cfg = supabaseConfig();
  if (!cfg) return null;
  client = createClient(cfg.url, cfg.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // LIFF puts its own params in the URL; sessions never arrive through the URL here.
      detectSessionInUrl: false,
      storageKey: 'cvc-auth',
    },
  });
  return client;
}
