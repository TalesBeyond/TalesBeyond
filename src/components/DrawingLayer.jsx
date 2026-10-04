import React from 'react';
import { DRAW_FILL_OPACITY, drawWidthSquares, pencilPath } from '../utils/drawing.js';

// One island's drawings, painted inside the island (MapBoard.jsx) over the
// map art, grid and day/night tint and under every token. The SVG is the
// island's size, so anything past its edge is cut off. `draft` is the shape
// the DM is drawing right now, shown before it's saved. Island fills aren't
// shapes: MapBoard paints them into the island's background, under the grid.
export default function IslandDrawings({ drawings, draft, cellPx, width, height }) {
  const shapes = drawings.filter((d) => d.kind !== 'fill');
  if (!shapes.length && !draft) return null;
  return (
    <svg className="drawing-svg" width={width} height={height} aria-hidden="true">
      {shapes.map((d) => (
        <DrawingShape key={d.id} drawing={d} cellPx={cellPx} />
      ))}
      {draft && <DrawingShape drawing={draft} cellPx={cellPx} />}
    </svg>
  );
}

export function DrawingShape({ drawing, cellPx }) {
  const { kind, geometry, style = {} } = drawing;
  const stroke = style.color || '#c0392b';
  const strokeWidth = Math.max(1, drawWidthSquares(style.width) * cellPx);
  const common = { stroke, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const fill = style.fill ? { fill: stroke, fillOpacity: DRAW_FILL_OPACITY } : { fill: 'none' };
  switch (kind) {
    case 'pencil':
      return <path d={pencilPath(geometry.points || [], cellPx)} fill="none" {...common} />;
    case 'line':
      return (
        <line
          x1={geometry.from[0] * cellPx}
          y1={geometry.from[1] * cellPx}
          x2={geometry.to[0] * cellPx}
          y2={geometry.to[1] * cellPx}
          {...common}
        />
      );
    case 'circle':
      return <circle cx={geometry.center[0] * cellPx} cy={geometry.center[1] * cellPx} r={geometry.radius * cellPx} {...common} {...fill} />;
    case 'rect':
      return (
        <rect
          x={geometry.x * cellPx}
          y={geometry.y * cellPx}
          width={geometry.w * cellPx}
          height={geometry.h * cellPx}
          {...common}
          {...fill}
        />
      );
    default:
      return null;
  }
}
