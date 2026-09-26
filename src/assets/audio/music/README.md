# Bundled music

Songs that ship with the app (the starter set). Songs are **not** uploaded to
Supabase — they live here and are registered in `DEMO_MUSIC` in
`src/data/defaultAudio.js`.

## Recipe for every new song

Follow this before adding a song. "Village Consort" is the reference:

| Version | Length | Size |
|---|---|---|
| Original download | 3:35 | 6.4 MB |
| Compressed only | 3:35 | 1.6 MB |
| **Compressed + trimmed to 2:00 + fades** | **2:00** | **938 KB** |

1. **Start from the original download.** Never re-compress an already
   compressed copy, because quality drops each time.
2. **Trim to 2:00.** At the same quality, size depends only on length, so
   this is the biggest saving. Trim any silence at the start first.
3. **Fade in 2 s and fade out 4 s, baked into the file.** The song then loops
   smoothly (fade out, then fade in) on every device with no code involved.
   Fades don't change the file size.
4. **Export as MP3, 64 kbps, mono.** This is fine for background music at a
   game table, at about 470 KB per minute.
5. **Check the size.** Aim for under 1 MB per song and keep the whole folder
   under about 10 MB (about 10 songs). The pre-commit hook rejects any audio
   file over 2 MB.

In Audacity: select from 2:00 to the end, delete it, then use Effect → Fading →
Fade In on the first 2 s and Fade Out on the last 4 s. Set Tracks → Mix →
Mix Stereo Down to Mono, then File → Export as MP3 at a constant 64 kbps.

## Registering it

Name the file in kebab-case (`village-consort.mp3`), then add an entry to
`DEMO_MUSIC`:

```js
import villageConsortUrl from '../assets/audio/music/village-consort.mp3';

{
  id: 'village-consort',
  name: 'Village Consort',
  description: 'A light medieval tune for villages, taverns and market squares.',
  source: { name: 'Where it is from', url: 'https://…', author: 'Creator' }, // optional credit
  url: villageConsortUrl,
  loop: true,
},
```

The Music modal shows the `description` and `source` credit when the song's row
is opened. Check the song's license before adding it: some "no copyright"
channels ask for credit in exchange for free use.

## Why the limits

Every committed file stays in git history forever, even after it is deleted.
Keeping songs short and compressed keeps the repo and the app download light.
