// A colour is the one other place a picture can hide. Colours go straight
// into CSS (a token's ring, a player's dot, a map's fill), and CSS accepts
// `url(https://…)` wherever it accepts a colour in a `background`, so a
// "colour" sent by another browser could put any picture on the web on
// everyone's screen, past the picture filter (imageSafety.js).
//
// Everything that arrives from outside this browser goes through
// scrubInbound first: cloud rows (remoteApi.js, realtime.js) and guest-table
// messages (guestRealtime.js). Pictures themselves are handled where they are
// drawn (imageCache.js resolveImage).

const FALLBACK_COLOUR = '#6f6f6f';
const HEX = /^#[0-9a-f]{3,8}$/i;
// rgb(…) / hsl(…) with nothing inside but numbers, and plain names (red,
// transparent): neither can make a browser load anything.
const FUNCTIONAL = /^(rgb|rgba|hsl|hsla)\(\s*[0-9.,%\s/deg-]*\)$/i;
const NAMED = /^[a-z]{3,24}$/i;
const COLOUR_KEY = /colou?r$/i;

export function isSafeColour(value) {
  return HEX.test(value) || FUNCTIONAL.test(value) || NAMED.test(value);
}

// The same value with every unsafe colour replaced by a neutral grey: any
// string under a key ending in "color"/"colour", or named `fill`/`stroke`.
// Untouched parts are returned as they are, not copied.
export function scrubInbound(value) {
  if (Array.isArray(value)) {
    let out = value;
    for (let i = 0; i < value.length; i++) {
      const next = scrubInbound(value[i]);
      if (next !== value[i]) {
        if (out === value) out = value.slice();
        out[i] = next;
      }
    }
    return out;
  }
  if (!value || typeof value !== 'object') return value;
  let out = value;
  for (const key of Object.keys(value)) {
    const current = value[key];
    let next = current;
    if (typeof current === 'string') {
      if ((COLOUR_KEY.test(key) || key === 'fill' || key === 'stroke') && current && !isSafeColour(current)) next = FALLBACK_COLOUR;
    } else if (current && typeof current === 'object') {
      next = scrubInbound(current);
    }
    if (next !== current) {
      if (out === value) out = { ...value };
      out[key] = next;
    }
  }
  return out;
}
