// The Store's shelves (components/StoreModal.jsx): what could be sold, by
// section. Everything here is an example — made-up names and prices, with
// pictures borrowed from the app's own icons and animated heroes — until a
// real catalogue replaces it. Nothing can be bought yet; for testing, a
// Characters ware has an Add button that puts it in the Default heroes
// gallery, and a Books ware one that puts it in the Compendium.
//   { key, name, price, imageUrl, spriteKey?, bookKind?, sub?, available? }
//   price is in US dollars; spriteKey is the animated hero a Characters ware
//   adds (data/spriteTokens.js), bookKind the compendium book a Books ware
//   adds (data/storeBooks.js), sub a line on what is in it, and available
//   true for a ware that can be had while the Store is closed (STORE_OPEN)

import { makeIconDataUrl } from './defaultTokens.js';
import { STORE_SPRITE_HEROES } from './spriteTokens.js';
import { STORE_BOOKS } from './storeBooks.js';

const item = (name, price, icon, color) => ({ key: name, name, price, imageUrl: makeIconDataUrl(icon, color) });

const CHARACTER_PRICES = [1.99, 1.99, 2.49, 2.49, 1.99, 2.99, 2.49, 2.99];
const BOOK_PRICES = [2.99, 2.49, 3.99, 2.99];
// Books given away, and open to Add while the rest of the Store is coming soon.
const FREE_BOOKS = ['foods'];

export const STORE_SECTIONS = [
  {
    key: 'maps',
    label: 'Maps',
    blurb: 'Ready-made places to drop onto a layer.',
    items: [
      item('The Sunken Crypt', 3.99, 'map', '#4c7a86'),
      item('Emberfall Keep', 4.99, 'map', '#8f3a20'),
      item('Mistwood Crossing', 2.99, 'map', '#45573f'),
      item('Harbor of Lanterns', 4.99, 'map', '#6b6b8f'),
      item('Frostpeak Pass', 3.49, 'map', '#5c7f99'),
      item('The Glass Desert', 5.99, 'map', '#a9853f'),
    ],
  },
  {
    key: 'characters',
    label: 'Characters',
    blurb: 'Animated heroes for the table.',
    items: STORE_SPRITE_HEROES.map((h, i) => ({
      key: h.key,
      name: h.name.replace(/^Sprite /, 'The '),
      price: CHARACTER_PRICES[i % CHARACTER_PRICES.length],
      imageUrl: h.imageUrl,
      spriteKey: h.key,
    })),
  },
  {
    key: 'books',
    label: 'Books',
    blurb: 'More books for the Compendium, each a chapter of ready-made content.',
    items: STORE_BOOKS.map((b, i) => ({
      key: `book-${b.kind}`,
      name: b.name,
      price: FREE_BOOKS.includes(b.kind) ? 0 : BOOK_PRICES[i % BOOK_PRICES.length],
      imageUrl: makeIconDataUrl(b.icon, b.color),
      bookKind: b.kind,
      sub: b.sub,
      available: FREE_BOOKS.includes(b.kind),
    })),
  },
  {
    key: 'stories',
    label: 'Stories',
    blurb: 'Adventures written out, scene by scene.',
    items: [
      item('The Lantern Thief', 6.99, 'book', '#7a2f55'),
      item('Ashes of Emberfall', 9.99, 'book', '#8f3a20'),
      item('A Wedding at Mistwood', 4.99, 'book', '#45573f'),
      item('The Drowned Bell', 7.99, 'book', '#4c7a86'),
      item('Nine Crowns, One Throne', 12.99, 'book', '#a9853f'),
    ],
  },
  {
    key: 'bundles',
    label: 'Bundles',
    blurb: 'Maps, heroes and a story together, for less.',
    items: [
      item('Starter Table Bundle', 14.99, 'chest', '#c98a3b'),
      item('Dungeon Delver’s Pack', 19.99, 'pack', '#45573f'),
      item('Heroes of the Vale', 9.99, 'pack', '#6b6b8f'),
      item('The Emberfall Saga', 24.99, 'chest', '#8f3a20'),
    ],
  },
];

// While false, the Store only shows what is coming: every ware reads
// "Coming soon" instead of its price, and its Add button is disabled — all
// but an `available` ware (a free book), which keeps its price and its Add.
export const STORE_OPEN = false;

export function formatStorePrice(price) {
  return price > 0 ? `$${price.toFixed(2)}` : 'Free';
}
