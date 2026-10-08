// The pictures on a door's, chest's, trap's and ambush's inspector card
// (RightPanel.jsx's PlaceableCard):
//
//   src/assets/placeables/door.<ext>          a door
//   src/assets/placeables/door-locked.<ext>   …locked (optional — falls back to door)
//   src/assets/placeables/chest.<ext>         a shut chest
//   src/assets/placeables/chest-open.<ext>    …open (optional — falls back to chest)
//   src/assets/placeables/trap.<ext>          a trap
//   src/assets/placeables/ambush.<ext>        an ambush
//
// svg, png, jpg, jpeg and webp all work; the ones that ship are drawn svgs.
// To swap in your own art, replace a file (one file per name — remove the svg
// when you add a png). It is shown about twice as wide as it is tall and
// cropped to fit. A kind with no picture shows its token icon instead. The
// token on the map keeps its icon either way.

const files = import.meta.glob('../assets/placeables/*.{svg,png,jpg,jpeg,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const ART = {};
for (const [path, url] of Object.entries(files)) {
  const m = path.match(/placeables\/([^/]+)\.[a-z]+$/i);
  if (m) ART[m[1].toLowerCase()] = url;
}

// The first of these names there is a picture for, or null.
export function placeableArt(...names) {
  for (const name of names) if (ART[name]) return ART[name];
  return null;
}
