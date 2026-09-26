// Default catalog admin script (REQ-010). Runs on the admin's machine only.
//
//   npm run catalog:seed -- [--assets <dir>] [--only weapons,items,...] [--dry-run]
//
// Reads the built-in catalogs from src/data, upserts them into Supabase by
// slug, and uploads any picture / model found in the assets folder
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
const MODEL_BUCKET = 'catalog-models';
const MODEL_MAX_BYTES = 8 * 1024 * 1024;

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
  const limit = { [IMAGE_BUCKET]: IMAGE_MAX_BYTES, [MODEL_BUCKET]: MODEL_MAX_BYTES }[bucket] ?? Infinity;
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

const DIE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

// One row per die type; its picture is dice/<die type>.webp (d4 … d100).
async function seedDiceImages() {
  const existing = await existingPaths('catalog_dice_images');
  const uploaded = await uploadImages('dice', await localFiles('dice', ['.webp']));
  const rows = DIE_TYPES.map((die) => ({
    slug: die,
    name: die,
    die_type: die,
    image_path: uploaded.has(die) ? `dice/${die}.webp` : existing.get(die) ?? null,
  }));
  await upsertRows('catalog_dice_images', rows);
  return `${rows.length} dice, ${[...uploaded].filter((s) => DIE_TYPES.includes(s)).length} pictures`;
}

const dieTypeOf = (slug) => DIE_TYPES.find((die) => slug === die || slug.startsWith(`${die}-`)) ?? null;

// 3D dice bases (no app UI yet): <assets>/dice-models/<slug>.glb, where the slug
// starts with its die type ("d20-classic"), plus an optional
// dice-models/<slug>.webp preview.
async function seedDiceModels() {
  const models = await localFiles('dice-models', ['.glb']);
  const previews = await localFiles('dice-models', ['.webp']);
  const existing = await existingPaths('catalog_dice_models', 'preview_image_path');
  const rows = [];
  for (const [slug, name] of models) {
    const dieType = dieTypeOf(slug);
    if (!dieType) {
      console.warn(`  skip dice-models/${name}: name must start with a die type, e.g. d20-classic.glb`);
      continue;
    }
    const modelPath = `dice-models/${slug}.glb`;
    if (!(await upload(MODEL_BUCKET, modelPath, path.join(assetsDir, 'dice-models', name), 'model/gltf-binary'))) continue;
    let previewPath = existing.get(slug) ?? null;
    if (previews.has(slug)) {
      const previewObject = `dice-models/${slug}.webp`;
      if (await upload(IMAGE_BUCKET, previewObject, path.join(assetsDir, 'dice-models', previews.get(slug)), 'image/webp')) previewPath = previewObject;
    }
    rows.push({ slug, name: titleCase(slug), die_type: dieType, model_path: modelPath, preview_image_path: previewPath });
  }
  // A re-run must not rename a model the admin has already renamed.
  const known = await existingPaths('catalog_dice_models', 'name');
  await upsertRows('catalog_dice_models', rows.map((row) => ({ ...row, name: known.get(row.slug) ?? row.name })));
  return `${rows.length} models`;
}

// Skin textures: <assets>/dice-skins/<slug>.webp. A slug written
// "<model slug>__<name>" belongs to that model; "<die type>__<name>" to any
// model of that die type; anything else to neither.
async function seedDiceSkins() {
  const local = await localFiles('dice-skins', ['.webp']);
  const modelSlugs = new Set([...(await existingPaths('catalog_dice_models', 'model_path')).keys(), ...(await localFiles('dice-models', ['.glb'])).keys()]);
  const known = await existingPaths('catalog_dice_skins', 'name');
  const uploaded = await uploadImages('dice-skins', local);
  const rows = [...uploaded].map((slug) => {
    const [owner, ...rest] = slug.split('__');
    const named = rest.length ? rest.join('__') : owner;
    return {
      slug,
      name: known.get(slug) ?? titleCase(named),
      texture_path: `dice-skins/${slug}.webp`,
      model_slug: rest.length && modelSlugs.has(owner) ? owner : null,
      die_type: rest.length && DIE_TYPES.includes(owner) ? owner : null,
    };
  });
  await upsertRows('catalog_dice_skins', rows);
  return `${rows.length} skins`;
}

const titleCase = (slug) => slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Songs are no longer seeded to Supabase: music ships with the app, in
// src/assets/audio/music/ (see src/data/defaultAudio.js).

const KINDS = {
  weapons: seedWeapons,
  items: seedItems,
  monsters: seedMonsters,
  dice: seedDiceImages,
  'dice-models': seedDiceModels,
  'dice-skins': seedDiceSkins,
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
