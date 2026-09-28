import { useEffect, useRef } from 'react';

// The table's "game feel" moments — floating hit numbers, the turn banner,
// natural 20/1 dice, loot reveals and the combat log — are fired from all
// over (an attack in RightPanel, a roll in DiceModal, a state change seen in
// GameView) and drawn somewhere else entirely (MapBoard, FxLayer,
// EncounterHud). A tiny in-memory bus keeps those callers from having to
// thread callbacks through every component in between. Everything here is
// local to this browser: nothing is synced, so a moment that every player
// should see has to be derived from synced state on each client instead
// (HP changes, turn changes, a chest opening — see GameView).
//
// Event shapes:
//   { type: 'float', entityId, kind: 'miss' }             — a MISS over a token
//   { type: 'die', value, sides?, min?, max?, detail?, caption? } — the big die (a d20 by default)
//   { type: 'banner', title, sub, tone: 'ally'|'enemy'|'mine' }
//   { type: 'loot', title, items: [{ name, qty }] }
//   { type: 'log', text, tone?: 'hit'|'miss'|'heal'|'turn'|'roll' }
const listeners = new Set();

export function emitFx(event) {
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch {
      /* one broken listener must not stop the others */
    }
  }
}

// Subscribes for the component's lifetime; always calls the latest handler.
export function useFx(handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const listener = (event) => ref.current(event);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);
}

// An attack that rolled a natural 20 marks its target, so the damage number
// the HP change produces a moment later is drawn as a critical. Local only:
// other players see an ordinary hit number for the same blow.
const critMarks = new Map();

export function markCrit(entityId) {
  critMarks.set(entityId, Date.now());
}

export function takeCrit(entityId) {
  const at = critMarks.get(entityId);
  critMarks.delete(entityId);
  return at != null && Date.now() - at < 4000;
}

// Loot has no rarity field — every item comes from the PHB-based weapon and
// item catalogs, whose magic variants carry their bonus in the name.
export function rarityOf(name) {
  const text = String(name || '');
  if (/\+3\b/.test(text)) return 'very-rare';
  if (/\+2\b/.test(text)) return 'rare';
  if (/\+1\b/.test(text)) return 'uncommon';
  return 'common';
}

export const RARITY_LABELS = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', 'very-rare': 'Very rare' };
