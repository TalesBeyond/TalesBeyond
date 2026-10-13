// Portals: a pair of tokens that lead to each other. A portal works like a
// door: a player clicks it from next to it and steps through, the DM drops a
// hero or monster on it to send it through, and the DM can lock it or hide
// it. Where a door joins two layers, a portal comes out wherever its partner
// stands: on another layer, on another map of the same layer, or across the
// same map. Each end is a token of its own (`linkId`: the other end's id), so
// the DM drags either one to where it should be.
//
// Locking and hiding are per end. A player steps into the end they clicked,
// if it isn't locked, and only when their client holds the other end — one
// the DM has hidden, or the fog of war covers, leads nowhere for them. Taking
// one end off the table takes the other with it.
//
// Like a bulletin board, a portal is never written to the database. On a
// cloud table it lives in the DM's browser and reaches players over the
// table's channel, as a bulletin board does: each change as it is made, with
// every other token's (lib/fastSync.js), and all of it again to whoever
// connects afterwards (lib/boardSync.js). A guest or local table carries it
// like any other token.

export const PORTAL_ICON = 'portal';
export const PORTAL_COLOR = '#4b3a8c';
export const MAX_PORTAL_NAME = 60;

export function isPortal(entity) {
  return entity?.kind === 'portal';
}

// Something tokens walk through: a door or a portal.
export function isGate(entity) {
  return entity?.kind === 'door' || isPortal(entity);
}

// The other end of a portal as `entities` (id -> token) holds it, or null:
// not a portal, or its partner is gone or not there to be seen.
export function portalPartner(portal, entities) {
  const partner = isPortal(portal) && portal.linkId ? entities?.[portal.linkId] : null;
  return isPortal(partner) ? partner : null;
}

// Where a portal leads, in words: the layer and map when it is another
// layer, the map alone when it is this one. `layers`: state.layers. Null when
// the portal leads nowhere.
export function portalDestinationName(portal, partner, layers) {
  if (!partner) return null;
  const layer = layers?.[partner.layerId];
  const layerName = layer?.name || 'Untitled layer';
  const mapName = layer?.islands?.[partner.islandId]?.name || 'Untitled map';
  if (partner.layerId !== portal.layerId) return layerName === mapName ? layerName : `${layerName} · ${mapName}`;
  return partner.islandId === portal.islandId ? `${mapName} (this map)` : mapName;
}
