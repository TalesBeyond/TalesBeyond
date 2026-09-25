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
  if (bucket === IMAGE_BUCKET && size > IMAGE_MAX_BYTES) {
    console.warn(`  skip ${objectPath}: ${(size / 1024).toFixed(0)} KB is over the 1 MB image limit`);
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

const KINDS = {
  weapons: seedWeapons,
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
