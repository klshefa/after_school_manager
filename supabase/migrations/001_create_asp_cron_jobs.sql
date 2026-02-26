-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule ASP daily email
-- Runs at 10:30 AM ET (15:30 UTC) Monday-Thursday
-- (moved from 8:30 AM to allow attendance to settle)
SELECT cron.schedule(
  'asp-daily-email',
  '30 15 * * 1-4',
  $$
  SELECT net.http_post(
    url := 'https://jbmwfdxzsvpfwfpndjay.supabase.co/functions/v1/send-asp-daily-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Schedule ASP data sync
-- Runs at 10:15 AM ET (15:15 UTC) Monday-Friday
-- (moved from 8:15 AM to align with email schedule change)
SELECT cron.schedule(
  'asp-data-sync',
  '15 15 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://afterschool.shefaschool.org/api/sync-asp-data',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
