// Every change to a token on a cloud table reaches the other browsers twice.
// The write to the database is the one that counts, but its way back out
// (Postgres -> Realtime -> each browser) takes a few seconds, so the browser
// that made the change also announces it over the table's channel
// (lib/realtime.js's 'entity'), which takes a fraction of one:
//   { byId, action }   action: the ADD_ENTITY, UPDATE_ENTITY, MOVE_ENTITY or
//                      REMOVE_ENTITY the store would be given
// Heroes, monsters, NPCs and shopkeepers, doors, chests, traps: all of them.
// What players may not see never goes out — a hidden or fogged token, an
// unrevealed trap, an ambush, a DM's notes (GameView.jsx's
// toGuestBroadcastAction, the same filter a guest table uses). A bulletin
// board or a portal is announced the same way though it has no row in the
// database (lib/boardSync.js): nothing of it is guarded below, as there is
// nothing to confirm it.
//
// An announcement is a preview; the database stays the authority. Two
// answers for one change means the slow one can contradict the fast one: the
// database's word on an earlier change arrives after a later one has already
// been shown, and the token would jump back. The guard below keeps each
// field of a token at the value its newest announced change gave it until
// the database says the same, holding back any older value it reports
// meanwhile. What the database has not confirmed within CONFIRM_WITHIN_MS
// gives way: the field goes to the last value the database did report — or,
// for a change that only ever arrived as an announcement (its write failed,
// or it was never a real change), back to what it was. A token that was
// announced but never written comes off again; one announced as removed but
// never deleted comes back.

const CONFIRM_WITHIN_MS = 10000;
const SEND_GAP_MS = 250; // the least time between two announced edits of one token

// Equal as the database would see them: nothing and null are the same, and an
// object's keys may come back in any order (jsonb keeps none).
export function sameValue(a, b) {
  if (a == null || b == null) return a == null && b == null;
  if (typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((value, i) => sameValue(value, b[i]));
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!sameValue(a[key], b[key])) return false;
  }
  return true;
}

// The place a move names, or null when it doesn't name one on a map this
// browser has. `state`: the table as this browser holds it.
export function placeFromMove(move, state) {
  const island = state.layers[move?.layerId]?.islands?.[move?.islandId];
  if (!island || !Number.isInteger(move.col) || !Number.isInteger(move.row)) return null;
  if (move.col < 0 || move.row < 0 || move.col >= island.cols || move.row >= island.rows) return null;
  return { col: move.col, row: move.row, islandId: move.islandId, layerId: move.layerId };
}

