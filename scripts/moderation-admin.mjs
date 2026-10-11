// Moderation admin script. Runs on the operator's machine only. MODERATION.md
// says when to use each command.
//
//   npm run moderate -- reports [--all]
//   npm run moderate -- show <code | table id>
//   npm run moderate -- export <code | table id> [--files]
//   npm run moderate -- remove <code | table id> --reason "..." [--ban-host] --yes
//   npm run moderate -- ban <auth user id> --reason "..."
//   npm run moderate -- unban <auth user id>
//   npm run moderate -- resolve <report id> [--note "..."]
//
// It reads and writes the tables of 71_moderation.sql (content_reports,
// banned_users, moderation_actions), which no browser can touch, and removes
// a cloud table with its uploaded files. A guest table has no row on the
// server, so there is nothing here to show or remove for one.
//
// It needs the project URL and the SERVICE-ROLE key, from .env (loaded by
// `node --env-file=.env`). The key is never prefixed VITE_, so Vite never
// bundles it into the app, and this script refuses to run with a publishable
// key.

import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const [command, target] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--reason', '--note'].includes(args[i - 1])));

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

// This script never opens a realtime connection, but the client still looks
// for a WebSocket when it is built and stops on Node 20 and older, which have
// none. A stand-in that is never used lets the script run there too.
const realtime = typeof WebSocket === 'undefined' ? { transport: class NoWebSocket {} } : undefined;
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, ...(realtime ? { realtime } : {}) });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXPORT_DIR = 'moderation-exports'; // git-ignored
// Every table that holds a cloud table's rows, by its table_id column.
const TABLE_ROWS = ['players', 'invite_codes', 'layers', 'islands', 'entities', 'entity_dm_data', 'custom_assets', 'audio_tracks', 'drawings', 'fog_chunks'];
const STORAGE_BUCKETS = ['token-art', 'map-backgrounds', 'table-audio'];
const STORAGE_PAGE = 100;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function must(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}

// A table by its id, or by any invitation code it has ever had.
async function findTable(codeOrId) {
  if (!codeOrId) fail('Give the table\'s invitation code or its id.');
  let tableId = codeOrId;
  if (!UUID.test(codeOrId)) {
    const codes = must(await supabase.from('invite_codes').select('table_id').eq('code', codeOrId.trim().toUpperCase()), 'invite_codes');
    if (!codes.length) fail(`No cloud table has the code ${codeOrId}. A guest table is not saved on the server, so it cannot be looked up.`);
    tableId = codes[0].table_id;
  }
  const table = must(await supabase.from('tables').select('*').eq('id', tableId).maybeSingle(), 'tables');
  if (!table) fail(`No table with the id ${tableId}. It may already be removed.`);
  return table;
}

async function listFiles(bucket, tableId) {
  const all = [];
  for (let offset = 0; ; offset += STORAGE_PAGE) {
    const { data, error } = await supabase.storage.from(bucket).list(tableId, { limit: STORAGE_PAGE, offset });
    if (error) throw new Error(`list ${bucket}: ${error.message}`);
    all.push(...(data || []).map((file) => `${tableId}/${file.name}`));
    if (!data || data.length < STORAGE_PAGE) return all;
  }
}

async function logAction(action, { table = null, targetAuthId = null, reason = null } = {}) {
  must(
    await supabase.from('moderation_actions').insert({ action, table_id: table?.id ?? null, table_name: table?.name ?? null, target_auth_id: targetAuthId, reason }),
    'moderation_actions'
  );
}

async function reports() {
  let query = supabase.from('content_reports').select('*').order('created_at', { ascending: true });
  if (!flag('all')) query = query.is('resolved_at', null);
  const rows = must(await query, 'content_reports');
  if (!rows.length) {
    console.log(flag('all') ? 'No reports.' : 'No open reports.');
    return;
  }
  for (const r of rows) {
    console.log(`\n${r.id}  ${r.created_at}${r.resolved_at ? `  resolved ${r.resolved_at} (${r.resolution || 'no note'})` : '  OPEN'}`);
    console.log(`  table:    ${r.table_name} (code ${r.invite_code || 'none'}, id ${r.table_id})`);
    console.log(`  host:     ${r.host_auth_id}`);
    console.log(`  reporter: ${r.reporter_name}${r.reporter_is_host ? ' (the host)' : ''} ${r.reporter_auth_id}`);
    console.log(`  reason:   ${r.reason}`);
    if (r.details) console.log(`  details:  ${r.details}`);
  }
  console.log(`\n${rows.length} report(s).`);
}

async function show() {
  const table = await findTable(target);
  const players = must(await supabase.from('players').select('id,name,is_host,auth_user_id,joined_at').eq('table_id', table.id), 'players');
  const codes = must(await supabase.from('invite_codes').select('code,revoked_at').eq('table_id', table.id), 'invite_codes');
  console.log(`${table.name}  (id ${table.id})`);
  console.log(`  created ${table.created_at}, ${table.is_open ? 'open' : 'closed'} to new players`);
  console.log(`  host identity: ${table.host_auth_id}`);
  console.log(`  codes: ${codes.map((c) => (c.revoked_at ? `${c.code} (old)` : c.code)).join(', ') || 'none'}`);
  console.log('  seats:');
  for (const p of players) console.log(`    ${p.is_host ? 'DM    ' : 'player'} ${p.name}  ${p.auth_user_id}`);
  for (const name of TABLE_ROWS.slice(2)) {
    const { count, error } = await supabase.from(name).select('*', { count: 'exact', head: true }).eq('table_id', table.id);
    if (!error) console.log(`  ${name}: ${count}`);
  }
  for (const bucket of STORAGE_BUCKETS) {
    const files = await listFiles(bucket, table.id);
    if (files.length) console.log(`  files in ${bucket}: ${files.length}`);
  }
}

