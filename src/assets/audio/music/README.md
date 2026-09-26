# Bundled music

Songs that ship with the app (the starter set). Register each one in
`DEMO_MUSIC` in `src/data/defaultAudio.js`.

- Trim silence and export as MP3, 96–128 kbps (mono is fine for ambience):
  about 1 MB per minute.
- Keep the whole folder under ~10 MB. Every committed file stays in git
  history forever, even after it is deleted.
- The pre-commit hook rejects any audio file over 2 MB.
- Songs are not uploaded to Supabase.
