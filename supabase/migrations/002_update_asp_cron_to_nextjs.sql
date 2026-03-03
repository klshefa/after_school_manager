-- Migration: Switch asp-daily-sync from Edge Function to Next.js API route
-- This aligns ASP with the standard pattern used by attendance-portal and event-tracker:
-- pg_cron → net.http_post() → Next.js API route (with SyncMonitor logging)
--
-- The old job (id 48) calls the Edge Function sync-asp-data at 8:15 AM ET.
-- The new job calls the Next.js route at afterschool.shefaschool.org/api/sync-asp-data
-- at the same time (8:15 AM ET) to avoid changing behavior.
--
-- IMPORTANT: Ensure app.settings.cron_secret is set in Supabase before running.
-- Run this in the Supabase SQL Editor.

-- 1. Remove the old Edge Function job
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname = 'asp-daily-sync';

-- 2. Create new job calling Next.js route with CRON_SECRET auth
SELECT cron.schedule(
  'asp-daily-sync',
  '15 13 * * 1-5',  -- 13:15 UTC = 8:15 AM ET (winter), Mon-Fri
  $$
  SELECT net.http_post(
    url := 'https://afterschool.shefaschool.org/api/sync-asp-data',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 3. Verify
SELECT jobid, jobname, schedule, command
FROM cron.job
WHERE jobname = 'asp-daily-sync';
