// Purges guest audio older than 6 hours from the guest-audio bucket
// (REQ-009 Slice 5). Runs with the service role because Storage only frees a
// file's bytes when it is removed through the Storage API, never by deleting
// its storage.objects row. Scheduled every 30 minutes — see
// migrations/20250101000043_guest_audio_purge.sql.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const BUCKET = 'guest-audio';
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const PAGE = 100;

Deno.serve(async (req) => {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey || req.headers.get('Authorization') !== `Bearer ${serviceKey}`) {
    return new Response('Forbidden', { status: 403 });
  }
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);
  const storage = supabase.storage.from(BUCKET);
  const cutoff = Date.now() - MAX_AGE_MS;

  async function listAll(prefix: string) {
    const all: { name: string; id: string | null; created_at?: string }[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await storage.list(prefix, { limit: PAGE, offset });
      if (error) throw error;
      all.push(...(data ?? []));
      if (!data || data.length < PAGE) return all;
    }
  }

  const expired: string[] = [];
  try {
    // Objects live at `<CODE>/<file>`; a top-level entry with no id is a folder.
    for (const entry of await listAll('')) {
      if (entry.id !== null) {
        if (entry.created_at && Date.parse(entry.created_at) < cutoff) expired.push(entry.name);
        continue;
      }
      for (const file of await listAll(entry.name)) {
        if (file.created_at && Date.parse(file.created_at) < cutoff) expired.push(`${entry.name}/${file.name}`);
      }
    }
    for (let i = 0; i < expired.length; i += PAGE) {
      const { error } = await storage.remove(expired.slice(i, i + PAGE));
      if (error) throw error;
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), { status: 500 });
  }
  return new Response(JSON.stringify({ removed: expired.length }), { headers: { 'Content-Type': 'application/json' } });
});
