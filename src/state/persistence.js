// Persistence layer — Phase 1 implementation.
//
// Every function here is written against a small interface
// (saveSession / loadSession / deleteSession / sessionExists) so that
// Phase 2 can swap the body of these functions for Supabase calls
// (see SPEC.md, section 9) without touching any component or the
// reducer in store.js. Nothing outside this file should call
// localStorage directly.

const NAMESPACE = 'hearthbound:session:';

function keyFor(code) {
  return NAMESPACE + code.toUpperCase();
}

export function sessionExists(code) {
  return window.localStorage.getItem(keyFor(code)) !== null;
}

export function saveSession(code, state) {
  const payload = JSON.stringify({ ...state, savedAt: Date.now() });
  try {
    window.localStorage.setItem(keyFor(code), payload);
    return true;
  } catch (err) {
    // Quota exceeded (usually from uncapped background/token image uploads
    // piling up) — surface this to the caller (see GameView.jsx's
    // saveOrWarn) instead of silently dropping the save. Deliberately does
    // NOT clear other localStorage keys to make room: this browser may be
    // hosting more than one table, and wiping the rest to save this one
    // would be a worse outcome than just failing this save.
    console.error('Failed to save session (storage may be full):', err);
    return false;
  }
}

export function loadSession(code) {
  const raw = window.localStorage.getItem(keyFor(code));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error('Corrupt session data for', code, err);
    return null;
  }
}

export function deleteSession(code) {
  window.localStorage.removeItem(keyFor(code));
}

export function listLocalSessionCodes() {
  const codes = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith(NAMESPACE)) codes.push(k.slice(NAMESPACE.length));
  }
  return codes;
}

// ---- Manual export / import, so a table can be backed up or handed
// ---- between machines even before real-time sync exists. ----

export function downloadSessionAsFile(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.session?.code || 'table'}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// REQ-008 Guest DM Sessions: hashes a DM code (session.hostKey, or whatever
// a resuming DM typed) so it can be verified without ever being written to
// disk in plain text — see downloadGuestSessionAsFile below and Landing.jsx's
// resume form. SHA-256 via SubtleCrypto, available in every browser this
// app targets (it requires no signing/secret key, just a one-way digest).
export async function hashGuestCode(code) {
  const bytes = new TextEncoder().encode(code.trim().toUpperCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// A guest table's export never carries session.hostKey itself — resuming
// requires the DM to retype it, checked against this hash, so the file
// alone can never hand over host control (REQ-008 Architectural decisions).
export async function downloadGuestSessionAsFile(state) {
  const { hostKey, ...sessionRest } = state.session;
  const hostKeyHash = await hashGuestCode(hostKey);
  const exportState = { ...state, session: { ...sessionRest, hostKeyHash } };
  const blob = new Blob([JSON.stringify(exportState, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.session?.code || 'table'}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---- Same-browser safety net for a guest table that never closed
// ---- cleanly (crash, force-closed tab) — REQ-008 Slice 4. ----

// Only ever written for a guest table (never local mode), so its mere
// presence — regardless of value — means "this code was a guest table at
// some point," letting the recovery scan below tell a genuinely interrupted
// guest session apart from an ordinary local-mode one, which never touches
// this key and would otherwise look identically "unclean."
const GUEST_META_NAMESPACE = 'hearthbound:guestmeta:';

function guestMetaKeyFor(code) {
  return GUEST_META_NAMESPACE + code.toUpperCase();
}

// Called the moment a guest table starts (fresh, resumed from a file, or
// recovered via findUnclosedGuestTable below) — stays 'active' until a
// deliberate Leave flips it to 'clean'. A tab that just closes or crashes
// leaves it at 'active', which is exactly the signal the recovery scan
// looks for.
export function markGuestActive(code) {
  window.localStorage.setItem(guestMetaKeyFor(code), 'active');
}

export function markGuestClean(code) {
  window.localStorage.setItem(guestMetaKeyFor(code), 'clean');
}

export function clearGuestMeta(code) {
  window.localStorage.removeItem(guestMetaKeyFor(code));
}

// The most recently saved guest table on this browser that's still marked
// 'active' (started, never cleanly left) and still has real saved state —
// or null. Landing's guest chooser offers to resume whatever this returns.
export function findUnclosedGuestTable() {
  let best = null;
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith(GUEST_META_NAMESPACE)) continue;
    if (window.localStorage.getItem(key) !== 'active') continue;
    const code = key.slice(GUEST_META_NAMESPACE.length);
    const raw = loadSession(code);
    if (!raw) continue;
    if (!best || (raw.savedAt || 0) > best.savedAt) best = { code, savedAt: raw.savedAt || 0 };
  }
  return best ? best.code : null;
}

// An island's shell — grid + background, no id/position/entities — so it
// can be re-imported as a brand-new island elsewhere.
export function downloadIslandAsFile(island) {
  const shell = {
    name: island.name,
    cols: island.cols,
    rows: island.rows,
    cellSize: island.cellSize,
    backgroundImage: island.backgroundImage ?? null,
  };
  const blob = new Blob([JSON.stringify(shell, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(island.name || 'island').trim().replace(/[^a-z0-9_-]+/gi, '_') || 'island'}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Triggers a browser download of a data: URL (e.g. a canvas.toDataURL()
// PNG) — the same create-<a>-click-remove pattern as the Blob-based
// downloads above, minus createObjectURL/revokeObjectURL since a data URL
// needs neither.
export function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ---- "Who am I" on a given table, so a refreshed or reopened tab
// ---- rejoins as the same player instead of a brand-new one. ----

const IDENTITY_NAMESPACE = 'hearthbound:identity:';

export function saveIdentity(code, identity) {
  window.localStorage.setItem(IDENTITY_NAMESPACE + code.toUpperCase(), JSON.stringify(identity));
}

export function loadIdentity(code) {
  const raw = window.localStorage.getItem(IDENTITY_NAMESPACE + code.toUpperCase());
  return raw ? JSON.parse(raw) : null;
}

export function clearIdentity(code) {
  window.localStorage.removeItem(IDENTITY_NAMESPACE + code.toUpperCase());
}

// ---- Which table (if any) this browser tab is currently sitting at,
// ---- so a page refresh resumes the game instead of dropping to the
// ---- landing screen. ----

const CURRENT_KEY = 'hearthbound:current';

// pointer: { mode: 'local' | 'remote', code, tableId (remote only), playerId }
export function saveCurrentPointer(pointer) {
  window.localStorage.setItem(CURRENT_KEY, JSON.stringify(pointer));
}

export function loadCurrentPointer() {
  const raw = window.localStorage.getItem(CURRENT_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearCurrentPointer() {
  window.localStorage.removeItem(CURRENT_KEY);
}

// Generic file → parsed-JSON reader, shared by the whole-table import and
// the island-shell import (REQ-002) — neither cares about the other's
// shape, only that the file is valid JSON.
export function readJsonFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
