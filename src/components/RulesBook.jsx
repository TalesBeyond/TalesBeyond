import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { RULE_CHAPTERS, TABLE_RULES } from '../data/tableRules.js';
import { playSfx } from '../lib/sfx.js';
import { usePhoneLayout } from './PhoneChrome.jsx';

// The Game table rules (Configurations → Game table rules): what every
// button and tool at the table does, to read at any time. The tips and the
// tutorial (Hints.jsx, Tour.jsx) show once; this stays.
//
// It is the compendium's book (CompendiumBook.jsx) with different pages: the
// same cover, tabs, page turn and desk tray, and the same styles. Chapters
// are its tabs, each button is an entry, and picking one puts its
// explanation on the tray. Searching looks through every chapter at once.
// A player's book leaves out the DM's buttons.

const ROW_H = 86;
const FLIP_MS = 750;

function shortName(name) {
  return name.split(' ')[0];
}

export default function RulesBook({ isHost, onClose }) {
  const [chapter, setChapter] = useState(RULE_CHAPTERS[0].key);
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState(null);
  const [spread, setSpread] = useState(0);
  const [flip, setFlip] = useState({ phase: 'idle', dir: 'fwd' }); // phase: idle | prep | go
  const [perPage, setPerPage] = useState(6);
  const pagesRef = useRef(null);
  const timers = useRef([]);
  const isPhone = usePhoneLayout();

  const q = search.trim().toLowerCase();
  const searching = q !== '';

  const { entries, totalCount } = useMemo(() => {
    const mine = (list) => list.filter((e) => isHost || !e.dm);
    const all = RULE_CHAPTERS.flatMap((c) => mine(TABLE_RULES[c.key]).map((e) => ({ ...e, key: `${c.key}:${e.key}` })));
    if (!searching) return { entries: all.filter((e) => e.key.startsWith(`${chapter}:`)), totalCount: all.length };
    const hit = (e) =>
      [e.name, e.sub, e.where, e.text, ...(e.items || []).flat()].some((s) => s.toLowerCase().includes(q));
    return { entries: all.filter(hit), totalCount: all.length };
  }, [isHost, chapter, searching, q]);

  const title = searching ? 'Search' : RULE_CHAPTERS.find((c) => c.key === chapter).title;
  const pageCount = Math.max(2, Math.ceil(entries.length / perPage));
  const spreads = Math.ceil(pageCount / 2);
  const shownSpread = Math.min(spread, spreads - 1);
  // The book opens ready to read: the first entry on the page is on the tray
  // until another is picked.
  const selected = entries.find((e) => e.key === selectedKey) || (isPhone ? null : entries[0]) || null;
  const idle = flip.phase === 'idle';

  // Rows that fit on a page depend on how tall the book is on this screen.
  useLayoutEffect(() => {
    const el = pagesRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      const fit = Math.floor((el.clientHeight - 120) / ROW_H);
      setPerPage(Math.max(3, Math.min(8, fit)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setSpread(0);
    setFlip({ phase: 'idle', dir: 'fwd' });
  }, [chapter, search, perPage]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    []
  );

  function turn(dir) {
    if (flip.phase !== 'idle') return;
    if (dir === 'fwd' ? shownSpread >= spreads - 1 : shownSpread <= 0) return;
    playSfx('page');
    setFlip({ phase: 'prep', dir });
    timers.current.push(setTimeout(() => setFlip({ phase: 'go', dir }), 40));
    timers.current.push(
      setTimeout(() => {
        setSpread(shownSpread + (dir === 'fwd' ? 1 : -1));
        setFlip({ phase: 'idle', dir });
      }, FLIP_MS + 60)
    );
  }

  const turnRef = useRef(turn);
  turnRef.current = turn;
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      // The arrows belong to the search box while it is being typed in.
      else if (e.target?.tagName === 'INPUT') return;
      else if (e.key === 'ArrowRight') turnRef.current('fwd');
      else if (e.key === 'ArrowLeft') turnRef.current('back');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function openChapter(key) {
    setSearch('');
    setSelectedKey(null);
    setChapter(key);
  }

  const tabs = RULE_CHAPTERS.map((c) => {
    const active = !searching && chapter === c.key;
    return { ...c, active, onClick: () => !active && openChapter(c.key) };
  });

  const who = (e) => (e.dm ? 'DM only' : isHost ? 'Everyone' : '');

  function ruleBody(e, textClass, listClass) {
    return (
      <>
        <p className={textClass}>{e.text}</p>
        {e.items && (
          <ul className={listClass}>
            {e.items.map(([name, what]) => (
              <li key={name}>
                <b>{name}:</b> {what}
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  // On a phone the open book doesn't fit: one scrolling page instead, the
  // tabs and search above it, and the chosen entry in a panel along the bottom.
  if (isPhone) {
    return (
      <div className="cphone" role="dialog" aria-modal="true" aria-label="Game table rules">
        <header className="cphone-head">
          <h2>Game table rules</h2>
          <button type="button" className="cphone-close" aria-label="Close the rules" onClick={onClose}>
            &times;
          </button>
        </header>
        <div className="cphone-tabs" role="tablist" aria-label="Chapters">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={t.active} className={t.active ? 'active' : ''} onClick={t.onClick}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="cphone-controls">
          <input
            className="cphone-search"
            type="search"
            aria-label="Search the rules"
            placeholder="Search every chapter…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="cphone-filter-row">
            <span className="cphone-count">
              {entries.length} of {totalCount}
            </span>
          </div>
        </div>

        <div className="cphone-list" role="list">
          {entries.map((e) => (
            <button
              key={e.key}
              type="button"
              role="listitem"
              className={`cphone-row${e.key === selectedKey ? ' selected' : ''}`}
              aria-pressed={e.key === selectedKey}
              onClick={() => setSelectedKey(e.key === selectedKey ? null : e.key)}
            >
              <span className="cphone-row-main">
                <span className="cphone-row-name">{e.name}</span>
                <span className="cphone-row-sub">{e.sub}</span>
              </span>
              {e.dm && (
                <span className="cphone-row-side">
                  <span className="cphone-row-small">DM only</span>
                </span>
              )}
            </button>
          ))}
          {entries.length === 0 && <p className="cphone-empty">Nothing in the rules matches that search.</p>}
        </div>

        <footer className={`cphone-detail${selected ? ' open' : ''}`}>
          {!selected ? (
            <p className="cphone-detail-empty">Tap an entry to read how it works.</p>
          ) : (
            <>
              <div className="cphone-detail-head">
                <b>{selected.name}</b>
                <button type="button" className="cphone-detail-close" aria-label="Back to the list" onClick={() => setSelectedKey(null)}>
                  &times;
                </button>
              </div>
              <div className="cphone-stats">
                <span>{selected.where}</span>
                {who(selected) && <span>{who(selected)}</span>}
              </div>
              {ruleBody(selected, 'cphone-detail-text', 'cphone-detail-text rules-list')}
            </>
          )}
        </footer>
      </div>
    );
  }

  function renderPage(p, role, extraClass, style, interactive) {
    const slice = entries.slice(p * perPage, p * perPage + perPage);
    const range = slice.length
      ? slice.length === 1
        ? shortName(slice[0].name)
        : `${shortName(slice[0].name)} to ${shortName(slice[slice.length - 1].name)}`
      : '';
    const left = role === 'L';
    return (
      <div
        key={`${extraClass}-${p}`}
        className={`cbook-page ${left ? 'left' : 'right'} ${extraClass}`}
        style={style}
        aria-hidden={interactive ? undefined : true}
      >
        <div className="cbook-page-head">
          <span className="cbook-chapter">{title}</span>
          <span className="cbook-range">{range}</span>
        </div>
        <div className="cbook-rows">
          {slice.map((e) => (
            <button
              key={e.key}
              type="button"
              className={`cbook-row${selected && e.key === selected.key ? ' selected' : ''}`}
              aria-pressed={Boolean(selected && e.key === selected.key)}
              tabIndex={interactive ? 0 : -1}
              onClick={() => setSelectedKey(e.key)}
            >
              <span className="cbook-row-lead">
                <span className="cbook-row-main">
                  <span className="cbook-row-name">{e.name}</span>
                  <span className="cbook-row-sub">{e.sub}</span>
                </span>
              </span>
              {e.dm && (
                <span className="cbook-row-side">
                  <span className="cbook-row-small">DM only</span>
                </span>
              )}
            </button>
          ))}
          {slice.length === 0 && p === 0 && <p className="cbook-empty">Nothing in the rules matches that search.</p>}
        </div>
        <div className={`cbook-page-foot ${left ? 'left' : 'right'}`}>
          {interactive && left && idle && shownSpread > 0 && (
            <button type="button" className="cbook-turn" aria-label="Previous page" onClick={() => turn('back')}>
              &#8249;
            </button>
          )}
          <span className="cbook-num">{p + 1}</span>
          {interactive && !left && idle && shownSpread < spreads - 1 && (
            <button type="button" className="cbook-turn" aria-label="Next page" onClick={() => turn('fwd')}>
              &#8250;
            </button>
          )}
        </div>
      </div>
    );
  }

  const L = shownSpread * 2;
  const go = flip.phase === 'go';
  const trans = go ? `transform ${FLIP_MS}ms cubic-bezier(0.45, 0.05, 0.25, 1)` : 'none';
  let slots;
  if (idle) {
    slots = [renderPage(L, 'L', 'base', { left: 0 }, true), renderPage(L + 1, 'R', 'base', { left: '50%' }, true)];
  } else if (flip.dir === 'fwd') {
    const ang = go ? -180 : 0;
    slots = [
      renderPage(L, 'L', 'base', { left: 0 }, false),
      renderPage(L + 3, 'R', 'base', { left: '50%' }, false),
      renderPage(L + 1, 'R', 'leaf', { left: '50%', transformOrigin: 'left center', transition: trans, transform: `rotateY(${ang}deg)` }, false),
      renderPage(L + 2, 'L', 'leaf', { left: '50%', transformOrigin: 'left center', transition: trans, transform: `rotateY(${ang}deg) translateX(100%) rotateY(180deg)` }, false),
    ];
  } else {
    const ang = go ? 180 : 0;
    slots = [
      renderPage(L - 2, 'L', 'base', { left: 0 }, false),
      renderPage(L + 1, 'R', 'base', { left: '50%' }, false),
      renderPage(L, 'L', 'leaf', { left: 0, transformOrigin: 'right center', transition: trans, transform: `rotateY(${ang}deg)` }, false),
      renderPage(L - 1, 'R', 'leaf', { left: 0, transformOrigin: 'right center', transition: trans, transform: `rotateY(${ang}deg) translateX(-100%) rotateY(180deg)` }, false),
    ];
  }

  return (
    <div className="cbook-backdrop" onClick={onClose}>
      <div className="cbook-stage" role="dialog" aria-modal="true" aria-label="Game table rules" onClick={(e) => e.stopPropagation()}>
        <div className="cbook-cover">
          <div className="cbook-cover-line" />
          <div className="cbook-stack left" />
          <div className="cbook-stack right" />
          <div className="cbook-ribbon" />
          <div className="cbook-pages" ref={pagesRef}>
            {slots}
            <div className="cbook-gutter" />
          </div>
        </div>

        <div className="cbook-tabs" role="tablist" aria-label="Chapters">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={t.active} className={`cbook-tab${t.active ? ' active' : ''}`} onClick={t.onClick}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="cbook-tray">
          <button type="button" className="cbook-close" aria-label="Close the rules" onClick={onClose}>
            &times;
          </button>
          <div className="cbook-tray-controls">
            <input
              className="cbook-search"
              type="search"
              aria-label="Search the rules"
              placeholder="Search every chapter…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="cbook-count">
              {entries.length} of {totalCount}
            </span>
          </div>

          <div className="cbook-selection">
            <span className="cbook-selection-name">{selected ? selected.name : 'Game table rules'}</span>
            {selected && (
              <span className="cbook-stats">
                <span>{selected.where}</span>
                {who(selected) && <span>{who(selected)}</span>}
              </span>
            )}
            {selected ? ruleBody(selected, 'cbook-rule-text', 'cbook-rule-text rules-list') : <p className="cbook-rule-text">Tap an entry in the book to read how it works.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
