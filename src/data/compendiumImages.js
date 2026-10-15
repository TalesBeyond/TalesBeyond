// The compendium's image database: a folder of pictures, one per entry.
//
//   src/assets/compendium/weapons/<slug>.png
//   src/assets/compendium/items/<slug>.png
//   src/assets/compendium/monsters/<slug>.png
//   src/assets/compendium/tomes/<slug>.png
//   src/assets/compendium/foods/<slug>.png     (food, drink and their ingredients)
//   src/assets/compendium/spells/<slug>.png
//   src/assets/compendium/potions/<slug>.png   (potions and ingredients)
//
// <slug> is the entry's name in lower case with every run of other characters
// turned into one "-" ("Giant Spider" -> giant-spider). A weapon's +1/+2/+3
// versions share the base weapon's picture (a "+2 Longsword" uses longsword.png).
// png, jpg, jpeg, webp, gif and svg all work. Drop a file in and it shows up in
// the book on the next reload; an entry with no file just shows no picture.
//
// A foods or potions folder can also hold `_default.<ext>`: the picture for
// every dish or potion in it that has none of its own (ingredients are left
// without one). `_<category>.<ext>` does the same for one category of the
// folder, ahead of `_default`: potions/_elixir.png is every elixir's picture.
// The underscore keeps the name clear of every slug.

import { slugify } from './slugify.js';

const files = import.meta.glob('../assets/compendium/*/*.{png,jpg,jpeg,webp,gif,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const INDEX = {};
for (const [path, url] of Object.entries(files)) {
  const m = path.match(/compendium\/([^/]+)\/([^/]+)\.[a-z]+$/i);
  if (m) INDEX[`${m[1]}/${m[2].toLowerCase()}`] = url;
}

export { slugify };

const BUNDLED = new Set(Object.values(INDEX));

// Whether a picture is one of these bundled files (a small one is inlined as
// a data URL, so it can look like an upload).
export function isCompendiumImage(url) {
  return BUNDLED.has(url);
}

// The picture for one entry, or null when the folder has none.
export function compendiumImage(kind, name) {
  return INDEX[`${kind}/${slugify(name)}`] || null;
}

// A folder's stand-in picture: the one for `category` (`_elixir`) when it has
// one, else `_default`, or null when it has neither.
export function compendiumDefaultImage(kind, category) {
  return (category && INDEX[`${kind}/_${slugify(category)}`]) || INDEX[`${kind}/_default`] || null;
}
