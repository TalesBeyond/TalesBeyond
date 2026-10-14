// Auth strategy (SPEC.md §9.3): every browser gets an anonymous Supabase
// auth session on first use, persisted by supabase-js in localStorage under
// its own key, unless it signs in to an account (below). `auth.uid()` from
// whichever session it has is what every RLS policy and RPC in
// supabase/*.sql keys off.

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

// Account sign-up/log-in — a real, permanent identity so a host can resume
// their tables (REQ-003) and a player their seats (REQ-004) from any
// device. The same account can host some tables and play at others.
// Explicit user actions, so unlike ensureAnonymousSession these are not
// memoized; each one drops ensureAnonymousSession's cached session, which
// no longer matches the client's.
export async function signUp(email, password) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured');
  }
  const { data, error } = await supabase.auth.signUp({ email, password });
  sessionPromise = null;
  if (error) throw error;
  if (!data.session) {
    // Project has email confirmation enabled, which conflicts with this
    // app's no-confirmation assumption (see REQ-003 Constraints) — signUp
    // succeeded but left no usable session.
    throw new Error('Account created, but email confirmation is required before signing in. Ask your admin to disable email confirmation for this project.');
  }
  return data.session;
}

export async function signIn(email, password) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured');
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  sessionPromise = null;
  if (error) throw error;
  return data.session;
}

// Signs this browser out of its account (both landing tabs share it). The
// cache has to go too: otherwise a later "Continue as guest" in the same
// page gets the signed-out session back and joins with no auth.uid().
export async function signOut() {
  try {
    await supabase.auth.signOut();
  } finally {
    sessionPromise = null;
  }
}

// The signed-in account, or null for an anonymous session or none at all.
export async function getAccount() {
  if (!isSupabaseConfigured) return null;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  return user && !user.is_anonymous ? { id: user.id, email: user.email ?? '' } : null;
}
