import { SOUND_EFFECTS } from '../data/defaultAudio.js';

// Plays the app's built-in sound effects (src/data/defaultAudio.js), once per
// action, restarting an effect if it fires again quickly. Local to this
// device: nothing is synced. Volumes are per browser (localStorage), one per
// effect, set from the Music modal. Autoplay rejections are ignored.
//
// Effects go through the Web Audio API, separate from the table music (a
// single <audio> element in audioEngine.js), so they always mix on top of it:
// an effect never stops or replaces the music, and on iOS Safari — where a
// second <audio> element can pause the first — the music keeps playing too.
// Falls back to plain <audio> elements where Web Audio is unavailable.
const clamp01 = (n) => Math.min(1, Math.max(0, n));

// Dice keeps its original key so existing volume settings carry over.
const volumeKey = (id) => (id === 'dice' ? 'tb.diceVolume' : `tb.sfxVolume.${id}`);

export function getSfxVolume(id) {
  try {
    const raw = localStorage.getItem(volumeKey(id));
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) ? clamp01(n) : 1;
  } catch {
    return 1;
  }
}

export function setSfxVolume(id, value) {
  const v = clamp01(value);
  try {
    localStorage.setItem(volumeKey(id), String(v));
  } catch {
    /* storage unavailable */
  }
  if (playing[id]) playing[id].gain.gain.value = v;
  if (fallbackPlayers[id]) fallbackPlayers[id].volume = v;
}

let ctx = null;
function context() {
  if (ctx) return ctx;
  const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!Ctx) return null;
  try {
    ctx = new Ctx();
  } catch {
    return null;
  }
  return ctx;
}

// Browsers start an AudioContext suspended until a user gesture. Effects are
// often fired from a timer (an attack's hit/miss beat), so resume on the
// first tap or key press anywhere rather than waiting for the effect itself.
if (typeof window !== 'undefined') {
  const unlock = () => {
    const c = context();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
}

const buffers = {}; // id -> Promise<AudioBuffer>
const playing = {}; // id -> { source, gain } of the effect's current play

function loadBuffer(c, effect) {
  if (!buffers[effect.id]) {
    buffers[effect.id] = fetch(effect.url)
      .then((res) => res.arrayBuffer())
      .then((data) => new Promise((resolve, reject) => c.decodeAudioData(data, resolve, reject)));
    buffers[effect.id].catch(() => delete buffers[effect.id]); // retry next time
  }
  return buffers[effect.id];
}

async function playBuffered(c, effect) {
  if (c.state === 'suspended') await c.resume().catch(() => {});
  const buffer = await loadBuffer(c, effect);
  const prev = playing[effect.id];
  if (prev) {
    try {
      prev.source.stop();
    } catch {
      /* already ended */
    }
  }
  const gain = c.createGain();
  gain.gain.value = getSfxVolume(effect.id);
  gain.connect(c.destination);
  const source = c.createBufferSource();
  source.buffer = buffer;
  source.connect(gain);
  const entry = { source, gain };
  playing[effect.id] = entry;
  source.onended = () => {
    if (playing[effect.id] === entry) delete playing[effect.id];
    gain.disconnect();
  };
  source.start();
}

const fallbackPlayers = {};
function playFallback(effect) {
  try {
    if (!fallbackPlayers[effect.id]) fallbackPlayers[effect.id] = new Audio(effect.url);
    const audio = fallbackPlayers[effect.id];
    audio.volume = getSfxVolume(effect.id);
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch {
    /* audio unavailable */
  }
}

export function playSfx(id) {
  const effect = SOUND_EFFECTS.find((s) => s.id === id);
  if (!effect) return;
  const c = context();
  if (!c) {
    playFallback(effect);
    return;
  }
  playBuffered(c, effect).catch(() => playFallback(effect));
}

export const playDiceSound = () => playSfx('dice');
