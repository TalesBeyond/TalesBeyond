# Compendium images

These bundled pictures are the fallback. When the Default catalog (Supabase)
has a picture for an entry, that one is shown instead — see `src/lib/catalog.js`.

Drop a picture here and it appears as a small square on that entry's row in the
compendium book. Entries without a picture are left as they are.

```
weapons/longsword.png      (also used by "+1 Longsword", "+2 Longsword", ...)
items/rope-hempen-50-feet.png
monsters/giant-spider.png
```

The file name is the entry's name in lower case, with every run of other
characters turned into one `-`. Accepted types: png, jpg, jpeg, webp, gif, svg.
Square pictures look best (they are shown at 56 x 56 and cropped to fit).
Reload the app after adding a file.
