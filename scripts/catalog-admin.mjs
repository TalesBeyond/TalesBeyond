// Default catalog admin script (REQ-010). Runs on the admin's machine only.
//
//   npm run catalog:seed -- [--assets <dir>] [--only weapons,items,...] [--dry-run]
//
// Reads the built-in catalogs from src/data, upserts them into Supabase by
// slug, and uploads any picture / song / model found in the assets folder
// (default ./catalog-assets, git-ignored) laid out as <kind>/<slug>.<ext>:
//
//   catalog-assets/weapons/longsword.webp      (also used by +1/+2 Longsword)
//
// Safe to run again: rows are upserted, files are overwritten, and a row with
// no local file keeps the image path it already has.
//
// It needs the project URL and the SERVICE-ROLE key, from .env (loaded by
// `node --env-file=.env`). The key is never prefixed VITE_, so Vite never
// bundles it into the app, and this script refuses to run with a publishable
// key.

import { createClient } from '@supabase/supabase-js';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { WEAPONS } from '../src/data/weapons.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';
import { slugify } from '../src/data/slugify.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const dryRun = flag('dry-run');
const assetsDir = path.resolve(option('assets') || 'catalog-assets');
const only = option('only')?.split(',').map((s) => s.trim());

const url = process.env.VITE_SUPABASE_PROJECT_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set VITE_SUPABASE_PROJECT_URL and SUPABASE_SERVICE_ROLE_KEY in .env (see .env.example).');
  process.exit(1);
}
if (key === process.env.VITE_SUPABASE_PUBLISHABLE_KEY || key.startsWith('sb_publishable') || key.includes('"role":"anon"')) {
  console.error('SUPABASE_SERVICE_ROLE_KEY looks like a public key. Use the service-role (secret) key.');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const IMAGE_BUCKET = 'catalog-images';
const IMAGE_MAX_BYTES = 1024 * 1024;
const AUDIO_BUCKET = 'catalog-audio';
const AUDIO_MAX_BYTES = 10 * 1024 * 1024;
const AUDIO_TYPES = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };

// Files in <assets>/<folder> with one of `extensions`, as Map<slug, filename>.
async function localFiles(folder, extensions) {
  const dir = path.join(assetsDir, folder);
  let names;
  try {
    names = await readdir(dir);
  } catch {
    return new Map();
  }
  const files = new Map();
  for (const name of names) {
    const ext = path.extname(name).toLowerCase();
    if (extensions.includes(ext)) files.set(path.basename(name, path.extname(name)).toLowerCase(), name);
  }
  return files;
}

async function upload(bucket, objectPath, filePath, contentType) {
  const size = (await stat(filePath)).size;
  const limit = bucket === IMAGE_BUCKET ? IMAGE_MAX_BYTES : bucket === AUDIO_BUCKET ? AUDIO_MAX_BYTES : Infinity;
  if (size > limit) {
    console.warn(`  skip ${objectPath}: ${(size / 1048576).toFixed(1)} MB is over the ${limit / 1048576} MB limit for ${bucket}`);
    return false;
  }
  if (dryRun) return true;
  const { error } = await supabase.storage.from(bucket).upload(objectPath, await readFile(filePath), { contentType, upsert: true });
  if (error) throw new Error(`upload ${bucket}/${objectPath}: ${error.message}`);
  return true;
}

async function existingPaths(table, column = 'image_path') {
  const { data, error } = await supabase.from(table).select(`slug, ${column}`);
  if (error) throw new Error(`read ${table}: ${error.message}`);
  return new Map(data.map((row) => [row.slug, row[column]]));
}

async function upsertRows(table, rows) {
  if (dryRun) return;
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + 100), { onConflict: 'slug' });
    if (error) throw new Error(`upsert ${table}: ${error.message}`);
  }
}

// Uploads every local picture in <assets>/<folder>, returning the set of slugs
// that made it to the bucket.
async function uploadImages(folder, local) {
  const uploaded = new Set();
  for (const [slug, name] of local) {
    if (await upload(IMAGE_BUCKET, `${folder}/${slug}.webp`, path.join(assetsDir, folder, name), 'image/webp')) uploaded.add(slug);
  }
  return uploaded;
}

