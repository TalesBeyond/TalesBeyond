// The compendium books that don't come with the app: Tomes, Food & Drink,
// Spells and Potions wait on the Store's Books shelf (data/store.js) until
// they are added, and only then lie in the Compendium drawer, on the open
// book's tabs and on the phone's Compendium tiles (components/Toolbar.jsx,
// CompendiumBook.jsx, PhoneHostScreens.jsx). Monsters, Items and Weapons
// always come with it. For now (testing, nothing is bought) the Store's Add
// button just adds one, and the list is kept in this browser only — nothing
// is synced. What the books hold is still there without them: a chest's
// contents, a hero's Spells tab and the shopkeepers' shelves read the same
// catalogue.
// A book not added still comes out once the table makes something of its own
// for it in Asset Storage — a "local" book, holding only those (bookShelf
// below). Adding the book from the Store makes it the full one.

import { useSyncExternalStore } from 'react';

// { kind, name, sub, icon, color }: `kind` is the book's chapter
// (CompendiumBook's CHAPTERS), `icon` a built-in picture for its Store frame
// and `color` its cover (styles.css .drawer-book.<kind>).
export const STORE_BOOKS = [
  { kind: 'tomes', name: 'Tomes', sub: 'Books to give or sell, and the ones you write', icon: 'book', color: '#33425c' },
  { kind: 'foods', name: 'Food & Drink', sub: 'Tavern fare and trail food to give or sell', icon: 'mug', color: '#7a4f24' },
  { kind: 'spells', name: 'Spells', sub: 'A hundred spells to teach a hero', icon: 'wand', color: '#43346e' },
  { kind: 'potions', name: 'Potions', sub: 'Potions, elixirs and venoms, each with its recipe', icon: 'flask', color: '#6a2b4c' },
];

const STORE_BOOK_KINDS = STORE_BOOKS.map((b) => b.kind);
const OWNED_BOOKS_KEY = 'hearthbound:ownedBooks';

function loadOwnedBooks() {
  try {
    const kinds = JSON.parse(window.localStorage.getItem(OWNED_BOOKS_KEY));
    return Array.isArray(kinds) ? kinds.filter((kind) => STORE_BOOK_KINDS.includes(kind)) : [];
  } catch {
    return [];
  }
}

let ownedBooks = loadOwnedBooks();
const listeners = new Set();

// Adds a Store book to the Compendium.
export function addStoreBook(kind) {
  if (ownedBooks.includes(kind) || !STORE_BOOK_KINDS.includes(kind)) return;
  ownedBooks = [...ownedBooks, kind];
  try {
    window.localStorage.setItem(OWNED_BOOKS_KEY, JSON.stringify(ownedBooks));
  } catch {
    // storage blocked or full: the book is only added until the page closes
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// The Store books this browser has, by kind.
export function useOwnedBooks() {
  return useSyncExternalStore(subscribe, () => ownedBooks);
}

// Whether a compendium chapter is owned: always for one that comes with the
// app, and for a Store book once it is added. `owned` is useOwnedBooks()'s
// list.
export function hasBook(kind, owned) {
  return !STORE_BOOK_KINDS.includes(kind) || owned.includes(kind);
}

// The Asset Storage type a Store book's own entries are saved as.
const OWN_ASSET_TYPES = { tomes: 'tome', foods: 'food', spells: 'spell', potions: 'potion' };

// Whether the table has made entries of its own for a chapter in Asset
// Storage (`customAssets`: the table's state.customAssets).
export function hasOwnEntries(kind, customAssets) {
  const type = OWN_ASSET_TYPES[kind];
  return Boolean(type) && Object.values(customAssets || {}).some((asset) => asset.assetType === type);
}

// The catalogue lists (lib/catalog.js's useCatalog) each Store book holds.
const BOOK_CATALOG_KEYS = { tomes: ['tomes'], foods: ['foods', 'foodIngredients'], spells: ['spells'], potions: ['potions', 'ingredients'] };

// The catalogue without the built-in entries of every Store book not added:
// what the DM browses and stocks from (a local compendium book, a
// shopkeeper's shelves) is then only what the table made in Asset Storage.
// Lookups of something already given or stocked keep the whole catalogue.
export function ownedCatalog(catalog, owned) {
  const out = { ...catalog };
  for (const [kind, keys] of Object.entries(BOOK_CATALOG_KEYS)) {
    if (!owned.includes(kind)) for (const key of keys) out[key] = [];
  }
  return out;
}

// How a chapter stands on the shelf:
//   'full'  — owned (hasBook): its built-in entries and the table's own;
//   'local' — a Store book not added, but the table has made entries of its
//             own for it (`hasOwn`), so the book holds only those;
//   null    — not on the shelf at all.
export function bookShelf(kind, owned, hasOwn) {
  if (hasBook(kind, owned)) return 'full';
  return hasOwn ? 'local' : null;
}
