import React, { useEffect, useRef, useState } from 'react';

// A draggable divider on the inner edge of one of the game layout's side
// panels. `onResize` is handed the width the drag is asking for and is
// responsible for clamping it, so the limits (which depend on the other
// panel and the window) live in one place, GameView.
//
// It is a real ARIA separator: focusable, and the arrow keys resize it too
// (Shift for bigger steps), so it isn't mouse-only. Double-click resets.
const KEY_STEP = 16;

export default function PanelResizer({ side, width, onResize, onReset, label }) {
  const dragRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  // Never leave the page stuck in "resizing" (col-resize cursor, no text
  // selection) if this unmounts mid-drag.
  useEffect(() => () => document.body.classList.remove('panel-resizing'), []);

  function onPointerDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startWidth: width };
    setDragging(true);
    document.body.classList.add('panel-resizing');
  }

  function onPointerMove(e) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    // The left panel grows as its right edge moves right; the right panel
    // grows as its left edge moves left.
    onResize(dragRef.current.startWidth + (side === 'left' ? dx : -dx));
  }

  function endDrag(e) {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    document.body.classList.remove('panel-resizing');
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // capture already released (e.g. the pointer was cancelled) - nothing to do
    }
  }

  function onKeyDown(e) {
    const grow = side === 'left' ? 'ArrowRight' : 'ArrowLeft';
    const shrink = side === 'left' ? 'ArrowLeft' : 'ArrowRight';
    const step = e.shiftKey ? KEY_STEP * 3 : KEY_STEP;
    if (e.key === grow) onResize(width + step);
    else if (e.key === shrink) onResize(width - step);
    else return;
    e.preventDefault();
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      className={`panel-resizer ${side}${dragging ? ' dragging' : ''}`}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onDoubleClick={onReset}
    />
  );
}
