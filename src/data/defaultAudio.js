// The sounds that ship with the app — nothing here is uploaded anywhere.
// Files live in src/assets/audio/ and are bundled by Vite (fetched only the
// first time they play).
//
// SOUND_EFFECTS play locally on the device that triggers them; each player
// sets their own volume per effect in the Music modal.
//
// DEMO_MUSIC is a starter library the DM can pick for the world, a layer or a
// token instead of uploading a file. A demo track is stored as
// `builtin:<id>` rather than a file URL, so it survives redeploys (Vite's
// hashed file names change) and uses none of the table's 50 MB audio quota.
// To add one: drop the file in src/assets/audio/music/, import it below and
// add an entry. Music is bundled here only — songs are not uploaded to the
// Supabase catalog. Keep each file small (trimmed, ~96–128 kbps MP3, about
// 1 MB); the pre-commit hook (.githooks/pre-commit) blocks audio over 2 MB,
// since a committed file stays in git history forever.

import diceRollUrl from '../assets/audio/dice-roll.mp3';
import swordSliceUrl from '../assets/audio/sword-slice.mp3';
import swooshMissUrl from '../assets/audio/swoosh-miss.mp3';
import pageFlipUrl from '../assets/audio/page-flip.mp3';

export const SOUND_EFFECTS = [
  { id: 'dice', name: 'Dice roll', when: 'Plays whenever you roll', url: diceRollUrl },
  { id: 'hit', name: 'Attack hits', when: "Plays when your hero's attack hits", url: swordSliceUrl },
  { id: 'miss', name: 'Attack misses', when: "Plays when your hero's attack misses", url: swooshMissUrl },
  { id: 'page', name: 'Page flip', when: 'Plays when you turn a page in the compendium', url: pageFlipUrl },
];

// { id, name, url, loop } — see the note above.
export const DEMO_MUSIC = [];

const BUILTIN_PREFIX = 'builtin:';

export const builtinTrackUrl = (id) => BUILTIN_PREFIX + id;
export const isBuiltinTrackUrl = (url) => typeof url === 'string' && url.startsWith(BUILTIN_PREFIX);

// A track's playable URL: demo tracks resolve to the bundled file (null if a
// later build dropped it), everything else is already a real URL.
export function resolveTrackUrl(url) {
  if (!isBuiltinTrackUrl(url)) return url;
  const id = url.slice(BUILTIN_PREFIX.length);
  return DEMO_MUSIC.find((m) => m.id === id)?.url ?? null;
}