const baseWeaponSlug = (name) => slugify(name.replace(/^\+\d+ /, ''));

async function seedWeapons() {
  const existing = await existingPaths('catalog_weapons');
  const uploaded = await uploadImages('weapons', await localFiles('weapons', ['.webp']));
  const rows = WEAPONS.map((w) => {
    const slug = slugify(w.name);
    const base = baseWeaponSlug(w.name);
    return {
      slug,
      name: w.name,
      type: w.type,
      number_of_dice: w.numberOfDice,
      dice_type: w.diceType,
      modifier: w.modifier,
      damage: w.damage,
      cost: w.cost,
      equipable_class: w.equipableClass,
      image_path: uploaded.has(base) ? `weapons/${base}.webp` : existing.get(slug) ?? null,
    };
  });
  await upsertRows('catalog_weapons', rows);
  return `${rows.length} weapons, ${uploaded.size} pictures`;
}

async function seedItems() {
  const existing = await existingPaths('catalog_items');
  const uploaded = await uploadImages('items', await localFiles('items', ['.webp']));
  const rows = ITEMS.map((it) => {
    const slug = slugify(it.name);
    return {
      slug,
      name: it.name,
      category: it.category,
      cost: it.cost,
      weight: it.weight,
      description: it.description || '',
      image_path: uploaded.has(slug) ? `items/${slug}.webp` : existing.get(slug) ?? null,
    };
  });
  await upsertRows('catalog_items', rows);
  return `${rows.length} items, ${uploaded.size} pictures`;
}

// A monster's row slug is its key; its picture is monsters/<key>.webp.
async function seedMonsters() {
  const existing = await existingPaths('catalog_monsters');
  const uploaded = await uploadImages('monsters', await localFiles('monsters', ['.webp']));
  const rows = MONSTERS.map((m) => ({
    slug: m.key,
    name: m.name,
    kind: m.kind,
    cr: m.cr,
    hp: m.hp,
    ac: m.ac,
    speed: m.speed,
    abilities: m.abilities,
    size: m.size,
    icon: m.icon,
    color: m.color,
    attack: m.attack,
    description: m.description,
    image_path: uploaded.has(m.key) ? `monsters/${m.key}.webp` : existing.get(m.key) ?? null,
  }));
  await upsertRows('catalog_monsters', rows);
  return `${rows.length} monsters, ${uploaded.size} pictures`;
}

const titleCase = (slug) => slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Songs come from files alone: <assets>/audio/<slug>.mp3|wav. A new song's
// name is its file name; an existing song keeps whatever name it has.
async function seedAudio() {
  const local = await localFiles('audio', Object.keys(AUDIO_TYPES));
  const existing = await existingPaths('catalog_audio', 'audio_path');
  let count = 0;
  for (const [slug, name] of local) {
    const ext = path.extname(name).toLowerCase();
    const filePath = path.join(assetsDir, 'audio', name);
    const objectPath = `audio/${slug}${ext}`;
    if (!(await upload(AUDIO_BUCKET, objectPath, filePath, AUDIO_TYPES[ext]))) continue;
    const fields = { audio_path: objectPath, mime: AUDIO_TYPES[ext], size_bytes: (await stat(filePath)).size };
    if (!dryRun) {
      const { error } = existing.has(slug)
        ? await supabase.from('catalog_audio').update(fields).eq('slug', slug)
        : await supabase.from('catalog_audio').insert({ slug, name: titleCase(slug), ...fields });
      if (error) throw new Error(`write catalog_audio ${slug}: ${error.message}`);
    }
    count += 1;
  }
  return `${count} songs`;
}

const KINDS = {
  weapons: seedWeapons,
  items: seedItems,
  monsters: seedMonsters,
  audio: seedAudio,
};

async function main() {
  console.log(`${dryRun ? '[dry run] ' : ''}Seeding ${url} from ${assetsDir}`);
  for (const [kind, run] of Object.entries(KINDS)) {
    if (only && !only.includes(kind)) continue;
    console.log(`- ${kind}: ${await run()}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
