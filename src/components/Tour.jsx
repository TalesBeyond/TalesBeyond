import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// The first-table tutorial: a short guided tour for a DM the first time
// they open a table on this device (desktop layout). Each step lights up
// one part of the screen and says what it is for, with Previous / Next /
// Skip. It only points and explains — nothing on the table changes.
//
// A step: { target, title, text, items, side }.
// - target: matches an element's data-tour="…" attribute (Toolbar.jsx,
//   TokenSidebar.jsx and RightPanel.jsx carry them). A step with no target,
//   or whose target isn't on screen (a folded panel, a menu the bar has
//   tucked away), shows in the middle of the screen instead.
// - items: [name, what it does] pairs, for a menu's tools.
// - side: where the card sits next to the target: 'bottom' (default),
//   'right' or 'left'.
//
// Whether it has been seen lives with the other hint choices (Hints.jsx's
// useTourState, `hearthbound:hints`); Configurations → Tutorial replays it.

export const HOST_TOUR = [
  {
    title: 'Welcome to your table',
    text: 'You are the Dungeon Master here. This short tour shows what each part of the screen is for. It takes about a minute, and you can skip it at any point.',
  },
  {
    target: 'tools',
    title: 'Tools',
    text: 'What your mouse does on the map. The button shows the tool you are using.',
    items: [
      ['Play', 'select tokens and drag them around. The everyday tool.'],
      ['Ruler', 'drag across the map to measure a distance.'],
      ['Draw', 'sketch on the map. Everyone at the table sees it.'],
      ['Edit', 'drag whole maps to rearrange the world.'],
    ],
  },
  {
    target: 'mapping',
    title: 'Mapping',
    text: 'Where you build the world your players walk through.',
    items: [
      ['World maps', 'the rooms and areas of this world. Add one, give it sub maps, resize it, give it a background.'],
      ['Layers', 'separate worlds in the same table: another floor, another town.'],
    ],
  },
  {
    target: 'world',
    title: 'World state',
    text: 'The mood of the scene.',
    items: [
      ['Ingame time', 'the table’s clock, and how fast it runs.'],
      ['Day / night', 'set dawn, day, dusk or night by hand.'],
      ['Ambience', 'the sound players hear in this world.'],
    ],
  },
  {
    target: 'compendium',
    title: 'Compendium',
    text: 'Things ready to drop into the game.',
    items: [
      ['Book', 'ready-made weapons, items and monsters.'],
      ['Storage', 'make your own monsters, weapons and items for this table.'],
    ],
  },
  {
    target: 'initiative',
    title: 'Initiative',
    text: 'Start a fight: roll for turn order, then step through each creature’s turn.',
  },
  {
    target: 'music',
    title: 'Music',
    text: 'Songs for the whole table, for one world, or for a single token. Each player sets their own volume.',
  },
  {
    target: 'dice',
    title: 'Dice',
    text: 'Roll any dice. Your rolls stay hidden from players unless you choose to reveal them.',
  },
  {
    target: 'rolls',
    title: 'Roll log',
    text: 'Every roll made at the table this session, with who rolled it.',
  },
  {
    target: 'charlog',
    title: 'Character log',
    text: 'What each player changed on their own hero: hit points, items, coins, spells. Only you can see it.',
  },
  {
    target: 'codes',
    title: 'Invite your players',
    text: 'Share the player code so people can join. Keep the DM code to yourself: it is how you get this table back. “New code” replaces the player code, so the old one stops working.',
  },
  {
    target: 'players',
    title: 'Players',
    text: 'Who is seated at your table. You can remove a player from here.',
    side: 'bottom',
  },
  {
    target: 'config',
    title: 'Configurations',
    text: 'Save and housekeeping.',
    items: [
      ['Save', 'save the table now.'],
      ['Export / Import', 'keep a copy of the table as a file, or load one back.'],
      ['Close', 'stop new players from joining.'],
      ['Hints', 'turn the small tips on or off.'],
      ['Palette', 'change the colours of the whole app.'],
      ['Tutorial', 'run this tour again.'],
      ['Game table rules', 'read what every button and tool does, any time.'],
    ],
  },
  {
    target: 'side-heroes',
    title: 'Default heroes',
    text: 'Ready-made characters. Click one to place it on the map you are viewing, then choose who plays it.',
    side: 'right',
  },
  {
    target: 'side-placeable',
    title: 'Placeable',
    text: 'Things to put on the map.',
    items: [
      ['Door', 'lets tokens walk through to another world.'],
      ['Chest', 'holds loot for players to open and take.'],
      ['Trap', 'hidden from players until you reveal it.'],
    ],
    side: 'right',
  },
  {
    target: 'side-own',
    title: 'Add your own image',
    text: 'Upload a picture from your computer and use it as a hero or monster token.',
    side: 'right',
  },
  {
    target: 'inspector',
    title: 'The character sheet',
    text: 'Click any token on the map and its sheet opens here: hit points, armor, conditions, and tabs for fighting, magic, the bag and stats. On a hero, “played by” sets which player controls it.',
    side: 'left',
  },
  {
    title: 'That’s the table',
    text: 'Place a hero, share the player code, and you are ready to play. You can run this tour again from Configurations → Tutorial.',
  },
];

