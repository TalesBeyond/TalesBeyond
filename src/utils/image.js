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

// Renders an island as a standalone PNG — its current background (or a
// blank parchment canvas if it has none) at native cols x rows x cellSize
// resolution, with the same grid lines MapBoard.jsx draws on screen baked
// in. Meant to be downloaded, edited in an external image editor using the
// grid as a per-cell guide, and re-uploaded as a new custom background.
// Rejects if the background image fails to load, so the caller can surface
// an error instead of silently exporting a blank template.
export function renderIslandTemplateToDataUrl(island) {
  const width = island.cols * island.cellSize;
  const height = island.rows * island.cellSize;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  function drawGridAndExport() {
    ctx.strokeStyle = 'rgba(23,20,15,0.28)';
    for (let v = 0; v <= island.cols; v++) {
      ctx.lineWidth = v % 5 === 0 ? 1.4 : 0.7;
      const x = v * island.cellSize;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let h = 0; h <= island.rows; h++) {
      ctx.lineWidth = h % 5 === 0 ? 1.4 : 0.7;
      const y = h * island.cellSize;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    return canvas.toDataURL('image/png');
  }

  if (!island.backgroundImage) {
    ctx.fillStyle = '#f2e9d4'; // --parchment-100, matches .grid-wrap's own background
    ctx.fillRect(0, 0, width, height);
    return Promise.resolve(drawGridAndExport());
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height);
      resolve(drawGridAndExport());
    };
    img.onerror = reject;
    img.src = island.backgroundImage;
  });
}
