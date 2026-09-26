import { SOUND_EFFECTS } from '../data/defaultAudio.js';

// Plays the app's built-in sound effects (src/data/defaultAudio.js), once per
// action, restarting an effect if it fires again quickly. Local to this
// device: nothing is synced. Volumes are per browser (localStorage), one per
// effect, set from the Music modal. Autoplay rejections are ignored.
const players = {};

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
  if (players[id]) players[id].volume = v;
}

export function playSfx(id) {
  const effect = SOUND_EFFECTS.find((s) => s.id === id);
  if (!effect) return;
  try {
    if (!players[id]) players[id] = new Audio(effect.url);
    const audio = players[id];
    audio.volume = getSfxVolume(id);
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch {
    /* audio unavailable */
  }
}

export const playDiceSound = () => playSfx('dice');
