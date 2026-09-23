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

// A whole-table export is packed into a real, viewable 24-bit BMP before it
// hits disk — the pixel data literally *is* the file's bytes, laid out as a
// valid bitmap — so opening the file shows a (visually meaningless, staticky)
// image instead of plain fields a DM could hand-edit (HP, gold, chest
// contents, ...) and reimport. Not real security (it's a reversible
// byte-for-byte repacking, not encryption or compression — an uncompressed
// bitmap is actually about the same size as the JSON it holds), just enough
// friction that the game stays the source of truth for its own values.
//
// Layout: standard BMP file header (14 bytes) + BITMAPINFOHEADER (40 bytes),
// then pixel data as plain BGR triples (no palette, no alpha) with each row
// padded to a 4-byte boundary per the BMP spec. Height is stored negative so
// rows are top-down, letting the payload be written/read in one straight
// pass with no bottom-up row reversal. The pixel bytes are, in order: a
// 4-byte little-endian length prefix, then that many bytes of UTF-8 JSON,
// then zero padding out to the image's full pixel capacity.
const BMP_FILE_HEADER_SIZE = 14;
const BMP_DIB_HEADER_SIZE = 40;
const BMP_PIXEL_DATA_OFFSET = BMP_FILE_HEADER_SIZE + BMP_DIB_HEADER_SIZE;
const BMP_BYTES_PER_PIXEL = 3; // 24-bit BGR, no alpha
const BMP_LENGTH_PREFIX_BYTES = 4; // uint32 LE byte-length of the JSON payload that follows

function encodeTableBitmap(jsonString) {
  const jsonBytes = new TextEncoder().encode(jsonString);
  const payload = new Uint8Array(BMP_LENGTH_PREFIX_BYTES + jsonBytes.length);
  new DataView(payload.buffer).setUint32(0, jsonBytes.length, true);
  payload.set(jsonBytes, BMP_LENGTH_PREFIX_BYTES);

  const pixelCount = Math.max(1, Math.ceil(payload.length / BMP_BYTES_PER_PIXEL));
  const width = Math.max(1, Math.ceil(Math.sqrt(pixelCount)));
  const height = Math.max(1, Math.ceil(pixelCount / width));
  const rowDataBytes = width * BMP_BYTES_PER_PIXEL;
  const rowSize = Math.ceil(rowDataBytes / 4) * 4; // BMP rows always pad to a 4-byte boundary
  const pixelArraySize = rowSize * height;
  const fileSize = BMP_PIXEL_DATA_OFFSET + pixelArraySize;

  const file = new Uint8Array(fileSize);
  const view = new DataView(file.buffer);

  file[0] = 0x42; // 'B'
  file[1] = 0x4d; // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint32(6, 0, true); // reserved
  view.setUint32(10, BMP_PIXEL_DATA_OFFSET, true);

  view.setUint32(14, BMP_DIB_HEADER_SIZE, true);
  view.setInt32(18, width, true);
  view.setInt32(22, -height, true); // negative = top-down rows
  view.setUint16(26, 1, true); // color planes
  view.setUint16(28, BMP_BYTES_PER_PIXEL * 8, true); // bit depth
  view.setUint32(30, 0, true); // BI_RGB, uncompressed
  view.setUint32(34, pixelArraySize, true);
  view.setInt32(38, 0, true); // x pixels/meter — unused
  view.setInt32(42, 0, true); // y pixels/meter — unused
  view.setUint32(46, 0, true); // colors used
  view.setUint32(50, 0, true); // important colors

  let cursor = 0;
  let offset = BMP_PIXEL_DATA_OFFSET;
  for (let row = 0; row < height; row++) {
    for (let i = 0; i < rowDataBytes; i++) {
      file[offset + i] = cursor < payload.length ? payload[cursor] : 0;
      cursor++;
    }
    offset += rowSize; // bytes beyond rowDataBytes are left 0 — the row's alignment padding
  }
  return file;
}

// The counterpart to encodeTableBitmap above — parses the same header
// layout back out and reassembles the payload bytes in the order they were
// written, then reads its length prefix to know exactly where the real JSON
// ends and the image's leftover zero padding begins.
function decodeTableBitmap(bytes) {
  if (bytes.length < BMP_PIXEL_DATA_OFFSET || bytes[0] !== 0x42 || bytes[1] !== 0x4d) {
    throw new Error('Not a Hearthbound bitmap export');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pixelDataOffset = view.getUint32(10, true);
  const width = view.getInt32(18, true);
  const height = view.getInt32(22, true);
  const bitCount = view.getUint16(28, true);
  const compression = view.getUint32(30, true);
  if (bitCount !== BMP_BYTES_PER_PIXEL * 8 || compression !== 0) {
    throw new Error('Unsupported bitmap format');
  }
  const rowDataBytes = width * BMP_BYTES_PER_PIXEL;
  const rowSize = Math.ceil(rowDataBytes / 4) * 4;
  const rowCount = Math.abs(height);
  const topDown = height < 0;

  const payload = new Uint8Array(rowDataBytes * rowCount);
  let cursor = 0;
  for (let r = 0; r < rowCount; r++) {
    const row = topDown ? r : rowCount - 1 - r;
    const rowStart = pixelDataOffset + row * rowSize;
    for (let i = 0; i < rowDataBytes; i++) payload[cursor++] = bytes[rowStart + i];
  }

  const jsonLength = new DataView(payload.buffer).getUint32(0, true);
  const jsonBytes = payload.subarray(BMP_LENGTH_PREFIX_BYTES, BMP_LENGTH_PREFIX_BYTES + jsonLength);
  return new TextDecoder().decode(jsonBytes);
}

export function downloadSessionAsFile(state) {
  const blob = new Blob([encodeTableBitmap(JSON.stringify(state))], { type: 'image/bmp' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.session?.code || 'table'}.bmp`;
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
  const blob = new Blob([encodeTableBitmap(JSON.stringify(exportState))], { type: 'image/bmp' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.session?.code || 'table'}.bmp`;
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

// Generic file → parsed-JSON reader, for plain-JSON files — used by the
// island-shell import (REQ-002), which is still plain text (see
// readEncodedJsonFromFile below for the whole-table import, which is
// packed into a bitmap on export).
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

// Counterpart to downloadSessionAsFile/downloadGuestSessionAsFile's bitmap
// packing — reads the file's raw bytes, unpacks the BMP back into its JSON
// payload, then parses it. Rejects the same way readJsonFromFile does (not a
// bitmap, wrong bitmap format, or bad JSON all just reject) so existing
// callers' "not a valid export" error handling doesn't need to change.
export function readEncodedJsonFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(decodeTableBitmap(new Uint8Array(reader.result))));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// REQ-009 Synced Table Audio — each player's own volume per track, this
// browser only. Keyed per table (its id in cloud tables, its code in guest
// tables) and tolerant of storage being unavailable: reads fall back to {}
// and writes are silently skipped.
const AUDIO_VOLUME_NAMESPACE = 'hearthbound:audiovol:';

export function loadLocalAudioVolumes(tableKey) {
  try {
    const raw = window.localStorage.getItem(AUDIO_VOLUME_NAMESPACE + tableKey);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveLocalAudioVolumes(tableKey, volumes) {
  try {
    window.localStorage.setItem(AUDIO_VOLUME_NAMESPACE + tableKey, JSON.stringify(volumes));
  } catch {
    // storage blocked or full - the level just won't survive a refresh
  }
}
