// Browser-to-browser picture delivery over a table's Realtime channel
// (realtime.js for cloud tables, guestRealtime.js for guest tables). A browser
// missing a picture (imageCache.js) broadcasts `img_want` with its
// fingerprint; any browser that has it — usually the DM's — answers with the
// bytes in `img_chunk` pieces small enough for Broadcast's free-tier message
// size. Broadcast reaches everyone on the channel, so one send serves every
// player who was waiting for that picture. Messages pass through Supabase but
// are never stored there.

import { acceptImage, getImageBlob, isWanted, setPeerRequester, wantedHashes } from './imageCache.js';

const CHUNK_BYTES = 96 * 1024; // ~128 KB once base64-encoded; Broadcast's free-tier limit is 256 KB
const CHUNK_GAP_MS = 150; // keeps a sender under Realtime's per-client message rate
const OFFER_DELAY_MAX_MS = 400; // spreads out answers so one browser usually wins
const RECENT_SEND_MS = 4000; // a picture just sent (by anyone) isn't sent again
const RETRY_MS = 8000; // how often unanswered wants are repeated
const MAX_HASHES_PER_WANT = 50;
const STALE_ASSEMBLY_MS = 20000;

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Registers the exchange's broadcast listeners on `channel` (before it
// subscribes). Call onSubscribed() on every SUBSCRIBED and detach() when the
// channel is removed.
export function attachImageExchange(channel) {
  let subscribed = false;
  let detached = false;
  let queued = new Set();
  let flushTimer = null;
  const pendingOffers = new Map(); // hash -> timeout
  const lastSentAt = new Map(); // hash -> ms, by this browser or another
  const assemblies = new Map(); // hash -> { total, type, parts, received, at }

  function send(event, payload) {
    if (subscribed && !detached) channel.send({ type: 'broadcast', event, payload });
  }

  function sendWants(hashes) {
    for (let i = 0; i < hashes.length; i += MAX_HASHES_PER_WANT) {
      send('img_want', { hashes: hashes.slice(i, i + MAX_HASHES_PER_WANT) });
    }
  }

  function request(hashes) {
    hashes.forEach((h) => queued.add(h));
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      const batch = [...queued].filter(isWanted);
      queued = new Set();
      if (batch.length) sendWants(batch);
    }, 150);
  }

  function recentlySent(hash) {
    return Date.now() - (lastSentAt.get(hash) || 0) < RECENT_SEND_MS;
  }

  async function sendImage(hash) {
    pendingOffers.delete(hash);
    if (recentlySent(hash) || detached) return;
    const blob = await getImageBlob(hash);
    if (!blob) return;
    lastSentAt.set(hash, Date.now());
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const total = Math.max(1, Math.ceil(bytes.length / CHUNK_BYTES));
    for (let seq = 0; seq < total; seq++) {
      if (detached || !subscribed) return;
      const data = toBase64(bytes.subarray(seq * CHUNK_BYTES, (seq + 1) * CHUNK_BYTES));
      send('img_chunk', { hash, seq, total, type: blob.type, data });
      lastSentAt.set(hash, Date.now());
      if (seq < total - 1) await wait(CHUNK_GAP_MS);
    }
  }

  async function handleWant({ hashes }) {
    if (!Array.isArray(hashes)) return;
    for (const hash of hashes.slice(0, MAX_HASHES_PER_WANT)) {
      if (typeof hash !== 'string' || pendingOffers.has(hash) || recentlySent(hash) || isWanted(hash)) continue;
      if (!(await getImageBlob(hash))) continue;
      const timer = setTimeout(() => sendImage(hash), Math.random() * OFFER_DELAY_MAX_MS);
      pendingOffers.set(hash, timer);
    }
  }

  function handleChunk({ hash, seq, total, type, data }) {
    if (typeof hash !== 'string') return;
    // Someone else is already sending it — don't send a second copy.
    lastSentAt.set(hash, Date.now());
    const offer = pendingOffers.get(hash);
    if (offer) {
      clearTimeout(offer);
      pendingOffers.delete(hash);
    }
    if (!isWanted(hash) || !Number.isInteger(seq) || !Number.isInteger(total) || seq < 0 || seq >= total || typeof data !== 'string') return;

    let a = assemblies.get(hash);
    if (!a || a.total !== total || Date.now() - a.at > STALE_ASSEMBLY_MS) {
      a = { total, type: typeof type === 'string' ? type : '', parts: new Array(total), received: 0, at: Date.now() };
      assemblies.set(hash, a);
    }
    a.at = Date.now();
    if (a.parts[seq]) return;
    a.parts[seq] = fromBase64(data);
    a.received += 1;
    if (a.received < a.total) return;

    assemblies.delete(hash);
    acceptImage(hash, new Blob(a.parts, { type: a.type })).catch(() => {});
  }

  channel.on('broadcast', { event: 'img_want' }, ({ payload }) => {
    handleWant(payload || {});
  });
  channel.on('broadcast', { event: 'img_chunk' }, ({ payload }) => handleChunk(payload || {}));

  // Unanswered wants are asked again — the browser that has the picture may
  // not have been online the first time.
  const retryTimer = setInterval(() => {
    const now = Date.now();
    const hashes = wantedHashes().filter((h) => {
      const a = assemblies.get(h);
      return !a || now - a.at > RETRY_MS;
    });
    if (hashes.length) sendWants(hashes);
  }, RETRY_MS);

  setPeerRequester(request);

  return {
    onSubscribed() {
      subscribed = true;
      const hashes = wantedHashes();
      if (hashes.length) sendWants(hashes);
    },
    onDisconnected() {
      subscribed = false;
    },
    detach() {
      detached = true;
      subscribed = false;
      clearInterval(retryTimer);
      clearTimeout(flushTimer);
      pendingOffers.forEach((t) => clearTimeout(t));
      setPeerRequester(null);
    },
  };
}
