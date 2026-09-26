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
import villageConsortUrl from '../assets/audio/music/village-consort.mp3';

// Where the built-in sounds come from, shown next to each one in the Music
// modal. Add `author` (the Pixabay uploader) and `url` (the sound's own
// Pixabay page) when known; otherwise the credit links to Pixabay itself.
export const PIXABAY = { name: 'Pixabay', url: 'https://pixabay.com/' };

export const SOUND_EFFECTS = [
  {
    id: 'dice',
    name: 'Dice roll',
    when: 'Plays whenever you roll',
    description: 'Dice tumbling across a table.',
    source: { ...PIXABAY, author: 'freesound_community', url: 'https://pixabay.com/sound-effects/household-diceland-90279/' },
    url: diceRollUrl,
  },
  {
    id: 'hit',
    name: 'Attack hits',
    when: "Plays when your hero's attack hits",
    description: 'A sharp sword slice.',
    source: PIXABAY,
    url: swordSliceUrl,
  },
  {
    id: 'miss',
    name: 'Attack misses',
    when: "Plays when your hero's attack misses",
    description: 'A blade swooshing through empty air.',
    source: PIXABAY,
    url: swooshMissUrl,
  },
  {
    id: 'page',
    name: 'Page flip',
    when: 'Plays when you turn a page in the compendium',
    description: 'A single paper page turning.',
    source: { ...PIXABAY, author: 'freesound_community', url: 'https://pixabay.com/sound-effects/film-special-effects-small-page-103398/' },
    url: pageFlipUrl,
  },
];

// { id, name, url, loop, description, source } — see the note above. `source`
// is PIXABAY (optionally with an `author`), shown as the song's credit.
export const DEMO_MUSIC = [
  {
    id: 'village-consort',
    name: 'Village Consort',
    description: 'A light medieval tune for villages, taverns and market squares.',
    url: villageConsortUrl,
    loop: true,
  },
];

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