async function exportTable(table) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.resolve(EXPORT_DIR, `${table.id}_${stamp}`);
  await mkdir(dir, { recursive: true });
  const dump = { exportedAt: new Date().toISOString(), table };
  for (const name of TABLE_ROWS) {
    const { data, error } = await supabase.from(name).select('*').eq('table_id', table.id);
    dump[name] = error ? { error: error.message } : data;
  }
  dump.reports = must(await supabase.from('content_reports').select('*').eq('table_id', table.id), 'content_reports');
  dump.termsAcceptances = must(await supabase.from('terms_acceptances').select('*').eq('table_id', table.id), 'terms_acceptances');
  dump.files = {};
  for (const bucket of STORAGE_BUCKETS) {
    const files = await listFiles(bucket, table.id);
    dump.files[bucket] = files;
    if (!flag('files')) continue;
    for (const file of files) {
      const { data, error } = await supabase.storage.from(bucket).download(file);
      if (error) {
        console.error(`  could not download ${bucket}/${file}: ${error.message}`);
        continue;
      }
      const out = path.join(dir, bucket, path.basename(file));
      await mkdir(path.dirname(out), { recursive: true });
      await writeFile(out, Buffer.from(await data.arrayBuffer()));
    }
  }
  await writeFile(path.join(dir, 'table.json'), JSON.stringify(dump, null, 2));
  await logAction('export', { table, reason: option('reason') ?? null });
  console.log(`Exported to ${dir}${flag('files') ? ' (with uploaded files)' : ' (rows only; add --files for uploaded files)'}`);
}

async function ban(authUserId, reason) {
  if (!UUID.test(authUserId || '')) fail('Give the identity to block as it is shown by `reports` or `show` (a long id with dashes).');
  must(await supabase.from('banned_users').upsert({ auth_user_id: authUserId, reason: reason ?? null }), 'banned_users');
  // Their seats at other people's tables go; a table they host stays until
  // it is removed on purpose.
  const seats = must(await supabase.from('players').delete().eq('auth_user_id', authUserId).eq('is_host', false).select('id'), 'players');
  const hosted = must(await supabase.from('tables').select('id,name').eq('host_auth_id', authUserId), 'tables');
  await logAction('ban', { targetAuthId: authUserId, reason });
  console.log(`Blocked ${authUserId}. Removed ${seats.length} seat(s) at other tables.`);
  if (hosted.length) {
    console.log('They still host:');
    for (const t of hosted) console.log(`  ${t.name}  ${t.id}`);
    console.log('Remove each with `remove <table id>` if it should go too.');
  }
}

async function remove() {
  const table = await findTable(target);
  const reason = option('reason');
  if (!reason) fail('Say why with --reason "...". It is kept in the moderation log.');
  if (!flag('yes')) {
    fail(
      `This permanently deletes "${table.name}" (${table.id}) with every map, token, sheet and uploaded file.\n` +
        'Nothing is kept. If you must keep a copy first, run `export` (read MODERATION.md before exporting anything that may be illegal to hold).\n' +
        'Run the same command again with --yes to go ahead.'
    );
  }
  for (const bucket of STORAGE_BUCKETS) {
    const files = await listFiles(bucket, table.id);
    if (!files.length) continue;
    const { error } = await supabase.storage.from(bucket).remove(files);
    if (error) throw new Error(`remove files from ${bucket}: ${error.message}`);
    console.log(`Removed ${files.length} file(s) from ${bucket}.`);
  }
  must(await supabase.from('tables').delete().eq('id', table.id), 'delete table');
  await logAction('remove_table', { table, targetAuthId: table.host_auth_id, reason });
  must(
    await supabase.from('content_reports').update({ resolved_at: new Date().toISOString(), resolution: `table removed: ${reason}` }).eq('table_id', table.id).is('resolved_at', null),
    'content_reports'
  );
  console.log(`Removed "${table.name}". Its open reports are marked resolved.`);
  if (flag('ban-host')) await ban(table.host_auth_id, reason);
}

async function unban() {
  if (!UUID.test(target || '')) fail('Give the identity to unblock.');
  must(await supabase.from('banned_users').delete().eq('auth_user_id', target), 'banned_users');
  await logAction('unban', { targetAuthId: target });
  console.log(`Unblocked ${target}.`);
}

async function resolve() {
  if (!UUID.test(target || '')) fail('Give the report id, as shown by `reports`.');
  const rows = must(
    await supabase.from('content_reports').update({ resolved_at: new Date().toISOString(), resolution: option('note') ?? 'no action needed' }).eq('id', target).select('id'),
    'content_reports'
  );
  if (!rows.length) fail(`No report with the id ${target}.`);
  console.log('Report marked resolved.');
}

async function main() {
  if (command === 'reports') return reports();
  if (command === 'show') return show();
  if (command === 'export') return exportTable(await findTable(target));
  if (command === 'remove') return remove();
  if (command === 'ban') return ban(target, option('reason'));
  if (command === 'unban') return unban();
  if (command === 'resolve') return resolve();
  fail('Commands: reports [--all] | show <code|id> | export <code|id> [--files] | remove <code|id> --reason "..." [--ban-host] --yes | ban <identity> --reason "..." | unban <identity> | resolve <report id> [--note "..."]');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
