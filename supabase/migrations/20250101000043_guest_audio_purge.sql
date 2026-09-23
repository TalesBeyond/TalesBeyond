-- Hearthbound — 43_guest_audio_purge.sql
-- REQ-009 Slice 5: the scheduled purge of guest audio older than 6 hours.
--
-- Deleting rows from storage.objects with SQL does NOT free the backing file,
-- so the purge has to go through the Storage API, which needs a service-role
-- caller: the purge-guest-audio Edge Function (supabase/functions/). This
-- migration only adds a helper that schedules it with pg_cron + pg_net, and
-- it needs your project's URL and service-role key, so it is NOT run for you.
-- After deploying the function, run once in the SQL Editor:
--
--   select schedule_guest_audio_purge('https://<project-ref>.supabase.co', '<service-role-key>');
--
-- Both pg_cron and pg_net must be enabled (Database -> Extensions). If your
-- plan does not offer them, call the function from any external scheduler
-- instead (REQ-009 Q4) — it accepts a POST with the service-role bearer token.

create or replace function schedule_guest_audio_purge(project_url text, service_role_key text) returns void as $$
begin
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
  perform cron.unschedule('purge-guest-audio')
    where exists (select 1 from cron.job where jobname = 'purge-guest-audio');
  perform cron.schedule(
    'purge-guest-audio',
    '*/30 * * * *',
    format(
      $job$select net.http_post(url := %L, headers := jsonb_build_object('Authorization', %L, 'Content-Type', 'application/json'), body := '{}'::jsonb)$job$,
      project_url || '/functions/v1/purge-guest-audio',
      'Bearer ' || service_role_key
    )
  );
end;
$$ language plpgsql security definer set search_path = public;

-- Only the service role / dashboard should ever call it.
revoke all on function schedule_guest_audio_purge(text, text) from public, anon, authenticated;
