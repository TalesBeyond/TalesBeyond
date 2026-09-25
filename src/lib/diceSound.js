import diceRollUrl from '../assets/audio/dice-roll.mp3';

// Plays the dice-roll sound once per roll action (not per die), restarting
// it if rolls come in quickly. Autoplay rejections are ignored. The volume
// is per browser (localStorage) and tweaked from the Music modal.
const VOLUME_KEY = 'tb.diceVolume';
let audio = null;

const clamp01 = (n) => Math.min(1, Math.max(0, n));

export function getDiceVolume() {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) ? clamp01(n) : 1;
  } catch {
    return 1;
  }
}

export function setDiceVolume(value) {
  const v = clamp01(value);
  try {
    localStorage.setItem(VOLUME_KEY, String(v));
  } catch {
    /* storage unavailable */
  }
  if (audio) audio.volume = v;
}

export function playDiceSound() {
  try {
    if (!audio) audio = new Audio(diceRollUrl);
    audio.volume = getDiceVolume();
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch {
    /* audio unavailable */
  }
}
