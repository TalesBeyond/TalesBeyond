// Pictures a DM uploads to a cloud or guest table, kept only in browsers.
// A picture is known everywhere by its fingerprint — `img:<sha-256 hex>` of
// its bytes — which is all the shared state (and the database) ever holds.
// The bytes live in each browser's IndexedDB; a browser that lacks them asks
// the table's other browsers through imageExchange.js. Nothing here touches
// Supabase Storage or any table.
//
// No picture is kept or shown before the picture filter has scored it
// (imageSafety.js): one a DM picks is refused outright, one received from
// another browser is dropped, and one kept from before the filter existed is
// scored the first time it is read. A kept picture that passed carries
// `checked` so it is not scored again.

import { useSyncExternalStore } from 'react';
import { assertImageAllowed, checkReceivedImage } from './imageSafety.js';

const PREFIX = 'img:';
const REF_RE = /^img:[0-9a-f]{64}$/;
const DB_NAME = 'tales-beyond-images';
const STORE = 'images';

export function isImageRef(value) {
  return typeof value === 'string' && REF_RE.test(value);
}

export function canShareImages() {
  return typeof indexedDB !== 'undefined' && !!globalThis.crypto?.subtle;
}

// --- IndexedDB -------------------------------------------------------------

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

// The kept record, { blob, savedAt, checked }, or null.
async function idbGet(hash) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(hash);
    req.onsuccess = () => resolve(req.result?.blob ? req.result : null);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(hash, blob, checked) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ blob, savedAt: Date.now(), checked }, hash);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(hash) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(hash);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- In-memory state and change notification --------------------------------

const urls = new Map(); // hash -> object URL, for everything loaded this session
const loading = new Set(); // hashes being read from IndexedDB
const wanted = new Set(); // hashes this browser doesn't have; asked of peers
const blocked = new Set(); // hashes the picture filter refused; never shown, never asked for again
let requestFromPeers = null; // set by imageExchange.js while a table is open
let version = 0;
const listeners = new Set();

function notify() {
  version += 1;
  listeners.forEach((l) => l());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Re-renders the calling component whenever a picture finishes loading, so
// resolveImage() calls made during its render pick it up.
export function useImageCacheVersion() {
  return useSyncExternalStore(subscribe, () => version);
}

export async function hashBlob(blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function remember(hash, blob) {
  if (!urls.has(hash)) urls.set(hash, URL.createObjectURL(blob));
  wanted.delete(hash);
  notify();
}

function markWanted(hash) {
  if (wanted.has(hash) || blocked.has(hash)) return;
  wanted.add(hash);
  requestFromPeers?.([hash]);
}

function block(hash) {
  blocked.add(hash);
  wanted.delete(hash);
  notify();
}

// A picture already kept in this browser. One kept before the picture filter
// existed is scored now, and dropped if the filter refuses it.
async function loadKept(hash) {
  const record = await idbGet(hash);
  if (!record) return markWanted(hash);
  if (!record.checked) {
    const verdict = await checkReceivedImage(record.blob, hash);
    if (verdict === 'blocked') {
      await idbDelete(hash).catch(() => {});
      return block(hash);
    }
    if (verdict === 'ok') await idbPut(hash, record.blob, true).catch(() => {});
  }
  return remember(hash, record.blob);
}

function load(hash) {
  if (urls.has(hash) || loading.has(hash) || wanted.has(hash) || blocked.has(hash)) return;
  loading.add(hash);
  loadKept(hash)
    .catch(() => markWanted(hash))
    .finally(() => loading.delete(hash));
}

// --- Public API --------------------------------------------------------------

// Keeps a picture (a data URL or Blob) in this browser and returns its
// fingerprint reference. Rejects, keeping nothing, when the picture filter
// refuses the picture or could not score it (imageSafety.js).
export async function storeImage(source) {
  const blob = typeof source === 'string' ? await (await fetch(source)).blob() : source;
  const hash = await hashBlob(blob);
  await assertImageAllowed(blob, hash);
  await idbPut(hash, blob, true);
  remember(hash, blob);
  return PREFIX + hash;
}

// What an <img src> / CSS url() should use for an image value: anything that
// isn't a fingerprint is returned as is; a fingerprint gives its object URL,
// or null while the picture is still being found (the call starts that).
export function resolveImage(value) {
  if (!isImageRef(value)) return value || null;
  const hash = value.slice(PREFIX.length);
  if (blocked.has(hash)) return null;
  const url = urls.get(hash);
  if (url) return url;
  load(hash);
  return null;
}

// For imageExchange.js ------------------------------------------------------

export async function getImageBlob(hash) {
  if (!/^[0-9a-f]{64}$/.test(hash)) return null;
  try {
    return (await idbGet(hash))?.blob ?? null;
  } catch {
    return null;
  }
}

export function isWanted(hash) {
  return wanted.has(hash);
}

export function wantedHashes() {
  return [...wanted];
}

// A picture received from a peer: kept only if its bytes match the
// fingerprint it was sent under and the picture filter does not refuse it.
export async function acceptImage(hash, blob) {
  if (!wanted.has(hash)) return false;
  if ((await hashBlob(blob)) !== hash) return false;
  const verdict = await checkReceivedImage(blob, hash);
  if (verdict === 'blocked') {
    block(hash);
    return false;
  }
  await idbPut(hash, blob, verdict === 'ok').catch(() => {});
  remember(hash, blob);
  return true;
}

export function setPeerRequester(fn) {
  requestFromPeers = fn;
  if (fn && wanted.size) fn([...wanted]);
}
