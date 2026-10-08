import React from 'react';
import { clippedFogChunk } from '../utils/fogOfWar.js';

// The eight handles of the chunk the DM has picked in the Fog of war tool:
// its corners and the middle of each side (utils/fogOfWar.js's
// fogChunkGrabAt works out which one a press took).
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

// One island's Fog of war, painted inside the island (MapBoard.jsx) over the
// map art, grid, day/night tint and drawings, and under every token.
//
// Players get an opaque cover over each unrevealed chunk. The DM gets a tint
// over an unrevealed chunk, with everything beneath still showing, and a
// dashed outline around a revealed one. `draft` is the rectangle the DM is
// dragging out right now, and `edit` ({ id, x, y, w, h }) where the chunk
// they are moving or resizing stands meanwhile. `editable`: the Fog of war
// tool is in hand, so the picked chunk shows its handles.
//
// MapBoard works out what a press on the map hit, with one exception: a
// revealed chunk's corner tag, the only thing of it the DM can click in Play
// (`onPickTag(chunk, col, row)`), so a click on explored ground behaves as it
// always did.
export default function IslandFogOfWar({ chunks, island, cellPx, isHost, selectedId = null, draft = null, edit = null, editable = false, onPickTag = null }) {
  if (!chunks.length && !draft) return null;
  const width = island.cols * cellPx;
  const height = island.rows * cellPx;
  // Whole pixels, rounded outwards, so two chunks side by side never leave a
  // hairline of map between them.
  const boxStyle = (box) => {
    const left = Math.max(0, Math.floor(box.x0 * cellPx));
    const top = Math.max(0, Math.floor(box.y0 * cellPx));
    return {
      left,
      top,
      width: Math.min(width, Math.ceil(box.x1 * cellPx)) - left,
      height: Math.min(height, Math.ceil(box.y1 * cellPx)) - top,
    };
  };
  const tags = [];
  return (
    <>
      {chunks.map((stored) => {
        const chunk = edit?.id === stored.id ? { ...stored, x: edit.x, y: edit.y, w: edit.w, h: edit.h } : stored;
        const box = clippedFogChunk(chunk, island);
        if (!box) return null;
        if (!isHost) return chunk.revealed ? null : <div key={chunk.id} className="fog-of-war-cover" style={boxStyle(box)} />;
        const selected = chunk.id === selectedId;
        if (chunk.revealed && onPickTag) tags.push({ chunk, box });
        return (
          <div key={chunk.id} className={`fog-of-war-chunk${chunk.revealed ? ' revealed' : ''}${selected ? ' selected' : ''}`} style={boxStyle(box)}>
            {selected && editable && HANDLES.map((side) => <span key={side} className={`fog-of-war-handle ${side}`} />)}
          </div>
        );
      })}
      {draft && <div className="fog-of-war-chunk draft" style={boxStyle({ x0: draft.x, y0: draft.y, x1: draft.x + draft.w, y1: draft.y + draft.h })} />}
      {tags.map(({ chunk, box }) => (
        <button
          key={chunk.id}
          type="button"
          className={`fog-of-war-tag${chunk.id === selectedId ? ' selected' : ''}`}
          style={{ left: Math.floor(box.x0 * cellPx), top: Math.floor(box.y0 * cellPx) }}
          title="Revealed fog of war. Click to fog it again or delete it."
          aria-label="Revealed fog of war"
          // Its own press: not the island's, and not the map's.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onPickTag(chunk, box.x0, box.y0);
          }}
        >
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M3 4h14v12H3zM3 10l6-6M3 16L15 4M9 16l8-8M15 16l2-2" />
          </svg>
        </button>
      ))}
    </>
  );
}
