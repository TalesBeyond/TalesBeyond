// Single Supabase client for the whole app. Everything here is optional:
// if the two env vars aren't set, `supabase` is null and
// `isSupabaseConfigured` is false, and every caller in src/lib and
// src/components falls back to Phase 1's local-only behavior.
//
// See supabase/README.md for how to obtain these values.

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_PROJECT_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && publishableKey);

if (isSupabaseConfigured) {
  console.log(`[supabase] Cloud mode enabled — connected to ${url}`);
} else {
  console.log('[supabase] Local-only mode — VITE_SUPABASE_PROJECT_URL/VITE_SUPABASE_PUBLISHABLE_KEY not set.');
}

export const supabase = isSupabaseConfigured
  ? createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;
