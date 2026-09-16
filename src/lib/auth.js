// Auth strategy (SPEC.md §9.3): every browser gets an anonymous Supabase
// auth session on first use, persisted by supabase-js in localStorage under
// its own key. Hearthbound never shows a login screen — `auth.uid()` from
// this session is what every RLS policy and RPC in supabase/*.sql keys off.

import { supabase, isSupabaseConfigured } from './supabaseClient.js';

let sessionPromise = null;

export function ensureAnonymousSession() {
  if (!isSupabaseConfigured) {
    return Promise.reject(new Error('Supabase is not configured'));
  }
  if (!sessionPromise) {
    sessionPromise = supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) return data.session;
      const { data: signInData, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      return signInData.session;
    });
  }
  return sessionPromise;
}

// Host-facing sign-up/log-in — a real, permanent identity so a host can
// resume their tables from any device (REQ-003). Explicit user actions, so
// unlike ensureAnonymousSession these are not memoized.
export async function signUpHost(email, password) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured');
  }
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  if (!data.session) {
    // Project has email confirmation enabled, which conflicts with this
    // app's no-confirmation assumption (see REQ-003 Constraints) — signUp
    // succeeded but left no usable session.
    throw new Error('Account created, but email confirmation is required before signing in. Ask your admin to disable email confirmation for this project.');
  }
  return data.session;
}

export async function signInHost(email, password) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured');
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}