const CARD_WIDTH = 340;
const GAP = 14;
const MARGIN = 12;

function findTarget(key) {
  if (!key) return null;
  // The codes are drawn twice (in the bar, and inside a menu when the bar is
  // narrow); only one is on screen.
  for (const el of document.querySelectorAll(`[data-tour="${key}"]`)) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return el;
  }
  return null;
}

export default function Tour({ steps = HOST_TOUR, onFinish }) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState(null); // the target's rectangle, or null for a centered step
  const [cardPos, setCardPos] = useState(null);
  const cardRef = useRef(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  function measure() {
    const el = findTarget(step.target);
    if (!el) {
      setBox(null);
      return;
    }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    setBox({ left: r.left - 4, top: r.top - 4, width: r.width + 8, height: r.height + 8 });
  }

  useLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Place the card beside the target once both are measured, kept on screen.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
    if (!box) {
      setCardPos({ left: (vw - cw) / 2, top: (vh - ch) / 2 });
      return;
    }
    let left;
    let top;
    if (step.side === 'right') {
      left = box.left + box.width + GAP;
      top = box.top;
    } else if (step.side === 'left') {
      left = box.left - cw - GAP;
      top = box.top;
    } else {
      left = box.left;
      top = box.top + box.height + GAP;
      if (top + ch > vh - MARGIN) top = box.top - ch - GAP; // no room below: go above
    }
    setCardPos({ left: clamp(left, MARGIN, vw - cw - MARGIN), top: clamp(top, MARGIN, vh - ch - MARGIN) });
  }, [box, index, step.side]);

  useEffect(() => {
    cardRef.current?.focus();
  }, [index]);

  function next() {
    if (last) onFinish();
    else setIndex(index + 1);
  }
  function previous() {
    if (index > 0) setIndex(index - 1);
  }
  function onKeyDown(e) {
    if (e.key === 'Escape') onFinish();
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') previous();
  }

  return (
    <div className="tour" onKeyDown={onKeyDown}>
      {/* Swallows clicks so the tour only explains; nothing underneath reacts. */}
      <div className={`tour-shade${box ? '' : ' solid'}`} />
      {box && <div className="tour-spot" style={box} aria-hidden="true" />}
      <div
        className="tour-card"
        role="dialog"
        aria-modal="true"
        aria-label={`Tutorial: ${step.title}`}
        tabIndex={-1}
        ref={cardRef}
        style={{ width: CARD_WIDTH, ...(cardPos || { left: -9999, top: 0 }) }}
      >
        <span className="tour-count">
          Tutorial · {index + 1} of {steps.length}
        </span>
        <h4>{step.title}</h4>
        <p>{step.text}</p>
        {step.items && (
          <ul>
            {step.items.map(([name, what]) => (
              <li key={name}>
                <b>{name}:</b> {what}
              </li>
            ))}
          </ul>
        )}
        <div className="tour-actions">
          {!last && (
            <button type="button" className="link-btn tour-skip" onClick={onFinish}>
              Skip
            </button>
          )}
          <span className="tour-spacer" />
          {index > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={previous}>
              Previous
            </button>
          )}
          <button type="button" className="btn btn-primary btn-sm" onClick={next}>
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
