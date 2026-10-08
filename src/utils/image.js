// Shared client-side image resize helper. A phone photo (or any oversized
// upload) is downscaled to a canvas before it's used anywhere, so it can't
// silently blow past localStorage's per-origin quota (Phase 1, embedded as a
// data URL) or bloat a Supabase Storage upload (Phase 2, see lib/storageUpload.js).

export function resizeImageToCanvas(file, maxDim) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = objectUrl;
  });
}

export async function resizeImageToDataUrl(file, maxDim, quality = 0.82) {
  const canvas = await resizeImageToCanvas(file, maxDim);
  return canvas.toDataURL('image/jpeg', quality);
}

// The largest side a browser will reliably give a canvas.
const TEMPLATE_MAX_DIM = 8192;

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// The rectangle that holds every one of these islands, in the layer's own
// un-zoomed pixels.
export function islandsBounds(islands) {
  const minX = Math.min(...islands.map((i) => i.x || 0));
  const minY = Math.min(...islands.map((i) => i.y || 0));
  const maxX = Math.max(...islands.map((i) => (i.x || 0) + i.cols * i.cellSize));
  const maxY = Math.max(...islands.map((i) => (i.y || 0) + i.rows * i.cellSize));
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

// Renders islands as a standalone PNG — each one's current background (or
// blank parchment if it has none) at native cols x rows x cellSize
// resolution, with the same grid lines MapBoard.jsx draws on screen baked
// in. Meant to be downloaded, edited in an external image editor using the
// grid as a per-cell guide, and re-uploaded as the background.
// One island gives a picture of exactly that island. Several (an island
// group) give one PNG the size of the rectangle that holds them all, each
// island drawn where it sits on the map and the gaps left transparent;
// sliceImageForIslands cuts an upload along the same rectangles.
// Rejects if a background image fails to load, so the caller can surface
// an error instead of silently exporting a blank template.
// The pixel size of that PNG, which is also the size a picture painted over
// it should keep: { width, height, scale }.
export function islandsTemplateSize(islands) {
  const { width, height } = islandsBounds(islands);
  const scale = Math.min(1, TEMPLATE_MAX_DIM / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale), scale };
}

export async function renderIslandsTemplateToDataUrl(islands) {
  const { minX, minY } = islandsBounds(islands);
  const size = islandsTemplateSize(islands);
  const { scale } = size;
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  for (const island of islands) {
    const left = (island.x || 0) - minX;
    const top = (island.y || 0) - minY;
    const w = island.cols * island.cellSize;
    const h = island.rows * island.cellSize;
    if (island.backgroundImage) {
      ctx.drawImage(await loadImage(island.backgroundImage), left, top, w, h);
    } else {
      ctx.fillStyle = '#f2e9d4'; // --parchment-100, matches .grid-wrap's own background
      ctx.fillRect(left, top, w, h);
    }
    ctx.strokeStyle = 'rgba(23,20,15,0.28)';
    for (let v = 0; v <= island.cols; v++) {
      ctx.lineWidth = v % 5 === 0 ? 1.4 : 0.7;
      const x = left + v * island.cellSize;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + h);
      ctx.stroke();
    }
    for (let r = 0; r <= island.rows; r++) {
      ctx.lineWidth = r % 5 === 0 ? 1.4 : 0.7;
      const y = top + r * island.cellSize;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + w, y);
      ctx.stroke();
    }
  }
  return canvas.toDataURL('image/png');
}

// One picture for a map, or for a whole island group: it is laid over the
// rectangle that holds every island (the shape renderIslandsTemplateToDataUrl
// exports) and each island gets the part that falls on it, as its own
// background. Returns { [islandId]: dataUrl }.
// `placement`: where the picture is laid instead, as { x, y, width, height }
// in the layer's pixels from that rectangle's top left corner (the settings'
// MapImageFit tool). What it does not reach is left as bare parchment.
// `placements`: { [islandId]: the same }, for the maps that have the picture
// laid for them alone (that tool's Snap to the art, or a map moved by itself).
export async function sliceImageForIslands(file, islands, maxDim, quality = 0.82, placement = null, placements = null) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const { minX, minY, width, height } = islandsBounds(islands);
    const shared = placement || { x: 0, y: 0, width, height };
    const slices = {};
    for (const island of islands) {
      const w = island.cols * island.cellSize;
      const h = island.rows * island.cellSize;
      const place = placements?.[island.id] || shared;
      // Picture pixels to one layer pixel, each way.
      const sx = img.width / place.width;
      const sy = img.height / place.height;
      // Keep the island's own proportions, so the slice fills it exactly.
      const longSide = Math.max(1, Math.min(maxDim, Math.max(w * sx, h * sy)));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round((longSide * w) / Math.max(w, h)));
      canvas.height = Math.max(1, Math.round((longSide * h) / Math.max(w, h)));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#f2e9d4'; // --parchment-100, a map with no background
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // The whole picture, drawn where it lies as seen from this island.
      const kx = canvas.width / w;
      const ky = canvas.height / h;
      ctx.drawImage(img, (place.x - ((island.x || 0) - minX)) * kx, (place.y - ((island.y || 0) - minY)) * ky, place.width * kx, place.height * ky);
      slices[island.id] = canvas.toDataURL('image/jpeg', quality);
    }
    return slices;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