// dispatch: the store's. getEntity(id): the token as state holds it now.
export function createEntityGuard({ dispatch, getEntity }) {
  // id -> what has been shown ahead of the database for that token:
  //   fields:  key -> { value, before, own, reported, db } — the newest
  //            announced value, what it was before the first unconfirmed
  //            one, whether this browser made it, and the last value the
  //            database reported instead
  //   added:   shown by another browser's announcement, no row seen yet
  //   removed: { entity, own } — taken off, no deletion seen yet
  const pending = new Map();

  function recordFor(id) {
    let record = pending.get(id);
    if (!record) {
      record = { timer: null, fields: {}, added: false, removed: null };
      pending.set(id, record);
    }
    clearTimeout(record.timer);
    record.timer = setTimeout(() => settle(id), CONFIRM_WITHIN_MS);
    return record;
  }

  function drop(id) {
    const record = pending.get(id);
    if (record) clearTimeout(record.timer);
    pending.delete(id);
  }

  // The database never confirmed what was shown.
  function settle(id) {
    const record = pending.get(id);
    pending.delete(id);
    if (!record) return;
    const entity = getEntity(id);
    if (record.removed) {
      // This browser's own removal stays, as it always has.
      if (!record.removed.own && !entity) dispatch({ type: 'ADD_ENTITY', entity: record.removed.entity });
      return;
    }
    if (!entity) return;
    if (record.added) {
      dispatch({ type: 'REMOVE_ENTITY', id });
      return;
    }
    const patch = {};
    for (const [key, field] of Object.entries(record.fields)) {
      if (!sameValue(entity[key], field.value)) continue; // changed some other way since
      if (field.reported) {
        if (!sameValue(field.db, field.value)) patch[key] = field.db;
      } else if (!field.own && !sameValue(field.before, field.value)) {
        // This browser's own edit stays unless the database said otherwise.
        patch[key] = field.before;
      }
    }
    if (Object.keys(patch).length) dispatch({ type: 'UPDATE_ENTITY', id, patch });
  }

  return {
    // Each of these is told about a change just before it is shown.
    // `own`: made in this browser, rather than announced by another.

    // A token another browser announced.
    noteAdd(id) {
      const record = recordFor(id);
      record.added = true;
      record.removed = null;
    },

    // `entity`: the token before the change. A move is a patch of its place.
    notePatch(entity, patch, own) {
      const record = recordFor(entity.id);
      for (const [key, value] of Object.entries(patch)) {
        const prior = record.fields[key];
        record.fields[key] = {
          value,
          before: prior ? prior.before : entity[key],
          own,
          reported: prior ? prior.reported : false,
          db: prior ? prior.db : undefined,
        };
      }
    },

    noteRemove(entity, own) {
      const record = recordFor(entity.id);
      record.fields = {};
      record.added = false;
      record.removed = { entity, own };
    },

    // A change read from the database, on its way into state: the action to
    // apply instead, or null for none.
    filter(action) {
      if (action.type === 'REMOVE_ENTITY') {
        drop(action.id);
        return action;
      }
      const isUpdate = action.type === 'UPDATE_ENTITY';
      const incoming = isUpdate ? action.patch : action.type === 'ADD_ENTITY' ? action.entity : null;
      const id = isUpdate ? action.id : incoming?.id;
      const record = id ? pending.get(id) : null;
      if (!record || !incoming) return action;
      // Taken off a moment ago: the database's word on it from before that
      // must not put it back.
      if (record.removed) return null;
      if ('kind' in incoming) record.added = false; // its own row: the token is real
      const held = {};
      for (const [key, field] of Object.entries(record.fields)) {
        if (!(key in incoming)) continue;
        if (sameValue(incoming[key], field.value)) {
          delete record.fields[key];
        } else {
          field.reported = true;
          field.db = incoming[key];
          held[key] = field.value;
        }
      }
      if (!record.added && Object.keys(record.fields).length === 0) drop(id);
      if (!Object.keys(held).length) return action;
      const kept = { ...incoming, ...held };
      return isUpdate ? { ...action, patch: kept } : { ...action, entity: kept };
    },

    // The whole table was just read afresh: nothing is waiting any more.
    clear() {
      for (const record of pending.values()) clearTimeout(record.timer);
      pending.clear();
    },
  };
}

// What goes out. An edit (UPDATE_ENTITY) is sent at once, but a second edit
// of the same token within SEND_GAP_MS waits and is merged with any that
// follow, so typing in a hero's sheet is not a message per letter. Anything
// else (`now`) goes at once, after whatever edit of that token was waiting.
// send(action): puts one action on the channel.
export function createEntityOutbox(send) {
  const boxes = new Map(); // id -> { last, patch, timer }

  function flush(id) {
    const box = boxes.get(id);
    if (!box?.timer) return;
    clearTimeout(box.timer);
    const patch = box.patch;
    box.timer = null;
    box.patch = null;
    box.last = Date.now();
    send({ type: 'UPDATE_ENTITY', id, patch });
  }

  return {
    update(id, patch) {
      let box = boxes.get(id);
      if (!box) {
        box = { last: 0, patch: null, timer: null };
        boxes.set(id, box);
      }
      if (box.timer) {
        box.patch = { ...box.patch, ...patch };
        return;
      }
      const wait = box.last + SEND_GAP_MS - Date.now();
      if (wait <= 0) {
        box.last = Date.now();
        send({ type: 'UPDATE_ENTITY', id, patch });
        return;
      }
      box.patch = patch;
      box.timer = setTimeout(() => flush(id), wait);
    },

    now(id, action) {
      flush(id);
      send(action);
    },

    clear() {
      for (const box of boxes.values()) clearTimeout(box.timer);
      boxes.clear();
    },
  };
}
