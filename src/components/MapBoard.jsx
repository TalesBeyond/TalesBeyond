import React, { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import { pixelToCell, feetDistance, feetAlongLine, computeCanvasBounds, gridLineStyle } from '../utils/grid.js';
import { CONDITIONS } from '../data/conditions.js';
import { isHiddenFromPlayers, isLockedDoor, isLockedChest } from '../data/visibility.js';
import { ambushMonsterCount } from '../data/ambush.js';
import { isCreature } from '../data/tokenKinds.js';
import { getIslandCondition } from '../data/islandConditions.js';
import { DAY_PHASES, islandPhase } from '../data/dayPhases.js';
import { useFx } from '../lib/fx.js';
import {
  finishPencilPoints,
  shapeGeometry,
  shapeFeetLabel,
  hitsDrawing,
  drawingBounds,
  drawingHandles,
  islandFillColour,
  movedGeometry,
  resizedGeometry,
} from '../utils/drawing.js';
import { areaShape, areaLabel, areaOutline, outlineBounds, outlineContains } from '../utils/areaOfEffect.js';
import IslandDrawings from './DrawingLayer.jsx';
import IslandFogOfWar from './FogOfWarLayer.jsx';
import { clippedFogChunk, fogChunksOnIsland, fogChunkRectFromDrag, fogChunkRectFromEdit, fogChunkGrabAt, isSquareFogged, smallestFogChunkAt } from '../utils/fogOfWar.js';
import { resolveImage, useImageCacheVersion } from '../lib/imageCache.js';
import { entityImageSrc } from '../lib/storedImages.js';

const CLICK_MOVE_THRESHOLD_PX = 6;
const FOG_HANDLE_REACH_PX = 8; // how near a press must be to a picked fog chunk's handle to take it
const FLOAT_MS = 1300; // how long a hit number drifts up over a token
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
  dayPhase = null,
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
  tool, // 'play' | 'edit' | 'pan' | 'ruler' | 'draw' | 'area' | 'fogofwar'
  zoom = 1,
  onRulerChange,
  moveRange = null, // { islandId, cells: [{col,row}] } — the acting token's reach this turn
  actorId = null, // whose turn it is, during an encounter
  gestureRef = null, // touch gestures (GameView): { panned } — set when a touch just panned the map, so its closing click is ignored
  onTapCell = null, // phone layout: (islandId, col, row) => true when the tap was used (a move or a planned move)
  plannedMove = null, // phone layout: { entityId, islandId, col, row, confirmLabel, note, onConfirm, onCancel } — a move waiting for "Move here"
  tokenActions = null, // phone layout: the selected token's actions, fanned around it — [{ id, label, icon, primary, onPress }]
  areas = [], // area-of-effect templates on this layer (utils/areaOfEffect.js), each with `removable` for this viewer
  areaDraft = null, // Area tool: the template being aimed
  onAreaAim = null, // (patch) => void — the draft's origin, aim point or angle, from a press or drag
  onRemoveArea = null, // (id) => void
  drawings = {}, // the DM's drawings (utils/drawing.js), keyed by id
  drawingOrder = [], // creation order — later drawings paint on top
  hideDrawings = false, // this viewer's "Hide drawings"
  drawSettings = null, // Draw tool: { subTool, style, snap }
  onAddDrawing = null, // (drawing without an id) => void — the DM only
  onUpdateDrawing = null, // (drawing) => void — a move or resize, the DM only
  onRemoveDrawings = null, // (ids, sweepKey) => void — the eraser, the DM only
  selectedDrawingId = null, // the drawing Select has picked
  onSelectDrawing = null, // (id | null) => void
  fogChunks = {}, // Fog of war's chunks (utils/fogOfWar.js), keyed by id
  fogChunkOrder = [], // creation order
  selectedFogChunkId = null, // the chunk the DM has picked
  onSelectFogChunk = null, // (id | null) => void — the DM only
  onAddFogChunk = null, // ({ islandId, x, y, w, h }) => void — the Fog of war tool, the DM only
  onUpdateFogChunk = null, // ({ id, x, y, w, h }) => void — the picked chunk, moved or resized
}) {
  const tapConsumedRef = useRef(false); // the click that follows a used tap mustn't clear the selection
  useImageCacheVersion(); // redraw when a shared picture arrives
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
  // The shape the DM is drawing right now (Draw tool), shown in its island
  // until the pointer lifts. The ref holds the live copy the move/up
  // handlers read; `draft` is what renders.
  const drawRef = useRef(null);
  const [draft, setDraft] = useState(null);
  // A drawing being moved or resized with Select: { id, geometry } shown in
  // place of the stored one until the pointer lifts.
  const [editPreview, setEditPreview] = useState(null);

  // Hit numbers (lib/fx.js 'float' events): −7, a critical −18, +9, MISS —
  // each drifts up from its token and fades.
  const [floats, setFloats] = useState([]);
  const floatSeq = useRef(0);
  useFx((event) => {
    if (event.type !== 'float') return;
    const key = ++floatSeq.current;
    setFloats((prev) => [...prev, { ...event, key }]);
    setTimeout(() => setFloats((prev) => prev.filter((f) => f.key !== key)), FLOAT_MS);
  });

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
  // Each island's drawings, oldest first.
  const drawingsByIsland = new Map();
  if (!hideDrawings) {
    for (const id of drawingOrder) {
      const stored = drawings[id];
      if (!stored || !islandRects[stored.islandId]) continue;
      const d = editPreview?.id === id ? { ...stored, geometry: editPreview.geometry } : stored;
      if (!drawingsByIsland.has(d.islandId)) drawingsByIsland.set(d.islandId, []);
      drawingsByIsland.get(d.islandId).push(d);
    }
  }
  // The latest copy for the window listeners of a drag that began in an
  // earlier render (the eraser removes drawings while it's still down).
  const drawingsRef = useRef(drawingsByIsland);
  drawingsRef.current = drawingsByIsland;
  // Each island's fog chunks (Fog of war), in creation order — and the
  // latest copy, for the same reason.
  const fogByIsland = new Map();
  for (const id of islandOrder) {
    if (!islandRects[id]) continue;
    const onIsland = fogChunksOnIsland(fogChunks, fogChunkOrder, id);
    if (onIsland.length) fogByIsland.set(id, onIsland);
  }
  const fogRef = useRef(fogByIsland);
  fogRef.current = fogByIsland;
  // The rectangle the DM is dragging out with the Fog of war tool:
  // { islandId, x, y, w, h }, shown until the pointer lifts.
  const fogDragRef = useRef(null);
  const [fogDraft, setFogDraft] = useState(null);
  // Where the picked chunk stands while the DM moves or resizes it:
  // { id, islandId, x, y, w, h }. Written once, when the pointer lifts.
  const [fogEdit, setFogEdit] = useState(null);

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
    if (!isHost && isLockedDoor(entity)) return; // a locked door isn't a player's to click: no selection, no "Open the door?"
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
    // A move the table refuses outright (a player's hero into a held-back
    // fog chunk) comes back false: the token never lands — it is not held at
    // the drop square — and no door is offered.
    if (onMoveEntity(current.id, col, row, found.island.id) === false) {
      setDragPos(null);
      return;
    }
    holdDragAt(current.id, size, col, row, found.island.id, found);
    // Landing a hero token on a door's square (via an actual drag, not a
    // bare click/reselect) offers to walk through it. The DM gets the same
    // offer for any hero, monster or NPC they drop on a door.
    const canUseDoor = isHost ? isCreature(current.entity) : current.entity.kind === 'hero';
    if (canUseDoor && !isClick) {
      const door = findDoorAt(found.island.id, col, row);
      if (door) {
        console.log(`${current.entity.name} landed on door "${door.name}" at (${col}, ${row})`);
        onEnterDoor?.(door, current.entity);
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
    if (tool === 'ruler' || tool === 'pan' || tool === 'draw' || tool === 'area' || tool === 'fogofwar') return;
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

    // A phone pan scrolls the map under a still finger, so the island would
    // otherwise read it as a click and select itself.
    if (gestureRef?.current?.panned) return;

    const p = getRelativePoint(e.clientX, e.clientY);
    const moved = Math.hypot(p.x - current.downX, p.y - current.downY);
    const isClick = moved < CLICK_MOVE_THRESHOLD_PX;

    // A tap on a square with a movable token selected moves it (or plans the
    // move, mid-encounter) instead of selecting the island.
    if (isClick && tool === 'play' && onTapCell) {
      const found = findIslandAt(p.x, p.y);
      if (found) {
        const { col, row } = pixelToCell(p.x - found.left, p.y - found.top, found.cellSize, found.island.cols, found.island.rows);
        if (onTapCell(found.island.id, col, row)) {
          tapConsumedRef.current = true;
          return;
        }
      }
    }

    // The DM's click on an empty square of a fogged chunk picks that chunk
    // (Fog of war). A revealed chunk isn't picked this way, so clicks on
    // explored ground behave as they always did.
    if (isClick && tool === 'play' && isHost && onSelectFogChunk) {
      const found = findIslandAt(p.x, p.y);
      if (found) {
        const { col, row } = pixelToCell(p.x - found.left, p.y - found.top, found.cellSize, found.island.cols, found.island.rows);
        const hit = smallestFogChunkAt(fogRef.current.get(found.island.id) || [], found.island, col, row, { unrevealedOnly: true });
        if (hit) {
          onSelectFogChunk(hit.id);
          tapConsumedRef.current = true;
          return;
        }
      }
    }

    // Selecting the "active" island (for placing new tokens) is the Edit
    // tool's: a click on the map during play must not change it.
    if (tool !== 'play') onSelectIsland(current.id);
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

  // Desktop: holding the right mouse button anywhere over the map view pans
  // it, in every tool and over tokens and islands alike. Caught on the way
  // down (capture) so nothing underneath selects or drags; the browser's
  // context menu is suppressed over the map.
  useEffect(() => {
    const stage = wrapRef.current?.parentElement;
    if (!stage) return undefined;
    function onRightDown(e) {
      if (e.pointerType !== 'mouse' || e.button !== 2) return;
      e.stopPropagation();
      stage.classList.add('right-panning');
      startPan(e);
      const done = () => {
        stage.classList.remove('right-panning');
        window.removeEventListener('pointerup', done);
      };
      window.addEventListener('pointerup', done);
    }
    function onContextMenu(e) {
      e.preventDefault();
    }
    stage.addEventListener('pointerdown', onRightDown, true);
    stage.addEventListener('contextmenu', onContextMenu);
    return () => {
      stage.removeEventListener('pointerdown', onRightDown, true);
      stage.removeEventListener('contextmenu', onContextMenu);
    };
    // startPan and its move/up handlers only touch refs, so the first
    // render's copies stay correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Draw ----
  // A press on an island starts a shape there — even on a token, which lets
  // the press through outside the Play tool. The shape stays on that island
  // whatever the pointer crosses; the island's SVG cuts off what's outside.
  // Select picks the topmost drawing under the pointer (or a handle of the
  // selected one) and drags it; Eraser removes every drawing it touches.
  // drawRef.current.mode says which: 'create' | 'edit' | 'erase'.

  function toIslandSquares(e, islandId) {
    const r = islandRects[islandId];
    if (!r) return null;
    const p = getRelativePoint(e.clientX, e.clientY);
    const left = (r.x - originX) * zoom;
    const top = (r.y - originY) * zoom;
    return [(p.x - left) / r.cellSize, (p.y - top) / r.cellSize];
  }

  // What the unfinished shape looks like right now, or null when it has no
  // size yet.
  function draftFrom(d) {
    if (d.kind === 'pencil') return { id: 'draft', islandId: d.islandId, kind: 'pencil', geometry: { points: d.raw }, style: d.style };
    const geometry = shapeGeometry(d.kind, d.start, d.end, d.snap);
    return geometry ? { id: 'draft', islandId: d.islandId, kind: d.kind, geometry, style: d.style } : null;
  }

  // How far a press may miss a drawing's line and still hit it, in squares
  // (a finger gets more room than a mouse).
  function hitTolerance(e, cellSize) {
    return Math.max(0.15, (e.pointerType === 'mouse' ? 6 : 14) / cellSize);
  }

  function startDrawing(e) {
    if (!isHost || !drawSettings || !onAddDrawing) return;
    if (drawRef.current) {
      cancelDrawing();
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = getRelativePoint(e.clientX, e.clientY);
    const found = findIslandAt(p.x, p.y);
    const subTool = drawSettings.subTool;

    if (subTool === 'select') {
      e.preventDefault();
      if (!startEditing(e, p, found)) onSelectDrawing?.(null);
      return;
    }
    if (subTool === 'eraser') {
      e.preventDefault();
      drawRef.current = { mode: 'erase', erased: new Set(), sweep: `erase-${Date.now()}` };
      eraseAt(e);
      listenWhileDrawing();
      return;
    }
    if (!found) return;
    e.preventDefault();
    if (subTool === 'fill') {
      fillIsland(found.island.id);
      return;
    }
    const start = toIslandSquares(e, found.island.id);
    drawRef.current = {
      mode: 'create',
      islandId: found.island.id,
      kind: subTool,
      raw: [start],
      start,
      end: start,
      snap: drawSettings.snap,
      style: { ...drawSettings.style },
    };
    setDraft(draftFrom(drawRef.current));
    listenWhileDrawing();
  }

  // Fill: paints the whole island one colour. A press on an island that
  // already has a fill recolours it; the same colour and opacity again
  // takes it off.
  function fillIsland(islandId) {
    const style = { color: drawSettings.style.color, opacity: drawSettings.style.opacity ?? 1 };
    const fills = drawingOrder.map((id) => drawings[id]).filter((d) => d?.islandId === islandId && d.kind === 'fill');
    const existing = fills[fills.length - 1];
    if (!existing) onAddDrawing({ islandId, kind: 'fill', geometry: {}, style });
    else if (existing.style?.color === style.color && (existing.style?.opacity ?? 1) === style.opacity) onRemoveDrawings?.(fills.map((d) => d.id));
    else onUpdateDrawing?.({ ...existing, style });
  }

  // Select: a handle of the selected drawing first (they can sit past the
  // island's edge), then the topmost drawing under the pointer. Returns
  // false when the press hit nothing.
  function startEditing(e, p, found) {
    const selected = selectedDrawingId && drawings[selectedDrawingId];
    const selectedRect = selected && islandRects[selected.islandId];
    if (selected && selectedRect) {
      const left = (selectedRect.x - originX) * zoom;
      const top = (selectedRect.y - originY) * zoom;
      const grab = e.pointerType === 'mouse' ? 9 : 22;
      const handle = drawingHandles(selected).find(
        (h) => Math.hypot(left + h.at[0] * selectedRect.cellSize - p.x, top + h.at[1] * selectedRect.cellSize - p.y) <= grab
      );
      if (handle) {
        beginEdit(e, selected, 'handle', handle.id);
        return true;
      }
    }
    if (!found) return false;
    const point = toIslandSquares(e, found.island.id);
    const onIsland = drawingsRef.current.get(found.island.id) || [];
    const tolerance = hitTolerance(e, found.cellSize);
    const hit = [...onIsland].reverse().find((d) => hitsDrawing(d, point, tolerance));
    if (!hit) return false;
    onSelectDrawing?.(hit.id);
    beginEdit(e, hit, 'move', null);
    return true;
  }

  function beginEdit(e, drawing, op, handle) {
    drawRef.current = {
      mode: 'edit',
      op,
      handle,
      drawing,
      islandId: drawing.islandId,
      start: toIslandSquares(e, drawing.islandId),
      snap: drawSettings.snap,
      geometry: drawing.geometry,
    };
    listenWhileDrawing();
  }

  // A moved drawing keeps the middle of its bounding box on its island, so
  // it can hang over the edge but never leave.
  function clampMove(drawing, dx, dy) {
    const island = islandRects[drawing.islandId]?.island;
    if (!island) return [dx, dy];
    const [x0, y0, x1, y1] = drawingBounds(drawing);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    return [Math.min(island.cols - cx, Math.max(-cx, dx)), Math.min(island.rows - cy, Math.max(-cy, dy))];
  }

  function eraseAt(e) {
    const d = drawRef.current;
    const p = getRelativePoint(e.clientX, e.clientY);
    const found = findIslandAt(p.x, p.y);
    if (!found) return;
    const point = toIslandSquares(e, found.island.id);
    const tolerance = hitTolerance(e, found.cellSize) + 0.15;
    const doomed = (drawingsRef.current.get(found.island.id) || [])
      .filter((drawing) => !d.erased.has(drawing.id) && hitsDrawing(drawing, point, tolerance))
      .map((drawing) => drawing.id);
    if (!doomed.length) return;
    doomed.forEach((id) => d.erased.add(id));
    onRemoveDrawings?.(doomed, d.sweep);
  }

  function listenWhileDrawing() {
    window.addEventListener('pointermove', onDrawMove);
    window.addEventListener('pointerup', onDrawUp);
    window.addEventListener('pointercancel', cancelDrawing);
  }

  function onDrawMove(e) {
    const d = drawRef.current;
    if (!d) return;
    if (gestureRef?.current?.pinch) {
      cancelDrawing();
      return;
    }
    if (d.mode === 'erase') {
      eraseAt(e);
      return;
    }
    const point = toIslandSquares(e, d.islandId);
    if (!point) return;
    if (d.mode === 'edit') {
      let geometry;
      if (d.op === 'move') {
        const [dx, dy] = clampMove(d.drawing, point[0] - d.start[0], point[1] - d.start[1]);
        geometry = movedGeometry(d.drawing, dx, dy, d.snap);
      } else {
        geometry = resizedGeometry(d.drawing, d.handle, point, d.snap) || d.geometry;
      }
      d.geometry = geometry;
      setEditPreview({ id: d.drawing.id, geometry });
      return;
    }
    if (d.kind === 'pencil') d.raw = [...d.raw, point];
    else d.end = point;
    setDraft(draftFrom(d));
  }

  function stopDrawingListeners() {
    window.removeEventListener('pointermove', onDrawMove);
    window.removeEventListener('pointerup', onDrawUp);
    window.removeEventListener('pointercancel', cancelDrawing);
  }

  function onDrawUp() {
    stopDrawingListeners();
    const d = drawRef.current;
    drawRef.current = null;
    setDraft(null);
    setEditPreview(null);
    if (!d || d.mode === 'erase') return;
    if (d.mode === 'edit') {
      if (JSON.stringify(d.geometry) !== JSON.stringify(d.drawing.geometry)) onUpdateDrawing?.({ ...d.drawing, geometry: d.geometry });
      return;
    }
    if (d.kind === 'pencil') {
      const points = finishPencilPoints(d.raw);
      if (points) onAddDrawing({ islandId: d.islandId, kind: 'pencil', geometry: { points }, style: d.style });
      return;
    }
    const geometry = shapeGeometry(d.kind, d.start, d.end, d.snap);
    if (geometry) onAddDrawing({ islandId: d.islandId, kind: d.kind, geometry, style: d.style });
  }

  function cancelDrawing() {
    stopDrawingListeners();
    drawRef.current = null;
    setDraft(null);
    setEditPreview(null);
  }

  // ---- Fog of war ----
  // A drag on an island lays a fog chunk there: a draft rectangle in whole
  // squares, clipped to that island, saved when the pointer lifts. A press
  // that never became a drag picks the chunk under it instead (the smallest,
  // where several overlap), or drops the selection on empty ground.
  //
  // A drag that starts on the picked chunk edits it instead: a handle (a
  // corner or the middle of a side) resizes it, its body moves it — in whole
  // squares, previewed live, and written once when the pointer lifts.

  // What a press at `point` took hold of on the picked chunk: { chunk, box,
  // edges } (edges null for its body), or null when it missed.
  function fogGrabAt(found, point) {
    if (!onUpdateFogChunk || !selectedFogChunkId || !point) return null;
    const chunk = (fogRef.current.get(found.island.id) || []).find((c) => c.id === selectedFogChunkId);
    const box = chunk && clippedFogChunk(chunk, found.island);
    if (!box) return null;
    const edges = fogChunkGrabAt(box, point, FOG_HANDLE_REACH_PX / found.cellSize);
    return edges === undefined ? null : { chunk, box, edges };
  }

  function startFogOfWar(e) {
    if (!isHost || !onAddFogChunk) return;
    if (fogDragRef.current) {
      cancelFogOfWar();
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = getRelativePoint(e.clientX, e.clientY);
    const found = findIslandAt(p.x, p.y);
    if (!found) {
      onSelectFogChunk?.(null);
      return;
    }
    e.preventDefault();
    // The pressed map becomes the active one: the one "Fog whole island" covers.
    onSelectIsland?.(found.island.id);
    const start = toIslandSquares(e, found.island.id);
    fogDragRef.current = { islandId: found.island.id, start, downX: p.x, downY: p.y, dragged: false, rect: null, grab: fogGrabAt(found, start) };
    window.addEventListener('pointermove', onFogMove);
    window.addEventListener('pointerup', onFogUp);
    window.addEventListener('pointercancel', cancelFogOfWar);
  }

  function onFogMove(e) {
    const d = fogDragRef.current;
    if (!d) return;
    if (gestureRef?.current?.pinch) {
      cancelFogOfWar();
      return;
    }
    const p = getRelativePoint(e.clientX, e.clientY);
    if (!d.dragged && Math.hypot(p.x - d.downX, p.y - d.downY) < CLICK_MOVE_THRESHOLD_PX) return;
    d.dragged = true;
    const island = islandRects[d.islandId]?.island;
    const point = toIslandSquares(e, d.islandId);
    if (!island || !point) return;
    if (d.grab) {
      d.rect = fogChunkRectFromEdit(d.grab.box, d.grab.edges, d.start, point, island);
      setFogEdit({ id: d.grab.chunk.id, islandId: d.islandId, ...d.rect });
      return;
    }
    d.rect = fogChunkRectFromDrag(d.start, point, island);
    setFogDraft(d.rect ? { islandId: d.islandId, ...d.rect } : null);
  }

  function stopFogListeners() {
    window.removeEventListener('pointermove', onFogMove);
    window.removeEventListener('pointerup', onFogUp);
    window.removeEventListener('pointercancel', cancelFogOfWar);
  }

  function onFogUp() {
    stopFogListeners();
    const d = fogDragRef.current;
    fogDragRef.current = null;
    setFogDraft(null);
    setFogEdit(null);
    if (!d) return;
    if (!d.dragged) {
      const island = islandRects[d.islandId]?.island;
      const hit = island ? smallestFogChunkAt(fogRef.current.get(d.islandId) || [], island, Math.floor(d.start[0]), Math.floor(d.start[1])) : null;
      onSelectFogChunk?.(hit ? hit.id : null);
      return;
    }
    if (d.grab) {
      const { chunk, box } = d.grab;
      const r = d.rect;
      const changed = r && (r.x !== box.x0 || r.y !== box.y0 || r.w !== box.x1 - box.x0 || r.h !== box.y1 - box.y0);
      if (changed) onUpdateFogChunk({ id: chunk.id, ...r });
      return;
    }
    if (d.rect) onAddFogChunk({ islandId: d.islandId, ...d.rect });
  }

  function cancelFogOfWar() {
    stopFogListeners();
    fogDragRef.current = null;
    setFogDraft(null);
    setFogEdit(null);
  }

  // The corner tag of a revealed chunk: the one thing of it the DM can click
  // in Play. On the phone a tap with a movable token in hand is a move first
  // (onTapCell), like a tap anywhere else on the map.
  function handleFogTagPick(chunk, island, col, row) {
    if (tool !== 'play' || gestureRef?.current?.panned) return;
    if (onTapCell?.(island.id, col, row)) return;
    onSelectFogChunk?.(chunk.id);
  }

  // ---- Ruler ----

  function handleStagePointerDown(e) {
    if (tool === 'pan') {
      startPan(e);
      return;
    }
    if (tool === 'draw') {
      startDrawing(e);
      return;
    }
    if (tool === 'fogofwar') {
      startFogOfWar(e);
      return;
    }
    if (tool === 'area') {
      startAreaAim(e);
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
    if (tapConsumedRef.current) {
      tapConsumedRef.current = false;
      return;
    }
    if (gestureRef?.current?.panned) return;
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

  // Feet per square on one island (its own, else the layer's).
  const feetOn = (islandId) => islands[islandId]?.feetPerSquare || feetPerSquare || 5;

  let rulerLine = null;
  if (ruler) {
    const p1 = rulerPoint(ruler.start);
    const p2 = rulerPoint(ruler.end);
    if (p1 && p2) {
      let feet;
      if (ruler.start.islandId === ruler.end.islandId) {
        feet = feetDistance(ruler.start, ruler.end, feetOn(ruler.start.islandId));
      } else {
        // Different islands: the 5-10-5 diagonal rule doesn't translate
        // across independent grids, so it's a straight line — and each
        // stretch of it counts at the scale of the island it crosses (a gap
        // at the last island's), whichever end it started from.
        const areas = islandOrder
          .filter((id) => islandRects[id])
          .map((id) => {
            const r = islandRects[id];
            return { left: (r.x - originX) * zoom, top: (r.y - originY) * zoom, w: r.w, h: r.h, feetPerPx: feetOn(id) / r.cellSize };
          });
        feet = Math.round(feetAlongLine(p1, p2, areas));
      }
      rulerLine = { p1, p2, feet };
    }
  }

  // ---- Areas of effect (utils/areaOfEffect.js) ----
  // A template is measured on one island's grid: its token's, or the one it
  // was laid on. A press (and the drag after it) in the Area tool aims the
  // draft: a shape with a direction turns towards the pointer, one centred on
  // a point goes to it. With no token to cast from, the first press is the
  // origin.

  const areaAimRef = useRef(null); // { islandId, aim: 'direction' | 'point', at } while the pointer is down

  function squaresAt(p, islandId) {
    const r = islandRects[islandId];
    return [(p.x - (r.x - originX) * zoom) / r.cellSize, (p.y - (r.y - originY) * zoom) / r.cellSize];
  }
  // Corners and centres of squares, where a spell's point of origin goes.
  const snapHalf = ([x, y]) => [Math.round(x * 2) / 2, Math.round(y * 2) / 2];

  function areaAimPatch(p) {
    const { islandId, aim, at } = areaAimRef.current;
    const at2 = squaresAt(p, islandId);
    if (aim === 'point') return { islandId, aim: snapHalf(at2) };
    const dx = at2[0] - at[0];
    const dy = at2[1] - at[1];
    return Math.hypot(dx, dy) < 0.15 ? {} : { angle: Math.atan2(dy, dx) };
  }

  function startAreaAim(e) {
    const shape = areaDraft && areaShape(areaDraft.shape);
    if (!shape || shape.aim === 'self' || !onAreaAim) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = getRelativePoint(e.clientX, e.clientY);
    const entity = areaDraft.entityId ? entities[areaDraft.entityId] : null;
    let islandId = entity ? entity.islandId : areaDraft.islandId;
    let origin = areaDraft.origin;
    const patch = {};
    if (!entity && (shape.aim === 'point' || !origin)) {
      const found = findIslandAt(p.x, p.y);
      if (found) islandId = found.island.id;
      if (!islandRects[islandId]) return;
      patch.islandId = islandId;
      if (shape.aim === 'direction') {
        origin = snapHalf(squaresAt(p, islandId));
        patch.origin = origin;
      }
    }
    if (!islandRects[islandId]) return;
    e.preventDefault();
    const span = entity?.size || 1;
    areaAimRef.current = { islandId, aim: shape.aim, at: entity ? [entity.col + span / 2, entity.row + span / 2] : origin };
    onAreaAim({ ...patch, ...areaAimPatch(p) });
    window.addEventListener('pointermove', onAreaAimMove);
    window.addEventListener('pointerup', onAreaAimUp);
  }

  function onAreaAimMove(e) {
    if (areaAimRef.current) onAreaAim(areaAimPatch(getRelativePoint(e.clientX, e.clientY)));
  }

  function onAreaAimUp() {
    window.removeEventListener('pointermove', onAreaAimMove);
    window.removeEventListener('pointerup', onAreaAimUp);
    areaAimRef.current = null;
  }

  // Where a template sits this render: its outline in pixels, the squares it
  // covers on every island (those whose centre is inside) and the creatures
  // standing on them. Null while it can't be drawn — its token is on another
  // map, or it hasn't been given an origin yet.
  function areaView(area, isDraft) {
    const shape = areaShape(area.shape);
    if (!shape) return null;
    const entity = area.entityId ? entities[area.entityId] : null;
    if (area.entityId && !entity && (isDraft || shape.aim !== 'point')) return null;
    const islandId = shape.aim === 'point' ? area.islandId || entity?.islandId : entity ? entity.islandId : area.islandId;
    const r = islandRects[islandId];
    if (!r) return null;
    const span = entity?.size || 1;
    const fromToken = Boolean(entity) && entity.islandId === islandId;
    const at = fromToken ? [entity.col + span / 2, entity.row + span / 2] : shape.aim === 'point' ? area.aim : area.origin;
    const feet = feetOn(islandId);
    const outline = areaOutline(area, at, fromToken ? span / 2 : 0, feet);
    if (!outline) return null;
    const left = (r.x - originX) * zoom;
    const top = (r.y - originY) * zoom;
    const toPx = ([x, y]) => [left + x * r.cellSize, top + y * r.cellSize];

    const bounds = outlineBounds(outline);
    const [minX, minY] = toPx([bounds.minX, bounds.minY]);
    const [maxX, maxY] = toPx([bounds.maxX, bounds.maxY]);
    const cells = [];
    const covered = new Set();
    for (const id of islandOrder) {
      const ir = islandRects[id];
      if (!ir) continue;
      const iLeft = (ir.x - originX) * zoom;
      const iTop = (ir.y - originY) * zoom;
      const lastCol = Math.min(ir.island.cols - 1, Math.floor((maxX - iLeft) / ir.cellSize));
      const lastRow = Math.min(ir.island.rows - 1, Math.floor((maxY - iTop) / ir.cellSize));
      for (let row = Math.max(0, Math.floor((minY - iTop) / ir.cellSize)); row <= lastRow; row++) {
        for (let col = Math.max(0, Math.floor((minX - iLeft) / ir.cellSize)); col <= lastCol; col++) {
          const cx = iLeft + (col + 0.5) * ir.cellSize;
          const cy = iTop + (row + 0.5) * ir.cellSize;
          if (!outlineContains(outline, (cx - left) / r.cellSize, (cy - top) / r.cellSize)) continue;
          cells.push({ x: iLeft + col * ir.cellSize, y: iTop + row * ir.cellSize, size: ir.cellSize });
          covered.add(`${id}:${col}:${row}`);
        }
      }
    }

    // A creature is inside when any square of its space is; the one a cone,
    // line, cube or emanation comes from is not.
    const inside = [];
    for (const id of entityOrder) {
      const e = entities[id];
      if (!isCreature(e)) continue;
      if (e.id === area.entityId && shape.aim !== 'point') continue;
      const size = e.size || 1;
      let hit = false;
      for (let dy = 0; dy < size && !hit; dy++) for (let dx = 0; dx < size && !hit; dx++) hit = covered.has(`${e.islandId}:${e.col + dx}:${e.row + dy}`);
      if (hit) inside.push(e);
    }

    const tag = outline.circle
      ? toPx([outline.cx, outline.cy - outline.r])
      : toPx([(outline.points[1][0] + outline.points[2][0]) / 2, (outline.points[1][1] + outline.points[2][1]) / 2]);
    // While aiming a sphere from a token: the line out to its centre, and how far that is.
    const range =
      isDraft && shape.aim === 'point' && fromToken
        ? { from: toPx(at), to: toPx([outline.cx, outline.cy]), feet: Math.round(Math.hypot(outline.cx - at[0], outline.cy - at[1]) * feet) }
        : null;
    return { area, isDraft, outline, toPx, scale: r.cellSize, cells, inside, tag, range };
  }

  const areaViews = [...areas.map((a) => areaView(a, false)), areaDraft && tool === 'area' ? areaView(areaDraft, true) : null].filter(Boolean);
  const inAreaIds = new Set(areaViews.flatMap((v) => v.inside.map((e) => e.id)));

  // Leaving the Ruler tool wipes the measurement off the map; leaving Draw
  // drops a shape that was never finished.
  useEffect(() => {
    if (tool !== 'ruler') setRuler(null);
    if (tool !== 'draw' && drawRef.current) cancelDrawing();
    if (tool !== 'fogofwar' && fogDragRef.current) cancelFogOfWar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  // Report the live measurement upward so the HUD can show it.
  const rulerFeet = rulerLine ? rulerLine.feet : null;
  useEffect(() => {
    onRulerChange?.(rulerFeet);
  }, [rulerFeet, onRulerChange]);

  return (
    <div
      ref={wrapRef}
      className={`island-canvas tool-${tool}${tool === 'draw' && drawSettings ? ` draw-${drawSettings.subTool}` : ''}`}
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
        // This island's own day/night setting, else the table clock's phase.
        const phase = DAY_PHASES[islandPhase(island, dayPhase)];
        // Fill (Draw tool): a colour laid over the map art, under the grid.
        const fill = (drawingsByIsland.get(id) || []).filter((d) => d.kind === 'fill').pop();
        const fillColour = fill && islandFillColour(fill.style);
        const background = [fillColour && `linear-gradient(${fillColour}, ${fillColour})`, resolveImage(island.backgroundImage) && `url(${resolveImage(island.backgroundImage)})`].filter(Boolean);
        // A picture still being laid over the map in its settings (Toolbar's
        // MapImageFit): the whole picture at { x, y, width, height } in the
        // island's own pixels, in place of one cut to fit.
        const fit = resolveImage(island.backgroundImage) ? island.backgroundFit : null;
        const fitLayers = (value, forFill) => [fillColour && forFill, value].filter(Boolean).join(', ');
        // The map's own grid lines, if its settings ask for heavier or coloured ones.
        const gridLines = gridLineStyle(island);
        const islandFog = fogByIsland.get(id) || [];

        return (
          <div
            key={id}
            className={`grid-wrap${activeIslandId === id ? ' active' : ''}`}
            style={{
              left,
              top,
              width: w,
              height: h,
              backgroundImage: background.length ? background.join(', ') : undefined,
              ...(fit
                ? {
                    backgroundSize: fitLayers(`${fit.width * zoom}px ${fit.height * zoom}px`, 'auto'),
                    backgroundPosition: fitLayers(`${fit.x * zoom}px ${fit.y * zoom}px`, '0 0'),
                    backgroundRepeat: fitLayers('no-repeat', 'repeat'),
                  }
                : null),
            }}
            onPointerDown={(e) => handleIslandPointerDown(e, island)}
          >
            {/* A grouped island's own label is suppressed — the group's
                single shared title (rendered below) stands in for it. */}
            {!groupIdByIslandId.has(id) && <div className="island-label">{island.name}</div>}
            {/* Condition badges (fog, fire, ...) sit on the island's top edge for
                everyone. A grouped island shows only its day/night badge: the
                group's conditions sit on the group's title instead. */}
            {(phase || (!groupIdByIslandId.has(id) && island.conditions?.length > 0)) && (
              <div className="island-conditions">
                {phase && <img src={phase.imageUrl} alt={phase.label} title={`${phase.label} — ${phase.description}`} />}
                {(groupIdByIslandId.has(id) ? [] : island.conditions || []).map((key) => {
                  const c = getIslandCondition(key);
                  if (!c) return null;
                  return <img key={key} src={c.imageUrl} alt={c.label} title={`${c.label} — ${c.description}`} />;
                })}
              </div>
            )}
            {/* A player's move range stops at the fog: it draws above the
                cover, and must not show through it. */}
            {moveRange?.islandId === id &&
              (isHost || !islandFog.length ? moveRange.cells : moveRange.cells.filter((c) => !isSquareFogged(islandFog, island, c.col, c.row))).map((c) => (
                <div
                  key={`${c.col}_${c.row}`}
                  className="move-cell"
                  style={{ left: c.col * cellPx, top: c.row * cellPx, width: cellPx, height: cellPx }}
                />
              ))}
            <svg className={`grid-svg${gridLines.custom ? ' grid-custom' : ''}`} width={w} height={h}>
              {Array.from({ length: island.cols + 1 }).map((_, v) => (
                <line key={'v' + v} x1={v * cellPx} y1={0} x2={v * cellPx} y2={h} stroke={gridLines.stroke} strokeWidth={v % 5 === 0 ? gridLines.major : gridLines.minor} />
              ))}
              {Array.from({ length: island.rows + 1 }).map((_, hh) => (
                <line key={'h' + hh} x1={0} y1={hh * cellPx} x2={w} y2={hh * cellPx} stroke={gridLines.stroke} strokeWidth={hh % 5 === 0 ? gridLines.major : gridLines.minor} />
              ))}
            </svg>
            {/* Dusk/night/dawn tint - over the map art and grid, under the tokens. */}
            {phase?.tint && <div className="island-daynight" style={{ background: phase.tint }} />}
            {/* The DM's drawings — chalk on the floor, still under the tokens. */}
            <IslandDrawings drawings={drawingsByIsland.get(id) || []} draft={draft?.islandId === id ? draft : null} cellPx={cellPx} width={w} height={h} />
            {/* Fog of war — over all of the above, still under the tokens:
                an opaque cover for players, a tint for the DM. */}
            <IslandFogOfWar
              chunks={islandFog}
              island={island}
              cellPx={cellPx}
              isHost={isHost}
              selectedId={selectedFogChunkId}
              draft={fogDraft?.islandId === id ? fogDraft : null}
              edit={fogEdit?.islandId === id ? fogEdit : null}
              editable={isHost && tool === 'fogofwar' && Boolean(onUpdateFogChunk)}
              onPickTag={isHost && onSelectFogChunk ? (chunk, col, row) => handleFogTagPick(chunk, island, col, row) : null}
            />
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
            {group.conditions?.length > 0 && (
              <div className="island-conditions group-conditions">
                {group.conditions.map((key) => {
                  const c = getIslandCondition(key);
                  if (!c) return null;
                  return <img key={key} src={c.imageUrl} alt={c.label} title={`${c.label} — ${c.description}`} />;
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Area-of-effect templates: over the maps, under the tokens. */}
      {areaViews.length > 0 && (
        <svg className="grid-svg area-layer" width={canvasWidth} height={canvasHeight} aria-hidden="true">
          {areaViews.map((v) => (
            <g key={v.area.id} className={`area${v.isDraft ? ' draft' : ''}`} style={{ '--area-color': v.area.color || 'var(--gold-hi)' }}>
              {v.cells.map((c) => (
                <rect key={`${c.x}:${c.y}`} x={c.x} y={c.y} width={c.size} height={c.size} className="area-cell" />
              ))}
              {v.outline.circle ? (
                <circle cx={v.toPx([v.outline.cx, v.outline.cy])[0]} cy={v.toPx([v.outline.cx, v.outline.cy])[1]} r={v.outline.r * v.scale} className="area-outline" />
              ) : (
                <polygon points={v.outline.points.map((pt) => v.toPx(pt).join(',')).join(' ')} className="area-outline" />
              )}
              {v.range && <line x1={v.range.from[0]} y1={v.range.from[1]} x2={v.range.to[0]} y2={v.range.to[1]} className="area-range" />}
            </g>
          ))}
        </svg>
      )}

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
          // Only the DM's client ever holds a hidden token, so this is the
          // DM's own reminder that players can't see it.
          const concealed = isHiddenFromPlayers(entity);
          const locked = isLockedDoor(entity);
          // A locked chest wears the padlock too, but stays clickable.
          const padlocked = locked || isLockedChest(entity);

          return (
            <div
              key={id}
              className={`token${entity.kind === 'door' ? ' door' : ''}${concealed ? ' dm-hidden' : ''}${locked ? ` locked${isHost ? '' : ' shut'}` : ''}${isDragging ? ' dragging' : ''}${selectedId === id ? ' selected' : ''}${actorId === id ? ' acting' : ''}${inAreaIds.has(id) ? ' in-area' : ''}`}
              style={{
                width: size,
                height: size,
                left: cx - size / 2,
                top: cy - size / 2,
                backgroundImage: `url(${entityImageSrc(entity)})`,
                '--token-color': entity.color || 'transparent',
              }}
              onPointerDown={(e) => handleTokenPointerDown(e, entity)}
              onClick={(e) => e.stopPropagation()}
              title={`${entity.name}${padlocked ? ' (locked)' : ''}${concealed ? ' (hidden from players)' : ''}`}
            >
              <span className="token-label">{entity.name}</span>
              {padlocked && (
                <span className="token-lock" aria-label="Locked" style={{ fontSize: Math.max(7, Math.min(12, size * 0.4)) }}>
                  🔒
                </span>
              )}
              {entity.kind === 'mob' && entity.hp === 0 && entity.loot?.length > 0 && (
                <span className="token-lock" aria-label="Has loot to take" title="Defeated — has loot to take" style={{ fontSize: Math.max(7, Math.min(12, size * 0.4)) }}>
                  💰
                </span>
              )}
              {entity.kind === 'ambush' && (
                <span className="token-count" title={`${ambushMonsterCount(entity)} monsters waiting`}>
                  {ambushMonsterCount(entity)}
                </span>
              )}
              {entity.kind !== 'door' && entity.initiativeTurn != null && (
                <span className="token-initiative" title={`Initiative: rolled ${entity.initiativeRoll}, turn ${entity.initiativeTurn}`}>
                  👢{entity.initiativeTurn}
                </span>
              )}
              {entity.kind !== 'door' && entity.maxHp ? (
                // The ghost underneath shows damage just taken, then drains
                // down to the new value after a beat (a CSS transition delay).
                <span className={`token-hpbar${entity.hp / entity.maxHp < 0.25 ? ' critical' : ''}`} aria-hidden="true">
                  <span className="token-hpbar-ghost" style={{ width: `${hpPercent(entity)}%` }} />
                  <span className={`token-hpbar-fill${entity.hp / entity.maxHp < 0.4 ? ' low' : ''}`} style={{ width: `${hpPercent(entity)}%` }} />
                </span>
              ) : null}
              {/* Temporary HP: a thin blue layer riding on top of the life bar. */}
              {entity.kind !== 'door' && entity.maxHp && entity.tempHp > 0 ? (
                <span className="token-tempbar" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, (entity.tempHp / entity.maxHp) * 100)}%` }} />
                </span>
              ) : null}
              {entity.kind !== 'door' && entity.maxHp ? (
                <span className="token-hp">
                  {entity.hp}/{entity.maxHp}
                  {entity.tempHp > 0 && <span className="token-hp-temp"> +{entity.tempHp}</span>}
                </span>
              ) : null}
              {entity.kind !== 'door' && entity.conditions?.length > 0 && (
                // Cardboard chits clipped to the token's edge; hovering the
                // token fans out their names.
                <span className="token-conditions">
                  {entity.conditions.map((key) => {
                    const c = CONDITIONS.find((cond) => cond.key === key);
                    if (!c) return null;
                    return (
                      <span key={key} className="token-chit" title={`${c.label} — ${c.description}`}>
                        <img src={c.imageUrl} alt={c.label} />
                        <span className="token-chit-label" aria-hidden="true">
                          {c.label}
                        </span>
                      </span>
                    );
                  })}
                </span>
              )}
            </div>
          );
        })}

      {floats.map((f) => {
        const entity = entities[f.entityId];
        const r = entity && islandRects[entity.islandId];
        if (!r) return null;
        const size = entity.size || 1;
        const x = (r.x - originX) * zoom + entity.col * r.cellSize + (r.cellSize * size) / 2;
        const y = (r.y - originY) * zoom + entity.row * r.cellSize;
        return (
          <span key={f.key} className={`hit-float hit-${f.kind}`} style={{ left: x, top: y }} aria-hidden="true">
            {f.kind === 'crit' && <small>Critical</small>}
            {f.kind === 'miss' ? 'MISS' : f.kind === 'heal' ? `+${f.amount}` : `−${f.amount}`}
          </span>
        );
      })}

      {/* Each template's tag: what it is, whose, how many creatures are inside,
          and a button to take it off for whoever may. */}
      {areaViews.map((v) => (
        <div
          key={v.area.id}
          className={`area-tag${v.isDraft ? ' draft' : ''}`}
          style={{ left: v.tag[0], top: v.tag[1], '--area-color': v.area.color || 'var(--gold-hi)' }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="area-tag-swatch" aria-hidden="true" />
          <span>
            {areaLabel(v.area)}
            {v.range ? ` · ${v.range.feet} ft away` : !v.isDraft ? ` · ${v.area.name}` : ''}
          </span>
          {v.inside.length > 0 && <b title={v.inside.map((e) => e.name).join(', ')}>{v.inside.length} inside</b>}
          {v.area.removable && onRemoveArea && (
            <button type="button" aria-label={`Remove ${v.area.name}’s ${areaLabel(v.area)}`} title="Remove" onClick={() => onRemoveArea(v.area.id)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>
      ))}

      {plannedMove && <PlannedMoveOverlay plan={plannedMove} entity={entities[plannedMove.entityId]} islandRects={islandRects} originX={originX} originY={originY} zoom={zoom} width={canvasWidth} height={canvasHeight} />}

      {tokenActions?.length > 0 && tool === 'play' && !plannedMove && dragPos?.id !== selectedId && (() => {
        const entity = entities[selectedId];
        const r = entity && islandRects[entity.islandId];
        if (!r) return null;
        const span = r.cellSize * (entity.size || 1);
        return (
          <TokenRing
            cx={(r.x - originX) * zoom + entity.col * r.cellSize + span / 2}
            cy={(r.y - originY) * zoom + entity.row * r.cellSize + span / 2}
            radius={Math.max(RING_MIN_RADIUS, span / 2 + 44)}
            actions={tokenActions}
          />
        );
      })()}

      {draft && draft.kind !== 'pencil' && islandRects[draft.islandId] && (
        <DrawFeetLabel
          label={shapeFeetLabel(draft.kind, draft.geometry, feetOn(draft.islandId), drawRef.current?.snap)}
          rect={islandRects[draft.islandId]}
          left={(islandRects[draft.islandId].x - originX) * zoom}
          top={(islandRects[draft.islandId].y - originY) * zoom}
        />
      )}
      {tool === 'draw' && selectedDrawingId && drawings[selectedDrawingId] && islandRects[drawings[selectedDrawingId].islandId] && (() => {
        const stored = drawings[selectedDrawingId];
        const shown = editPreview?.id === stored.id ? { ...stored, geometry: editPreview.geometry } : stored;
        const r = islandRects[shown.islandId];
        const left = (r.x - originX) * zoom;
        const top = (r.y - originY) * zoom;
        return (
          <>
            <DrawSelection drawing={shown} rect={r} left={left} top={top} width={canvasWidth} height={canvasHeight} />
            {editPreview && shown.kind !== 'pencil' && (
              <DrawFeetLabel label={shapeFeetLabel(shown.kind, shown.geometry, feetOn(shown.islandId), drawSettings?.snap)} rect={r} left={left} top={top} />
            )}
          </>
        );
      })()}

      {rulerLine && (
        <svg className="grid-svg ruler-overlay" width={canvasWidth} height={canvasHeight}>
          <RulerOverlay p1={rulerLine.p1} p2={rulerLine.p2} feet={rulerLine.feet} />
        </svg>
      )}
    </div>
  );
}

// The selected drawing's dashed box and its resize handles (Select). Drawn
// over the whole canvas so handles past the island's edge still show;
// MapBoard finds handles by distance, so this takes no pointer events.
function DrawSelection({ drawing, rect, left, top, width, height }) {
  const px = (at) => [left + at[0] * rect.cellSize, top + at[1] * rect.cellSize];
  const [x0, y0, x1, y1] = drawingBounds(drawing);
  const [bx, by] = px([x0, y0]);
  const [bx1, by1] = px([x1, y1]);
  return (
    <svg className="grid-svg draw-selection" width={width} height={height} aria-hidden="true">
      <rect x={bx - 4} y={by - 4} width={bx1 - bx + 8} height={by1 - by + 8} className="draw-selection-box" />
      {drawingHandles(drawing).map((h) => {
        const [hx, hy] = px(h.at);
        return <rect key={h.id} x={hx - 6} y={hy - 6} width={12} height={12} rx={2} className="draw-handle" />;
      })}
    </svg>
  );
}

// A shape's size in feet while it's being drawn, like the ruler's label.
function DrawFeetLabel({ label, rect, left, top }) {
  if (!label) return null;
  return (
    <span className="draw-feet" style={{ left: left + label.at[0] * rect.cellSize, top: top + label.at[1] * rect.cellSize }}>
      {label.text}
    </span>
  );
}

function hpPercent(entity) {
  return Math.max(0, Math.min(100, (entity.hp / entity.maxHp) * 100));
}

// Floating phone chrome an on-map control must stay clear of: the top row, and
// the dock with the encounter bar over it.
const CHROME_TOP_PX = 76;
const CHROME_BOTTOM_PX = 200;
const RING_MIN_RADIUS = 74; // keeps 48 px buttons from touching around a one-square token
const RING_BUTTON_PX = 48;

// How far an on-map control's anchor (the element's own position, a point on
// the map) sits from each edge of the visible stage, measured after layout —
// what the control needs to keep clear of the screen's edges and the chrome.
function useStageInsets(ref, deps) {
  const [insets, setInsets] = useState(null);
  useLayoutEffect(() => {
    const stage = ref.current?.closest('.stage');
    if (!stage) return;
    const box = stage.getBoundingClientRect();
    const at = ref.current.getBoundingClientRect();
    setInsets({ top: at.top - box.top, bottom: box.bottom - at.top, left: at.left - box.left, right: box.right - at.left });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return insets;
}

// Phone layout: the selected token's actions, fanned over it on the map —
// under it when it stands too near the top of the screen, and leaning away
// from a side edge it stands next to.
function TokenRing({ cx, cy, radius, actions }) {
  const ref = useRef(null);
  const insets = useStageInsets(ref, [cx, cy, radius]);
  const reach = radius + RING_BUTTON_PX / 2;
  const below = Boolean(insets) && insets.top - reach < CHROME_TOP_PX;
  const lean = !insets ? 0 : insets.left < reach ? 1 : insets.right < reach ? -1 : 0;
  const step = 2 * Math.asin((RING_BUTTON_PX + 6) / 2 / radius);
  const fan = step * (actions.length - 1);
  const start = -Math.PI / 2 - fan / 2 + (lean * fan) / 2;
  return (
    <div className="token-ring" ref={ref} style={{ left: cx, top: cy }} role="group" aria-label="Token actions">
      {actions.map((action, i) => {
        const angle = start + step * i;
        return (
          <button
            key={action.id}
            type="button"
            className={`token-ring-btn${action.primary ? ' primary' : ''}`}
            style={{ left: Math.cos(angle) * radius, top: Math.sin(angle) * radius * (below ? -1 : 1) }}
            aria-label={action.label}
            title={action.label}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              action.onPress();
            }}
          >
            {action.icon}
          </button>
        );
      })}
    </div>
  );
}

// A move waiting for "Move here" (phone, mid-encounter): a dashed path from
// the token to the chosen square, a ghost ring there, and under it (over it,
// near the bottom of the screen) the buttons that commit or drop the move.
function PlannedMoveOverlay({ plan, entity, islandRects, originX, originY, zoom, width, height }) {
  const from = entity && islandRects[entity.islandId];
  const to = islandRects[plan.islandId];
  const size = entity?.size || 1;
  const x2 = to ? (to.x - originX) * zoom + plan.col * to.cellSize + (to.cellSize * size) / 2 : 0;
  const y2 = to ? (to.y - originY) * zoom + plan.row * to.cellSize + (to.cellSize * size) / 2 : 0;
  const radius = to ? (to.cellSize * size) / 2 - 2 : 0;
  const actionsRef = useRef(null);
  const insets = useStageInsets(actionsRef, [x2, y2, radius]);
  const above = Boolean(insets) && insets.bottom - radius - 64 < CHROME_BOTTOM_PX;
  if (!from || !to) return null;
  const x1 = (from.x - originX) * zoom + entity.col * from.cellSize + (from.cellSize * size) / 2;
  const y1 = (from.y - originY) * zoom + entity.row * from.cellSize + (from.cellSize * size) / 2;
  return (
    <>
      <svg className="grid-svg planned-move" width={width} height={height} aria-hidden="true">
        <line x1={x1} y1={y1} x2={x2} y2={y2} className="planned-move-path" />
        <circle cx={x2} cy={y2} r={radius} className="planned-move-ghost" />
      </svg>
      <div className="planned-move-anchor" ref={actionsRef} style={{ left: x2, top: y2 }}>
        {plan.onConfirm && (
          <div
            className={`planned-move-actions${above ? ' above' : ''}`}
            style={{ top: above ? -(radius + 10) : radius + 10 }}
            aria-live="polite"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="planned-move-cancel" aria-label="Cancel the move" onClick={plan.onCancel}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
            <button type="button" className="planned-move-confirm" onClick={plan.onConfirm}>
              <b>{plan.confirmLabel}</b>
              {plan.note && <span>{plan.note}</span>}
            </button>
          </div>
        )}
      </div>
    </>
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
