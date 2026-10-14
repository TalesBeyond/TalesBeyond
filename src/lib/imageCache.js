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
import { iconRefForUrl } from '../data/defaultTokens.js';
import { assertImageAllowed, checkReceivedImage, wasPickedHere } from './imageSafety.js';

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

// Keeps one of the app's own bundled pictures (the quick campaign's maps,
// data/quickCampaign.js) under the fingerprint the campaign's state already
// uses. They ship with the build, so they skip the picture filter. Rejects
// if the bytes don't match the fingerprint.
export async function keepBundledImage(hash, blob) {
  if ((await hashBlob(blob)) !== hash) throw new Error('A bundled picture does not match its fingerprint');
  try {
    if (!(await idbGet(hash))) await idbPut(hash, blob, true);
  } catch {
    // storage blocked: it is still shown here this session (players can't be sent it)
  }
  blocked.delete(hash);
  remember(hash, blob);
}

// --- Pictures that are not fingerprints ----------------------------------------
// A local table keeps its pictures as data URLs, and a table that came from a
// file or from another browser can hold anything at all. Only three kinds are
// ever drawn: the app's own art, a data URL the picture filter has scored,
// and nothing else — a link to a picture elsewhere on the web is never loaded.

// The default catalog's pictures (lib/catalog.js): only the admin script can
// write those buckets.
const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_PROJECT_URL;
const CATALOG_PREFIX = SUPABASE_URL ? `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/public/catalog-` : null;

const inline = new Map(); // data URL -> 'pending' | 'ok' | 'blocked'

function isOwnPicture(value) {
  return (
    Boolean(iconRefForUrl(value)) || // a built-in icon
    value.startsWith('blob:') || // made by this page: a picture being fitted, or one from the cache above
    (value.startsWith('/') && !value.startsWith('//')) || // a file shipped with the app
    value.startsWith(`${globalThis.location?.origin}/`) ||
    Boolean(CATALOG_PREFIX && value.startsWith(CATALOG_PREFIX)) ||
    wasPickedHere(value) // picked in this browser a moment ago, and passed
  );
}

async function scoreInline(value) {
  let verdict = 'blocked'; // what cannot even be read as a picture is not shown
  try {
    const blob = await (await fetch(value)).blob();
    verdict = (await checkReceivedImage(blob, null)) === 'blocked' ? 'blocked' : 'ok';
  } catch {
    // stays blocked
  }
  inline.set(value, verdict);
  notify();
}

function resolveInline(value) {
  if (isOwnPicture(value)) return value;
  if (!value.startsWith('data:image/')) return null;
  const verdict = inline.get(value);
  if (verdict === 'ok') return value;
  if (!verdict) {
    inline.set(value, 'pending');
    scoreInline(value);
  }
  return null;
}

// What an <img src> / CSS url() should use for an image value, or null while
// it is not (or not yet) to be drawn; callers fall back to a default icon and
// re-render through useImageCacheVersion(). A fingerprint gives its object
// URL once the picture has been found (the call starts that). Anything else
// is drawn only if it is the app's own art or the picture filter has scored
// it (the call starts that too).
export function resolveImage(value) {
  if (typeof value !== 'string' || !value) return null;
  if (!isImageRef(value)) return resolveInline(value);
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
