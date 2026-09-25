// The compendium's image database: a folder of pictures, one per entry.
//
//   src/assets/compendium/weapons/<slug>.png
//   src/assets/compendium/items/<slug>.png
//   src/assets/compendium/monsters/<slug>.png
//
// <slug> is the entry's name in lower case with every run of other characters
// turned into one "-" ("Giant Spider" -> giant-spider). A weapon's +1/+2/+3
// versions share the base weapon's picture (a "+2 Longsword" uses longsword.png).
// png, jpg, jpeg, webp, gif and svg all work. Drop a file in and it shows up in
// the book on the next reload; an entry with no file just shows no picture.

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

// The picture for one entry, or null when the folder has none.
export function compendiumImage(kind, name) {
  return INDEX[`${kind}/${slugify(name)}`] || null;
}
