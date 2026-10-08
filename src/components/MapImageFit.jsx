import React, { useId, useRef, useState } from 'react';
import { islandsBounds, islandsTemplateSize } from '../utils/image.js';
import { findMapArt } from '../utils/imageSnap.js';

// Where a picture is laid over these islands, as { x, y, width, height } in
// the layer's own pixels, measured from the top left corner of the rectangle
// that holds them all (utils/image.js's sliceImageForIslands cuts along it).

// Where a picture starts when it is first picked: one of the right shape
// (near enough) fills the rectangle exactly; any other keeps its own
// proportions and covers the rectangle, centred.
export function defaultImagePlacement(imageWidth, imageHeight, islands) {
  const { width, height } = islandsBounds(islands);
  const ratio = imageWidth / imageHeight;
  if (Math.abs(ratio * (height / width) - 1) <= 0.02) return { x: 0, y: 0, width, height };
  const w = Math.max(width, height * ratio);
  const h = w / ratio;
  return { x: Math.round((width - w) / 2), y: Math.round((height - h) / 2), width: Math.round(w), height: Math.round(h) };
}

// How far the picture can be sized, as a percentage of the rectangle.
const MIN_PERCENT = 10;
const MAX_PERCENT = 400;

// The tool for sitting a picked picture on a map, or on a group of maps: a
// small plan of the maps with the picture under it, to drag about and size
// until the art lines up. The map itself shows the same thing as it is moved
// (the settings' preview); nothing is saved until Use this picture.
// A group's picture rarely has every map's art exactly where the map is, so
// each map can also have the picture laid for it alone: Snap to the art finds
// those places (utils/imageSnap.js), and Move picks one map to shift by hand.
//
// `islands`: the map, or every map of its group, as they are on the layer.
// `place`: the placement above, for every map that has none of its own.
// `placements`: { [islandId]: the same }, the maps laid on their own.
// `onChange(place, placements)`.
export default function MapImageFit({ url, imageWidth, imageHeight, islands, place, placements = {}, onChange, onCancel, onUse, busy = false, groupName = null }) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const clipId = useId().replace(/:/g, '');
  const [keepShape, setKeepShape] = useState(true);
  const [target, setTarget] = useState(''); // the one map being moved, or '' for all of them together
  const [snap, setSnap] = useState(null); // 'working', 'failed', or how many maps the last snap lined up

  const { minX, minY, width, height } = islandsBounds(islands);
  const ratio = imageWidth / imageHeight;
  // Room around the maps, so a picture hanging over their edge can be seen.
  const margin = Math.max(width, height) * 0.08;
  const rects = islands.map((i) => ({ id: i.id, x: (i.x || 0) - minX, y: (i.y || 0) - minY, w: i.cols * i.cellSize, h: i.rows * i.cellSize }));
  const wanted = islandsTemplateSize(islands);
  const fits = Math.abs(ratio * (height / width) - 1) <= 0.02;
  const several = islands.length > 1;
  const targetId = islands.some((i) => i.id === target) ? target : '';
  // What the drag, the arrow keys and the sliders move.
  const current = (targetId && placements[targetId]) || place;
  const split = Boolean(targetId) || Object.keys(placements).length > 0;

  const tidy = (p) => ({ x: Math.round(p.x), y: Math.round(p.y), width: Math.max(1, Math.round(p.width)), height: Math.max(1, Math.round(p.height)) });
  // `fresh`: laid out anew, so no map keeps a place of its own.
  function set(next, fresh = false) {
    const to = tidy(next);
    if (targetId) return onChange(place, { ...placements, [targetId]: to });
    if (fresh) return onChange(to, {});
    // The maps laid on their own move and grow with the rest.
    const fx = to.width / place.width;
    const fy = to.height / place.height;
    const moved = Object.entries(placements).map(([id, p]) => [id, { x: to.x + (p.x - place.x) * fx, y: to.y + (p.y - place.y) * fy, width: p.width * fx, height: p.height * fy }]);
    return onChange(to, Object.fromEntries(moved));
  }

  function onPointerDown(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    // Screen pixels to layer pixels: the plan is drawn to fit its box.
    dragRef.current = { clientX: e.clientX, clientY: e.clientY, x: current.x, y: current.y, scale: svgRef.current.getScreenCTM().a || 1 };
  }
  function onPointerMove(e) {
    const drag = dragRef.current;
    if (!drag) return;
    set({ ...current, x: drag.x + (e.clientX - drag.clientX) / drag.scale, y: drag.y + (e.clientY - drag.clientY) / drag.scale });
  }
  function onPointerUp() {
    dragRef.current = null;
  }
  // Arrow keys nudge it a pixel at a time, ten with Shift.
  function onKeyDown(e) {
    const step = e.shiftKey ? 10 : 1;
    const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!move) return;
    e.preventDefault();
    set({ ...current, x: current.x + move[0], y: current.y + move[1] });
  }
  // A double click picks the map under it to move alone; one beside the maps goes back to all of them.
  function onDoubleClick(e) {
    if (!several) return;
    const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(svgRef.current.getScreenCTM().inverse());
    setTarget(rects.find((r) => point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h)?.id || '');
  }

  // Sized about its own middle, so it grows and shrinks in place.
  function resize(nextWidth, nextHeight) {
    set({ x: current.x + (current.width - nextWidth) / 2, y: current.y + (current.height - nextHeight) / 2, width: nextWidth, height: nextHeight });
  }
  function setWidthPercent(percent) {
    const w = (width * percent) / 100;
    resize(w, keepShape ? (w * current.height) / current.width : current.height);
  }
  function setHeightPercent(percent) {
    const h = (height * percent) / 100;
    resize(keepShape ? (h * current.width) / current.height : current.width, h);
  }
  const percent = (value, of) => Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, Math.round((value / of) * 100)));

  // Each map's own art looked for in the picture, around where the picture lies now.
  async function snapToArt() {
    setSnap('working');
    try {
      const found = await findMapArt(url, islands, place);
      onChange(place, found.placements);
      setSnap(Object.keys(found.placements).length);
    } catch {
      setSnap('failed');
    }
  }
  function backWithTheRest() {
    const rest = { ...placements };
    delete rest[targetId];
    onChange(place, rest);
  }

  const shade = `M${-margin} ${-margin}H${width + margin}V${height + margin}H${-margin}Z${rects.map((r) => `M${r.x} ${r.y}h${r.w}v${r.h}h${-r.w}Z`).join('')}`;
  const picture = (at, key, clipPath) => <image key={key} href={url} x={at.x} y={at.y} width={at.width} height={at.height} preserveAspectRatio="none" clipPath={clipPath} />;

  return (
    <div className="image-fit">
      <svg
        ref={svgRef}
        className="image-fit-pad"
        viewBox={`${-margin} ${-margin} ${width + margin * 2} ${height + margin * 2}`}
        tabIndex={0}
        role="application"
        aria-label="The picture over the map. Drag it, or use the arrow keys, to move it."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onDoubleClick={onDoubleClick}
      >
        {split && (
          <defs>
            {rects.map((r) => (
              <clipPath key={r.id} id={`${clipId}-${r.id}`}>
                <rect x={r.x} y={r.y} width={r.w} height={r.h} />
              </clipPath>
            ))}
          </defs>
        )}
        {picture(current, 'all')}
        {/* Maps laid on their own each show the picture where it lies for them. */}
        {split && rects.map((r) => picture(placements[r.id] || place, r.id, `url(#${clipId}-${r.id})`))}
        {/* Everything that is not a map is dimmed: what stays bright is what the maps get. */}
        <path className="image-fit-shade" fillRule="evenodd" d={shade} />
        {rects.map((r) => (
          <rect key={r.id} className={`image-fit-map${r.id === targetId ? ' active' : ''}`} x={r.x} y={r.y} width={r.w} height={r.h} />
        ))}
      </svg>
      <span className="island-row-note">
        Drag the picture until the art sits on {groupName ? 'the maps' : 'the map'}; the arrow keys nudge it. The bright parts are what {groupName ? 'the maps get' : 'the map gets'}, and the map shows it as you go.
      </span>
      <div className="image-fit-snap">
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy || snap === 'working'} onClick={snapToArt} title="Looks for the edges of each map’s art in the picture, and lays the picture so that art fills the map">
          {snap === 'working' ? 'Looking for the art…' : several ? 'Snap each map to its art' : 'Snap to the art'}
        </button>
        {several && (
          <label className="image-fit-target">
            <span>Move</span>
            <select className="field" value={targetId} onChange={(e) => setTarget(e.target.value)}>
              <option value="">All the maps together</option>
              {islands.map((i) => (
                <option key={i.id} value={i.id}>
                  Only {i.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {typeof snap === 'number' && (
        <span className="island-row-note">
          {snap === 0
            ? 'Could not tell the art from what is around it in this picture, so nothing was moved.'
            : several
              ? `Lined up ${snap} of ${islands.length} maps with their own art. If one still looks off, pick it under Move (or double-click it) and shift it by itself.`
              : 'Lined the map up with the art in the picture.'}
        </span>
      )}
      {snap === 'failed' && <span className="island-row-note">Could not read the picture to look for the art.</span>}
      <div className="image-fit-sizes">
        <label>
          <span>Width {percent(current.width, width)}%</span>
          <input type="range" min={MIN_PERCENT} max={MAX_PERCENT} value={percent(current.width, width)} onChange={(e) => setWidthPercent(Number(e.target.value))} />
        </label>
        <label>
          <span>Height {percent(current.height, height)}%</span>
          <input type="range" min={MIN_PERCENT} max={MAX_PERCENT} value={percent(current.height, height)} onChange={(e) => setHeightPercent(Number(e.target.value))} />
        </label>
      </div>
      <label className="image-fit-keep">
        <input type="checkbox" checked={keepShape} onChange={(e) => setKeepShape(e.target.checked)} />
        Size width and height together
      </label>
      {targetId ? (
        <div className="image-fit-presets">
          <button type="button" className="btn btn-secondary btn-sm" disabled={!placements[targetId]} onClick={backWithTheRest} title="Drops this map’s own placing: it shows the picture where the others have it">
            Put it back with the rest
          </button>
        </div>
      ) : (
        <div className="image-fit-presets" role="group" aria-label="Lay the picture out">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => set({ x: 0, y: (height - width / ratio) / 2, width, height: width / ratio }, true)} title="As wide as the maps, keeping the picture’s own proportions">
            Fit width
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => set({ x: (width - height * ratio) / 2, y: 0, width: height * ratio, height }, true)} title="As tall as the maps, keeping the picture’s own proportions">
            Fit height
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => set({ x: 0, y: 0, width, height }, true)} title="Pulled to the maps’ full width and height, whatever its proportions">
            Stretch
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => set({ ...place, x: (width - place.width) / 2, y: (height - place.height) / 2 })} title="Back to the middle, at the size it is now">
            Centre
          </button>
        </div>
      )}
      <span className="island-row-note">
        This picture is {imageWidth} × {imageHeight}.{' '}
        {fits
          ? `That is the shape of ${groupName ? 'the group' : 'the map'}.${several ? ' If the art still sits off the maps, it was not drawn exactly over the downloaded picture: Snap each map to its art lines every map up with its own piece.' : ''}`
          : `${groupName ? 'The group' : 'The map'} is ${wanted.width} × ${wanted.height}, a different shape, so move and size it to fit. Download map gives a picture of the exact shape to paint over.`}
      </span>
      <div className="field-row image-fit-actions">
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={onUse}>
          {busy ? 'Adding image…' : 'Use this picture'}
        </button>
      </div>
    </div>
  );
}
