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

// Off for now: the table has only the built-in sound effects. No music of
// any kind (world, ambience, token sounds, the encounter theme), and no
// audio file can be uploaded from anywhere. Turning this back on restores it
// all — the code paths are only hidden, not removed.
export const MUSIC_ENABLED = false;

import diceRollUrl from '../assets/audio/dice-roll.mp3';
import swordSliceUrl from '../assets/audio/sword-slice.mp3';
import swooshMissUrl from '../assets/audio/swoosh-miss.mp3';
import pageFlipUrl from '../assets/audio/page-flip.mp3';
import turnStartUrl from '../assets/audio/turn-start.mp3';
import natural20Url from '../assets/audio/natural-20.mp3';
import natural1Url from '../assets/audio/natural-1.mp3';
import villageConsortUrl from '../assets/audio/music/village-consort.mp3';
import bossFightUrl from '../assets/audio/music/boss-fight.mp3';

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
  {
    id: 'turn',
    name: 'Turn starts',
    when: 'Plays when a new turn starts during an encounter',
    description: 'A short, bright video-game success chime.',
    source: { ...PIXABAY, url: 'https://pixabay.com/sound-effects/film-special-effects-next-level-114480/' },
    url: turnStartUrl,
    // Cut to its first 2 seconds, fading out over the last half second.
    maxSeconds: 2,
    fadeSeconds: 0.5,
  },
  {
    id: 'nat20',
    name: 'Natural 20',
    when: 'Plays when anyone at the table rolls a natural 20 that you can see',
    description: 'An epic flute fanfare.',
    source: { ...PIXABAY, author: 'BreakzStudios', url: 'https://pixabay.com/sound-effects/film-special-effects-epic-flute-reveal-logo-201062/' },
    url: natural20Url,
    // Starts 2 seconds into the file. On the roller's screen it plays from the
    // moment the big die freezes on 20 until the die leaves (FxLayer.jsx:
    // NAT_MS − TUMBLE_MS = 3.42s), fading in, then out with the die over its
    // last 0.4s.
    startSeconds: 2,
    maxSeconds: 3.42,
    fadeInSeconds: 0.2,
    fadeSeconds: 0.4,
  },
  {
    id: 'nat1',
    name: 'Natural 1',
    when: 'Plays when anyone at the table rolls a natural 1 that you can see',
    description: 'A heavy, epic whoosh.',
    source: { ...PIXABAY, author: 'Dragon Studio', url: 'https://pixabay.com/sound-effects/film-special-effects-epic-whoosh-478371/' },
    url: natural1Url,
    // Timed like the natural 20 (above) from the die freezing on 1, untrimmed:
    // the whole file is about 2.5s, so it ends on its own before the die goes.
    maxSeconds: 3.42,
    fadeInSeconds: 0.2,
    fadeSeconds: 0.4,
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

// Plays for everyone at the table while an encounter is running, in place of
// the table's music (which picks back up where it would be once the fight
// ends — see audioEngine.js's `override`). Each player sets its volume in the
// Music modal. Not offered as world music: it's the fight's own theme.
export const ENCOUNTER_MUSIC = {
  id: 'encounter-music',
  name: 'Encounter music',
  when: 'Loops while an encounter is running, in place of the table music',
  description: 'A driving boss-fight loop.',
  source: PIXABAY,
  url: bossFightUrl,
};

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
