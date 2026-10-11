// The picture filter behind the Terms of Use's ban on pornographic content
// (LegalPage.jsx, section 6). Every picture is scored in this browser by a
// small image classifier (NSFWJS on TensorFlow.js) before it is used: when a
// DM picks one (utils/image.js, imageCache.js storeImage) and again when a
// browser receives one from another (imageCache.js acceptImage), so a DM
// whose own check was switched off still cannot show it to anyone else.
// The picture never leaves the device for this; nothing is sent anywhere.
//
// It finds pornography and explicit drawings. It does not tell a person's
// age, and it is not a detector of child sexual abuse material: that needs
// matching against the authorities' lists, which only works on a server
// (CLOUDFLARE_SCANNING.md).
//
// The classifier and its model (about 5 MB together) are fetched the first
// time a picture is checked, never on the start screen.

import { useSyncExternalStore } from 'react';

// How sure the classifier must be before a picture is refused, from 0 to 1.
// `explicit` is its Porn and Hentai scores added up; `sexy` is its score for
// suggestive pictures that are not pornography, refused only when it is
// nearly certain, so armour, swimwear and classical art get through.
// `tile` is `explicit` for one quarter of a large picture on its own (a map
// with something small hidden in it). Lower numbers refuse more.
//
// A received picture gets more room than a picked one: two devices score the
// same picture slightly differently, and a picture its own DM's browser let
// through should not vanish for one player over a rounding difference.
const LIMITS = {
  upload: { explicit: 0.6, sexy: 0.9, tile: 0.8 },
  receive: { explicit: 0.8, sexy: 0.97, tile: 0.92 },
};

// Pictures at least this long on a side are also scored in quarters.
const TILE_MIN_SIDE = 800;

export class BlockedImageError extends Error {
  constructor() {
    super('This picture was blocked');
    this.name = 'BlockedImageError';
  }
}

export class ImageCheckUnavailableError extends Error {
  constructor(cause) {
    super('The picture check could not run');
    this.name = 'ImageCheckUnavailableError';
    this.cause = cause;
  }
}

// What to tell the person who picked the picture. `fallback` is the caller's
// own message for every other failure (an unreadable file, a full disk).
export function imageErrorMessage(err, fallback) {
  if (err instanceof BlockedImageError) {
    return 'That picture looks like it has sexual or explicit content, which is not allowed here, so it was not added. If that is wrong, try another picture or write to us.';
  }
  if (err instanceof ImageCheckUnavailableError) {
    return 'The picture could not be checked, so it was not added. Check your connection and try again.';
  }
  return fallback;
}

// --- What the screen shows while this works (ImageCheckNotice.jsx) ----------

let status = { busy: 0, blockedReceived: 0 };
const listeners = new Set();

function setStatus(patch) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// { busy: pictures a DM picked that are being checked right now,
//   blockedReceived: pictures from other browsers refused since the last
//   clearBlockedNotice() }.
export function useImageCheckStatus() {
  return useSyncExternalStore(subscribe, () => status);
}

export function clearBlockedNotice() {
  if (status.blockedReceived) setStatus({ blockedReceived: 0 });
}

// --- The classifier ----------------------------------------------------------

let modelPromise = null;

function loadModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const [tf, { load }, { MobileNetV2Model }] = await Promise.all([
        import('@tensorflow/tfjs'),
        import('nsfwjs/core'),
        import('nsfwjs/models/mobilenet_v2'),
      ]);
      tf.enableProdMode();
      await tf.ready();
      return load('MobileNetV2', { modelDefinitions: [MobileNetV2Model] });
    })();
    // A failed load (offline, say) is tried again by the next picture.
    modelPromise.catch(() => {
      modelPromise = null;
    });
  }
  return modelPromise;
}

function decode(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('not a picture'));
    };
    img.src = url;
  });
}

function quarter(img, col, row) {
  const w = Math.floor(img.naturalWidth / 2);
  const h = Math.floor(img.naturalHeight / 2);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, col * w, row * h, w, h, 0, 0, w, h);
  return canvas;
}

async function scoreOne(model, picture) {
  const predictions = await model.classify(picture, 5);
  const p = Object.fromEntries(predictions.map((x) => [x.className, x.probability]));
  return { explicit: (p.Porn || 0) + (p.Hentai || 0), sexy: p.Sexy || 0 };
}

// { explicit, sexy, tile }, each the classifier's certainty from 0 to 1.
async function score(blob) {
  const model = await loadModel();
  const img = await decode(blob);
  const whole = await scoreOne(model, img);
  let tile = 0;
  if (Math.max(img.naturalWidth, img.naturalHeight) >= TILE_MIN_SIDE) {
    for (const [col, row] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      tile = Math.max(tile, (await scoreOne(model, quarter(img, col, row))).explicit);
    }
  }
  return { ...whole, tile };
}

// One picture at a time: several at once only fight over the graphics card.
let queue = Promise.resolve();
const scores = new Map(); // fingerprint -> { explicit, sexy, tile }, for this session

async function fingerprint(blob) {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function isBlocked(result, mode) {
  const limit = LIMITS[mode];
  return result.explicit >= limit.explicit || result.sexy >= limit.sexy || result.tile >= limit.tile;
}

// Scores a picture (a data URL or Blob) and says whether it may be used.
// `mode`: 'upload' for one a DM picked, 'receive' for one another browser
// sent or this browser kept from before the filter existed. `hash`: the
// picture's fingerprint, when the caller already has it.
// Resolves to true (allowed) or false (blocked); rejects with
// ImageCheckUnavailableError when the check itself could not run.
export async function isImageAllowed(source, mode = 'upload', hash = null) {
  let result;
  try {
    const blob = typeof source === 'string' ? await (await fetch(source)).blob() : source;
    const key = hash || (await fingerprint(blob));
    result = key ? scores.get(key) : null;
    if (!result) {
      const run = queue.then(() => score(blob));
      queue = run.catch(() => {});
      result = await run;
      if (key) scores.set(key, result);
    }
  } catch (err) {
    throw new ImageCheckUnavailableError(err);
  }
  return !isBlocked(result, mode);
}

// For a picture a DM picked: resolves when it may be used, rejects with
// BlockedImageError when it may not, or ImageCheckUnavailableError when it
// could not be checked. Either way it is not used: a check that can be
// skipped by going offline would stop nobody.
export async function assertImageAllowed(source, hash = null) {
  setStatus({ busy: status.busy + 1 });
  try {
    if (!(await isImageAllowed(source, 'upload', hash))) throw new BlockedImageError();
  } finally {
    setStatus({ busy: status.busy - 1 });
  }
}

// For a picture this browser received or already held: 'ok', 'blocked' (it
// must not be shown) or 'unchecked'. An unchecked picture is still shown:
// only this device's own trouble (no connection for the classifier) causes
// that, never the sender.
export async function checkReceivedImage(blob, hash) {
  try {
    if (await isImageAllowed(blob, 'receive', hash)) return 'ok';
  } catch {
    return 'unchecked';
  }
  setStatus({ blockedReceived: status.blockedReceived + 1 });
  return 'blocked';
}
