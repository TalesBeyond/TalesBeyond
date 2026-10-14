// The quick campaign: a ready-made world for someone trying the app for the
// first time, opened from the Landing screen's "Try a quick campaign" as a
// guest table with them as its DM. A town with its inn, blacksmith and
// library (three floors of it), a dark forest beyond the fields, a few
// monsters about and heroes waiting for players.
//
// The world is campaigns/quick-campaign.json: a table's state without its
// session or players. Token pictures in it are built-in icon references
// (`icon:<name>:<#color>`, drawn again here) and map backgrounds are picture
// fingerprints (`img:<sha-256>`); each fingerprint's picture ships in
// src/assets/campaign/ as campaign-<sha-256>.<ext> and is kept in this
// browser under it before the table opens (lib/imageCache.js), so the guest
// table hands it to players like any picture the DM uploaded.

import template from './campaigns/quick-campaign.json';
import { createEmptyGameState } from '../state/store.jsx';
import { iconUrlForRef } from './defaultTokens.js';
import './spriteTokens.js'; // the animated heroes' icons, before any reference is read
import { keepBundledImage } from '../lib/imageCache.js';
import { generateInviteCode, generatePlayerId } from '../utils/inviteCode.js';

const PICTURES = import.meta.glob('../assets/campaign/campaign-*.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' });

const pictureUrlByHash = Object.fromEntries(
  Object.entries(PICTURES).map(([path, url]) => [/campaign-([0-9a-f]{64})\./.exec(path)?.[1], url]).filter(([hash]) => hash)
);

// Every map picture the campaign uses, kept in this browser. One that is
// missing from the build (or fails to load) leaves its map bare parchment.
async function keepPictures(layers) {
  const hashes = new Set();
  for (const layer of Object.values(layers)) {
    for (const island of Object.values(layer.islands)) {
      const hash = /^img:([0-9a-f]{64})$/.exec(island.backgroundImage || '')?.[1];
      if (hash) hashes.add(hash);
    }
  }
  await Promise.all(
    [...hashes].map(async (hash) => {
      const url = pictureUrlByHash[hash];
      if (!url) return;
      try {
        await keepBundledImage(hash, await (await fetch(url)).blob());
      } catch {
        // its map opens without a picture
      }
    })
  );
}

// A new guest table holding the campaign, with `hostName` as its DM:
// { state, me }, ready for Landing's onEnter({ state, me, mode: 'guest' }).
export async function createQuickCampaignTable({ hostName, hostColor }) {
  const code = generateInviteCode();
  const hostId = generatePlayerId();
  const empty = createEmptyGameState({ code, hostPlayerId: hostId, hostName, hostColor });
  const world = structuredClone(template);
  for (const entity of Object.values(world.entities)) {
    entity.imageUrl = iconUrlForRef(entity.imageUrl) || '';
  }
  await keepPictures(world.layers);
  const host = { ...empty.players[hostId], currentLayerId: world.layerOrder[0] };
  const state = { ...empty, ...world, session: empty.session, players: { [hostId]: host } };
  return { state, me: { id: hostId, name: hostName, color: hostColor, isHost: true } };
}
