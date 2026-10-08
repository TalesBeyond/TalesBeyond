import { islandsBounds, loadImage } from './image.js';

// Finding where each map's art really lies in a picture laid over a map or an
// island group (MapImageFit's Snap to the art).
// A picture painted over Download map's PNG by hand keeps every map where it
// was. One redrawn from it (by an image generator, say) is the right size and
// the right idea, but each map's art ends up a little off its rectangle, each
// by its own amount, so no single position fits them all. Here every map's
// four edges are looked for near where they should be, and the map gets the
// picture laid so that the art found fills it.

// The picture is read at this size at most: plenty to find an edge to within
// a pixel or two of the map, and quick.
const ANALYSIS_MAX_DIM = 1400;
// How far a colour may be from the background's and still count as it.
const BACKGROUND_TOLERANCE = 40;
// A transparent pixel reads as this, a colour no map art is likely to hold.
const CLEAR = [255, 0, 255];

export async function findMapArt(url, islands, place) {
  const img = await loadImage(url);
  const scale = Math.min(1, ANALYSIS_MAX_DIM / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return artPlacements(ctx.getImageData(0, 0, canvas.width, canvas.height), islands, place);
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};

// `pixels`: { data, width, height } (an ImageData). `place`: where the whole
// picture lies now, as MapImageFit has it. Returns
// { placements: { [islandId]: { x, y, width, height } }, total }: for each map
// whose art was found, where the picture has to lie for that art to fill it.
export function artPlacements(pixels, islands, place) {
  const { data, width: W, height: H } = pixels;
  const { minX, minY } = islandsBounds(islands);
  // Layer pixels to picture pixels, each way.
  const kx = W / place.width;
  const ky = H / place.height;
  // Where each map should be, in the picture's own pixels.
  const rects = islands.map((i) => {
    const x0 = ((i.x || 0) - minX - place.x) * kx;
    const y0 = ((i.y || 0) - minY - place.y) * ky;
    return { id: i.id, x0, y0, x1: x0 + i.cols * i.cellSize * kx, y1: y0 + i.rows * i.cellSize * ky, cellX: i.cellSize * kx, cellY: i.cellSize * ky };
  });

  const colourAt = (x, y) => {
    const at = (y * W + x) * 4;
    return data[at + 3] < 128 ? CLEAR : [data[at], data[at + 1], data[at + 2]];
  };
  const apart = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

  // The background: what the picture holds where no map is, well clear of
  // them all. A picture with no such room (one map, or maps that tile) falls
  // back on its corners, if they agree.
  function backgroundColour() {
    const samples = [];
    const left = Math.min(...rects.map((r) => r.x0));
    const top = Math.min(...rects.map((r) => r.y0));
    const right = Math.max(...rects.map((r) => r.x1));
    const bottom = Math.max(...rects.map((r) => r.y1));
    const STEPS = 56;
    for (let a = 0; a < STEPS; a++) {
      for (let b = 0; b < STEPS; b++) {
        const x = Math.floor(left + ((a + 0.5) * (right - left)) / STEPS);
        const y = Math.floor(top + ((b + 0.5) * (bottom - top)) / STEPS);
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (rects.some((r) => x > r.x0 - r.cellX * 0.6 && x < r.x1 + r.cellX * 0.6 && y > r.y0 - r.cellY * 0.6 && y < r.y1 + r.cellY * 0.6)) continue;
        samples.push(colourAt(x, y));
      }
    }
    if (samples.length < 8) {
      samples.length = 0;
      for (const [x, y] of [[1, 1], [W - 2, 1], [1, H - 2], [W - 2, H - 2]]) if (x >= 0 && y >= 0 && x < W && y < H) samples.push(colourAt(x, y));
      if (samples.length < 4) return null;
    }
    const colour = [0, 1, 2].map((c) => median(samples.map((s) => s[c])));
    // Mostly one colour, or it is not a background at all.
    const agreeing = samples.filter((s) => apart(s, colour) <= BACKGROUND_TOLERANCE).length;
    return agreeing >= samples.length * (samples.length > 4 ? 0.6 : 1) ? colour : null;
  }
  const background = backgroundColour();

  // Summed-area tables, for the mean of any rectangle at once: each colour
  // channel, and how much of it is art (anything but the background).
  const stride = W + 1;
  const tables = [0, 1, 2, 3].map(() => new Float64Array(stride * (H + 1)));
  for (let y = 0; y < H; y++) {
    const row = [0, 0, 0, 0];
    for (let x = 0; x < W; x++) {
      const colour = colourAt(x, y);
      row[0] += colour[0];
      row[1] += colour[1];
      row[2] += colour[2];
      if (background && apart(colour, background) > BACKGROUND_TOLERANCE) row[3] += 1;
      const at = (y + 1) * stride + x + 1;
      for (let t = 0; t < 4; t++) tables[t][at] = tables[t][at - stride] + row[t];
    }
  }
  // Summed over the part of the rectangle that is on the picture.
  function sum(table, x0, y0, x1, y1) {
    const a = Math.max(0, Math.min(W, Math.round(x0)));
    const b = Math.max(0, Math.min(H, Math.round(y0)));
    const c = Math.max(0, Math.min(W, Math.round(x1)));
    const d = Math.max(0, Math.min(H, Math.round(y1)));
    if (c <= a || d <= b) return { total: 0, area: 0 };
    return { total: table[d * stride + c] - table[b * stride + c] - table[d * stride + a] + table[b * stride + a], area: (c - a) * (d - b) };
  }
  // How much of a rectangle is art. What hangs off the picture counts as background.
  const artIn = (x0, y0, x1, y1) => sum(tables[3], x0, y0, x1, y1).total / Math.max(1, Math.round(x1 - x0) * Math.round(y1 - y0));
  const colourIn = (x0, y0, x1, y1) => {
    const parts = [0, 1, 2].map((c) => sum(tables[c], x0, y0, x1, y1));
    return parts[0].area ? parts.map((p) => p.total / p.area) : null;
  };

  // Every edge of every map. `across`: the axis the edge is looked for along
  // (x for a left or right edge). `inward`: +1 when the map lies on the
  // greater side of it.
  const edges = [];
  for (const r of rects) {
    for (const side of ['left', 'right', 'top', 'bottom']) {
      const across = side === 'left' || side === 'right' ? 'x' : 'y';
      const cell = across === 'x' ? r.cellX : r.cellY;
      const size = across === 'x' ? r.x1 - r.x0 : r.y1 - r.y0;
      edges.push({
        rect: r,
        side,
        across,
        inward: side === 'left' || side === 'top' ? 1 : -1,
        pos: { left: r.x0, right: r.x1, top: r.y0, bottom: r.y1 }[side],
        from: across === 'x' ? r.y0 : r.x0,
        to: across === 'x' ? r.y1 : r.x1,
        // How far off it is looked for: half the map, three squares at most.
        reach: Math.max(2, Math.round(Math.min(size * 0.5, cell * 3))),
        near: cell * 0.25,
        found: null,
        how: null,
      });
    }
  }
  // A rectangle `depth` deep on one side of an edge put at `p`, along `from`..`to`.
  const strip = (edge, p, depth, side, from, to, skip = 0) => {
    const a = side > 0 ? p + skip : p - skip - depth;
    return edge.across === 'x' ? [a, from, a + depth, to] : [from, a, to, a + depth];
  };
  const depth = Math.max(2, Math.round(Math.max(W, H) * 0.004));

  // The longest run of an edge with no other map against its outer side:
  // there the art stops at the background.
  function openRun(edge) {
    const outside = edge.pos - edge.inward * edge.near;
    const blocked = rects
      .filter((o) => o !== edge.rect && (edge.across === 'x' ? o.x0 <= outside && o.x1 > outside : o.y0 <= outside && o.y1 > outside))
      .map((o) => (edge.across === 'x' ? [o.y0, o.y1] : [o.x0, o.x1]))
      .sort((a, b) => a[0] - b[0]);
    let best = [edge.from, edge.from];
    let at = edge.from;
    for (const [b0, b1] of [...blocked, [edge.to, edge.to]]) {
      if (b0 - at > best[1] - best[0]) best = [at, Math.min(b0, edge.to)];
      at = Math.max(at, b1);
    }
    return best;
  }

  // 1. Where an edge has background beyond it: the line the art starts at.
  if (background) {
    for (const edge of edges) {
      const [open0, open1] = openRun(edge);
      const cellAlong = edge.across === 'x' ? edge.rect.cellY : edge.rect.cellX;
      if (open1 - open0 < Math.max((edge.to - edge.from) * 0.25, cellAlong * 0.6)) continue;
      const inset = (open1 - open0) * 0.08;
      let best = null;
      for (let d = -edge.reach; d <= edge.reach; d++) {
        const p = Math.round(edge.pos) + d;
        const step = artIn(...strip(edge, p, depth, edge.inward, open0 + inset, open1 - inset)) - artIn(...strip(edge, p, depth, -edge.inward, open0 + inset, open1 - inset));
        const score = step - (0.08 * Math.abs(d)) / edge.reach;
        if (step >= 0.4 && (!best || score > best.score)) best = { p, score };
      }
      if (best) Object.assign(edge, { found: best.p, how: 'gap' });
    }
  }

  // Two maps side by side share the line between them.
  const partnerOf = (edge, wanted) =>
    edges
      .filter((o) => o.rect !== edge.rect && o.across === edge.across && o.inward === -edge.inward && Math.abs(o.pos - edge.pos) <= edge.near && wanted(o))
      .map((o) => ({ o, overlap: Math.min(o.to, edge.to) - Math.max(o.from, edge.from) }))
      .filter((m) => m.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap)[0]?.o;

  // 2. An edge wholly against another map takes that map's edge, if the
  // background gave it away further along.
  for (const edge of edges) {
    if (edge.found !== null) continue;
    const partner = partnerOf(edge, (o) => o.how === 'gap');
    if (partner) Object.assign(edge, { found: partner.found, how: 'shared' });
  }

  // 3. Two maps against each other all the way along: the seam between
  // their art, the line across which the picture changes most.
  for (const edge of edges) {
    if (edge.found !== null) continue;
    const length = edge.to - edge.from;
    const from = edge.from + length * 0.08;
    const to = edge.to - length * 0.08;
    const pieces = Math.max(4, Math.min(16, Math.round((to - from) / 12)));
    const scores = [];
    for (let d = -edge.reach; d <= edge.reach; d++) {
      const p = Math.round(edge.pos) + d;
      let total = 0;
      let counted = 0;
      for (let s = 0; s < pieces; s++) {
        const a = from + ((to - from) * s) / pieces;
        const b = from + ((to - from) * (s + 1)) / pieces;
        const one = colourIn(...strip(edge, p, depth, 1, a, b, 1));
        const other = colourIn(...strip(edge, p, depth, -1, a, b, 1));
        if (!one || !other) continue;
        total += (Math.abs(one[0] - other[0]) + Math.abs(one[1] - other[1]) + Math.abs(one[2] - other[2])) / 3;
        counted += 1;
      }
      scores.push({ p, d, raw: counted ? total / counted : 0 });
    }
    const usual = median(scores.map((s) => s.raw));
    let best = null;
    for (const s of scores) {
      const score = s.raw * (1 - (0.25 * Math.abs(s.d)) / edge.reach);
      if (!best || score > best.score) best = { ...s, score };
    }
    if (!best || best.raw < 16 || best.raw < usual * 1.6) continue;
    Object.assign(edge, { found: best.p, how: 'seam' });
    // The map on the other side of it is cut along the same line.
    const partner = partnerOf(edge, (o) => o.found === null);
    if (partner) Object.assign(partner, { found: best.p, how: 'seam' });
  }

  // 4. What is left: a neighbour's edge if it was found after all, or the
  // map's far edge moved by as much, or where it was.
  for (const edge of edges) {
    if (edge.found !== null) continue;
    const partner = partnerOf(edge, (o) => o.how !== null);
    if (partner) edge.found = partner.found;
  }
  for (const edge of edges) {
    if (edge.found !== null) continue;
    const far = edges.find((o) => o.rect === edge.rect && o.across === edge.across && o !== edge);
    edge.found = far.how ? edge.pos + (far.found - far.pos) : edge.pos;
  }

  const placements = {};
  islands.forEach((island, index) => {
    const r = rects[index];
    const [left, right, top, bottom] = edges.slice(index * 4, index * 4 + 4);
    if (![left, right, top, bottom].some((e) => e.how)) return;
    // Art found at an unlikely size is a wrong find: that way keeps its place.
    const span = (a, b, was) => (b.found - a.found >= was * 0.3 && b.found - a.found <= was * 2.5 ? [a.found, b.found] : [a.pos, b.pos]);
    const [x0, x1] = span(left, right, r.x1 - r.x0);
    const [y0, y1] = span(top, bottom, r.y1 - r.y0);
    // The picture laid so that the art found fills the map.
    const fx = (r.x1 - r.x0) / (x1 - x0);
    const fy = (r.y1 - r.y0) / (y1 - y0);
    const mapX = (island.x || 0) - minX;
    const mapY = (island.y || 0) - minY;
    const round = (n) => Math.round(n * 100) / 100;
    placements[island.id] = { x: round(mapX - (x0 / kx) * fx), y: round(mapY - (y0 / ky) * fy), width: round(place.width * fx), height: round(place.height * fy) };
  });
  return { placements, total: islands.length };
}
