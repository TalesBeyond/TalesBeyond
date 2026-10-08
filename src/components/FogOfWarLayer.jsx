import React from 'react';
import { clippedFogChunk } from '../utils/fogOfWar.js';

// One island's Fog of war, painted inside the island (MapBoard.jsx) over the
// map art, grid, day/night tint and drawings, and under every token.
//
// Players get an opaque cover over each unrevealed chunk. The DM gets a tint
// over an unrevealed chunk, with everything beneath still showing, and a
// dashed outline around a revealed one. `draft` is the rectangle the DM is
// dragging out right now. Nothing here takes a press: MapBoard works out
// what a press on the map hit.
export default function IslandFogOfWar({ chunks, island, cellPx, isHost, selectedId = null, draft = null }) {
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
  return (
    <>
      {chunks.map((chunk) => {
        const box = clippedFogChunk(chunk, island);
        if (!box) return null;
        if (!isHost) return chunk.revealed ? null : <div key={chunk.id} className="fog-of-war-cover" style={boxStyle(box)} />;
        return (
          <div
            key={chunk.id}
            className={`fog-of-war-chunk${chunk.revealed ? ' revealed' : ''}${chunk.id === selectedId ? ' selected' : ''}`}
            style={boxStyle(box)}
          />
        );
      })}
      {draft && <div className="fog-of-war-chunk draft" style={boxStyle({ x0: draft.x, y0: draft.y, x1: draft.x + draft.w, y1: draft.y + draft.h })} />}
    </>
  );
}
