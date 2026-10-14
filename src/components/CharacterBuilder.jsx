import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import CreatureCard from './CreatureCard.jsx';
import { BattleEquipmentTab, SpellsTab, BagTab, SavesSkillsTab } from './RightPanel.jsx';
import { DEFAULT_HEROES } from '../data/defaultTokens.js';
import { SPRITE_HEROES, spriteForUrl, useOwnedSpriteHeroes } from '../data/spriteTokens.js';
import { resizeImageToDataUrl } from '../utils/image.js';
import { imageErrorMessage } from '../lib/imageSafety.js';
import { useImageCacheVersion } from '../lib/imageCache.js';
import { entityImageSrc } from '../lib/storedImages.js';
import {
  HERO_FILE_EXTENSION,
  HERO_IMAGE_MAX_DIM,
  downloadHeroFile,
  heroFileErrorMessage,
  loadHeroDraft,
  newHero,
  readHeroFile,
  saveHeroDraft,
} from '../lib/heroFile.js';

// Every built-in picture, owned or not: a hero wearing any of them (say, one
// from a file, in an animated look still in the Store) isn't using its own image.
const BUILT_IN_LOOKS = [...DEFAULT_HEROES, ...SPRITE_HEROES];

// The Characters screen: anyone, a player or the DM, at a table or before
// joining one, builds a hero on the same card a hero has on the map (its
// name, level, hit points, armor, abilities, and the Battle, Spells, Bag and
// Skills tabs), picks its picture, and keeps it as a .tlsbyd file
// (lib/heroFile.js). A file made earlier is uploaded here to go on with.
//
// `table` is set when the screen is opened at a table, and says how the hero
// gets onto it:
//   { isHost, canSend, dmName, onPlace(hero), onSend(hero) }
// The DM places it on the map. A player sends it to the DM, who adds it as
// that player's hero (`onSend` resolves once it is sent, or rejects with a
// message to show); `canSend` is false on a table with no channel to send it
// over. With no `table` the screen only builds, exports and uploads.
//
// The hero being worked on is kept in this browser, so it is still here after
// the screen is closed, the page reloaded, or a table joined.
export default function CharacterBuilder({ table = null, onClose }) {
  const [hero, setHero] = useState(() => loadHeroDraft() || newHero());
  // Bumped when another hero takes this one's place, so the card starts over
  // on its first tab with nothing half-edited.
  const [cardKey, setCardKey] = useState(0);
  const [status, setStatus] = useState(null); // { tone: 'ok' | 'error', text }
  const [busy, setBusy] = useState(null); // what the screen is waiting on, in words
  const fileRef = useRef(null);
  const pictureRef = useRef(null);
  // The looks to pick from: the plain heroes and the animated ones this browser has.
  const looks = [...DEFAULT_HEROES, ...useOwnedSpriteHeroes()];

  useEffect(() => {
    const timer = setTimeout(() => saveHeroDraft(hero), 300);
    return () => clearTimeout(timer);
  }, [hero]);
  // Closing the screen within that wait still keeps the last change.
  const latest = useRef(hero);
  latest.current = hero;
  useEffect(() => () => saveHeroDraft(latest.current), []);

  function replaceHero(next, text) {
    setHero(next);
    setCardKey((k) => k + 1);
    setStatus(text ? { tone: 'ok', text } : null);
  }

  function updateSheet(patch) {
    setHero((prev) => ({ ...prev, sheet: { ...prev.sheet, ...patch } }));
  }

  // The card's own fields. A premade hero is always at full health, so its
  // hit points are one number: whichever the card changed is its maximum.
  function updateCard(_id, patch) {
    setHero((prev) => {
      const next = { ...prev };
      if (typeof patch.name === 'string' && patch.name.trim()) next.name = patch.name.trim().slice(0, 60);
      if (Number.isInteger(patch.size)) next.size = Math.max(1, Math.min(4, patch.size));
      const hp = patch.maxHp ?? patch.hp;
      if (Number.isInteger(hp)) next.maxHp = Math.max(1, Math.min(9999, hp));
      // The pencil on the card's art: the same picture as "Add your own image".
      if (typeof patch.imageUrl === 'string' && patch.imageUrl) next.imageUrl = patch.imageUrl;
      return next;
    });
  }

  async function handlePictureChosen(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('Checking the picture…');
    setStatus(null);
    try {
      const imageUrl = await resizeImageToDataUrl(file, HERO_IMAGE_MAX_DIM);
      setHero((prev) => ({ ...prev, imageUrl }));
    } catch (err) {
      setStatus({ tone: 'error', text: imageErrorMessage(err, 'Could not read that image. Try a different file.') });
    } finally {
      setBusy(null);
    }
  }

  async function handleFileChosen(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('Reading the hero…');
    setStatus(null);
    try {
      const { hero: loaded, pictureError } = await readHeroFile(file);
      replaceHero(loaded, `${loaded.name} loaded from ${file.name}.`);
      if (pictureError) {
        setStatus({
          tone: 'error',
          text: `${loaded.name} loaded, but without its picture. ${imageErrorMessage(pictureError, 'The picture in the file could not be read.')}`,
        });
      }
    } catch (err) {
      setStatus({ tone: 'error', text: heroFileErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  function exportHero() {
    downloadHeroFile(hero);
    setStatus({ tone: 'ok', text: `${hero.name} saved as a ${HERO_FILE_EXTENSION} file in your downloads.` });
  }

  async function sendToDm() {
    setBusy('Sending…');
    setStatus(null);
    try {
      await table.onSend(hero);
      setStatus({
        tone: 'ok',
        text: `${hero.name} was sent to ${table.dmName || 'the DM'}. It appears on the map as your hero once they accept.`,
      });
    } catch (err) {
      setStatus({ tone: 'error', text: err?.message || 'Could not send the hero. Try again.' });
    } finally {
      setBusy(null);
    }
  }

  const entity = {
    id: 'premade-hero',
    kind: 'hero',
    name: hero.name,
    imageUrl: hero.imageUrl,
    color: hero.color,
    size: hero.size,
    hp: hero.maxHp,
    maxHp: hero.maxHp,
    tempHp: 0,
    conditions: [],
  };
  const { sheet } = hero;
  const tabs = [
    {
      key: 'battle',
      label: 'Battle',
      content: <BattleEquipmentTab sheet={sheet} updateSheet={updateSheet} targets={[]} onAttackTarget={() => {}} attackerName={hero.name} noTargetsHint={null} />,
    },
    { key: 'spells', label: 'Spells', content: <SpellsTab sheet={sheet} updateSheet={updateSheet} /> },
    { key: 'bag', label: 'Bag', content: <BagTab sheet={sheet} updateSheet={updateSheet} /> },
    { key: 'skills', label: 'Skills', content: <SavesSkillsTab sheet={sheet} updateSheet={updateSheet} /> },
  ];
  const ownPicture = !BUILT_IN_LOOKS.some((look) => look.imageUrl === hero.imageUrl);

  return createPortal(
    <div className="hero-screen" role="dialog" aria-label="Create a character">
      <header className="hero-screen-bar">
        <h2>Create a character</h2>
        <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(busy)} onClick={() => replaceHero(newHero(), 'Started a new hero.')}>
          New hero
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(busy)} onClick={() => fileRef.current?.click()}>
          Upload {HERO_FILE_EXTENSION}
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(busy)} onClick={exportHero}>
          Export {HERO_FILE_EXTENSION}
        </button>
        <button type="button" className="popover-close" aria-label="Close the Characters screen" title="Close" onClick={onClose}>
          ×
        </button>
        <input ref={fileRef} type="file" accept={HERO_FILE_EXTENSION} style={{ display: 'none' }} onChange={handleFileChosen} />
      </header>

      <div className="hero-screen-body">
        <aside className="hero-screen-side">
          {(busy || status) && (
            <p className={`hero-screen-status${!busy && status?.tone === 'error' ? ' error' : ''}`} role="status">
              {busy || status.text}
            </p>
          )}

          <section className="hero-screen-block">
            <h3>Picture</h3>
            <p>How the hero looks on the map.</p>
            <div className="token-grid">
              {looks.map((look) => {
                const sprite = spriteForUrl(look.imageUrl);
                return (
                  <button
                    key={look.key}
                    type="button"
                    className="token-card round"
                    aria-pressed={look.imageUrl === hero.imageUrl}
                    aria-label={`Use the ${look.name} picture`}
                    onClick={() => setHero((prev) => ({ ...prev, imageUrl: look.imageUrl, color: look.color }))}
                  >
                    {sprite ? (
                      <span className="sprite" style={{ backgroundImage: `url(${sprite.sheet})`, '--sprite-frames': sprite.frames }} aria-hidden="true" />
                    ) : (
                      <img src={look.imageUrl} alt="" />
                    )}
                    <span>{look.name}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" className={`add-image-drop${ownPicture ? ' chosen' : ''}`} disabled={Boolean(busy)} onClick={() => pictureRef.current?.click()}>
              {ownPicture ? 'Using your own image' : 'Add your own image'}
              <span>{ownPicture ? 'Press to pick another' : 'PNG or JPG'}</span>
            </button>
            <input ref={pictureRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePictureChosen} />
          </section>

          <section className="hero-screen-block">
            <h3>{table ? 'Bring it to this table' : 'Bring it to a table'}</h3>
            {!table && (
              <p>
                Export the hero as a {HERO_FILE_EXTENSION} file to keep it. At a table, open <b>Characters</b> to send it to your DM, or hand them the file. This
                browser also remembers the hero you are working on.
              </p>
            )}
            {table?.isHost && (
              <>
                <p>
                  It lands on the map you are viewing, with this sheet. Pick who plays it under <b>played by</b> on its card.
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    table.onPlace(hero);
                    onClose();
                  }}
                >
                  Place {hero.name} on the map
                </button>
              </>
            )}
            {table && !table.isHost && table.canSend && (
              <>
                <p>{table.dmName || 'The DM'} is asked to add it to the map. Once they accept, it is your hero, with this sheet.</p>
                <button type="button" className="btn btn-primary btn-block" disabled={Boolean(busy)} onClick={sendToDm}>
                  Send {hero.name} to the DM
                </button>
              </>
            )}
            {table && !table.isHost && !table.canSend && (
              <p>
                On this table only the DM adds heroes. Export the {HERO_FILE_EXTENSION} file and hand it to them: they upload it from the <b>Tokens</b> panel.
              </p>
            )}
          </section>
        </aside>

        <div className="hero-screen-sheet">
          <CreatureCard
            key={cardKey}
            entity={entity}
            sheet={sheet}
            updateSheet={updateSheet}
            onUpdate={updateCard}
            canEdit
            showConditions={false}
            typeLine="Premade hero"
            tabs={tabs}
            tabNote="Click any value on the card to change it."
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

// The DM's side of a player's "Send to the DM": one card per hero waiting for
// an answer. `offers`: [{ id, byId, hero }]; `players`: the table's seats.
export function HeroOffers({ offers, players, onAccept, onDecline }) {
  useImageCacheVersion(); // redraw when an offered hero's own picture arrives
  if (!offers.length) return null;
  return (
    <div className="hero-offers" aria-live="polite">
      {offers.map((offer) => {
        const { hero } = offer;
        const sender = players[offer.byId]?.name || 'A player';
        return (
          <div key={offer.id} className="hero-offer" role="group" aria-label={`${sender} sent a hero`}>
            <img src={entityImageSrc({ kind: 'hero', imageUrl: hero.imageUrl, color: hero.color })} alt="" />
            <div className="hero-offer-text">
              <b>{sender}</b> wants to play <b>{hero.name}</b>
              <span>
                Level {hero.sheet.level} · {hero.maxHp} HP · AC {hero.sheet.armorClass}
              </span>
            </div>
            <div className="hero-offer-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onDecline(offer)}>
                Decline
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onAccept(offer)}>
                Add to the map
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
