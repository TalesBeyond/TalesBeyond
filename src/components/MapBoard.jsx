import React, { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import { pixelToCell, feetDistance, computeCanvasBounds } from '../utils/grid.js';
import { CONDITIONS } from '../data/conditions.js';
import { getIslandCondition } from '../data/islandConditions.js';
import { DAY_PHASES, islandPhase } from '../data/dayPhases.js';

const CLICK_MOVE_THRESHOLD_PX = 6;
const ISLAND_SNAP_PX = 20; // un-zoomed pixels — how close an island's edge must get to another's to snap flush

// Paint order among tokens, lowest first: traps underneath, doors on top,
// everything else (in entityOrder) between.
function tokenStackRank(entity) {
  if (entity?.kind === 'trap') return 0;
  if (entity?.kind === 'door') return 2;
  return 1;
}

export default function MapBoard({
  islands,
  islandOrder,
  islandGroups = {},
  pendingGroupIslandIds = [],
  dayPhase = null,
  onToggleGroupCandidate,
  onMoveIslandGroup,
  feetPerSquare,
  activeIslandId,
  onSelectIsland,
  onMoveIsland,
  entities,
  entityOrder,
  selectedId,
  onSelectEntity,
  onMoveEntity,
  canMoveEntity,
  isHost,
  onEnterDoor,
  tool, // 'play' | 'edit' | 'pan' | 'ruler'
  zoom = 1,
}) {
  const wrapRef = useRef(null);
  const panRef = useRef(null); // { startX, startY, scrollLeft, scrollTop }
  // Authoritative drag data lives in refs (not state) so the *Up handlers
  // always read the current value without going through a setState updater
  // — the updater form was previously used to call onMoveEntity/onEnterDoor
  // (parent callbacks that update GameView's state) from inside a setState
  // updater, which React disallows and which can cascade into an infinite
  // render loop for callbacks that themselves call a state setter.
  const dragRef = useRef(null); // { id, entity, downX, downY, locked }
  const [dragPos, setDragPos] = useState(null); // { id, x, y, pendingCol?, pendingRow?, pendingIslandId? } — visual position only
  const dragHoldTimeoutRef = useRef(null); // clears a stuck pending drop if confirmation never arrives
  const islandDragRef = useRef(null); // { id, downX, downY, startX, startY }
  const [islandDragPos, setIslandDragPos] = useState(null); // { id, x, y } — visual position only
  const groupDragRef = useRef(null); // { groupId, downX, downY, dx, dy }
  const [groupDragPos, setGroupDragPos] = useState(null); // { groupId, dx, dy } — unzoomed delta, visual only
  const [ruler, setRuler] = useState(null); // { start: {islandId,col,row}, end: {islandId,col,row} }

  // Which group (if any) each island belongs to, for label-suppression and
  // for translating grouped islands together while their group's handle is
  // being dragged.
  const groupIdByIslandId = new Map();
  for (const group of Object.values(islandGroups)) {
    for (const memberId of group.islandIds) groupIdByIslandId.set(memberId, group.id);
  }

  // Every island's on-screen rectangle for this render, honoring an
  // in-progress drag (individual or group) so dragging doesn't jitter the
  // canvas bounds.
  const islandRects = {};
  for (const id of islandOrder) {
    const island = islands[id];
    if (!island) continue;
    const isDragging = islandDragPos?.id === id;
    let x = isDragging ? islandDragPos.x : island.x;
    let y = isDragging ? islandDragPos.y : island.y;
    if (groupDragPos && groupIdByIslandId.get(id) === groupDragPos.groupId) {
      x += groupDragPos.dx;
      y += groupDragPos.dy;
    }
    const cellSize = island.cellSize * zoom;
    islandRects[id] = { island, x, y, cellSize, w: island.cols * cellSize, h: island.rows * cellSize };
  }
  // Padded generously beyond the islands' own bounding box (see
  // CANVAS_PAN_PADDING) so there's always room to pan in every direction —
  // computed from the stored island positions, not the live drag override
  // above, since the padding is large enough that a single drag never
  // needs the bounds to shift in real time to avoid clipping.
  const { originX, originY, maxX, maxY } = computeCanvasBounds(islands);
  const canvasWidth = (maxX - originX) * zoom;
  const canvasHeight = (maxY - originY) * zoom;

  // originX/originY shift whenever an island is dragged past the previous
  // min(0, ...x)/min(0, ...y) boundary (e.g. moved to a negative position
  // for the first time) — every island's rendered `left`/`top` is relative
  // to this shared origin, so that shift silently moves the whole map on
  // screen even though the actual scroll offset never changed, reading as
  // an unwanted "recenter." Compensate by nudging scroll the same amount
  // the origin moved, so anything that didn't itself move stays visually
  // put; the island that was actually dragged still ends up wherever it
  // was dropped, since its own x/y — not the shared origin — is what
  // determines that.
  const originRef = useRef({ originX, originY });
  useLayoutEffect(() => {
    const stage = wrapRef.current?.parentElement;
    const prev = originRef.current;
    if (stage && (prev.originX !== originX || prev.originY !== originY)) {
      stage.scrollLeft += (prev.originX - originX) * zoom;
      stage.scrollTop += (prev.originY - originY) * zoom;
    }
    originRef.current = { originX, originY };
  }, [originX, originY, zoom]);

  const getRelativePoint = useCallback((clientX, clientY) => {
    const rect = wrapRef.current.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  // Which island (if any) contains an absolute canvas point, in the same
  // "screen-left/screen-top" space the rectangles above are rendered in —
  // every island is just its own flat rectangle.
  function findIslandAt(x, y) {
    for (const id of islandOrder) {
      const r = islandRects[id];
      if (!r) continue;
      const left = (r.x - originX) * zoom;
      const top = (r.y - originY) * zoom;
      if (x >= left && x < left + r.w && y >= top && y < top + r.h) return { ...r, left, top };
    }
    return null;
  }

  function findDoorAt(islandId, col, row) {
    for (const id of entityOrder) {
      const e = entities[id];
      if (e?.kind === 'door' && e.islandId === islandId && e.col === col && e.row === row) return e;
    }
    return null;
  }

  function isDoorOccupied(doorEntity) {
    for (const id of entityOrder) {
      const e = entities[id];
      if (e?.kind === 'hero' && e.id !== doorEntity.id && e.islandId === doorEntity.islandId && e.col === doorEntity.col && e.row === doorEntity.row)
        return true;
    }
    return false;
  }

  // A light usability assist (not a data change) — nudges a dragged
  // island's edges flush against the nearest other island's edge within
  // ISLAND_SNAP_PX, so "drag until corners touch" actually lands precisely.
  function snapIslandPosition(islandId, x, y) {
    const dragged = islands[islandId];
    const w = dragged.cols * dragged.cellSize;
    const h = dragged.rows * dragged.cellSize;
    let snapX = x;
    let snapY = y;
    let bestDx = ISLAND_SNAP_PX;
    let bestDy = ISLAND_SNAP_PX;
    for (const id of islandOrder) {
      if (id === islandId) continue;
      const other = islands[id];
      const ow = other.cols * other.cellSize;
      const oh = other.rows * other.cellSize;
      for (const [edge, candidate] of [
        [x, other.x - w],
        [x, other.x + ow],
        [x + w, other.x],
        [x + w, other.x + ow],
      ]) {
        const d = Math.abs(edge - candidate);
        if (d < bestDx) {
          bestDx = d;
          snapX = edge === x ? candidate : candidate - w;
        }
      }
      for (const [edge, candidate] of [
        [y, other.y - h],
        [y, other.y + oh],
        [y + h, other.y],
        [y + h, other.y + oh],
      ]) {
        const d = Math.abs(edge - candidate);
        if (d < bestDy) {
          bestDy = d;
          snapY = edge === y ? candidate : candidate - h;
        }
      }
    }
    return { x: snapX, y: snapY };
  }

  // ---- Token dragging ----

  function handleTokenPointerDown(e, entity) {
    if (tool !== 'play') return; // token dragging/selection only applies in the Play tool
    e.stopPropagation();
    onSelectEntity(entity.id);
    const p = getRelativePoint(e.clientX, e.clientY);
    const locked = entity.kind === 'door' && isDoorOccupied(entity);
    dragRef.current = { id: entity.id, entity, downX: p.x, downY: p.y, locked };
    // Still track the pointer even for a token this viewer can't reposition
    // (a door click-to-enter needs the down/up cycle to detect click-vs-drag),
    // but don't visually follow the cursor for it — see onTokenDragMove.
    if (canMoveEntity?.(entity)) setDragPos({ id: entity.id, x: p.x, y: p.y });
    window.addEventListener('pointermove', onTokenDragMove);
    window.addEventListener('pointerup', onTokenDragUp);
  }

  function onTokenDragMove(e) {
    if (!dragRef.current || dragRef.current.locked) return; // a door standing under a hero can't be dragged around
    if (!canMoveEntity?.(dragRef.current.entity)) return; // not repositionable by this viewer — leave it pinned in place
    const p = getRelativePoint(e.clientX, e.clientY);
    setDragPos({ id: dragRef.current.id, x: p.x, y: p.y });
  }

  // Holds the token at its (snapped) drop position instead of releasing it
  // back to `entity`'s own col/row. For a guest (non-host) player, moveEntity
  // only sends a network intent — the local entity doesn't update until the
  // DM's client validates and echoes it back — so clearing dragPos right
  // away would let the token fall back to its stale origin and then jump to
  // the new square once confirmed. Holding it here keeps the drop visually
  // in place the whole time; the effect below releases the hold once
  // `entities` actually catches up (or after a timeout, in case the move
  // was rejected or the confirmation never arrives).
  function holdDragAt(id, size, col, row, islandId, rect) {
    clearTimeout(dragHoldTimeoutRef.current);
    setDragPos({
      id,
      x: rect.left + col * rect.cellSize + (rect.cellSize * size) / 2,
      y: rect.top + row * rect.cellSize + (rect.cellSize * size) / 2,
      pendingCol: col,
      pendingRow: row,
      pendingIslandId: islandId,
    });
    dragHoldTimeoutRef.current = setTimeout(() => {
      setDragPos((dp) => (dp?.id === id ? null : dp));
    }, 4000);
  }

  function onTokenDragUp(e) {
    window.removeEventListener('pointermove', onTokenDragMove);
    window.removeEventListener('pointerup', onTokenDragUp);
    const current = dragRef.current;
    dragRef.current = null;
    if (!current) {
      setDragPos(null);
      return;
    }

    const p = getRelativePoint(e.clientX, e.clientY);
    const moved = Math.hypot(p.x - current.downX, p.y - current.downY);
    const isClick = moved < CLICK_MOVE_THRESHOLD_PX;
    const found = findIslandAt(p.x, p.y);
    const size = current.entity.size || 1;
    // Re-check here, not just at drag-start/move: a viewer who can't
    // reposition this token (e.g. a player dragging a hero that isn't
    // theirs, or any non-host dragging a door) must never see it visually
    // land at the drop point — holdDragAt would otherwise hold it there
    // until the rejected move's timeout expires, which reads as "it moved,
    // then snapped back" instead of "it never moved."
    const allowed = canMoveEntity?.(current.entity);

    if (current.entity.kind === 'door') {
      // Clicking a door (occupied or not) always offers to open it. Dragging
      // only repositions it when nothing is currently standing on it.
      if (isClick && !isHost) {
        setDragPos(null);
        onEnterDoor?.(current.entity);
      } else if (allowed && !isClick && !current.locked && found) {
        const { col, row } = pixelToCell(p.x - found.left, p.y - found.top, found.cellSize, found.island.cols, found.island.rows);
        holdDragAt(current.id, size, col, row, found.island.id, found);
        onMoveEntity(current.id, col, row, found.island.id);
      } else {
        setDragPos(null);
      }
      return;
    }

    if (!allowed || !found) {
      setDragPos(null); // not this viewer's token to move, or dropped in the empty space between islands — leave it where it was
      return;
    }
    const { col, row } = pixelToCell(p.x - found.left, p.y - found.top, found.cellSize, found.island.cols, found.island.rows);
    holdDragAt(current.id, size, col, row, found.island.id, found);
    onMoveEntity(current.id, col, row, found.island.id);
    // Landing a hero token on a door's square (via an actual drag, not a
    // bare click/reselect) offers to walk through it.
    if (current.entity.kind === 'hero' && !isHost && !isClick) {
      const door = findDoorAt(found.island.id, col, row);
      if (door) {
        console.log(`${current.entity.name} landed on door "${door.name}" at (${col}, ${row})`);
        onEnterDoor?.(door);
      }
    }
  }

  // Releases a held drop once the authoritative entity position (from
  // `entities`) actually matches where we're holding it — see holdDragAt.
  useEffect(() => {
    if (dragPos?.pendingCol === undefined) return;
    const entity = entities[dragPos.id];
    if (!entity || (entity.col === dragPos.pendingCol && entity.row === dragPos.pendingRow && entity.islandId === dragPos.pendingIslandId)) {
      clearTimeout(dragHoldTimeoutRef.current);
      setDragPos(null);
    }
  }, [entities, dragPos]);

  // ---- Island dragging / selection ----
  // Entirely pointer-driven (not the native click event) so click-vs-drag
  // resolves the same reliable way token dragging already does.

  function handleIslandPointerDown(e, island) {
    if (tool === 'ruler' || tool === 'pan') return;
    e.stopPropagation();
    const p = getRelativePoint(e.clientX, e.clientY);
    islandDragRef.current = { id: island.id, downX: p.x, downY: p.y, startX: island.x, startY: island.y };
    window.addEventListener('pointermove', onIslandDragMove);
    window.addEventListener('pointerup', onIslandDragUp);
  }

  function onIslandDragMove(e) {
    if (tool !== 'edit' || !isHost || !islandDragRef.current) return; // repositioning is Edit-tool, host-only
    const p = getRelativePoint(e.clientX, e.clientY);
    const { downX, downY, startX, startY, id } = islandDragRef.current;
    // Rounded to whole pixels — island.x/y are stored (and, in cloud mode,
    // written to a Postgres `integer` column) as un-zoomed whole pixels;
    // dividing a drag delta by a fractional zoom otherwise leaves a
    // fractional remainder that a real Postgres column rejects outright.
    setIslandDragPos({ id, x: Math.round(startX + (p.x - downX) / zoom), y: Math.round(startY + (p.y - downY) / zoom) });
  }

  function onIslandDragUp(e) {
    window.removeEventListener('pointermove', onIslandDragMove);
    window.removeEventListener('pointerup', onIslandDragUp);
    const current = islandDragRef.current;
    islandDragRef.current = null;
    setIslandDragPos(null);
    if (!current) return;

    const p = getRelativePoint(e.clientX, e.clientY);
    const moved = Math.hypot(p.x - current.downX, p.y - current.downY);
    const isClick = moved < CLICK_MOVE_THRESHOLD_PX;

    // While the 'group' tool is active, a click toggles the island into the
    // pending group selection instead of selecting/repositioning it —
    // dragging is ignored entirely in this mode.
    if (tool === 'group') {
      if (isClick) onToggleGroupCandidate?.(current.id);
      return;
    }

    // Selecting the "active" island (for placing new tokens) works in any
    // tool that reaches here — only the drag-to-reposition part below is
    // restricted to the Edit tool.
    onSelectIsland(current.id);
    if (!isClick && tool === 'edit' && isHost) {
      // Rounded to whole pixels — see the matching comment in
      // onIslandDragMove; this is the value that actually gets persisted
      // (and, in cloud mode, written to a Postgres `integer` column).
      const nextX = Math.round(current.startX + (p.x - current.downX) / zoom);
      const nextY = Math.round(current.startY + (p.y - current.downY) / zoom);
      const snapped = snapIslandPosition(current.id, nextX, nextY);
      onMoveIsland(current.id, snapped.x, snapped.y);
    }
  }

  // ---- Island-group dragging (the bounding-box handle) ----

  function handleGroupHandlePointerDown(e, groupId) {
    e.stopPropagation();
    const p = getRelativePoint(e.clientX, e.clientY);
    groupDragRef.current = { groupId, downX: p.x, downY: p.y, dx: 0, dy: 0 };
    window.addEventListener('pointermove', onGroupHandleMove);
    window.addEventListener('pointerup', onGroupHandleUp);
  }

  function onGroupHandleMove(e) {
    if (!groupDragRef.current) return;
    const p = getRelativePoint(e.clientX, e.clientY);
    const { groupId, downX, downY } = groupDragRef.current;
    const dx = Math.round((p.x - downX) / zoom);
    const dy = Math.round((p.y - downY) / zoom);
    groupDragRef.current.dx = dx;
    groupDragRef.current.dy = dy;
    setGroupDragPos({ groupId, dx, dy });
  }

  function onGroupHandleUp() {
    window.removeEventListener('pointermove', onGroupHandleMove);
    window.removeEventListener('pointerup', onGroupHandleUp);
    const current = groupDragRef.current;
    groupDragRef.current = null;
    setGroupDragPos(null);
    if (!current || (!current.dx && !current.dy)) return;
    onMoveIslandGroup?.(current.groupId, current.dx, current.dy);
  }

  // ---- Pan ----

  function startPan(e) {
    // Without this, a real mouse drag over the map tries to select text or
    // ghost-drag an underlying image instead of panning — synthetic test
    // events don't trigger that, which is why this was easy to miss.
    e.preventDefault();
    const stage = wrapRef.current.parentElement;
    panRef.current = { startX: e.clientX, startY: e.clientY, scrollLeft: stage.scrollLeft, scrollTop: stage.scrollTop };
    window.addEventListener('pointermove', onPanMove);
    window.addEventListener('pointerup', onPanUp);
  }

  function onPanMove(e) {
    if (!panRef.current) return;
    const stage = wrapRef.current.parentElement;
    stage.scrollLeft = panRef.current.scrollLeft - (e.clientX - panRef.current.startX);
    stage.scrollTop = panRef.current.scrollTop - (e.clientY - panRef.current.startY);
  }

  function onPanUp() {
    window.removeEventListener('pointermove', onPanMove);
    window.removeEventListener('pointerup', onPanUp);
    panRef.current = null;
  }

  // ---- Ruler ----

  function handleStagePointerDown(e) {
    if (tool === 'pan') {
      startPan(e);
      return;
    }
    if (tool !== 'ruler') return;
    const p = getRelativePoint(e.clientX, e.clientY);
    const found = findIslandAt(p.x, p.y);
    if (!found) return;
    const cell = pixelToCell(p.x - found.left, p.y - found.top, found.cellSize, found.island.cols, found.island.rows);
    const point = { islandId: found.island.id, ...cell };
    setRuler({ start: point, end: point });
    window.addEventListener('pointermove', onRulerMove);
    window.addEventListener('pointerup', onRulerUp);
  }

  function onRulerMove(e) {
    const p = getRelativePoint(e.clientX, e.clientY);
    const found = findIslandAt(p.x, p.y);
    if (!found) return;
    const cell = pixelToCell(p.x - found.left, p.y - found.top, found.cellSize, found.island.cols, found.island.rows);
    setRuler((prev) => (prev ? { ...prev, end: { islandId: found.island.id, ...cell } } : prev));
  }

  function onRulerUp() {
    window.removeEventListener('pointermove', onRulerMove);
    window.removeEventListener('pointerup', onRulerUp);
  }

  function handleStageClick() {
    if (tool === 'play') onSelectEntity(null);
  }

  // Resolves a ruler endpoint to an absolute canvas pixel point (center of
  // its cell), regardless of which island it's on.
  function rulerPoint(point) {
    const r = islandRects[point.islandId];
    if (!r) return null;
    const left = (r.x - originX) * zoom;
    const top = (r.y - originY) * zoom;
    return { x: left + point.col * r.cellSize + r.cellSize / 2, y: top + point.row * r.cellSize + r.cellSize / 2 };
  }

  let rulerLine = null;
  if (ruler) {
    const p1 = rulerPoint(ruler.start);
    const p2 = rulerPoint(ruler.end);
    if (p1 && p2) {
      let feet;
      if (ruler.start.islandId === ruler.end.islandId) {
        feet = feetDistance(ruler.start, ruler.end, feetPerSquare);
      } else {
        // Different islands: the 5-10-5 diagonal rule doesn't translate
        // across two independent grids, so fall back to straight-line
        // distance using the starting island's scale.
        const cellSize = islandRects[ruler.start.islandId].cellSize;
        const pixelDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        feet = Math.round((pixelDist / cellSize) * feetPerSquare);
      }
      rulerLine = { p1, p2, feet };
    }
  }

  return (
    <div
      ref={wrapRef}
      className={`island-canvas tool-${tool}`}
      style={{ width: canvasWidth, height: canvasHeight }}
      onPointerDown={handleStagePointerDown}
      onClick={handleStageClick}
    >
      {islandOrder.map((id) => {
        const r = islandRects[id];
        if (!r) return null;
        const island = r.island;
        const left = (r.x - originX) * zoom;
        const top = (r.y - originY) * zoom;
        const w = island.cols * island.cellSize * zoom;
        const h = island.rows * island.cellSize * zoom;
        const cellPx = island.cellSize * zoom;
        const isPendingGroupMember = pendingGroupIslandIds.includes(id);
        // This island's own day/night setting, else the table clock's phase.
        const phase = DAY_PHASES[islandPhase(island, dayPhase)];

        return (
          <div
            key={id}
            className={`grid-wrap${activeIslandId === id ? ' active' : ''}${isPendingGroupMember ? ' pending-group-member' : ''}`}
            style={{
              left,
              top,
              width: w,
              height: h,
              backgroundImage: island.backgroundImage ? `url(${island.backgroundImage})` : undefined,
            }}
            onPointerDown={(e) => handleIslandPointerDown(e, island)}
          >
            {/* A grouped island's own label is suppressed — the group's
                single shared title (rendered below) stands in for it. */}
            {!groupIdByIslandId.has(id) && <div className="island-label">{island.name}</div>}
            {/* Condition badges (fog, fire, ...) sit on the island's top edge for
                everyone - a grouped island keeps its own, unlike the label. */}
            {(phase || island.conditions?.length > 0) && (
              <div className="island-conditions">
                {phase && <img src={phase.imageUrl} alt={phase.label} title={`${phase.label} — ${phase.description}`} />}
                {(island.conditions || []).map((key) => {
                  const c = getIslandCondition(key);
                  if (!c) return null;
                  return <img key={key} src={c.imageUrl} alt={c.label} title={`${c.label} — ${c.description}`} />;
                })}
              </div>
            )}
            <svg className="grid-svg" width={w} height={h}>
              {Array.from({ length: island.cols + 1 }).map((_, v) => (
                <line key={'v' + v} x1={v * cellPx} y1={0} x2={v * cellPx} y2={h} stroke="rgba(23,20,15,0.28)" strokeWidth={v % 5 === 0 ? 1.4 : 0.7} />
              ))}
              {Array.from({ length: island.rows + 1 }).map((_, hh) => (
                <line key={'h' + hh} x1={0} y1={hh * cellPx} x2={w} y2={hh * cellPx} stroke="rgba(23,20,15,0.28)" strokeWidth={hh % 5 === 0 ? 1.4 : 0.7} />
              ))}
            </svg>
            {/* Dusk/night/dawn tint - over the map art and grid, under the tokens. */}
            {phase?.tint && <div className="island-daynight" style={{ background: phase.tint }} />}
          </div>
        );
      })}

      {/* An island group's invisible bounding box — the dashed outline and
          drag handle are host/Edit-tool-only editing chrome; the shared
          title label always shows, for everyone, in place of each member's
          own label. */}
      {Object.values(islandGroups).map((group) => {
        const memberRects = group.islandIds.map((memberId) => islandRects[memberId]).filter(Boolean);
        if (memberRects.length < 2) return null;
        const left = Math.min(...memberRects.map((r) => (r.x - originX) * zoom));
        const top = Math.min(...memberRects.map((r) => (r.y - originY) * zoom));
        const right = Math.max(...memberRects.map((r) => (r.x - originX) * zoom + r.w));
        const bottom = Math.max(...memberRects.map((r) => (r.y - originY) * zoom + r.h));
        const showChrome = isHost && tool === 'edit';
        return (
          <div
            key={group.id}
            className={`group-bbox${showChrome ? '' : ' group-bbox-hidden'}`}
            style={{ left, top, width: right - left, height: bottom - top }}
          >
            {showChrome && (
              <div
                className="group-handle"
                onPointerDown={(e) => handleGroupHandlePointerDown(e, group.id)}
                title="Drag to move the whole group"
              />
            )}
            <div className="group-label">{group.name}</div>
          </div>
        );
      })}

      {/* Doors render last (on top) regardless of entityOrder, so one stays
          clickable/openable even when a hero token shares its square —
          otherwise whichever happened to be placed more recently would
          silently swallow the click. Traps render first (underneath) for the
          opposite reason: one can cover up to 5x5 squares, and must not
          swallow clicks meant for the heroes and monsters standing on it. */}
      {[...entityOrder]
        .sort((a, b) => tokenStackRank(entities[a]) - tokenStackRank(entities[b]))
        .map((id) => {
          const entity = entities[id];
          if (!entity) return null;
          const r = islandRects[entity.islandId];
          if (!r) return null; // entity's island doesn't exist on this layer view
          const islandLeft = (r.x - originX) * zoom;
          const islandTop = (r.y - originY) * zoom;
          const isDragging = dragPos?.id === id;
          const size = r.cellSize * (entity.size || 1) - 6;
          const cx = isDragging ? dragPos.x : islandLeft + entity.col * r.cellSize + (r.cellSize * (entity.size || 1)) / 2;
          const cy = isDragging ? dragPos.y : islandTop + entity.row * r.cellSize + (r.cellSize * (entity.size || 1)) / 2;

          return (
            <div
              key={id}
              className={`token${entity.kind === 'door' ? ' door' : ''}${entity.kind === 'trap' && !entity.trapRevealed ? ' trap-hidden' : ''}${isDragging ? ' dragging' : ''}${selectedId === id ? ' selected' : ''}`}
              style={{
                width: size,
                height: size,
                left: cx - size / 2,
                top: cy - size / 2,
                backgroundImage: `url(${entity.imageUrl})`,
                borderColor: entity.color || 'rgba(0,0,0,0.55)',
              }}
              onPointerDown={(e) => handleTokenPointerDown(e, entity)}
              onClick={(e) => e.stopPropagation()}
              title={entity.kind === 'trap' && !entity.trapRevealed ? `${entity.name} (hidden from players)` : entity.name}
            >
              <span className="token-label">{entity.name}</span>
              {entity.kind !== 'door' && entity.initiativeTurn != null && (
                <span className="token-initiative" title={`Initiative: rolled ${entity.initiativeRoll}, turn ${entity.initiativeTurn}`}>
                  👢{entity.initiativeTurn}
                </span>
              )}
              {entity.kind !== 'door' && entity.maxHp ? (
                <span className="token-hp">
                  {entity.hp}/{entity.maxHp}
                </span>
              ) : null}
              {entity.kind !== 'door' && entity.conditions?.length > 0 && (
                <span className="token-conditions">
                  {entity.conditions.map((key) => {
                    const c = CONDITIONS.find((cond) => cond.key === key);
                    if (!c) return null;
                    return <img key={key} src={c.imageUrl} alt={c.label} title={`${c.label} — ${c.description}`} />;
                  })}
                </span>
              )}
            </div>
          );
        })}

      {rulerLine && (
        <svg className="grid-svg ruler-overlay" width={canvasWidth} height={canvasHeight}>
          <RulerOverlay p1={rulerLine.p1} p2={rulerLine.p2} feet={rulerLine.feet} />
        </svg>
      )}
    </div>
  );
}

function RulerOverlay({ p1, p2, feet }) {
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;
  const label = `${feet} ft`;

  return (
    <g>
      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} className="ruler-line" />
      <circle cx={p1.x} cy={p1.y} r={4} fill="var(--ember)" />
      <circle cx={p2.x} cy={p2.y} r={4} fill="var(--ember)" />
      <rect x={midX - label.length * 3.6 - 6} y={midY - 22} width={label.length * 7.2 + 12} height={18} rx={3} className="ruler-label-bg" />
      <text x={midX} y={midY - 9} textAnchor="middle" className="ruler-label">
        {label}
      </text>
    </g>
  );
}
